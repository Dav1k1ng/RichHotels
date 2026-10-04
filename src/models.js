/**
 * models.js — Volumes 3D : hôtels, bases de loisirs, entrées, voitures, Banque
 * et Mairie.
 *
 * Les hôtels reprennent la construction des pièces du jeu, visible sur les
 * photos (Hotel01/02/03.jpg) : un SOCLE plastique débordant, un CORPS en carton
 * imprimé (façade vitrée), et un TOIT plastique débordant surmonté d'un bloc
 * technique. Socle et toit partagent la couleur plastique du complexe
 * (`deed.plastic`), le corps porte la couleur de façade (`deed.facade`).
 *
 * Chaque groupe a son origine au centre du socle, posé sur y = 0.
 */

import * as THREE from 'three';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.6, metalness: 0.05, ...opts
});

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function cyl(rTop, rBot, h, material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Toit pyramidal à 4 pans. */
function pyramid(radius, h, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(radius, h, 4), material);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = Math.PI / 4;
  m.castShadow = true;
  return m;
}

/** Toit à deux pans (prisme triangulaire), faîtage le long de l'axe X. */
function gable(w, h, d, material, x = 0, y = 0, z = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(0, h); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.rotateY(Math.PI / 2);
  geo.translate(-w / 2, 0, 0);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Secteur de couronne, pour les bâtiments courbes (Sahara, Boomerang Bay). */
function arcBlock(rInner, rOuter, angle, h, material, x = 0, y = 0, z = 0) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter, -angle / 2, angle / 2, false);
  shape.absarc(0, 0, rInner, angle / 2, -angle / 2, true);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.rotateY(-Math.PI / 2); // l'ouverture de l'arc fait face à la chaussée
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * Façade vitrée : bandeaux horizontaux plaqués sur les 4 faces d'un bloc, ce
 * qui rend l'aspect « carton imprimé » des pièces du jeu.
 */
function glazing(group, w, h, d, y0, floors, material) {
  const band = (h / floors) * 0.52;
  for (let f = 0; f < floors; f++) {
    const yy = y0 + (h / floors) * (f + 0.5);
    const a = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, band), material);
    a.position.set(0, yy, d / 2 + 0.012); group.add(a);
    const b = a.clone(); b.position.set(0, yy, -d / 2 - 0.012); b.rotation.y = Math.PI; group.add(b);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.86, band), material);
    c.position.set(w / 2 + 0.012, yy, 0); c.rotation.y = Math.PI / 2; group.add(c);
    const e = c.clone(); e.position.set(-w / 2 - 0.012, yy, 0); e.rotation.y = -Math.PI / 2; group.add(e);
  }
}

/** Socle plastique débordant, avec son perron à l'avant (côté +Z = la route). */
function plinth(w, d, material, h = 0.26) {
  const g = new THREE.Group();
  g.add(box(w, h, d, material));
  g.add(box(w * 0.3, h * 0.55, 0.45, material, 0, 0, d / 2 + 0.2));
  return g;
}

/** Toit plastique débordant, avec son bloc technique. */
function cap(w, d, material, h = 0.42) {
  const g = new THREE.Group();
  g.add(box(w, h, d, material));
  g.add(box(w * 0.34, h * 0.7, d * 0.34, material, 0, h, 0));
  return g;
}

/**
 * Construit un hôtel.
 * @param {object} deed  entrée de HOTELS
 * @param {number} index 0 = hôtel principal, 1+ = annexes (plus petites)
 */
