/**
 * data.js — Données du jeu HOTEL (édition Lansay 2023, réf. 75021)
 *
 * Sources :
 *  - 75021_NOTICE_RC 2023.pdf (règles officielles FR, fourni dans ce dossier)
 *  - Titres de propriété de l'édition 2023/2024 (valeurs relevées sur hotelboardgame.com)
 *
 * Lecture des Titres de propriété :
 *  - land        : prix d'achat du terrain
 *  - rebuy       : rachat de terrain = moitié du prix d'achat (notice p.3)
 *  - entrance    : prix d'une entrée
 *  - build[]     : coût de construction, dans l'ordre imposé
 *                  (index 0 = Hôtel principal, puis Annexe 1, 2, 3, 4)
 *  - rents[]     : PRIX D'UNE NUITÉE selon le nombre d'hôtels construits
 *                  (index 0 = 1 hôtel construit, index 1 = 2 hôtels, ...)
 *  - leisure     : coût de la base de loisirs
 *  - leisureRent : prix d'une nuitée une fois la base de loisirs construite
 *
 * Séjour dû = prix de la nuitée × résultat du dé « classique » (1 à 6 nuits).
 * Contrôle avec l'exemple de la notice (p.5) : Mont Blanc, 3 hôtels, pas de
 * base de loisirs, dé = 4  ->  250 × 4 = 1000. OK
 */

/**
 * Les bases de loisirs du Fujiyama et du Boomerang Bay sont relevées à 250 sur
 * la source. C'est très probablement une coquille (250 pour une nuitée portée à
 * 400/600 serait rentabilisé en une seule nuit). Passez ce drapeau à true pour
 * utiliser 2500, valeur cohérente avec les autres complexes.
 */
export const PATCH_EQUILIBRAGE = false;
const leisureFuj = PATCH_EQUILIBRAGE ? 2500 : 250;
const leisureBoo = PATCH_EQUILIBRAGE ? 2500 : 250;

/**
 * Habillage du plateau, relevé par échantillonnage sur les photos du jeu
 * (Hotel01/02/03.jpg) puis corrigé de la sous-exposition des clichés.
 *
 * La chaussée du jeu réel se lit, en coupe : liseré bleu ciel · bande noire ·
 * case blanche illustrée · bande noire · liseré bleu ciel, les cases étant
 * séparées par un trait rouge qui traverse toute la largeur.
 */
export const SKIN = {
  asphalt: '#121214',    // les deux bandes noires
  lane: '#f4f1e8',       // la case blanche, au centre de la chaussée
  edge: '#2fa8e0',       // liseré bleu ciel, de part et d'autre
  separator: '#e02a2a',  // trait rouge entre deux cases
  lawn: '#3fae4a',       // pelouse des parcelles
  sand: '#e8bf49',       // plages et abords
  path: '#cdb79a',       // allées
  water: '#2f8fd0',      // piscines
  court: '#5fae4f',      // courts de tennis gazon
  clay: '#e06a3c',       // courts en terre battue
  parking: '#c9c9c6',    // sol de la zone de départ
  bankBand: '#f0cf22',   // bandeau jaune « Recevez 2000 »
  freeArrow: '#2fa8e0',  // flèches « Entrée / Construction gratuite »
  boardEdge: '#c8102e',  // liseré rouge du pourtour du plateau
  boardBase: '#101820'
};

