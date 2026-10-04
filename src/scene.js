/**
 * scene.js — Plateau 3D : le circuit, les 8 complexes hôteliers, la Banque, la
 * Mairie, les voitures, les entrées et les bases de loisirs.
 *
 * Le circuit est une courbe fermée (rectangle aux angles arrondis) échantillonnée
 * en 48 points équidistants : un par case. Chaque complexe est posé à l'intérieur
 * du circuit, face à son front de cases (`sides` dans data.js).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  BOARD, BOARD_SIZE, TILE, HOTELS, HOTEL_ORDER, SKIN,
  BANK_LINE_TILE, MAIRIE_LINE_TILE, START_TILES, PLAYER_COLORS
} from './data.js';
import { buildHotel, buildLeisure, buildEntrance, buildCar, buildBank, buildTownHall } from './models.js';

const TILE_COLORS = {
  [TILE.DEPART]: '#39424d',
  [TILE.PLAIN]: '#6d7883',
  [TILE.ACHAT]: '#2e8b57',
  [TILE.PERMIS]: '#c2822a',
  [TILE.ENTREE_FREE]: '#2f7fe0',
  [TILE.CONSTR_FREE]: '#8e5bd0',
  [TILE.GREY]: '#4a5158'
};

export const TILE_LEGEND = [
  { t: TILE.ACHAT, label: 'Achat de terrain' },
  { t: TILE.PERMIS, label: 'Permis de construire' },
  { t: TILE.ENTREE_FREE, label: 'Entrée gratuite' },
  { t: TILE.CONSTR_FREE, label: 'Construction gratuite' },
  { t: TILE.DEPART, label: 'Départ' },
  { t: TILE.GREY, label: 'Case grisée (pas d\'entrée)' }
];
export const tileColor = (t) => TILE_COLORS[t];

/** Profondeurs, mesurées depuis l'axe du circuit vers l'intérieur du plateau. */
const PARCEL_NEAR = 3.6;   // bord de la parcelle, juste après la chaussée
const PARCEL_FAR = 12.5;   // fond de la parcelle
const HOTEL_DEPTH = 5.0;   // rangée d'hôtels
const LEISURE_DEPTH = 9.6; // base de loisirs, derrière les hôtels

/** Courbe fermée du circuit : rectangle aux angles arrondis, dans le plan XZ. */
function makeTrack(w, h, r) {
  const hw = w / 2, hh = h / 2;
  const P = (x, z) => new THREE.Vector3(x, 0, z);
  const path = new THREE.CurvePath();
  const add = (a, b) => path.add(new THREE.LineCurve3(a, b));
  const arc = (a, c, b) => path.add(new THREE.QuadraticBezierCurve3(a, c, b));

  add(P(-hw + r, hh), P(hw - r, hh));
  arc(P(hw - r, hh), P(hw, hh), P(hw, hh - r));
  add(P(hw, hh - r), P(hw, -hh + r));
  arc(P(hw, -hh + r), P(hw, -hh), P(hw - r, -hh));
  add(P(hw - r, -hh), P(-hw + r, -hh));
  arc(P(-hw + r, -hh), P(-hw, -hh), P(-hw, -hh + r));
  add(P(-hw, -hh + r), P(-hw, hh - r));
  arc(P(-hw, hh - r), P(-hw, hh), P(-hw + r, hh));
  return path;
}

