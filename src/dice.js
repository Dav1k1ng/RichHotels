/**
 * dice.js — Les deux dés du jeu, en CSS 3D.
 *  - le dé « classique » (1 à 6) : déplacement et durée des séjours
 *  - le dé « permis de construire » : ROUGE / VERT / H / ×2
 */

import { PERMIT, PERMIT_FACES } from './data.js';

/** Orientation à appliquer au cube pour amener la face n (1..6) vers l'avant. */
const FACE_ROT = {
  1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180]
};

const PIPS = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
};

function faceEl(className, inner) {
  const el = document.createElement('div');
  el.className = 'die-face ' + className;
  el.innerHTML = inner;
  return el;
}

function pipFace(n) {
  const cells = Array.from({ length: 9 }, (_, i) =>
    '<i' + (PIPS[n].includes(i) ? ' class="on"' : '') + '></i>').join('');
  return '<div class="pips">' + cells + '</div>';
}

const PERMIT_FACE_HTML = {
  [PERMIT.REFUSE]: '<span class="pf red"></span>',
  [PERMIT.ACCORDE]: '<span class="pf green"></span>',
  [PERMIT.GRATUIT]: '<span class="pf letter">H</span>',
  [PERMIT.DOUBLE]: '<span class="pf letter">2</span>'
};

/** Crée un cube de dé dans `host`. `kind` vaut 'classic' ou 'permit'. */
export function createDie(host, kind) {
  host.innerHTML = '';
  const scene = document.createElement('div');
  scene.className = 'die-scene';
  const cube = document.createElement('div');
  cube.className = 'die-cube die-' + kind;
  const sides = ['front', 'right', 'top', 'bottom', 'left', 'back'];
  for (let i = 0; i < 6; i++) {
    const html = kind === 'classic'
      ? pipFace(i + 1)
      : PERMIT_FACE_HTML[PERMIT_FACES[i]];
    cube.appendChild(faceEl(sides[i], html));
  }
  scene.appendChild(cube);
  host.appendChild(scene);
  return cube;
}

/**
 * Lance le dé vers une face donnée.
 * @param {HTMLElement} cube  cube renvoyé par createDie
 * @param {number} face       1..6
 * @returns {Promise<void>}   résolue à la fin de l'animation
 */
export function rollTo(cube, face) {
  const [rx, ry] = FACE_ROT[face];
  const spinX = 360 * (2 + Math.floor(Math.random() * 2));
  const spinY = 360 * (2 + Math.floor(Math.random() * 2));
  cube.style.transition = 'none';
  cube.style.transform = 'rotateX(0deg) rotateY(0deg)';
  void cube.offsetWidth; // force le reflow pour relancer la transition
  cube.style.transition = 'transform 1.05s cubic-bezier(.17,.67,.3,1.0)';
  cube.style.transform = 'rotateX(' + (rx - spinX) + 'deg) rotateY(' + (ry + spinY) + 'deg)';
  return new Promise(res => setTimeout(res, 1100));
}

/** Face du dé « permis » correspondant à un résultat tiré par le moteur. */
export function permitFaceIndex(result) {
  const i = PERMIT_FACES.indexOf(result);
  return (i < 0 ? 0 : i) + 1;
}