export const HOTELS = {
  BOO: {
    code: 'BOO', name: 'Boomerang Bay', country: 'Australie',
    color: '#e8c06a', roof: '#d8a93f', accent: '#fff0c8', style: 'courbe',
    plastic: '#e8c06a', facade: '#f3dca0',
    land: 500, rebuy: 250, entrance: 100,
    build: [1800],
    rents: [400],
    leisure: leisureBoo, leisureRent: 600
  },
  FUJ: {
    code: 'FUJ', name: 'Fujiyama', country: 'Japon',
    color: '#a8702f', roof: '#22221f', accent: '#f0cf8a', style: 'pagode',
    plastic: '#22221f', facade: '#a8702f',
    land: 1000, rebuy: 500, entrance: 100,
    build: [2200, 1400, 1400],
    rents: [50, 50, 100],
    leisure: leisureFuj, leisureRent: 400
  },
  SAH: {
    code: 'SAH', name: 'Sahara', country: 'Maroc',
    color: '#c0392b', roof: '#1f1d1c', accent: '#f2d6c0', style: 'courbe',
    plastic: '#1f1d1c', facade: '#c0392b',
    land: 1500, rebuy: 750, entrance: 100,
    build: [2400, 1000, 500],
    rents: [100, 100, 200],
    leisure: 1000, leisureRent: 300
  },
  MON: {
    code: 'MON', name: 'Mont Blanc', country: 'France',
    color: '#6b4a2f', roof: '#3a2a1c', accent: '#e8d8b8', style: 'chalet',
    plastic: '#3a2a1c', facade: '#8a6440',
    land: 2000, rebuy: 1000, entrance: 150,
    build: [2600, 1200, 1200],
    rents: [100, 100, 250],
    leisure: 2000, leisureRent: 500
  },
  MIR: {
    code: 'MIR', name: 'Mirasol', country: 'Espagne',
    color: '#e0cf9a', roof: '#d2bc82', accent: '#fff8e0', style: 'palais',
    plastic: '#ead9a6', facade: '#f2e6c0',
    land: 2500, rebuy: 1250, entrance: 200,
    build: [3600, 2600, 1800, 1800],
    rents: [150, 300, 300, 450],
    leisure: 3000, leisureRent: 600
  },
  WAI: {
    code: 'WAI', name: 'Waikiki', country: 'Hawaii',
    color: '#5a3a24', roof: '#33210f', accent: '#e8d0a8', style: 'bungalow',
    plastic: '#33210f', facade: '#6b4830',
    land: 2500, rebuy: 1250, entrance: 200,
    build: [3500, 2500, 2500, 1750, 1750],
    rents: [200, 350, 500, 500, 650],
    leisure: 2500, leisureRent: 1000
  },
  REG: {
    code: 'REG', name: 'Regency', country: 'Royaume-Uni',
    color: '#2f6f9e', roof: '#f0d49a', accent: '#ffffff', style: 'tour',
    plastic: '#f0d49a', facade: '#2f6f9e',
    land: 3000, rebuy: 1500, entrance: 250,
    build: [3300, 2200, 1800, 1800, 1800],
    rents: [150, 300, 300, 300, 450],
    leisure: 4000, leisureRent: 750
  },
  LIB: {
    code: 'LIB', name: 'Liberty', country: 'Etats-Unis',
    color: '#3a4652', roof: '#23262b', accent: '#9fb4c4', style: 'gratte',
    plastic: '#23262b', facade: '#3a4652',
    land: 3500, rebuy: 1750, entrance: 250,
    build: [5000, 3000, 2250, 1750],
    rents: [200, 400, 600, 800],
    leisure: 5000, leisureRent: 1200
  }
};

/** Ordre de parcours du plateau. */
export const HOTEL_ORDER = ['BOO', 'SAH', 'FUJ', 'MON', 'MIR', 'REG', 'WAI', 'LIB'];

/** Nom de l'élément construit à l'index donné. */
export function buildingLabel(i) {
  return i === 0 ? 'Hôtel principal' : 'Annexe ' + i;
}

/* --------------------------------------------------------------------------
 * Types de cases
 * ----------------------------------------------------------------------- */
export const TILE = {
  DEPART: 'depart',
  PLAIN: 'plain',
  ACHAT: 'achat',              // Achat de terrain
  PERMIS: 'permis',            // Permis de construire
  ENTREE_FREE: 'entree',       // Entrée gratuite
  CONSTR_FREE: 'construction', // Construction gratuite
  GREY: 'grey'                 // case grisée : aucune entrée ne peut y être posée
};

/**
 * Le circuit : 48 cases. `sides` = complexes hôteliers bordant la case.
 * Une entrée ne peut être posée que sur une case bordant l'hôtel et non grisée
 * (notice p.5).
 */