export class BoardView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0d2240');
    this.scene.fog = new THREE.Fog('#0d2240', 170, 340);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 500);
    this.camera.position.set(0, 62, 72);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 22;
    this.controls.maxDistance = 160;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.tileMeshes = [];
    this.tilePos = [];
    this.tileTangent = [];
    this.tileInward = [];
    this.plotAnchors = {};
    this.hotelGroups = {};
    this.leisureGroups = {};
    this.entranceMeshes = {};
    this.cars = {};
    this.highlight = new Set();

    this.onTileClick = null;
    this.onPlotClick = null;

    this.buildLights();
    this.buildBoard();
    this.bindEvents();
    this.resize();
    this.animate();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight('#bcd8ff', '#1b2b3f', 1.0));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.5);
    sun.position.set(38, 60, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 60;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 200 });
    sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#86b7ff', 0.5);
    fill.position.set(-40, 30, -35);
    this.scene.add(fill);
  }

  buildBoard() {
    // 70 × 48 avec des angles de rayon 15 : ~207 unités de circuit, soit ~4,3
    // unités par case — de quoi loger une case sans chevauchement.
    const curve = makeTrack(70, 48, 15);
    this.curve = curve;

    // --- socle du plateau, avec son liseré rouge de pourtour
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(84, 1.2, 62),
      new THREE.MeshStandardMaterial({ color: SKIN.boardEdge, roughness: 0.8 })
    );
    base.position.y = -0.6;
    base.receiveShadow = true;
    this.scene.add(base);

    const field = new THREE.Mesh(
      new THREE.BoxGeometry(80, 0.3, 58),
      new THREE.MeshStandardMaterial({ color: '#ded5c0', roughness: 1 })
    );
    field.position.y = -0.03;
    field.receiveShadow = true;
    this.scene.add(field);

    // --- la chaussée, en coupe : liseré bleu · bande noire · case blanche ·
    //     bande noire · liseré bleu (relevé sur les photos du plateau).
    const lanes = [
      [-3.55, -3.15, SKIN.edge], [-3.15, -1.25, SKIN.asphalt],
      [-1.25, 1.25, SKIN.lane],
      [1.25, 3.15, SKIN.asphalt], [3.15, 3.55, SKIN.edge]
    ];
    for (const [a, b, c] of lanes) {
      const band = this.makeBand(0, 1, a, b, 0.13, c);
      this.scene.add(band);
    }

    // --- traits rouges de séparation entre deux cases
    const sepMat = new THREE.MeshStandardMaterial({ color: SKIN.separator, roughness: 0.7 });
    for (let i = 0; i < BOARD_SIZE; i++) {
      const f = this.frameAt((i - 0.5) / BOARD_SIZE);
      const sep = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.05, 0.18), sepMat);
      sep.position.copy(f.pos).setY(0.16);
      sep.lookAt(f.pos.clone().add(f.tan).setY(0.16));
      this.scene.add(sep);
    }

    // --- cases
    const center = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < BOARD_SIZE; i++) {
      const t = i / BOARD_SIZE;
      const pos = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).normalize();
      let inward = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tan).normalize();
      if (inward.dot(center.clone().sub(pos)) < 0) inward.negate();

      this.tilePos[i] = pos;
      this.tileTangent[i] = tan;
      this.tileInward[i] = inward;

      const def = BOARD[i];
      // La case est la bande claire au centre de la chaussée. Son type n'est pas
      // porté par la couleur du sol (blanc sur le vrai plateau) mais par une
      // plaque posée dessus, qui remplace l'illustration imprimée.
      const isStart = def.t === TILE.DEPART;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.14, 3.9),
        new THREE.MeshStandardMaterial({
          color: isStart ? SKIN.parking : SKIN.lane, roughness: 0.95
        })
      );
      mesh.position.copy(pos).setY(0.2);
      mesh.lookAt(pos.clone().add(tan).setY(0.2));
      mesh.receiveShadow = true;
      mesh.userData = { tileIndex: i, baseColor: isStart ? SKIN.parking : SKIN.lane };
      this.scene.add(mesh);
      this.tileMeshes[i] = mesh;

      if (isStart) {
        // emplacement de départ aux couleurs du joueur
        const slot = START_TILES.indexOf(i);
        const col = PLAYER_COLORS[slot] ? PLAYER_COLORS[slot].hex : '#ffffff';
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.05, 2.4),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 })
        );
        pad.position.copy(pos).setY(0.29);
        pad.lookAt(pos.clone().add(tan).setY(0.29));
        this.scene.add(pad);
      } else if (def.t !== TILE.PLAIN && def.t !== TILE.GREY) {
        const mark = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.05, 1.5),
          new THREE.MeshStandardMaterial({
            color: TILE_COLORS[def.t], roughness: 0.75,
            emissive: TILE_COLORS[def.t], emissiveIntensity: 0.22
          })
        );
        mark.position.copy(pos).setY(0.29);
        mark.lookAt(pos.clone().add(tan).setY(0.29));
        this.scene.add(mark);
      }
    }

    // --- lignes Banque (rouge) et Mairie (jaune)
    this.addCrossLine(BANK_LINE_TILE, '#e23b3b');
    this.addCrossLine(MAIRIE_LINE_TILE, '#e8c22a');

    // --- ancrages des complexes.
    // Un front de cases traverse souvent un virage : en faire la moyenne donnerait
    // une parcelle de travers. On raisonne donc en portion de courbe, et tout —
    // parcelle, hôtels, panneau — est placé en suivant le circuit.
    for (const code of HOTEL_ORDER) {
      const run = this.frontRun(code);
      const uStart = (run[0] - 0.5) / BOARD_SIZE;
      const span = run.length / BOARD_SIZE;
      this.plotAnchors[code] = { run, uStart, span };

      const deed = HOTELS[code];
      const parcel = this.makeBand(uStart, span, PARCEL_NEAR, PARCEL_FAR, 0.14, SKIN.lawn);
      parcel.userData = { plotCode: code };
      this.scene.add(parcel);
      this.plotAnchors[code].parcel = parcel;

      // liseré de propriété, posé au fond de la parcelle : près de la chaussée il
      // se confondrait avec le liseré bleu du circuit.
      const kerb = this.makeBand(uStart, span, PARCEL_FAR - 0.7, PARCEL_FAR, 0.17, '#ffffff');
      kerb.visible = false;
      kerb.userData = { plotCode: code };
      this.scene.add(kerb);
      this.plotAnchors[code].kerb = kerb;

      const midFrame = this.frameAt(uStart + span / 2);
      const sign = this.makeLabel(deed.name, deed.color);
      sign.position.copy(midFrame.pos).addScaledVector(midFrame.inward, 3.4).setY(1.2);
      sign.lookAt(sign.position.clone().addScaledVector(midFrame.inward, -1).setY(1.2));
      sign.userData = { plotCode: code };
      this.scene.add(sign);

      this.hotelGroups[code] = [];
      this.entranceMeshes[code] = new Map();
    }

    // --- Banque et Mairie, au coeur du plateau (les parcelles occupent la
    //     couronne intérieure jusqu'à ~13 unités du circuit).
    const placeCivic = (group, tileIdx) => {
      const pos = this.tilePos[tileIdx].clone().multiplyScalar(0.26).setY(0);
      group.position.copy(pos);
      group.lookAt(pos.clone().addScaledVector(this.tileInward[tileIdx], -1).setY(0));
      this.scene.add(group);
      return pos;
    };
    this.bankPos = placeCivic(buildBank(), BANK_LINE_TILE);
    this.hallPos = placeCivic(buildTownHall(), MAIRIE_LINE_TILE);
    this.decorateCentre();
  }

  /**
   * Front de cases d'un complexe, remis dans l'ordre du circuit en tenant compte
   * du passage par la case 0 (le Boomerang Bay borde les cases 47, 4, 5 et 6).
   */
  frontRun(code) {
    const front = [];
    for (let i = 0; i < BOARD_SIZE; i++) if (BOARD[i].sides.includes(code)) front.push(i);
    const set = new Set(front);
    const first = front.find(i => !set.has((i - 1 + BOARD_SIZE) % BOARD_SIZE));
    const start = first === undefined ? front[0] : first;
    const run = [];
    for (let k = 0, i = start; k < front.length; k++, i = (i + 1) % BOARD_SIZE) run.push(i);
    return run;
  }

  /** Repère local du circuit à l'abscisse u (position, tangente, normale rentrante). */
  frameAt(u) {
    const t = ((u % 1) + 1) % 1;
    const pos = this.curve.getPointAt(t);
    const tan = this.curve.getTangentAt(t).normalize();
    const inward = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tan).normalize();
    if (inward.dot(pos.clone().negate()) < 0) inward.negate();
    return { pos, tan, inward };
  }

  /** Bande plate épousant la courbe entre deux profondeurs, sur une portion donnée. */
  makeBand(uStart, span, offNear, offFar, y, color) {
    const N = Math.max(12, Math.round(span * BOARD_SIZE * 8));
    const pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const f = this.frameAt(uStart + span * (i / N));
      const a = f.pos.clone().addScaledVector(f.inward, offNear);
      const b = f.pos.clone().addScaledVector(f.inward, offFar);
      pos.push(a.x, y, a.z, b.x, y, b.z);
      if (i < N) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color, roughness: 1, side: THREE.DoubleSide
    }));
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Emplacement du i-ème bâtiment d'un complexe qui en compte n, le long du front. */
  slotFrame(code, i, n, depth) {
    const a = this.plotAnchors[code];
    const f = this.frameAt(a.uStart + a.span * ((i + 0.5) / n));
    f.pos.addScaledVector(f.inward, depth);
    return f;
  }

  /**
   * Le coeur du plateau : parc central, plan d'eau et parvis de la Banque et de
   * la Mairie, à la place d'une grande dalle vide.
   */
  decorateCentre() {
    // Le fond du plateau affleure à y = 0.12 : tout le décor central se pose
    // au-dessus. L'espace libre au centre est un ovale large, pas un disque :
    // les parcelles descendent plus bas sur les grands côtés du circuit.
    const flat = (color, y, sx, sz, x, z, seg = 48) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, seg),
        new THREE.MeshStandardMaterial({ color, roughness: 1 }));
      m.rotation.x = -Math.PI / 2;
      m.scale.set(sx, sz, 1);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };

    flat(SKIN.path, 0.14, 20.5, 10.4, 0, 0);
    flat(SKIN.lawn, 0.15, 19.6, 9.6, 0, 0);

    // plan d'eau et sa plage
    flat(SKIN.sand, 0.16, 8.2, 5.0, -1, -1);
    const lake = flat(SKIN.water, 0.17, 7.0, 3.9, -1, -1, 40);
    lake.material.metalness = 0.35;
    lake.material.roughness = 0.12;
    lake.material.emissive = new THREE.Color(SKIN.water);
    lake.material.emissiveIntensity = 0.2;

    // parvis sous la Banque et la Mairie
    for (const pos of [this.bankPos, this.hallPos]) {
      flat(SKIN.path, 0.18, 4.6, 4.6, pos.x, pos.z, 28);
    }

    // bosquets, à l'écart de l'ovale d'eau et des parvis
    const tree = (x, z, r) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 6),
        new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 1 }));
      trunk.position.set(x, 0.6, z);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8),
        new THREE.MeshStandardMaterial({ color: '#2e8b57', roughness: 1 }));
      crown.position.set(x, 1.05 + r * 0.6, z);
      crown.scale.y = 0.85;
      crown.castShadow = true;
      this.scene.add(trunk, crown);
    };
    const spots = [[16.5, 4.2], [17.5, -3.4], [-16.5, 4.0], [-17.5, -3.6],
                   [12.5, 7.4], [-12.5, -7.4], [6.5, 7.8], [-6.5, -7.8],
                   [-9.5, 7.6], [9.5, -7.6]];
    for (let i = 0; i < spots.length; i++) tree(spots[i][0], spots[i][1], 0.75 + (i % 4) * 0.12);
  }

  /** Trait peint en travers de la chaussée, à l'entrée d'une case. */
  addCrossLine(tileIdx, color) {
    const prev = (tileIdx - 1 + BOARD_SIZE) % BOARD_SIZE;
    const p = this.tilePos[tileIdx].clone().lerp(this.tilePos[prev], 0.5);
    const tan = this.tileTangent[tileIdx];
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(7.1, 0.06, 0.9),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55 })
    );
    line.position.copy(p).setY(0.3);
    line.lookAt(p.clone().add(tan));
    this.scene.add(line);
  }

  /** Petit panneau texte dessiné sur un canvas. */
  makeLabel(text, color) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#0f1b2a'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = color; g.fillRect(0, 0, 512, 14);
    g.fillStyle = '#ffffff';
    g.font = 'bold 62px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 74);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5.0, 1.25),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    return mesh;
  }

  /* ------------------------------------------------- mise à jour du plateau */

  /** Reconstruit les volumes d'un complexe d'après l'état du moteur. */
  syncPlot(code, plot) {
    const deed = HOTELS[code];

    for (const g of this.hotelGroups[code]) this.scene.remove(g);
    this.hotelGroups[code] = [];

    // Un hôtel par créneau le long du front de cases : rien ne peut déborder
    // sur la parcelle voisine, même dans un virage.
    for (let i = 0; i < plot.built; i++) {
      const g = buildHotel(deed, i);
      const f = this.slotFrame(code, i, plot.built, HOTEL_DEPTH);
      g.position.copy(f.pos).setY(0.16);
      g.lookAt(g.position.clone().addScaledVector(f.inward, -1).setY(0.16));
      g.traverse(o => { o.userData.plotCode = code; });
      this.scene.add(g);
      this.hotelGroups[code].push(g);
    }

    if (this.leisureGroups[code]) {
      this.scene.remove(this.leisureGroups[code]);
      this.leisureGroups[code] = null;
    }
    if (plot.leisure) {
      const g = buildLeisure(deed, SKIN);
      const f = this.slotFrame(code, 0, 1, LEISURE_DEPTH);
      g.position.copy(f.pos).setY(0.16);
      g.lookAt(g.position.clone().addScaledVector(f.inward, -1).setY(0.16));
      g.traverse(o => { o.userData.plotCode = code; });
      this.scene.add(g);
      this.leisureGroups[code] = g;
    }

    // entrées
    const wanted = new Set(plot.entrances);
    for (const [idx, mesh] of this.entranceMeshes[code]) {
      if (!wanted.has(idx)) { this.scene.remove(mesh); this.entranceMeshes[code].delete(idx); }
    }
    for (const idx of plot.entrances) {
      if (this.entranceMeshes[code].has(idx)) continue;
      const g = buildEntrance(deed.color);
      const p = this.tilePos[idx].clone().addScaledVector(this.tileInward[idx], 4.0);
      g.position.copy(p).setY(0.14);
      g.lookAt(p.clone().addScaledVector(this.tileInward[idx], -1).setY(0.14));
      g.traverse(o => { o.userData.plotCode = code; });
      this.scene.add(g);
      this.entranceMeshes[code].set(idx, g);
    }
  }

  /**
   * La pelouse reste verte comme sur le plateau ; c'est le liseré de bordure qui
   * signale le propriétaire.
   */
  setPlotOwner(code, colorHex) {
    const kerb = this.plotAnchors[code].kerb;
    if (!kerb) return;
    kerb.visible = !!colorHex;
    if (colorHex) {
      kerb.material.color.set(colorHex);
      kerb.material.emissive.set(colorHex);
      kerb.material.emissiveIntensity = 0.35;
    }
  }

  /* ------------------------------------------------------------- voitures */

  addCar(playerId, colorHex, tileIdx) {
    const car = buildCar(colorHex);
    this.cars[playerId] = car;
    this.scene.add(car);
    this.placeCar(playerId, tileIdx);
  }

  removeCar(playerId) {
    if (this.cars[playerId]) { this.scene.remove(this.cars[playerId]); delete this.cars[playerId]; }
  }

  placeCar(playerId, tileIdx) {
    const car = this.cars[playerId];
    if (!car) return;
    const p = this.tilePos[tileIdx].clone().addScaledVector(this.tileInward[tileIdx], 0);
    car.position.copy(p).setY(0.3);
    car.lookAt(p.clone().add(this.tileTangent[tileIdx]).setY(0.3));
  }

  /** Anime la voiture de case en case ; renvoie une promesse résolue à l'arrivée. */
  animateCar(playerId, path) {
    const car = this.cars[playerId];
    if (!car || !path.length) return Promise.resolve();
    return new Promise(resolve => {
      let k = 0;
      const stepDuration = Math.max(110, 380 - path.length * 18);
      const from = car.position.clone();
      let start = performance.now();
      let origin = from;

      const tick = (now) => {
        const idx = path[k];
        const target = this.tilePos[idx].clone()
          .addScaledVector(this.tileInward[idx], -0.5).setY(0.3);
        const u = Math.min(1, (now - start) / stepDuration);
        car.position.lerpVectors(origin, target, u);
        car.position.y = 0.3 + Math.sin(u * Math.PI) * 0.35;
        const look = car.position.clone().add(this.tileTangent[idx]);
        car.lookAt(look.setY(car.position.y));
        if (u >= 1) {
          k++; origin = target.clone(); start = now;
          if (k >= path.length) { this.placeCar(playerId, path[path.length - 1]); resolve(); return; }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ------------------------------------------------- surbrillance & clics */

  setHighlight(tileIndices) {
    for (const i of this.highlight) {
      const m = this.tileMeshes[i];
      m.material.color.set(m.userData.baseColor);
      m.material.emissive.set('#000000');
      m.position.y = 0.2;
    }
    this.highlight = new Set(tileIndices || []);
    for (const i of this.highlight) {
      const m = this.tileMeshes[i];
      m.material.color.set('#ffffff');
      m.material.emissive.set('#5fd36a');
      m.material.emissiveIntensity = 0.7;
      m.position.y = 0.45;
    }
  }

  bindEvents() {
    addEventListener('resize', () => this.resize());
    // On ne déclenche un clic que si le pointeur n'a quasiment pas bougé :
    // sinon toute rotation de caméra sélectionnerait une case au relâchement.
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
      down = null;
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.scene.children, true);
      for (const h of hits) {
        let o = h.object;
        while (o) {
          if (o.userData && o.userData.tileIndex !== undefined) {
            if (this.onTileClick) this.onTileClick(o.userData.tileIndex);
            return;
          }
          if (o.userData && o.userData.plotCode) {
            if (this.onPlotClick) this.onPlotClick(o.userData.plotCode);
            return;
          }
          o = o.parent;
        }
      }
    });
  }

  /** Recentre doucement la caméra sur une case. */
  focusTile(tileIdx) {
    const p = this.tilePos[tileIdx];
    if (!p) return;
    this.controls.target.lerp(new THREE.Vector3(p.x * 0.45, 0, p.z * 0.45), 0.6);
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    const loop = () => {
      requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
}