export function buildHotel(deed, index) {
  const g = new THREE.Group();
  const plastic = mat(deed.plastic, { roughness: 0.45 });
  const facade = mat(deed.facade);
  const trim = mat(deed.accent);
  const glass = new THREE.MeshStandardMaterial({
    color: deed.accent, roughness: 0.2, metalness: 0.45,
    emissive: deed.facade, emissiveIntensity: 0.3, side: THREE.DoubleSide
  });
  const main = index === 0;
  const s = main ? 1 : 0.78 - Math.min(index - 1, 3) * 0.06;

  switch (deed.style) {

    case 'tour': { // Regency — tours vitrées, socle et toit crème très débordants
      const w = 2.3 * s, d = 2.0 * s, h = (main ? 4.4 : 3.4) * s;
      g.add(plinth(w + 0.7, d + 0.7, plastic, 0.3 * s));
      const y0 = 0.3 * s;
      g.add(box(w, h, d, facade, 0, y0));
      glazing(g, w, h, d, y0, main ? 7 : 5, glass);
      const top = cap(w + 0.7, d + 0.7, plastic, 0.5 * s);
      top.position.y = y0 + h;
      g.add(top);
      break;
    }

    case 'gratte': { // Liberty — gratte-ciel noir fumé, le plus haut du plateau
      const w = 2.1 * s, d = 1.9 * s, h = (main ? 5.6 : 4.2) * s;
      g.add(plinth(w + 0.6, d + 0.6, plastic, 0.3 * s));
      const y0 = 0.3 * s;
      g.add(box(w, h, d, facade, 0, y0));
      glazing(g, w, h, d, y0, main ? 9 : 7, glass);
      // décrochés d'angle, caractéristiques du moule
      g.add(box(w * 0.42, h * 0.72, d * 0.42, facade, w * 0.42, y0, -d * 0.42));
      const top = cap(w + 0.6, d + 0.6, plastic, 0.45 * s);
      top.position.y = y0 + h;
      g.add(top);
      break;
    }

    case 'pagode': { // Fujiyama — corps cuivré, toit noir octogonal débordant
      const w = 2.2 * s, d = 2.0 * s, h = (main ? 4.2 : 3.2) * s;
      g.add(plinth(w + 0.6, d + 0.6, plastic, 0.3 * s));
      const y0 = 0.3 * s;
      g.add(box(w, h, d, facade, 0, y0));
      glazing(g, w, h, d, y0, main ? 7 : 5, glass);
      const oct = cyl((w + 0.75) / 2, (w + 0.75) / 2, 0.55 * s, plastic, 0, y0 + h, 0, 8);
      g.add(oct);
      g.add(cyl(w * 0.2, w * 0.2, 0.3 * s, plastic, 0, y0 + h + 0.55 * s, 0, 8));
      break;
    }

    case 'courbe': { // Sahara & Boomerang Bay — bâtiments en arc de cercle
      const rI = 1.9 * s, rO = 3.4 * s, ang = Math.PI * 0.66;
      const h = (main ? 2.0 : 1.5) * s;
      const z = -2.6 * s; // recentre la masse de l'arc sur le socle
      g.add(arcBlock(rI - 0.28, rO + 0.28, ang, 0.26 * s, plastic, 0, 0, z));
      g.add(arcBlock(rI, rO, ang, h, facade, 0, 0.26 * s, z));
      g.add(arcBlock(rI - 0.34, rO + 0.34, ang, 0.44 * s, plastic, 0, 0.26 * s + h, z));
      // bandeau de fenêtres sur la face convexe
      const win = new THREE.Mesh(new THREE.CylinderGeometry(rO + 0.02, rO + 0.02, h * 0.5,
        28, 1, true, Math.PI / 2 - ang / 2, ang), glass);
      win.position.set(0, 0.26 * s + h * 0.5, z);
      g.add(win);
      break;
    }

    case 'palais': { // Mirasol — palais ivoire à coupoles
      const w = 2.8 * s, d = 2.2 * s, h = (main ? 1.6 : 1.2) * s;
      g.add(plinth(w + 0.5, d + 0.5, plastic, 0.26 * s));
      const y0 = 0.26 * s;
      g.add(box(w, h, d, facade, 0, y0));
      glazing(g, w, h, d, y0, 2, glass);
      g.add(box(w + 0.4, 0.18 * s, d + 0.4, plastic, 0, y0 + h));
      const domeY = y0 + h + 0.18 * s;
      const dome = (r, x) => {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(r, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), plastic);
        m.position.set(x, domeY, 0); m.castShadow = true; g.add(m);
        g.add(cyl(0.04 * s, 0.04 * s, 0.3 * s, plastic, x, domeY + r * 0.78, 0, 6));
      };
      dome(0.72 * s, 0);
      if (main) { dome(0.36 * s, -1.0 * s); dome(0.36 * s, 1.0 * s); }
      for (const px of [-1, 1]) {
        g.add(cyl(0.13 * s, 0.13 * s, h + 0.5 * s, plastic, px * (w / 2 + 0.18), y0, 0, 10));
      }
      break;
    }

    case 'chalet': { // Mont Blanc — chalet brun, toit pyramidal très pentu
      const w = 2.6 * s, d = 2.1 * s, h = (main ? 1.5 : 1.1) * s;
      g.add(plinth(w + 0.5, d + 0.5, plastic, 0.26 * s));
      const y0 = 0.26 * s;
      g.add(box(w, h, d, facade, 0, y0));
      glazing(g, w, h, d, y0, main ? 2 : 1, glass);
      g.add(pyramid((w + 0.6) * 0.72, 1.25 * s, plastic, 0, y0 + h, 0));
      g.add(box(w * 0.98, 0.07 * s, 0.4 * s, trim, 0, y0 + h * 0.58, d / 2 + 0.16));
      break;
    }

    case 'bungalow':
    default: { // Waikiki — bungalows bas à toiture arrondie
      const w = 2.9 * s, d = 1.9 * s, h = (main ? 1.2 : 0.9) * s;
      g.add(plinth(w + 0.5, d + 0.5, plastic, 0.24 * s));
      const y0 = 0.24 * s;
      g.add(box(w, h, d, facade, 0, y0));
      glazing(g, w, h, d, y0, 1, glass);
      const roll = new THREE.Mesh(
        new THREE.CylinderGeometry((d + 0.5) / 2, (d + 0.5) / 2, w + 0.5, 18, 1, false, 0, Math.PI),
        plastic);
      roll.rotation.z = Math.PI / 2;
      roll.position.set(0, y0 + h, 0);
      roll.castShadow = true;
      g.add(roll);
      if (main) {
        g.add(box(w * 0.5, h * 0.8, d * 0.8, facade, 0, y0, d * 0.75));
        g.add(cyl(0.05 * s, 0.07 * s, 1.0 * s, mat('#7a5a32'), -w * 0.6, y0, d * 0.7, 6));
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.4 * s, 8, 6), mat('#2e8b57'));
        leaf.position.set(-w * 0.6, y0 + 1.25 * s, d * 0.7); leaf.scale.y = 0.42;
        g.add(leaf);
      }
      break;
    }
  }
  return g;
}

