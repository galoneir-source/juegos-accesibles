import { TILE, TILE_SIZE, BOSS_FLOOR } from './constants.js';

const ENEMY_NAMES = {
  goblin: 'Goblin', skeleton: 'Esqueleto',
  orc: 'Orco', troll: 'Troll', dragon: 'Dragón Oscuro',
};

export class AccessibilityManager {
  constructor(game, audio, speech) {
    this.game   = game;
    this.audio  = audio;
    this.speech = speech;

    // State snapshots for change detection
    this._snap = {
      hp: null, level: null, floor: null,
      state: null, gold: null, inventory: 0,
    };
    this._chasingIds  = new Set();
    this._deadIds     = new Set();
    this._visitedRooms= new Set();
    this._exploreTargetIdx = null;

    // Timers
    this._pingTimer = 0;

    this._setupAriaRegions();
    this._bindKeys();

    // Announce menu on load
    setTimeout(() => this.speech.speak(
      'Mazmorra Oscura. Menú principal. Presiona Enter o Espacio para Nueva Partida. ' +
      'C para Controles. H en cualquier momento para ayuda.',
      'normal'
    ), 600);
  }

  // ── Setup ─────────────────────────────────────────────────────────
  _setupAriaRegions() {
    const live = document.getElementById('a11y-live');
    if (!live) return;
    live.setAttribute('aria-live', 'assertive');
    live.setAttribute('aria-atomic', 'true');
  }

