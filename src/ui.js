/**
 * ui.js — Interface du jeu : panneau d'actions contextuel, titres de propriété,
 * dés, journal, enchères. Toute la logique de règles vit dans engine.js ;
 * l'interface ne fait qu'offrir les coups légaux et les transmettre.
 */

import {
  HOTELS, HOTEL_ORDER, BOARD, TILE, PERMIT, PERMIT_LABEL,
  money, buildingLabel, PLAYER_COLORS
} from './data.js';
import { createDie, rollTo, permitFaceIndex } from './dice.js';
import { TILE_LEGEND, tileColor } from './scene.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export class UI {
  constructor(game, view) {
    this.game = game;
    this.view = view;
    this.busy = false;
    this.placement = null; // { code, free, onDone }

    this.elActions = $('#actions');
    this.elPlayers = $('#players');
    this.elDeeds = $('#deeds-body');
    this.elLog = $('#log-body');
    this.elTurn = $('#turn');
    this.elModal = $('#modal');

    this.classicDie = createDie($('#die-classic'), 'classic');
    this.permitDie = createDie($('#die-permit'), 'permit');

    view.onTileClick = (i) => this.handleTileClick(i);
    view.onPlotClick = (code) => this.showDeed(code);

    game.on('log', (t) => this.appendLog(t));
    game.on('change', () => this.render());
    game.on('plotChanged', (code) => this.syncPlot(code));
    game.on('eliminated', (id) => view.removeCar(id));
    game.on('gameOver', (w) => this.showGameOver(w));

    this.buildLegend();
    this.buildDeedList();
    for (const code of HOTEL_ORDER) this.syncPlot(code);
    for (const p of game.players) view.addCar(p.id, p.color, p.tile);
    for (const t of game.log) this.appendLog(t);
    this.render();

    $('#btn-rules').onclick = () => this.showRules();
    $('#log-toggle').onclick = () => $('#log').classList.toggle('collapsed');
    $('#deeds-toggle').onclick = () => $('#deeds').classList.toggle('collapsed');
  }

  /* ------------------------------------------------------------- rendu */

  syncPlot(code) {
    const plot = this.game.plots[code];
    this.view.syncPlot(code, plot);
    this.view.setPlotOwner(code, plot.owner !== null ? this.game.players[plot.owner].color : null);
    this.renderDeedCard(code);
  }

  render() {
    this.renderPlayers();
    this.renderTurn();
    this.renderActions();
    for (const code of HOTEL_ORDER) this.renderDeedCard(code);
  }

  renderTurn() {
    const g = this.game;
    if (g.phase === 'over') { this.elTurn.textContent = 'Partie terminée'; return; }
    const p = g.player;
    this.elTurn.innerHTML = '';
    const dot = el('span', 'dot');
    dot.style.background = p.color;
    this.elTurn.append(dot, el('span', '', 'Au tour de ' + p.name + ' — ' + money(p.money)));
  }

  renderPlayers() {
    this.elPlayers.innerHTML = '';
    for (const p of this.game.players) {
      const card = el('div', 'player' + (p.alive ? '' : ' dead')
        + (p.id === this.game.current && p.alive ? ' active' : ''));
      card.style.setProperty('--c', p.color);
      const head = el('div', 'p-head');
      head.append(el('span', 'p-name', p.name), el('span', 'p-money', money(p.money)));
      card.append(head);
      const plots = this.game.plotsOf(p.id);
      const list = el('div', 'p-plots');
      if (!plots.length) list.append(el('span', 'muted', p.alive ? 'aucun terrain' : 'éliminé'));
      for (const plot of plots) {
        const chip = el('span', 'chip');
        chip.style.borderColor = HOTELS[plot.code].color;
        chip.textContent = HOTELS[plot.code].name + ' ' + plot.built + '/'
          + HOTELS[plot.code].build.length
          + (plot.leisure ? ' ★' : '')
          + ' · ' + plot.entrances.length + '🚪';
        chip.title = 'Nuitée : ' + money(this.game.nightRate(plot.code));
        chip.onclick = () => this.showDeed(plot.code);
        list.append(chip);
      }
      card.append(list);
      this.elPlayers.append(card);
    }
  }

  /* -------------------------------------------------- panneau d'actions */

  btn(label, fn, cls = '') {
    const b = el('button', 'btn ' + cls, label);
    b.onclick = fn;
    return b;
  }

  panel(title, hint) {
    this.elActions.innerHTML = '';
    const head = el('div', 'act-head');
    head.append(el('h3', '', title));
    if (hint) head.append(el('p', 'hint', hint));
    this.elActions.append(head);
    const body = el('div', 'act-body');
    this.elActions.append(body);
    return body;
  }

  renderActions() {
    const g = this.game;
    if (this.busy || this.placement) return;

    if (g.phase === 'over') {
      const body = this.panel('Fin de partie', g.winner ? g.winner.name + ' remporte la partie.' : '');
      body.append(this.btn('Nouvelle partie', () => location.reload(), 'primary'));
      return;
    }

    if (g.phase === 'roll') {
      const body = this.panel('Tour de ' + g.player.name, 'Lancez le dé « classique » et avancez.');
      body.append(this.btn('🎲 Lancer le dé', () => this.doRollMove(), 'primary'));
      return;
    }

    const step = g.step;
    if (!step) return this.renderFreePhase();

    switch (step.kind) {
      case 'debt': return this.renderDebt();
      case 'stay': return this.renderStay(step);
      case 'mairie': return this.renderMairie();
      case 'achat': return this.renderAchat(step);
      case 'permis': return this.renderPermis();
      case 'entreeFree': return this.renderEntreeFree();
      case 'constrFree': return this.renderConstrFree();
      default: return this.renderFreePhase();
    }
  }

  renderFreePhase() {
    const g = this.game;
    const me = g.player;
    const body = this.panel('Actions libres',
      'Base de loisirs : constructible à tout moment une fois le complexe achevé, sans permis.');
    let any = false;
    for (const plot of g.plotsOf(me.id)) {
      if (g.isComplete(plot.code) && !plot.leisure) {
        const deed = HOTELS[plot.code];
        const can = me.money >= deed.leisure;
        const b = this.btn('🏊 Base de loisirs — ' + deed.name + ' (' + money(deed.leisure)
          + ' → nuitée ' + money(deed.leisureRent) + ')', () => g.buyLeisure(plot.code));
        b.disabled = !can;
        body.append(b);
        any = true;
      }
    }
    if (!any) body.append(el('p', 'muted', 'Rien à construire pour l\'instant.'));
    body.append(this.btn(g.extraRoll ? '🎲 6 obtenu — rejouer' : 'Terminer le tour',
      () => g.endTurn(), 'primary'));
  }

  renderStay(step) {
    const g = this.game;
    const deed = HOTELS[step.code];
    const owner = g.players[step.ownerId];
    const body = this.panel('Séjour au ' + deed.name,
      'Hôtel de ' + owner.name + '. Nuitée : ' + money(g.nightRate(step.code))
      + '. Lancez le dé pour la durée du séjour (1 à 6 nuits).');
    body.append(this.btn('🎲 Lancer le dé du séjour', () => this.doRollStay(), 'primary'));
  }

  renderMairie() {
    const g = this.game;
    const me = g.player;
    const body = this.panel('Mairie — ligne jaune franchie',
      'Vous pouvez acheter une entrée par hôtel principal et par annexe, pour ce tour.');
    let any = false;
    for (const plot of g.plotsOf(me.id)) {
      const deed = HOTELS[plot.code];
      if (!g.canAddEntrance(plot.code)) continue;
      if (g.turnMairieEntrances >= plot.built) continue;
      const b = this.btn('🚪 Entrée ' + deed.name + ' — ' + money(deed.entrance)
        + ' (' + plot.entrances.length + '/' + plot.built + ')',
        () => this.startPlacement(plot.code, false));
      b.disabled = me.money < deed.entrance;
      body.append(b);
      any = true;
    }
    if (!any) body.append(el('p', 'muted',
      'Aucune entrée achetable (il faut un hôtel construit et une case libre à ses côtés).'));
    body.append(this.btn('Passer', () => g.nextStep()));
  }

  renderAchat(step) {
    const g = this.game;
    const me = g.player;
    const body = this.panel('Case « Achat de terrain »',
      'Un seul achat OU un seul rachat par tour. Seuls les terrains bordant cette case sont proposés.');
    for (const code of step.codes) {
      const deed = HOTELS[code];
      const plot = g.plots[code];
      if (plot.owner === null) {
        const b = this.btn('🟩 Acheter ' + deed.name + ' — ' + money(deed.land),
          () => { g.buyLand(code); g.nextStep(); });
        b.disabled = g.turnLandDeal || me.money < deed.land;
        body.append(b);
      } else if (plot.owner !== me.id && plot.built === 0) {
        const owner = g.players[plot.owner];
        const b = this.btn('♻️ Racheter ' + deed.name + ' à ' + owner.name + ' — ' + money(deed.rebuy),
          () => { g.rebuyLand(code); g.nextStep(); });
        b.disabled = g.turnLandDeal || me.money < deed.rebuy;
        b.title = 'La demande de rachat ne peut pas être refusée.';
        body.append(b);
      } else {
        const tag = plot.owner === me.id ? 'déjà à vous' : 'déjà construit, rachat impossible';
        body.append(el('p', 'muted', deed.name + ' : ' + tag + '.'));
      }
    }
    body.append(this.btn('Passer', () => g.nextStep()));
  }

  renderPermis() {
    const g = this.game;
    const me = g.player;
    const body = this.panel('Case « Permis de construire »',
      'Choisissez un terrain et le nombre d\'hôtels. L\'ordre est imposé : hôtel principal, puis annexes. '
      + 'Si le permis est délivré, la construction devient obligatoire.');
    let any = false;
    for (const plot of g.plotsOf(me.id)) {
      const deed = HOTELS[plot.code];
      const left = deed.build.length - plot.built;
      if (left === 0) continue;
      any = true;
      const row = el('div', 'row');
      row.append(el('span', 'row-label', deed.name));
      const sel = el('select');
      for (let n = 1; n <= left; n++) {
        const o = el('option', '', n + ' × ' + (n === 1 ? buildingLabel(plot.built) : 'hôtels')
          + ' — ' + money(g.buildCost(plot.code, n)));
        o.value = String(n);
        sel.append(o);
      }
      row.append(sel);
      row.append(this.btn('Demander', () => this.doPermit(plot.code, Number(sel.value)), 'primary'));
      body.append(row);
    }
    if (!any) body.append(el('p', 'muted', 'Aucun terrain constructible.'));
    body.append(this.btn('Passer', () => g.nextStep()));
  }

  renderEntreeFree() {
    const g = this.game;
    const body = this.panel('Case « Entrée gratuite »', 'Ajoutez une entrée à l\'un de vos hôtels, sans payer.');
    let any = false;
    for (const plot of g.plotsOf(g.player.id)) {
      if (!g.canAddEntrance(plot.code)) continue;
      any = true;
      body.append(this.btn('🚪 ' + HOTELS[plot.code].name
        + ' (' + plot.entrances.length + '/' + plot.built + ')',
        () => this.startPlacement(plot.code, true)));
    }
    if (!any) body.append(el('p', 'muted', 'Aucun hôtel ne peut recevoir d\'entrée supplémentaire.'));
    body.append(this.btn('Passer', () => g.nextStep()));
  }

  renderConstrFree() {
    const g = this.game;
    const body = this.panel('Case « Construction gratuite »',
      'Un hôtel offert. Si le complexe est déjà achevé, vous recevez sa base de loisirs.');
    let any = false;
    for (const plot of g.plotsOf(g.player.id)) {
      const deed = HOTELS[plot.code];
      if (!g.isComplete(plot.code)) {
        body.append(this.btn('🏗️ ' + deed.name + ' — ' + buildingLabel(plot.built) + ' offert',
          () => g.buildFree(plot.code)));
        any = true;
      } else if (!plot.leisure) {
        body.append(this.btn('🏊 ' + deed.name + ' — base de loisirs offerte',
          () => g.buildFree(plot.code)));
        any = true;
      }
    }
    if (!any) body.append(el('p', 'muted', 'Rien à construire.'));
    body.append(this.btn('Passer', () => g.nextStep()));
  }

  renderDebt() {
    const g = this.game;
    const me = g.player;
    const body = this.panel('Enchères obligatoires',
      me.name + ' doit réunir ' + money(g.debt.amount) + ' (' + g.debt.reason + '). '
      + 'Un complexe se vend en entier : terrain, hôtels, entrées et base de loisirs.');
    const mine = g.plotsOf(me.id);
    if (!mine.length) {
      body.append(el('p', 'muted', 'Plus rien à vendre.'));
      body.append(this.btn('Déclarer banqueroute', () => g.settleDebt(), 'danger'));
      return;
    }
    for (const plot of mine) {
      body.append(this.btn('⚖️ Vendre ' + HOTELS[plot.code].name
        + ' (investi ≈ ' + money(g.plotValue(plot.code)) + ')',
        () => this.openAuction(plot.code)));
    }
  }

  /* --------------------------------------------- actions avec animation */

  async doRollMove() {
    const g = this.game;
    this.busy = true;
    this.elActions.innerHTML = '';
    const res = g.rollMove();
    if (!res) { this.busy = false; return; }
    await rollTo(this.classicDie, res.die);
    await this.view.animateCar(g.current, res.path);
    this.view.focusTile(g.player.tile);
    this.busy = false;
    this.render();
  }

  async doRollStay() {
    const g = this.game;
    this.busy = true;
    this.elActions.innerHTML = '';
    const res = g.rollStay();
    if (res) await rollTo(this.classicDie, res.nights);
    this.busy = false;
    this.render();
  }

  async doPermit(code, count) {
    const g = this.game;
    this.busy = true;
    this.elActions.innerHTML = '';
    const res = g.requestPermit(code, count);
    if (res) {
      await rollTo(this.permitDie, permitFaceIndex(res.face));
      this.flash(PERMIT_LABEL[res.face], res.face === PERMIT.REFUSE ? 'bad' : 'good');
    }
    this.busy = false;
    this.render();
  }

  /* ------------------------------------------------- pose d'une entrée */

  startPlacement(code, free) {
    const spots = this.game.entranceSpots(code);
    // `free` distingue la case « Entrée gratuite » de l'achat en passant par la Mairie.
    this.placement = { code, free };
    this.view.setHighlight(spots);
    const body = this.panel('Où poser l\'entrée du ' + HOTELS[code].name + ' ?',
      'Cliquez une case verte du plateau. Les cases grisées (Banque, Mairie, Départ) sont interdites, '
      + 'et deux entrées ne peuvent pas partager une case.');
    const list = el('div', 'spots');
    for (const i of spots) {
      list.append(this.btn('Case ' + i, () => this.finishPlacement(i)));
    }
    body.append(list);
    body.append(this.btn('Annuler', () => { this.cancelPlacement(); }));
  }

  handleTileClick(i) {
    if (this.placement && this.view.highlight.has(i)) this.finishPlacement(i);
  }

  finishPlacement(tileIdx) {
    const { code, free } = this.placement;
    const g = this.game;
    // Chaque voie a ses propres limites (gratuité, quota par tour) : pas de repli
    // sur placeEntrance, qui court-circuiterait ces contrôles.
    if (free) g.takeFreeEntrance(code, tileIdx);
    else g.buyEntranceAtMairie(code, tileIdx);
    this.cancelPlacement();
  }

  cancelPlacement() {
    this.placement = null;
    this.view.setHighlight([]);
    this.render();
  }

  /* --------------------------------------------------------- enchères */

  openAuction(code) {
    const g = this.game;
    g.startAuction(code);
    const bidders = g.auction.bidders;
    const wrap = this.modal('Enchères — ' + HOTELS[code].name,
      'Pas d\'enchère minimum. Le complexe part au plus offrant ; si personne n\'enchérit, il est rasé.');
    const inputs = {};
    for (const id of bidders) {
      const p = g.players[id];
      const row = el('div', 'row');
      const dot = el('span', 'dot'); dot.style.background = p.color;
      row.append(dot, el('span', 'row-label', p.name + ' (' + money(p.money) + ')'));
      const inp = el('input');
      inp.type = 'number'; inp.min = '0'; inp.step = '50'; inp.value = '0';
      inp.max = String(p.money);
      inputs[id] = inp;
      row.append(inp);
      wrap.append(row);
    }
    const actions = el('div', 'act-body');
    actions.append(this.btn('Adjuger', () => {
      const bids = {};
      for (const [id, inp] of Object.entries(inputs)) bids[id] = inp.value;
      this.closeModal();
      g.settleAuction(bids);
    }, 'primary'));
    wrap.append(actions);
  }

  /* ------------------------------------------- titres de propriété & aide */

  buildDeedList() {
    this.elDeeds.innerHTML = '';
    this.deedCards = {};
    for (const code of HOTEL_ORDER) {
      const card = el('div', 'deed');
      card.style.setProperty('--c', HOTELS[code].color);
      card.onclick = () => this.showDeed(code);
      this.elDeeds.append(card);
      this.deedCards[code] = card;
      this.renderDeedCard(code);
    }
  }

  renderDeedCard(code) {
    const card = this.deedCards && this.deedCards[code];
    if (!card) return;
    const deed = HOTELS[code];
    const plot = this.game.plots[code];
    const owner = plot.owner !== null ? this.game.players[plot.owner] : null;
    card.innerHTML = '';
    const top = el('div', 'deed-top');
    top.append(el('strong', '', deed.name));
    top.append(el('span', 'deed-land', money(deed.land)));
    card.append(top);
    const sub = el('div', 'deed-sub');
    sub.textContent = owner
      ? owner.name + ' · ' + plot.built + '/' + deed.build.length + ' hôtel(s)'
        + (plot.leisure ? ' + loisirs' : '') + ' · nuitée ' + money(this.game.nightRate(code))
      : 'libre · ' + deed.build.length + ' hôtel(s) constructible(s)';
    if (owner) sub.style.color = owner.color;
    card.append(sub);
  }

  showDeed(code) {
    const deed = HOTELS[code];
    const plot = this.game.plots[code];
    const wrap = this.modal('Titre de propriété — ' + deed.name, deed.country);
    const table = el('table', 'deed-table');
    const row = (a, b) => {
      const tr = el('tr');
      tr.append(el('td', '', a), el('td', 'num', b));
      table.append(tr);
    };
    row('Terrain', money(deed.land));
    row('Rachat de terrain', money(deed.rebuy));
    row('Entrée', money(deed.entrance));
    deed.build.forEach((c, i) => row('Construction — ' + buildingLabel(i), money(c)));
    row('Base de loisirs', money(deed.leisure));
    wrap.append(table);

    wrap.append(el('h4', '', 'Prix de la nuitée'));
    const t2 = el('table', 'deed-table');
    deed.rents.forEach((r, i) => {
      const tr = el('tr');
      if (plot.built === i + 1 && !plot.leisure) tr.className = 'cur';
      tr.append(el('td', '', (i + 1) + ' hôtel(s) construit(s)'), el('td', 'num', money(r)));
      t2.append(tr);
    });
    const tr = el('tr');
    if (plot.leisure) tr.className = 'cur';
    tr.append(el('td', '', 'Complexe achevé + base de loisirs'), el('td', 'num', money(deed.leisureRent)));
    t2.append(tr);
    wrap.append(t2);
    wrap.append(el('p', 'hint', 'Séjour dû = prix de la nuitée × dé (1 à 6 nuits).'));
  }

  buildLegend() {
    const host = $('#legend');
    for (const item of TILE_LEGEND) {
      const row = el('span', 'leg');
      const sw = el('i');
      sw.style.background = tileColor(item.t);
      row.append(sw, document.createTextNode(item.label));
      host.append(row);
    }
  }

  showRules() {
    const wrap = this.modal('Règles — HOTEL (Lansay 2023)', 'Résumé de la notice fournie.');
    wrap.innerHTML += `
      <h4>But du jeu</h4>
      <p>Être le dernier joueur en jeu, en poussant tous ses adversaires à la faillite.</p>
      <h4>Devenir hôtelier en 6 leçons</h4>
      <ol>
        <li>Devenez propriétaire d'un terrain.</li>
        <li>Obtenez un permis de construire.</li>
        <li>Achetez l'hôtel principal du complexe.</li>
        <li>Procurez-vous des entrées pour faire séjourner des clients.</li>
        <li>Ajoutez annexes, bases de loisirs et entrées pour augmenter le prix du séjour.</li>
        <li>Recommencez avec d'autres complexes.</li>
      </ol>
      <h4>Le tour</h4>
      <p>Lancez le dé « classique » et avancez. Deux voitures ne peuvent pas occuper
      la même case : avancez jusqu'à la prochaine case libre. Sur un 6, rejouez après
      avoir terminé toutes vos actions.</p>
      <h4>Terrain</h4>
      <p>Sur une case « Achat de terrain », achetez un terrain nu bordant la case.
      Si un terrain voisin appartient à un adversaire et qu'aucun hôtel n'y est bâti,
      vous pouvez le racheter à la moitié du prix : la demande ne peut pas être refusée.
      Un seul achat <em>ou</em> rachat par tour.</p>
      <h4>Permis de construire</h4>
      <p>Avec un titre en main, demandez un permis et lancez le dé « permis » :
      ROUGE refusé · VERT payez le prix · H gratuit · ×2 payez le double. Un même permis
      autorise plusieurs hôtels, mais sur un seul terrain. Permis délivré = construction
      obligatoire, quitte à vendre aux enchères.</p>
      <h4>Banque &amp; Mairie</h4>
      <p>Ligne rouge franchie : +2000 (sauf s'il ne reste que 2 joueurs dans une partie
      lancée à 3 ou 4). Ligne jaune franchie : achetez une entrée par hôtel principal et
      par annexe.</p>
      <h4>Entrées &amp; séjours</h4>
      <p>Sans entrée, personne ne peut séjourner chez vous. Une entrée se pose sur une
      case voisine de l'hôtel, jamais sur une case grisée, jamais deux sur la même case.
      Un adversaire qui s'arrête sur votre entrée lance le dé : il paie la nuitée × le
      nombre de nuits.</p>
      <h4>Base de loisirs</h4>
      <p>Une fois le complexe entièrement construit, achetez-la sans permis, à n'importe
      quel tour : le prix du séjour grimpe fortement.</p>
      <h4>Enchères &amp; banqueroute</h4>
      <p>Si vous ne pouvez pas payer, vendez un complexe entier au plus offrant — pas
      d'enchère minimum. Si personne n'enchérit, le complexe est rasé et le titre
      retourne à la Banque. Sans argent, sans hôtel ni terrain : banqueroute.</p>`;
  }

  showGameOver(winner) {
    const wrap = this.modal('🏆 Fin de partie', winner ? winner.name + ' remporte la partie !' : '');
    wrap.append(this.btn('Nouvelle partie', () => location.reload(), 'primary'));
  }

  /* ------------------------------------------------------------- divers */

  modal(title, subtitle) {
    this.elModal.innerHTML = '';
    this.elModal.classList.add('open');
    const card = el('div', 'modal-card');
    const close = el('button', 'modal-close', '✕');
    close.onclick = () => this.closeModal();
    card.append(close, el('h2', '', title));
    if (subtitle) card.append(el('p', 'hint', subtitle));
    const body = el('div', 'modal-body');
    card.append(body);
    this.elModal.append(card);
    return body;
  }

  closeModal() {
    this.elModal.classList.remove('open');
    this.elModal.innerHTML = '';
  }

  flash(text, kind) {
    const f = el('div', 'flash ' + (kind || ''), text);
    document.body.append(f);
    setTimeout(() => f.remove(), 2200);
  }

  appendLog(text) {
    const line = el('div', 'log-line', text);
    this.elLog.append(line);
    this.elLog.scrollTop = this.elLog.scrollHeight;
  }
}