export const BOARD = [
  { t: TILE.DEPART, sides: [] },                 // 0
  { t: TILE.DEPART, sides: [] },                 // 1
  { t: TILE.DEPART, sides: [] },                 // 2
  { t: TILE.DEPART, sides: [] },                 // 3
  { t: TILE.ACHAT, sides: ['BOO'] },             // 4
  { t: TILE.PLAIN, sides: ['BOO'] },             // 5
  { t: TILE.ACHAT, sides: ['BOO', 'SAH'] },      // 6
  { t: TILE.PLAIN, sides: ['SAH'] },             // 7
  { t: TILE.PERMIS, sides: ['SAH'] },            // 8
  { t: TILE.PLAIN, sides: ['SAH'] },             // 9
  { t: TILE.ENTREE_FREE, sides: ['SAH'] },       // 10
  { t: TILE.GREY, sides: [] },                   // 11  abords de la Banque
  { t: TILE.GREY, sides: [] },                   // 12  abords de la Banque
  { t: TILE.ACHAT, sides: ['SAH', 'FUJ'] },      // 13
  { t: TILE.PLAIN, sides: ['FUJ'] },             // 14
  { t: TILE.PERMIS, sides: ['FUJ'] },            // 15
  { t: TILE.PLAIN, sides: ['FUJ'] },             // 16
  { t: TILE.ACHAT, sides: ['FUJ', 'MON'] },      // 17
  { t: TILE.PLAIN, sides: ['MON'] },             // 18
  { t: TILE.CONSTR_FREE, sides: ['MON'] },       // 19
  { t: TILE.PLAIN, sides: ['MON'] },             // 20
  { t: TILE.ACHAT, sides: ['MON', 'MIR'] },      // 21
  { t: TILE.PLAIN, sides: ['MIR'] },             // 22
  { t: TILE.PERMIS, sides: ['MIR'] },            // 23
  { t: TILE.PLAIN, sides: ['MIR'] },             // 24
  { t: TILE.ENTREE_FREE, sides: ['MIR'] },       // 25
  { t: TILE.PLAIN, sides: ['MIR'] },             // 26
  { t: TILE.ACHAT, sides: ['MIR', 'REG'] },      // 27
  { t: TILE.PLAIN, sides: ['REG'] },             // 28
  { t: TILE.PERMIS, sides: ['REG'] },            // 29
  { t: TILE.PLAIN, sides: ['REG'] },             // 30
  { t: TILE.PLAIN, sides: ['REG'] },             // 31
  { t: TILE.CONSTR_FREE, sides: ['REG'] },       // 32
  { t: TILE.PLAIN, sides: ['REG'] },             // 33
  { t: TILE.PLAIN, sides: ['REG'] },             // 34
  { t: TILE.GREY, sides: [] },                   // 35  abords de la Mairie
  { t: TILE.GREY, sides: [] },                   // 36  abords de la Mairie
  { t: TILE.ACHAT, sides: ['REG', 'WAI'] },      // 37
  { t: TILE.PLAIN, sides: ['WAI'] },             // 38
  { t: TILE.PERMIS, sides: ['WAI'] },            // 39
  { t: TILE.PLAIN, sides: ['WAI'] },             // 40
  { t: TILE.PLAIN, sides: ['WAI'] },             // 41
  { t: TILE.PLAIN, sides: ['WAI'] },             // 42
  { t: TILE.ACHAT, sides: ['WAI', 'LIB'] },      // 43
  { t: TILE.PLAIN, sides: ['LIB'] },             // 44
  { t: TILE.PERMIS, sides: ['LIB'] },            // 45
  { t: TILE.PLAIN, sides: ['LIB'] },             // 46
  { t: TILE.ACHAT, sides: ['LIB', 'BOO'] }       // 47
];

export const BOARD_SIZE = BOARD.length;

/** On franchit la ligne rouge de la Banque en entrant sur la case 12. */
export const BANK_LINE_TILE = 12;
/** On franchit la ligne jaune de la Mairie en entrant sur la case 36. */
export const MAIRIE_LINE_TILE = 36;
/** Somme perçue en franchissant la ligne rouge (notice p.4). */
export const BANK_SALARY = 2000;

/** Cases de départ : une par joueur. */
export const START_TILES = [0, 1, 2, 3];

/* --------------------------------------------------------------------------
 * Dé « permis de construire »
 * ----------------------------------------------------------------------- */
export const PERMIT = {
  REFUSE: 'refuse',   // ROUGE  : permis refusé
  ACCORDE: 'accorde', // VERT   : payez le prix indiqué
  GRATUIT: 'gratuit', // H      : construction gratuite
  DOUBLE: 'double'    // 2      : payez le double
};

/**
 * Répartition des 6 faces du dé « permis ». La notice décrit les 4 faces sans
 * préciser combien de fois chacune apparaît ; cette répartition (2 rouges,
 * 2 vertes, 1 « H », 1 « ×2 ») est celle des éditions classiques du jeu.
 */
export const PERMIT_FACES = [
  PERMIT.REFUSE, PERMIT.ACCORDE, PERMIT.REFUSE,
  PERMIT.GRATUIT, PERMIT.ACCORDE, PERMIT.DOUBLE
];

export const PERMIT_LABEL = {
  [PERMIT.REFUSE]: 'ROUGE — permis refusé',
  [PERMIT.ACCORDE]: 'VERT — permis accordé',
  [PERMIT.GRATUIT]: 'H — construction gratuite',
  [PERMIT.DOUBLE]: '×2 — accordé, prix doublé'
};

/* --------------------------------------------------------------------------
 * Joueurs
 * ----------------------------------------------------------------------- */
export const PLAYER_COLORS = [
  { name: 'Rouge', hex: '#e23b3b' },
  { name: 'Bleu', hex: '#2f7fe0' },
  { name: 'Vert', hex: '#2fae5a' },
  { name: 'Jaune', hex: '#e8c22a' }
];

/** Dotation initiale (notice p.3). */
export function startingMoney(nbPlayers) {
  return nbPlayers === 4 ? 12000 : 16000;
}

export const money = (n) => n.toLocaleString('fr-FR');
