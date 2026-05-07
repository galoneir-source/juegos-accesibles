export const TILE_SIZE = 32;
export const CANVAS_W = 960;
export const CANVAS_H = 640;

export const TILE = {
  EMPTY:  0,
  FLOOR:  1,
  WALL:   2,
  DOOR:   3,
  STAIRS: 4,
  CHEST:  5,
};

export const STATE = {
  MENU:     'menu',
  PLAYING:  'playing',
  PAUSED:   'paused',
  DEAD:     'dead',
  WIN:      'win',
  CONTROLS: 'controls',
};

export const ENEMY_TYPE = {
  GOBLIN:   'goblin',
  ORC:      'orc',
  SKELETON: 'skeleton',
  TROLL:    'troll',
  DRAGON:   'dragon',
};

export const ITEM_TYPE = {
  HEALTH_POTION: 'health_potion',
  MANA_POTION:   'mana_potion',
  SWORD:         'sword',
  SHIELD:        'shield',
  ARMOR:         'armor',
  RING:          'ring',
};

export const COLORS = {
  floor:        '#2a1f14',
  floorAlt:     '#251c12',
  wall:         '#4a3a2a',
  wallFace:     '#6a5a4a',
  wallTop:      '#3a2a1a',
  door:         '#7a5a30',
  stairs:       '#ffd700',
  chest:        '#c8940a',

  player:       '#4af',
  playerSword:  '#cdf',

  goblin:       '#4a8a2a',
  orc:          '#8a3a1a',
  skeleton:     '#ccc',
  troll:        '#5a7a3a',
  dragon:       '#c03020',

  hpFill:       '#e74c3c',
  hpBg:         '#1a0a0a',
  mpFill:       '#3498db',
  mpBg:         '#0a0a1a',
  xpFill:       '#f39c12',
  xpBg:         '#1a1a0a',

  dmgText:      '#ff4444',
  healText:     '#44ff88',
  xpText:       '#ffcc00',

  shadow:       'rgba(0,0,0,0.6)',
  overlay:      'rgba(0,0,0,0.75)',
};

export const DUNGEON_FLOORS = 5;
export const BOSS_FLOOR = DUNGEON_FLOORS;