/** Écran de configuration : nombre de joueurs et noms. */
export function askSetup() {
  return new Promise(resolve => {
    const host = $('#setup');
    host.classList.add('open');
    const nameInputs = [];
    const list = $('#setup-names');

    const build = (n) => {
      list.innerHTML = '';
      nameInputs.length = 0;
      for (let i = 0; i < n; i++) {
        const row = el('div', 'row');
        const dot = el('span', 'dot');
        dot.style.background = PLAYER_COLORS[i].hex;
        const inp = el('input');
        inp.type = 'text';
        inp.value = 'Joueur ' + (i + 1);
        inp.maxLength = 14;
        nameInputs.push(inp);
        row.append(dot, el('span', 'row-label', PLAYER_COLORS[i].name), inp);
        list.append(row);
      }
      $('#setup-money').textContent = n === 4 ? '12 000' : '16 000';
    };

    let count = 4;
    for (const b of document.querySelectorAll('#setup-count button')) {
      b.onclick = () => {
        count = Number(b.dataset.n);
        for (const o of document.querySelectorAll('#setup-count button')) o.classList.remove('on');
        b.classList.add('on');
        build(count);
      };
    }
    document.querySelector('#setup-count button[data-n="4"]').classList.add('on');
    build(count);

    $('#setup-go').onclick = () => {
      host.classList.remove('open');
      resolve(nameInputs.map((i, k) => i.value.trim() || 'Joueur ' + (k + 1)));
    };
  });
}