  _bindKeys() {
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === 'r') { e.preventDefault(); this.doRadar(); }
      if (k === 't') { e.preventDefault(); this.describeSurroundings(); }
      if (k === 'q') { e.preventDefault(); this.readStats(); }
      if (k === 'h') { e.preventDefault(); this.readHelp(); }
      if (k === 'p') { e.preventDefault(); this.readInventory(); }
      if (k === 'x') { e.preventDefault(); this.exploreNearest(); }
    });
  }

  // ── Main update (called every frame) ──────────────────────────────
  update(dt) {
    this._detectStateChange();
    if (this.game.state !== 'playing') return;
    this._detectPlayerChanges();
    this._detectEnemyChanges();
    this._updatePing(dt);
  }

  // ── State machine transitions ──────────────────────────────────────
  _detectStateChange() {
    const { state } = this.game;
    if (state === this._snap.state) return;
    const prevState = this._snap.state;
    this._snap.state = state;

    if (state === 'playing' && prevState === 'menu') {
      const f = this.game.floor;
      this._snap.floor     = f;
      this._snap.hp        = this.game.player?.hp    ?? null;
      this._snap.gold      = this.game.player?.gold  ?? 0;
      this._snap.level     = this.game.player?.level ?? null;
      this._snap.inventory = this.game.player?.inventory?.length ?? 0;
      this._visitedRooms.clear();
      this._chasingIds.clear();
      this._deadIds.clear();
      this._exploreTargetIdx = null;
      this.audio.stairs();
      this.speech.speak(
        `Piso ${f}. Aventura comenzada. Usa T para explorar los alrededores.`,
        'high'
      );
    }

    if (state === 'dead') {
      this.audio.playerDeath();
      const p = this.game.player;
      this.speech.speak(
        `Has muerto. Nivel ${p.level}. Eliminaste ${p.kills} enemigos y recogiste ${p.gold} monedas de oro.`,
        'critical', true
      );
    }

    if (state === 'win') {
      this.audio.victory();
      const p = this.game.player;
      this.speech.speak(
        `¡Victoria! Has derrotado al Dragón Oscuro y salvado el reino. ` +
        `Nivel ${p.level}. ${p.kills} enemigos. ${p.gold} monedas de oro. Eres una leyenda.`,
        'critical', true
      );
    }

    if (state === 'paused') {
      this.speech.speak('Juego pausado. Escape para continuar.', 'high', true);
    }

    if (state === 'menu') {
      this.speech.speak(
        'Menú principal. Presiona Enter para nueva partida. C para ver controles.',
        'normal'
      );
    }
  }

  // ── Player stat changes ────────────────────────────────────────────
  _detectPlayerChanges() {
    const p = this.game;
    const pl = p.player;
    if (!pl) return;

    // Floor transition (stairs)
    if (this.game.floor !== this._snap.floor) {
      const f = this.game.floor;
      this._snap.floor     = f;
      this._snap.hp        = pl.hp;
      this._snap.gold      = pl.gold;
      this._snap.level     = pl.level;
      this._snap.inventory = pl.inventory.length;
      this._visitedRooms.clear();
      this._chasingIds.clear();
      this._deadIds.clear();
      this._exploreTargetIdx = null;
      if (f === BOSS_FLOOR) {
        this.audio.bossRoar();
        this.speech.speak(
          'Piso cinco. La guarida del Dragón Oscuro. ¡Prepárate para la batalla final!',
          'critical', true
        );
      } else {
        this.audio.stairs();
        this.speech.speak(
          `Piso ${f}. Nueva mazmorra generada. Usa T para explorar los alrededores.`,
          'high'
        );
      }
      return;
    }

    // HP decrease → damage taken
    if (this._snap.hp !== null && pl.hp < this._snap.hp) {
      const dmg = this._snap.hp - pl.hp;
      this.audio.playerHurt();
      if (dmg >= 5 || pl.hp < 25) {
        const pct = Math.round((pl.hp / pl.maxHp) * 100);
        this.speech.speak(`${dmg} de daño. Vida al ${pct}%.`, 'high');
      }
    }

    // HP increase → healed
    if (this._snap.hp !== null && pl.hp > this._snap.hp) {
      this.audio.heal();
      const gained = pl.hp - this._snap.hp;
      this.speech.speak(`Curación. ${gained} puntos de vida recuperados.`, 'normal');
    }
    this._snap.hp = pl.hp;

    // Level up
    if (this._snap.level !== null && pl.level > this._snap.level) {
      this.audio.levelUp();
      this.speech.speak(
        `¡Nivel ${pl.level}! Vida aumentada a ${pl.maxHp}. Ataque: ${pl.atk}. Defensa: ${pl.def}.`,
        'critical', true
      );
    }
    this._snap.level = pl.level;

    // Gold picked up
    if (this._snap.gold !== null && pl.gold > this._snap.gold) {
      const gained = pl.gold - this._snap.gold;
      this.audio.pickup();
      this.speech.speak(`${gained} monedas de oro. Total: ${pl.gold}.`, 'normal');
    }
    this._snap.gold = pl.gold;

    // Inventory grew (item picked up)
    const invLen = pl.inventory.length;
    if (invLen > this._snap.inventory) {
      const item = pl.inventory[invLen - 1];
      if (item) {
        this.audio.pickup();
        this.speech.speak(`Recogiste: ${item.name}.`, 'normal');
      }
    }
    this._snap.inventory = invLen;

    // Room entry detection (via dungeon rooms)
    if (this.game.dungeon) {
      this._detectRoomEntry(pl);
    }
  }

  _detectRoomEntry(pl) {
    const { rooms } = this.game.dungeon;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      const inRoom = pl.tileX >= r.x && pl.tileX < r.x + r.w &&
                     pl.tileY >= r.y && pl.tileY < r.y + r.h;
      if (inRoom && !this._visitedRooms.has(i)) {
        this._visitedRooms.add(i);
        const enemies = this.game.dungeon.enemies.filter(e => !e.dead &&
          e.x >= r.x * TILE_SIZE && e.x < (r.x + r.w) * TILE_SIZE &&
          e.y >= r.y * TILE_SIZE && e.y < (r.y + r.h) * TILE_SIZE
        );
        const chests = this.game.dungeon.chests.filter(c => !c.opened &&
          c.x >= r.x && c.x < r.x + r.w &&
          c.y >= r.y && c.y < r.y + r.h
        );
        const hasStairs = this.game.dungeon.map[r.cy]?.[r.cx] === TILE.STAIRS ||
          this._roomHasTile(r, TILE.STAIRS);

        this.audio.enterRoom();
        let desc = `Nueva sala.`;
        if (enemies.length)  desc += ` ${enemies.length} enemigo${enemies.length > 1 ? 's' : ''}.`;
        if (chests.length)   desc += ` ${chests.length} cofre${chests.length > 1 ? 's' : ''}.`;
        if (hasStairs)       desc += ` Escaleras detectadas.`;
        if (!enemies.length && !chests.length) desc += ` Zona despejada.`;
        this.speech.speak(desc, 'high');
        break;
      }
    }
  }

  _roomHasTile(room, tileType) {
    const map = this.game.dungeon.map;
    for (let y = room.y; y < room.y + room.h; y++)
      for (let x = room.x; x < room.x + room.w; x++)
        if (map[y]?.[x] === tileType) return true;
    return false;
  }

  // ── Enemy changes ──────────────────────────────────────────────────
  _detectEnemyChanges() {
    if (!this.game.dungeon) return;
    const pl = this.game.player;

    for (const e of this.game.dungeon.enemies) {
      if (e.dead) {
        if (!this._deadIds.has(e.id)) {
          this._deadIds.add(e.id);
          this._chasingIds.delete(e.id);
          const pan = this._pan(e.x - pl.x, Math.hypot(e.x - pl.x, e.y - pl.y));
          this.audio.enemyDeath(pan);
          const name = ENEMY_NAMES[e.type] || e.type;
          this.speech.speak(`${name} eliminado.`, 'normal');
        }
        continue;
      }

      // Enemy starts chasing
      const isChasing = e.state === 'chase' || e.state === 'attack';
      if (isChasing && !this._chasingIds.has(e.id)) {
        this._chasingIds.add(e.id);
        const dx   = e.x - pl.x;
        const dy   = e.y - pl.y;
        const dist = Math.hypot(dx, dy);
        const dir  = this._dir(dx, dy);
        const pan  = this._pan(dx, dist);
        const name = ENEMY_NAMES[e.type] || e.type;
        this.audio.enemyAlert(pan);
        this.speech.speak(`¡${name} al ${dir}!`, 'high');
      } else if (!isChasing) {
        this._chasingIds.delete(e.id);
      }
    }
  }

  // ── Ambient spatial ping ───────────────────────────────────────────
  // Cada segundo comprueba los tres tipos (enemigo, ítem, escaleras)
  // y reproduce el ping de cada uno que esté dentro del rango.
  _updatePing(dt) {
    this._pingTimer -= dt;
    if (this._pingTimer > 0) return;
    this._pingTimer = 1000;

    if (!this.game.dungeon) return;
    const pl  = this.game.player;
    const map = this.game.dungeon.map;

    // Enemigo más cercano
    let nearest = null, nearEnemyDist = Infinity;
    for (const e of this.game.dungeon.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - pl.x, e.y - pl.y);
      if (d < nearEnemyDist) { nearest = e; nearEnemyDist = d; }
    }
    if (nearest && nearEnemyDist < 380) {
      const dx = nearest.x - pl.x;
      this.audio.enemyPing(nearest.type, this._pan(dx, nearEnemyDist), nearEnemyDist);
    }

    // Ítem en suelo más cercano (drop de enemigo muerto)
    let nearestDrop = null, nearDropDist = Infinity;
    for (const e of this.game.dungeon.enemies) {
      if (!e.dead || !e.dropItem) continue;
      const d = Math.hypot(e.x - pl.x, e.y - pl.y);
      if (d < nearDropDist) { nearestDrop = e; nearDropDist = d; }
    }
    if (nearestDrop && nearDropDist < 320) {
      const dx = nearestDrop.x - pl.x;
      this.audio.itemPing(this._pan(dx, nearDropDist));
    }

    // Escaleras más cercanas
    let nearStairs = null, nearStairsDist = Infinity;
    const startTX = Math.max(0, pl.tileX - 12);
    const endTX   = Math.min(map[0]?.length ?? 60, pl.tileX + 12);
    const startTY = Math.max(0, pl.tileY - 12);
    const endTY   = Math.min(map.length, pl.tileY + 12);
    for (let ty = startTY; ty < endTY; ty++) {
      for (let tx = startTX; tx < endTX; tx++) {
        if (map[ty]?.[tx] !== TILE.STAIRS) continue;
        const wx = tx * TILE_SIZE + TILE_SIZE / 2;
        const wy = ty * TILE_SIZE + TILE_SIZE / 2;
        const d  = Math.hypot(wx - pl.x, wy - pl.y);
        if (d < nearStairsDist) { nearStairs = { wx, wy }; nearStairsDist = d; }
      }
    }
    if (nearStairs && nearStairsDist < 400) {
      const dx = nearStairs.wx - pl.x;
      this.audio.stairsPing(this._pan(dx, nearStairsDist));
    }
  }

  // Called by player._stepTile — fires exactly once per tile crossed.
  onStep() {
    this.audio.footstep();
  }

  // ── Player-triggered commands ──────────────────────────────────────
  doRadar() {
    if (this.game.state !== 'playing' || !this.game.dungeon) return;
    this.audio.uiSelect();

    const pl    = this.game.player;
    const alive = this.game.dungeon.enemies.filter(e => !e.dead);

    if (alive.length === 0) {
      this.speech.speak('Radar: zona despejada. No hay enemigos.', 'high', true);
      return;
    }

    const sorted = alive
      .map(e => ({ e, dx: e.x - pl.x, dy: e.y - pl.y, dist: Math.hypot(e.x - pl.x, e.y - pl.y) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);

    // Play spatial pings one by one
    sorted.forEach(({ e, dx, dist }, i) => {
      setTimeout(() => this.audio.enemyPing(e.type, this._pan(dx, dist), dist), i * 350);
    });

    const parts = sorted.map(({ e, dx, dy, dist }) => {
      const pasos = Math.round(dist / TILE_SIZE);
      return `${ENEMY_NAMES[e.type] || e.type} al ${this._dir(dx, dy)}, ${pasos} pasos`;
    });

    setTimeout(() => {
      this.speech.speak(`Radar: ${parts.join('. ')}.`, 'high', true);
    }, sorted.length * 350 + 200);
  }

  describeSurroundings() {
    if (this.game.state !== 'playing' || !this.game.dungeon) return;
    this.audio.uiSelect();

    const pl  = this.game.player;
    const tx  = pl.tileX;
    const ty  = pl.tileY;
    const map = this.game.dungeon.map;
    const parts = [];

    const cardinals = [
      { dx: 0, dy: -1, name: 'norte' },
      { dx: 1, dy:  0, name: 'este'  },
      { dx: 0, dy:  1, name: 'sur'   },
      { dx:-1, dy:  0, name: 'oeste' },
    ];

    for (const { dx, dy, name } of cardinals) {
      const t = map[ty + dy]?.[tx + dx];
      if (t === TILE.WALL || t === TILE.EMPTY || t === undefined) {
        parts.push(`pared al ${name}`);
      } else if (t === TILE.STAIRS) {
        parts.push(`escaleras al ${name}, presiona E para descender`);
      } else if (t === TILE.DOOR) {
        parts.push(`puerta al ${name}`);
      }
    }

    // Items on ground
    const drops = this.game.dungeon.enemies
      .filter(e => e.dead && e.dropItem && Math.hypot(e.x - pl.x, e.y - pl.y) < 55);
    if (drops.length) parts.push(`${drops.length} objeto${drops.length > 1 ? 's' : ''} en el suelo, E para recoger`);

    // Chests
    const chests = this.game.dungeon.chests.filter(c =>
      !c.opened && Math.abs(c.x - tx) <= 2 && Math.abs(c.y - ty) <= 2
    );
    if (chests.length) parts.push(`cofre del tesoro cerca, E para abrirlo`);

    // Currently on stairs
    if (map[ty]?.[tx] === TILE.STAIRS) parts.push(`estás sobre las escaleras`);

    const text = parts.length ? parts.join('. ') : 'pasillo abierto en todas direcciones';
    this.speech.speak(text, 'high', true);
  }

  readStats() {
    if (!this.game.player) return;
    this.audio.uiSelect();
    const p = this.game.player;
    const hpPct = Math.round((p.hp / p.maxHp) * 100);
    const mpPct = Math.round((p.mp / p.maxMp) * 100);
    this.speech.speak(
      `Estadísticas. Nivel ${p.level}. ` +
      `Vida ${p.hp} de ${p.maxHp}, ${hpPct}%. ` +
      `Maná ${p.mp} de ${p.maxMp}, ${mpPct}%. ` +
      `Ataque ${p.atk}. Defensa ${p.def}. ` +
      `Oro ${p.gold}. Piso ${this.game.floor} de 5. ` +
      `Enemigos eliminados: ${p.kills}.`,
      'high', true
    );
  }

  readInventory() {
    if (!this.game.player) return;
    this.audio.uiSelect();
    const inv = this.game.player.inventory;
    if (inv.length === 0) {
      this.speech.speak('Inventario vacío.', 'high', true);
      return;
    }
    const list = inv.map((item, i) => `${i + 1}: ${item.name}`).join('. ');
    this.speech.speak(`Inventario: ${list}. Presiona el número correspondiente para usar.`, 'high', true);
  }

  exploreNearest() {
    if (this.game.state !== 'playing' || !this.game.dungeon) return;
    this.audio.uiSelect();

    const pl  = this.game.player;
    const { rooms, map } = this.game.dungeon;
    const W = map[0]?.length || 60;
    const { dist: distMap, initDir } = this._bfsDistances(pl.tileX, pl.tileY, map);

    const reached = this._exploreTargetIdx !== null &&
                    this._visitedRooms.has(this._exploreTargetIdx);
    if (reached) this._exploreTargetIdx = null;

    const unvisited = rooms
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => !this._visitedRooms.has(i))
      .map(({ r, i }) => {
        const wx = r.cx * TILE_SIZE + TILE_SIZE / 2;
        const wy = r.cy * TILE_SIZE + TILE_SIZE / 2;
        const pixelDX = wx - pl.x;
        const pixelDY = wy - pl.y;
        const pixelDist = Math.hypot(pixelDX, pixelDY);
        // Use the nearest room tile (entry point), not the center
        let pasos = Infinity;
        let entryKey = r.cy * W + r.cx;
        for (let ty = r.y; ty < r.y + r.h; ty++) {
          for (let tx = r.x; tx < r.x + r.w; tx++) {
            const t = map[ty]?.[tx];
            if (t === undefined || t === 0 || t === 2) continue;
            const k = ty * W + tx;
            const d = distMap.get(k);
            if (d !== undefined && d < pasos) { pasos = d; entryKey = k; }
          }
        }
        if (!isFinite(pasos)) pasos = Math.round(pixelDist / TILE_SIZE);
        const first = initDir.get(entryKey);
        const dirDX = first ? first.dx : pixelDX;
        const dirDY = first ? first.dy : pixelDY;
        return { i, pixelDX, pixelDist, pasos, dirDX, dirDY };
      })
      .sort((a, b) => a.pasos - b.pasos);

    if (unvisited.length === 0) {
      const msg = reached ? 'Sala alcanzada. Has explorado todas las salas de este piso.'
                          : 'Has explorado todas las salas de este piso.';
      this.speech.speak(msg, 'high', true);
      return;
    }

    const { i: roomIdx, pixelDX, pixelDist, pasos, dirDX, dirDY } = unvisited[0];
    const dir  = this._dir(dirDX, dirDY);
    const pan  = this._pan(pixelDX, pixelDist);
    const resto = unvisited.length - 1;

    this._exploreTargetIdx = roomIdx;

    const prefix = reached ? 'Sala alcanzada. ' : '';
    this.audio.explorePing(pan);
    this.speech.speak(
      `${prefix}Zona inexplorada al ${dir}, a ${pasos} pasos. ` +
      (resto > 0 ? `Quedan ${unvisited.length} salas sin explorar.` : 'Es la última sala sin explorar.'),
      'high', true
    );
  }

  // Returns { dist, initDir } where initDir maps each tile key → {dx,dy} of the
  // first step from (tx,ty) on the optimal path to that tile.
  _bfsDistances(tx, ty, map) {
    const W = map[0]?.length || 60;
    const dist    = new Map();
    const initDir = new Map();
    const key = (x, y) => y * W + x;
    dist.set(key(tx, ty), 0);
    const q = [[tx, ty, 0, 0]]; // x, y, firstStepDX, firstStepDY
    const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
    while (q.length) {
      const [x, y, idx, idy] = q.shift();
      const d = dist.get(key(x, y));
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        const k = key(nx, ny);
        if (dist.has(k)) continue;
        const t = map[ny]?.[nx];
        if (t === undefined || t === 0 || t === 2) continue;
        dist.set(k, d + 1);
        const fIdx = d === 0 ? dx : idx;
        const fIdy = d === 0 ? dy : idy;
        initDir.set(k, { dx: fIdx, dy: fIdy });
        q.push([nx, ny, fIdx, fIdy]);
      }
    }
    return { dist, initDir };
  }

  readHelp() {
    this.audio.uiSelect();
    this.speech.speak(
      'Ayuda. WASD o flechas para mover. Espacio o clic para atacar. ' +
      'E para interactuar con cofres y escaleras. ' +
      'I para mostrar u ocultar el inventario. ' +
      'R para radar de enemigos con audio espacial. ' +
      'T para describir los alrededores. ' +
      'Q para leer estadísticas. ' +
      'P para leer el inventario. ' +
      'X para zona inexplorada más cercana. ' +
      'Del uno al seis para usar un ítem. ' +
      'Escape para pausar.',
      'high', true
    );
  }

  announceFootVolume() {
    const v = this.audio.getFootVolume();
    const pct = Math.round((v / 5) * 100);
    this.speech.speak(`Volumen de pasos: ${pct}%`, 'high', true);
  }

  // Announce combat (called from player.js)
  onSwing() {
    this.audio.swing();
  }

  onHitEnemy(enemy, dmg) {
    const pl  = this.game.player;
    const dx  = enemy.x - pl.x;
    const dist = Math.hypot(dx, enemy.y - pl.y);
    const pan  = this._pan(dx, dist);
    this.audio.hitEnemy(pan);
  }

  // ── Helpers ────────────────────────────────────────────────────────
  _pan(dx, dist) {
    return Math.max(-1, Math.min(1, dx / Math.max(1, dist * 0.9)));
  }

  _dir(dx, dy) {
    const a = Math.atan2(dy, dx) * 180 / Math.PI;
    if (a > -22.5  && a <= 22.5)  return 'este';
    if (a > 22.5   && a <= 67.5)  return 'sureste';
    if (a > 67.5   && a <= 112.5) return 'sur';
    if (a > 112.5  && a <= 157.5) return 'suroeste';
    if (a > 157.5  || a <= -157.5) return 'oeste';
    if (a > -157.5 && a <= -112.5) return 'noroeste';
    if (a > -112.5 && a <= -67.5) return 'norte';
    return 'noreste';
  }
}