/**
 * Base de loisirs, telle qu'imprimée sur le plateau : pelouse, piscine de forme
 * libre, court de tennis, parasols rayés et arbustes.
 */
export function buildLeisure(deed, skin) {
  const g = new THREE.Group();
  g.add(box(5.6, 0.16, 3.8, mat(skin.lawn, { roughness: 1 })));
  const y = 0.16;

  // piscine : deux disques et un rectangle, pour la silhouette en haricot
  const water = mat(skin.water, {
    roughness: 0.1, metalness: 0.35, emissive: skin.water, emissiveIntensity: 0.18
  });
  const deck = mat(skin.path, { roughness: 1 });
  g.add(box(2.6, 0.03, 1.9, deck, -1.3, y, 0.2));
  const pool = new THREE.Group();
  pool.add(box(1.5, 0.04, 0.85, water));
  pool.add(cyl(0.42, 0.42, 0.04, water, -0.72, 0, 0, 14));
  pool.add(cyl(0.42, 0.42, 0.04, water, 0.72, 0, 0, 14));
  pool.position.set(-1.3, y + 0.03, 0.2);
  g.add(pool);

  // court de tennis, lignes blanches comprises
  g.add(box(2.0, 0.03, 1.3, mat(skin.court, { roughness: 1 }), 1.5, y, -0.8));
  const line = mat('#ffffff');
  g.add(box(2.0, 0.035, 0.035, line, 1.5, y + 0.002, -0.8));
  g.add(box(0.035, 0.035, 1.3, line, 1.5, y + 0.002, -0.8));
  g.add(box(1.8, 0.035, 0.035, line, 1.5, y + 0.002, -1.35));
  g.add(box(1.8, 0.035, 0.035, line, 1.5, y + 0.002, -0.25));

  // terrain en terre battue
  g.add(box(1.5, 0.03, 1.0, mat(skin.clay, { roughness: 1 }), 1.7, y, 1.0));

  // parasols rayés
  const parasol = (x, z, c) => {
    g.add(cyl(0.02, 0.02, 0.42, mat('#e8e4d8'), x, y, z, 6));
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 10), mat(c));
    top.position.set(x, y + 0.5, z); top.castShadow = true;
    g.add(top);
  };
  parasol(-2.2, 1.3, '#e02a2a');
  parasol(-0.5, 1.4, '#2f8fd0');
  parasol(-1.9, -1.3, '#f0cf22');

  // arbustes
  for (const [x, z] of [[2.5, 1.6], [-2.6, -1.5], [0.4, -1.5]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), mat('#2e8b57'));
    b.position.set(x, y + 0.2, z); b.scale.y = 0.8; b.castShadow = true;
    g.add(b);
  }
  return g;
}

