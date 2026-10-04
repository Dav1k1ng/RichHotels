/**
 * main.js — Point d'entrée : configuration de la partie, création du moteur,
 * de la vue 3D et de l'interface.
 */

import { Game } from './engine.js';
import { BoardView } from './scene.js';
import { UI, askSetup } from './ui.js';

async function start() {
  const names = await askSetup();
  const game = new Game(names);
  const view = new BoardView(document.getElementById('view'));
  const ui = new UI(game, view);
  // Pratique pour inspecter l'état depuis la console du navigateur.
  Object.assign(window, { game, view, ui });
}

start();
