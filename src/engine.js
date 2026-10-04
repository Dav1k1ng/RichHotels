/**
 * engine.js — Moteur de règles de HOTEL. Aucune dépendance 3D : cet objet ne
 * connaît que l'état de la partie. La vue (Three.js) et l'interface s'y
 * abonnent via `on(event, callback)`.
 *
 * Règles implémentées, d'après 75021_NOTICE_RC 2023.pdf :
 *  p.3 mise en place, but du jeu, déroulement, achat et rachat de terrain
 *  p.4 permis de construire, dé « permis », Banque, Mairie
 *  p.5 entrée, entrée gratuite, construction gratuite, base de loisirs, séjour
 *  p.6 enchères, banqueroute, fin du jeu
 */

import {
  HOTELS, BOARD, BOARD_SIZE, TILE, PERMIT, PERMIT_FACES,
  BANK_LINE_TILE, MAIRIE_LINE_TILE, BANK_SALARY, START_TILES,
  PLAYER_COLORS, startingMoney, buildingLabel, money
} from './data.js';

const d6 = () => 1 + Math.floor(Math.random() * 6);

export class Game {
  constructor(playerNames) {
    const n = playerNames.length;
    this.players = playerNames.map((name, i) => ({
      id: i,
      name,
      color: PLAYER_COLORS[i].hex,
      colorName: PLAYER_COLORS[i].name,
      money: startingMoney(n),
      tile: START_TILES[i],
      alive: true
    }));
    this.initialPlayerCount = n;

    /** État de chaque complexe hôtelier. */
    this.plots = {};
    for (const code of Object.keys(HOTELS)) {
      this.plots[code] = {
        code,
        owner: null,     // id du joueur, ou null
        built: 0,        // nombre d'hôtels construits (principal + annexes)
        leisure: false,  // base de loisirs construite
        entrances: []    // index des cases portant une entrée de ce complexe
      };
    }

    this.current = 0;
    this.phase = 'roll';        // 'roll' | 'resolve' | 'free' | 'over'
    this.steps = [];            // file des étapes à résoudre pour ce tour
    this.extraRoll = false;     // un 6 a été fait : on rejouera
    this.turnLandDeal = false;  // un achat OU un rachat déjà fait ce tour
    this.turnMairieEntrances = 0;
    this.pendingBuild = null;   // construction accordée mais impayée
    this.debt = null;           // { amount, creditorId, reason }
    this.auction = null;
    this.winner = null;
    this.log = [];
    this._handlers = {};

    this.say('Début de la partie. ' + this.players.map(p =>
      p.name + ' (' + p.colorName + ') : ' + money(p.money)).join(' · '));
  }

  /* ---------------------------------------------------------------- events */
  on(evt, cb) {
    if (!this._handlers[evt]) this._handlers[evt] = [];
    this._handlers[evt].push(cb);
    return this;
  }
  emit(evt, payload) {
    for (const cb of this._handlers[evt] || []) cb(payload);
  }
  say(text) {
    this.log.push(text);
    this.emit('log', text);
  }
  changed() { this.emit('change'); }

  /* ----------------------------------------------------------- accesseurs */
  get player() { return this.players[this.current]; }
  get alivePlayers() { return this.players.filter(p => p.alive); }
  get step() { return this.steps[0] || null; }

  deed(code) { return HOTELS[code]; }

  /** Complexes possédés par un joueur. */
  plotsOf(playerId) {
    return Object.values(this.plots).filter(p => p.owner === playerId);
  }

  /** Nombre total d'hôtels constructibles sur un complexe. */
  maxBuildings(code) { return HOTELS[code].build.length; }

  /** Le complexe est-il entièrement construit ? */
  isComplete(code) {
    return this.plots[code].built === this.maxBuildings(code);
  }

  /** Prix d'une nuitée pour ce complexe dans son état actuel. */
  nightRate(code) {
    const plot = this.plots[code];
    const deed = HOTELS[code];
    if (plot.built === 0) return 0;
    return plot.leisure ? deed.leisureRent : deed.rents[plot.built - 1];
  }

  /** Coût cumulé des `count` prochains hôtels à bâtir sur ce complexe. */
  buildCost(code, count) {
    const deed = HOTELS[code];
    const from = this.plots[code].built;
    let total = 0;
    for (let i = from; i < from + count && i < deed.build.length; i++) total += deed.build[i];
    return total;
  }

