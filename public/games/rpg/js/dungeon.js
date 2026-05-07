import { TILE, TILE_SIZE, DUNGEON_FLOORS, BOSS_FLOOR } from './constants.js';

const MAP_W = 60;
const MAP_H = 60;
const MIN_ROOMS = 8;
const MAX_ROOMS = 14;
const MIN_ROOM_SIZE = 5;
const MAX_ROOM_SIZE = 11;

function rng(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class Room {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
  }
  get cx() { return Math.floor(this.x + this.w / 2); }
  get cy() { return Math.floor(this.y + this.h / 2); }
  intersects(other) {
    return this.x <= other.x + other.w + 1 &&
           this.x + this.w + 1 >= other.x &&
           this.y <= other.y + other.h + 1 &&
           this.y + this.h + 1 >= other.y;
  }
}

function carveRoom(map, room) {
  for (let y = room.y; y < room.y + room.h; y++)
    for (let x = room.x; x < room.x + room.w; x++)
      map[y][x] = TILE.FLOOR;
}

function carveCorridor(map, x1, y1, x2, y2) {
  let cx = x1, cy = y1;
  if (Math.random() < 0.5) {
    while (cx !== x2) { map[cy][cx] = TILE.FLOOR; cx += cx < x2 ? 1 : -1; }
    while (cy !== y2) { map[cy][cx] = TILE.FLOOR; cy += cy < y2 ? 1 : -1; }
  } else {
    while (cy !== y2) { map[cy][cx] = TILE.FLOOR; cy += cy < y2 ? 1 : -1; }
    while (cx !== x2) { map[cy][cx] = TILE.FLOOR; cx += cx < x2 ? 1 : -1; }
  }
  map[cy][cx] = TILE.FLOOR;
}

export function generateDungeon(floor) {
  const isBoss = floor === BOSS_FLOOR;
  const map = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(TILE.WALL));
  const rooms = [];

  if (isBoss) {
    const bossRoom = new Room(10, 10, 20, 20);
    carveRoom(map, bossRoom);
    rooms.push(bossRoom);
    const entryRoom = new Room(25, 25, 8, 8);
    carveRoom(map, entryRoom);
    rooms.push(entryRoom);
    carveCorridor(map, bossRoom.cx, bossRoom.cy, entryRoom.cx, entryRoom.cy);
    map[entryRoom.cy][entryRoom.cx] = TILE.FLOOR;
    return buildResult(map, rooms, floor, isBoss);
  }

  const roomCount = rng(MIN_ROOMS + floor, Math.min(MAX_ROOMS + floor, MAX_ROOMS + 4));
  for (let attempts = 0; attempts < 200 && rooms.length < roomCount; attempts++) {
    const w = rng(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
    const h = rng(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
    const x = rng(1, MAP_W - w - 2);
    const y = rng(1, MAP_H - h - 2);
    const room = new Room(x, y, w, h);
    if (rooms.some(r => r.intersects(room))) continue;
    carveRoom(map, room);
    if (rooms.length > 0) {
      const prev = rooms[rooms.length - 1];
      carveCorridor(map, prev.cx, prev.cy, room.cx, room.cy);
    }
    rooms.push(room);
  }

  return buildResult(map, rooms, floor, isBoss);
}

function buildResult(map, rooms, floor, isBoss) {
  const startRoom = rooms[rooms.length - 1];
  const endRoom   = rooms[0];

  if (!isBoss) map[endRoom.cy][endRoom.cx] = TILE.STAIRS;

  const enemies = [];
  const items   = [];
  const chests  = [];

  rooms.forEach((room, i) => {
    if (i === rooms.length - 1) return; // skip spawn room

    if (isBoss && i === 0) {
      enemies.push(spawnBoss(room));
      return;
    }

    const count = rng(1, 3 + Math.floor(floor * 0.5));
    for (let e = 0; e < count; e++) {
      const ex = rng(room.x + 1, room.x + room.w - 2);
      const ey = rng(room.y + 1, room.y + room.h - 2);
      enemies.push(spawnEnemy(ex, ey, floor));
    }

    if (Math.random() < 0.35) {
      const cx = rng(room.x + 1, room.x + room.w - 2);
      const cy = rng(room.y + 1, room.y + room.h - 2);
      map[cy][cx] = TILE.CHEST;
      chests.push({ x: cx, y: cy, opened: false });
    }
  });

  return {
    map, rooms,
    width: MAP_W, height: MAP_H,
    startX: startRoom.cx, startY: startRoom.cy,
    enemies, items, chests,
    floor,
  };
}

function spawnEnemy(tx, ty, floor) {
  const types = getEnemyPool(floor);
  const type  = types[rng(0, types.length - 1)];
  return buildEnemyData(type, tx, ty, floor);
}

function spawnBoss(room) {
  return buildEnemyData('dragon', room.cx, room.cy, BOSS_FLOOR, true);
}

function getEnemyPool(floor) {
  if (floor <= 1) return ['goblin'];
  if (floor <= 2) return ['goblin', 'skeleton'];
  if (floor <= 3) return ['goblin', 'skeleton', 'orc'];
  return ['skeleton', 'orc', 'troll'];
}

const ENEMY_STATS = {
  goblin:   { hp: 20,  atk: 4,  def: 1, spd: 1.8, xp: 10, size: 14, color: '#4a8a2a' },
  skeleton: { hp: 30,  atk: 6,  def: 2, spd: 1.4, xp: 18, size: 15, color: '#ccc'    },
  orc:      { hp: 55,  atk: 10, def: 4, spd: 1.0, xp: 30, size: 18, color: '#8a3a1a' },
  troll:    { hp: 90,  atk: 14, def: 6, spd: 0.8, xp: 50, size: 20, color: '#5a7a3a' },
  dragon:   { hp: 400, atk: 22, def: 10,spd: 1.2, xp: 500,size: 28, color: '#c03020' },
};

function buildEnemyData(type, tx, ty, floor, isBoss = false) {
  const base = ENEMY_STATS[type];
  const scale = 1 + (floor - 1) * 0.3;
  return {
    type, isBoss,
    x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2,
    hp: Math.floor(base.hp * scale),
    maxHp: Math.floor(base.hp * scale),
    atk: Math.floor(base.atk * scale),
    def: base.def,
    spd: base.spd,
    xp: base.xp * floor,
    size: isBoss ? base.size * 1.5 : base.size,
    color: base.color,
    state: 'idle',
    dir: { x: 0, y: 0 },
    attackTimer: 0,
    patrolTimer: 0,
    patrolDir: { x: 0, y: 0 },
    id: Math.random().toString(36).slice(2),
  };
}