/** Entrée : le perron en escalier posé au bord d'une case. */
export function buildEntrance(color) {
  const g = new THREE.Group();
  const m = mat('#f2f4f6');
  g.add(box(1.5, 0.09, 0.9, m, 0, 0, 0));
  g.add(box(1.15, 0.09, 0.66, m, 0, 0.09, 0));
  g.add(box(0.8, 0.09, 0.42, m, 0, 0.18, 0));
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.05), mat(color, {
    emissive: color, emissiveIntensity: 0.25
  }));
  flag.position.set(0, 0.45, 0);
  g.add(flag);
  g.add(cyl(0.025, 0.025, 0.3, mat('#8a9199'), 0, 0.27, 0, 6));
  return g;
}

/** Voiture du joueur. */
export function buildCar(colorHex) {
  const g = new THREE.Group();
  const body = mat(colorHex, { metalness: 0.35, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({
    color: '#cfe8ff', roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.85
  });
  g.add(box(1.5, 0.3, 0.78, body, 0, 0.12, 0));
  g.add(box(0.8, 0.3, 0.68, glass, -0.05, 0.42, 0));
  g.add(box(1.52, 0.08, 0.8, mat('#1b1f24'), 0, 0.08, 0));
  const tyre = mat('#15181c');
  for (const [x, z] of [[0.5, 0.42], [0.5, -0.42], [-0.5, 0.42], [-0.5, -0.42]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), tyre);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.18, z);
    w.castShadow = true;
    g.add(w);
  }
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat('#fff6cc', {
    emissive: '#ffe9a0', emissiveIntensity: 0.8
  }));
  light.position.set(0.74, 0.26, 0.24); g.add(light);
  const light2 = light.clone(); light2.position.z = -0.24; g.add(light2);
  return g;
}

/** Banque : bâtiment beige à toiture noire nervurée, comme sur le plateau. */
export function buildBank() {
  const g = new THREE.Group();
  const stone = mat('#e8d8b0');
  const dark = mat('#1d1d20', { roughness: 0.5 });
  g.add(box(5.6, 0.3, 3.6, dark));
  g.add(box(4.8, 1.5, 2.8, stone, 0, 0.3, 0));
  for (let i = -2; i <= 2; i++) {
    g.add(box(0.5, 1.1, 0.12, mat('#6b4a2f'), i * 0.95, 0.5, 1.42));
  }
  g.add(box(5.4, 0.9, 3.2, dark, 0, 1.8, 0));
  for (let i = -5; i <= 5; i++) {
    g.add(box(0.1, 0.06, 3.2, mat('#34343a'), i * 0.45, 2.7, 0));
  }
  return g;
}

/** Mairie : petit édifice sombre sur son parvis clair. */
export function buildTownHall() {
  const g = new THREE.Group();
  const stone = mat('#e8dcc0');
  const dark = mat('#1d1d20', { roughness: 0.5 });
  g.add(box(3.4, 0.3, 2.8, stone));
  g.add(box(2.6, 0.7, 2.2, stone, 0, 0.3, 0));
  g.add(box(2.9, 1.3, 2.4, dark, 0, 1.0, 0));
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), mat('#f4ead0', {
    emissive: '#d8c78a', emissiveIntensity: 0.4
  }));
  dial.position.set(0, 1.7, 1.21);
  g.add(dial);
  g.add(box(1.2, 0.3, 1.2, dark, 0, 2.3, 0));
  return g;
}