  /** Case portant une entrée, quel qu'en soit le complexe. */
  entranceAt(tileIdx) {
    for (const plot of Object.values(this.plots)) {
      if (plot.entrances.includes(tileIdx)) return plot;
    }
    return null;
  }

  /** Cases où une entrée de ce complexe peut encore être posée. */
  entranceSpots(code) {
    const spots = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      const tile = BOARD[i];
      if (!tile.sides.includes(code)) continue;
      if (tile.t === TILE.GREY || tile.t === TILE.DEPART) continue;
      if (this.entranceAt(i)) continue;
      spots.push(i);
    }
    return spots;
  }

  /** Le complexe peut-il recevoir une entrée de plus ? */
  canAddEntrance(code) {
    const plot = this.plots[code];
    return plot.built > 0
      && plot.entrances.length < plot.built
      && this.entranceSpots(code).length > 0;
  }

  /** Valeur liquidative approximative d'un complexe (repère pour les enchères). */
  plotValue(code) {
    const plot = this.plots[code];
    const deed = HOTELS[code];
    let v = deed.land;
    for (let i = 0; i < plot.built; i++) v += deed.build[i];
    if (plot.leisure) v += deed.leisure;
    v += plot.entrances.length * deed.entrance;
    return v;
  }

  /* ------------------------------------------------------------ le tour */

  /** Lancer du dé « classique » et déplacement (notice p.3). */
  rollMove() {
    if (this.phase !== 'roll') return null;
    const die = d6();
    this.extraRoll = die === 6;
    this.turnLandDeal = false;
    this.turnMairieEntrances = 0;

    const me = this.player;
    const path = [];
    let pos = me.tile;
    let crossedMairie = false;

    const advance = () => {
      pos = (pos + 1) % BOARD_SIZE;
      path.push(pos);
      if (pos === BANK_LINE_TILE) this.crossBank();
      if (pos === MAIRIE_LINE_TILE) crossedMairie = true;
    };

    for (let i = 0; i < die; i++) advance();
    // « Deux voitures ne peuvent pas se retrouver sur la même case. »
    let guard = 0;
    while (this.players.some(p => p.alive && p.id !== me.id && p.tile === pos) && guard++ < BOARD_SIZE) {
      advance();
    }

    me.tile = pos;
    this.say(me.name + ' fait ' + die + ' et avance case ' + pos + '.');
    this.phase = 'resolve';
    this.steps = [];

    if (crossedMairie) this.steps.push({ kind: 'mairie' });
    this.queueLanding(pos);

    this.emit('move', { playerId: me.id, path, die });
    this.changed();
    return { die, path };
  }

  crossBank() {
    const me = this.player;
    // « Si vous jouez à 3 ou 4 joueurs et qu'il ne reste que 2 joueurs, ils ne
    //   reçoivent plus la somme de 2000. » (ne s'applique pas à une partie à 2)
    if (this.initialPlayerCount >= 3 && this.alivePlayers.length <= 2) {
      this.say(me.name + ' franchit la Banque, mais à deux joueurs restants le salaire ne tombe plus.');
      return;
    }
    me.money += BANK_SALARY;
    this.say(me.name + ' franchit la ligne rouge : +' + money(BANK_SALARY) + '.');
  }

  /** Détermine ce que la case d'arrivée déclenche. */
  queueLanding(tileIdx) {
    const tile = BOARD[tileIdx];
    const plot = this.entranceAt(tileIdx);

    if (plot && plot.owner !== null && plot.owner !== this.player.id
        && this.players[plot.owner].alive && plot.built > 0) {
      this.steps.push({ kind: 'stay', code: plot.code, ownerId: plot.owner });
    }

    switch (tile.t) {
      case TILE.ACHAT:
        this.steps.push({ kind: 'achat', codes: tile.sides.slice() });
        break;
      case TILE.PERMIS:
        if (this.plotsOf(this.player.id).length > 0) this.steps.push({ kind: 'permis' });
        break;
      case TILE.ENTREE_FREE:
        this.steps.push({ kind: 'entreeFree' });
        break;
      case TILE.CONSTR_FREE:
        this.steps.push({ kind: 'constrFree' });
        break;
      default:
        break;
    }
  }

  /** Clôt l'étape courante et passe à la suivante. */
  nextStep() {
    this.steps.shift();
    if (this.steps.length === 0 && this.phase === 'resolve') this.phase = 'free';
    this.changed();
  }

  /* --------------------------------------------------- séjour (notice p.5) */

  /** Le joueur lance le dé pour la durée de son séjour, puis paie. */
  rollStay() {
    const step = this.step;
    if (!step || step.kind !== 'stay') return null;
    const nights = d6();
    const rate = this.nightRate(step.code);
    const amount = rate * nights;
    const owner = this.players[step.ownerId];
    this.say(this.player.name + ' séjourne au ' + HOTELS[step.code].name + ' : '
      + nights + ' nuit(s) × ' + money(rate) + ' = ' + money(amount)
      + ' à payer à ' + owner.name + '.');
    this.emit('stayRolled', { nights, rate, amount, code: step.code });
    this.nextStep();
    this.transfer(this.player, owner, amount, 'séjour au ' + HOTELS[step.code].name);
    return { nights, rate, amount };
  }

  /* ------------------------------------------- terrain (notice p.3) */

  /** Achat d'un terrain nu. */
  buyLand(code) {
    const plot = this.plots[code];
    const deed = HOTELS[code];
    const me = this.player;
    if (plot.owner !== null || this.turnLandDeal || me.money < deed.land) return false;
    me.money -= deed.land;
    plot.owner = me.id;
    this.turnLandDeal = true;
    this.say(me.name + ' achète le terrain du ' + deed.name + ' pour ' + money(deed.land) + '.');
    this.emit('plotChanged', code);
    this.changed();
    return true;
  }

  /**
   * Rachat de terrain : possible si le terrain appartient à un autre joueur et
   * qu'aucun hôtel n'y est construit. La demande ne peut pas être refusée.
   */
  rebuyLand(code) {
    const plot = this.plots[code];
    const deed = HOTELS[code];
    const me = this.player;
    if (plot.owner === null || plot.owner === me.id) return false;
    if (plot.built > 0 || this.turnLandDeal || me.money < deed.rebuy) return false;
    const seller = this.players[plot.owner];
    me.money -= deed.rebuy;
    seller.money += deed.rebuy;
    plot.owner = me.id;
    this.turnLandDeal = true;
    this.say(me.name + ' rachète le terrain du ' + deed.name + ' à ' + seller.name
      + ' pour ' + money(deed.rebuy) + '.');
    this.emit('plotChanged', code);
    this.changed();
    return true;
  }

  /* ------------------------------ permis de construire (notice p.4) */

  /**
   * Demande de permis pour `count` hôtels sur un même terrain, puis lancer du
   * dé « permis ». Si le permis est délivré, la construction est obligatoire :
   * à défaut d'argent le joueur doit vendre un complexe aux enchères.
   */
  requestPermit(code, count) {
    const step = this.step;
    if (!step || step.kind !== 'permis') return null;
    const plot = this.plots[code];
    if (plot.owner !== this.player.id) return null;
    const left = this.maxBuildings(code) - plot.built;
    count = Math.max(1, Math.min(count, left));
    if (left === 0) return null;

    const face = PERMIT_FACES[Math.floor(Math.random() * PERMIT_FACES.length)];
    const base = this.buildCost(code, count);
    let cost = 0;
    if (face === PERMIT.ACCORDE) cost = base;
    else if (face === PERMIT.DOUBLE) cost = base * 2;

    this.emit('permitRolled', { face, code, count, cost });

    if (face === PERMIT.REFUSE) {
      this.say('Permis REFUSÉ pour ' + HOTELS[code].name + '. '
        + this.player.name + ' devra retenter sa chance.');
      this.nextStep();
      return { face, cost: 0 };
    }

    const label = face === PERMIT.GRATUIT ? 'GRATUIT'
      : face === PERMIT.DOUBLE ? 'ACCORDÉ (prix doublé)' : 'ACCORDÉ';
    this.say('Permis ' + label + ' : ' + count + ' hôtel(s) au ' + HOTELS[code].name
      + ' pour ' + money(cost) + '.');
    this.nextStep();

    if (this.player.money >= cost) {
      this.doBuild(code, count, cost);
    } else {
      // Construction obligatoire : il faut lever des fonds (notice p.4 et p.6).
      this.pendingBuild = { code, count, cost };
      this.openDebt(cost, null, 'construction obligatoire au ' + HOTELS[code].name);
    }
    return { face, cost };
  }

  doBuild(code, count, cost) {
    const plot = this.plots[code];
    this.player.money -= cost;
    const names = [];
    for (let i = 0; i < count; i++) {
      names.push(buildingLabel(plot.built));
      plot.built++;
    }
    this.say(this.player.name + ' construit : ' + names.join(', ') + ' au ' + HOTELS[code].name + '.');
    this.emit('plotChanged', code);
    this.changed();
  }

  /** Case « Construction gratuite » (notice p.5). */
  buildFree(code) {
    const step = this.step;
    if (!step || step.kind !== 'constrFree') return false;
    const plot = this.plots[code];
    if (plot.owner !== this.player.id) return false;

    if (!this.isComplete(code)) {
      this.doBuild(code, 1, 0);
    } else if (!plot.leisure) {
      plot.leisure = true;
      this.say(this.player.name + ' ajoute gratuitement la base de loisirs du ' + HOTELS[code].name + '.');
      this.emit('plotChanged', code);
    } else {
      return false;
    }
    this.nextStep();
    return true;
  }

  /* ----------------------------------------- entrées (notice p.5) */

  /** Pose d'une entrée (gratuite ou payée) sur une case bordant le complexe. */
  placeEntrance(code, tileIdx, { free = false } = {}) {
    const plot = this.plots[code];
    const deed = HOTELS[code];
    const me = this.player;
    if (plot.owner !== me.id || plot.built === 0) return false;
    if (plot.entrances.length >= plot.built) return false;
    if (!this.entranceSpots(code).includes(tileIdx)) return false;
    if (!free) {
      if (me.money < deed.entrance) return false;
      me.money -= deed.entrance;
    }
    plot.entrances.push(tileIdx);
    this.say(me.name + (free ? ' pose gratuitement' : ' achète') + ' une entrée du '
      + deed.name + ' case ' + tileIdx + (free ? '.' : ' (' + money(deed.entrance) + ').'));
    this.emit('plotChanged', code);
    this.changed();
    return true;
  }

  /** Entrée achetée en franchissant la ligne jaune de la Mairie. */
  buyEntranceAtMairie(code, tileIdx) {
    const step = this.step;
    if (!step || step.kind !== 'mairie') return false;
    // « une entrée par hôtel principal et par annexe, par tour »
    if (this.turnMairieEntrances >= this.plots[code].built) return false;
    if (!this.placeEntrance(code, tileIdx, { free: false })) return false;
    this.turnMairieEntrances++;
    return true;
  }

  /** Case « Entrée gratuite » (notice p.5). */
  takeFreeEntrance(code, tileIdx) {
    const step = this.step;
    if (!step || step.kind !== 'entreeFree') return false;
    if (!this.placeEntrance(code, tileIdx, { free: true })) return false;
    this.nextStep();
    return true;
  }

  /* ------------------------------- base de loisirs (notice p.5) */

  /**
   * Achetable à n'importe quel tour une fois le complexe entièrement construit.
   * Aucun permis n'est nécessaire.
   */
  buyLeisure(code) {
    const plot = this.plots[code];
    const deed = HOTELS[code];
    const me = this.player;
    if (plot.owner !== me.id || !this.isComplete(code) || plot.leisure) return false;
    if (me.money < deed.leisure) return false;
    me.money -= deed.leisure;
    plot.leisure = true;
    this.say(me.name + ' construit la base de loisirs du ' + deed.name
      + ' (' + money(deed.leisure) + '). Nuitée portée à ' + money(deed.leisureRent) + '.');
    this.emit('plotChanged', code);
    this.changed();
    return true;
  }

  /* ----------------------------------- paiements, enchères, faillite (p.6) */

  transfer(from, to, amount, reason) {
    if (from.money >= amount) {
      from.money -= amount;
      if (to) to.money += amount;
      this.changed();
      return true;
    }
    this.openDebt(amount, to ? to.id : null, reason);
    return false;
  }

  openDebt(amount, creditorId, reason) {
    this.debt = { amount, creditorId, reason };
    this.steps.unshift({ kind: 'debt' });
    this.phase = 'resolve';
    this.say(this.player.name + ' ne peut pas payer ' + money(amount)
      + ' (' + reason + ') : il doit vendre un complexe aux enchères.');
    this.changed();
  }

  /** Le joueur endetté met un de ses complexes en vente. */
  startAuction(code) {
    const plot = this.plots[code];
    if (plot.owner !== this.player.id) return false;
    this.auction = {
      code,
      sellerId: this.player.id,
      bidders: this.alivePlayers.filter(p => p.id !== this.player.id).map(p => p.id)
    };
    this.say('Enchères sur le complexe ' + HOTELS[code].name
      + ' (valeur investie ≈ ' + money(this.plotValue(code)) + ').');
    this.changed();
    return true;
  }

  /**
   * Adjudication. `bids` = { playerId: montant }. Le plus offrant emporte le
   * complexe au complet. Si personne n'enchérit, le complexe est rasé.
   */
  settleAuction(bids) {
    if (!this.auction) return false;
    const { code, sellerId } = this.auction;
    const plot = this.plots[code];
    const seller = this.players[sellerId];

    let bestId = null, best = 0;
    for (const [id, raw] of Object.entries(bids || {})) {
      const amount = Math.floor(Number(raw) || 0);
      const bidder = this.players[Number(id)];
      if (amount > best && bidder && bidder.alive && bidder.money >= amount) {
        best = amount; bestId = Number(id);
      }
    }

    if (bestId === null) {
      // « Si personne n'enchérit, le complexe est rasé. »
      plot.built = 0;
      plot.leisure = false;
      plot.entrances = [];
      plot.owner = null;
      this.say('Personne n\'enchérit : le ' + HOTELS[code].name
        + ' est rasé, son Titre de propriété retourne à la Banque.');
    } else {
      const buyer = this.players[bestId];
      buyer.money -= best;
      seller.money += best;
      plot.owner = bestId;
      this.say(buyer.name + ' emporte le ' + HOTELS[code].name + ' pour ' + money(best) + '.');
    }

    this.auction = null;
    this.emit('plotChanged', code);
    this.settleDebt();
    return true;
  }

  /** Après une vente, tente de solder la dette en cours. */
  settleDebt() {
    const me = this.player;
    if (!this.debt) { this.changed(); return; }

    if (me.money >= this.debt.amount) {
      const creditor = this.debt.creditorId !== null ? this.players[this.debt.creditorId] : null;
      me.money -= this.debt.amount;
      if (creditor) creditor.money += this.debt.amount;
      this.say(me.name + ' règle ' + money(this.debt.amount) + '.');
      this.debt = null;
      if (this.steps[0] && this.steps[0].kind === 'debt') this.steps.shift();
      if (this.pendingBuild) {
        const { code, count } = this.pendingBuild;
        this.pendingBuild = null;
        this.doBuild(code, count, 0); // le montant vient d'être prélevé
      }
      if (this.steps.length === 0) this.phase = 'free';
      this.changed();
      return;
    }

    // Plus rien à vendre : banqueroute.
    if (this.plotsOf(me.id).length === 0) {
      const creditor = this.debt.creditorId !== null ? this.players[this.debt.creditorId] : null;
      if (creditor) creditor.money += me.money;
      me.money = 0;
      this.debt = null;
      this.pendingBuild = null;
      this.eliminate(me);
      return;
    }
    this.changed();
  }

  eliminate(p) {
    p.alive = false;
    for (const plot of Object.values(this.plots)) {
      if (plot.owner === p.id) {
        plot.owner = null; plot.built = 0; plot.leisure = false; plot.entrances = [];
        this.emit('plotChanged', plot.code);
      }
    }
    this.say(p.name + ' fait banqueroute et quitte la partie.');
    this.steps = [];
    this.emit('eliminated', p.id);
    if (this.alivePlayers.length <= 1) {
      this.winner = this.alivePlayers[0] || null;
      this.phase = 'over';
      if (this.winner) this.say('🏆 ' + this.winner.name + ' remporte la partie !');
      this.emit('gameOver', this.winner);
      this.changed();
      return;
    }
    this.endTurn(true);
  }

  /* ------------------------------------------------------------ fin de tour */

  canEndTurn() {
    return this.phase === 'free' || (this.phase === 'resolve' && this.steps.length === 0);
  }

  endTurn(forced = false) {
    if (this.phase === 'over') return;
    if (!forced && !this.canEndTurn()) return;

    // « Si vous obtenez un 6, jouez votre tour puis relancez le dé. »
    if (!forced && this.extraRoll && this.player.alive) {
      this.extraRoll = false;
      this.phase = 'roll';
      this.say(this.player.name + ' a fait 6 : il rejoue.');
      this.changed();
      return;
    }

    this.extraRoll = false;
    let guard = 0;
    do {
      this.current = (this.current + 1) % this.players.length;
    } while (!this.players[this.current].alive && guard++ < this.players.length);

    this.phase = 'roll';
    this.steps = [];
    this.turnLandDeal = false;
    this.turnMairieEntrances = 0;
    this.say('— Au tour de ' + this.player.name + ' (' + money(this.player.money) + ').');
    this.changed();
  }
}
