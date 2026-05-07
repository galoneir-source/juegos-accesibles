import { CANVAS_W, CANVAS_H, STATE, TILE, TILE_SIZE, DUNGEON_FLOORS, BOSS_FLOOR } from './constants.js';
import { generateDungeon } from './dungeon.js';
import { Player } from './player.js';
import { updateEnemies } from './enemy.js';
import { Camera } from './camera.js';
import {
  renderDungeon, renderEntities, renderFloatingTexts
} from './renderer.js';
import {
  renderHUD, renderMenu, renderControls2, renderPause,
  renderDead, renderWin, renderBossWarning, getMenuButtonBounds
} from './ui.js';
import { AudioManager }         from './audio.js';
import { SpeechManager }        from './speech.js';
import { AccessibilityManager } from './accessibility.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.state  = STATE.MENU;
    this.keys   = {};
    this.mouse  = { x: 0, y: 0, left: false };
    this.prevKeys = {};

    this.dungeon = null;
    this.player  = null;
    this.camera  = new Camera();
    this.floor   = 1;

    this.bossWarningTimer = 0;
    this.bossWarningDone  = false;
    this.showInventory    = true;
    this.lastTime = 0;

    this.audio  = new AudioManager();
    this.speech = new SpeechManager();
    this.a11y   = new AccessibilityManager(this, this.audio, this.speech);

    this._bindEvents();
    this._loop(0);
  }

  _bindEvents() {
    window.addEventListener('keydown', e => {
      if (e.key === 'Tab') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      this.keys[e.key] = true;
      this.audio.resume();
      this._onKeyDown(e.key);
      e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      const tag = document.activeElement?.tagName;
      if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') this.keys[e.key] = false;
    });
    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 0) this.mouse.left = true;
      this.audio.resume();
      this._onMouseDown(e);
    });
    this.canvas.addEventListener('mouseup',   e => { if (e.button === 0) this.mouse.left = false; });
    this.canvas.addEventListener('mousemove', e => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (CANVAS_W / r.width);
      this.mouse.y = (e.clientY - r.top)  * (CANVAS_H / r.height);
    });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  _onKeyDown(key) {
    if (this.state === STATE.MENU) {
      if (key === 'Enter' || key === ' ') { this.audio.uiConfirm(); this._startGame(); return; }
      if (key === 'c' || key === 'C')     { this.audio.uiSelect();  this.state = STATE.CONTROLS; return; }
    }
    if (this.state === STATE.CONTROLS) {
      if (key === 'Escape' || key === 'Enter') { this.audio.uiSelect(); this.state = STATE.MENU; return; }
    }
    if (this.state === STATE.DEAD) {
      if (key === 'Enter' || key === ' ') { this.audio.uiSelect(); this.state = STATE.MENU; return; }
    }
    if (this.state === STATE.WIN) {
      if (key === 'Enter' || key === ' ') { this.audio.uiConfirm(); this._startGame(); return; }
    }
    if (this.state === STATE.PLAYING) {
      if (key === 'Escape') { this.state = STATE.PAUSED; return; }
      if (key === 'i' || key === 'I') { this.showInventory = !this.showInventory; this.audio.uiSelect(); return; }
      if (key === 'e' || key === 'E') { this._interact(); return; }
      if (key === 'PageDown') { this.audio.changeFootVolume(-0.5); this.a11y.announceFootVolume(); return; }
      if (key === 'PageUp')   { this.audio.changeFootVolume(+0.5); this.a11y.announceFootVolume(); return; }
      if (key >= '1' && key <= '6') {
        const idx = parseInt(key) - 1;
        const item = this.player.inventory[idx];
        if (item) this.player.useItem(item);
        return;
      }
    }
    if (this.state === STATE.PAUSED && key === 'Escape') {
      this.state = STATE.PLAYING;
    }
  }

  _onMouseDown(e) {
    const r = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (CANVAS_W / r.width);
    const my = (e.clientY - r.top)  * (CANVAS_H / r.height);
    const bounds = getMenuButtonBounds();

    if (this.state === STATE.MENU) {
      if (inBounds(mx, my, bounds.newGame))  { this.audio.uiConfirm(); this._startGame(); }
      if (inBounds(mx, my, bounds.controls)) { this.audio.uiSelect();  this.state = STATE.CONTROLS; }
    }
    if (this.state === STATE.CONTROLS) {
      if (inBounds(mx, my, bounds.back)) { this.audio.uiSelect(); this.state = STATE.MENU; }
    }
    if (this.state === STATE.DEAD) {
      if (inBounds(mx, my, bounds.deadMenu)) { this.audio.uiSelect(); this.state = STATE.MENU; }
    }
    if (this.state === STATE.WIN) {
      if (inBounds(mx, my, bounds.winReplay)) { this.audio.uiConfirm(); this._startGame(); }
    }
  }

  _startGame() {
    this.floor  = 1;
    this.player = null; // prevent copying dead/win player stats into new game
    this._loadFloor(this.floor);
    this.state = STATE.PLAYING;
    this.bossWarningDone  = false;
    this._bossDeadHandled = false;
  }

  _loadFloor(floor) {
    this.dungeon = generateDungeon(floor);
    const prevPlayer = this.player;
    this.player = new Player(this.dungeon.startX, this.dungeon.startY);
    this.player.onSwing    = () => this.a11y.onSwing();
    this.player.onHitEnemy = (e, dmg) => this.a11y.onHitEnemy(e, dmg);
    this.player.onStep     = () => this.a11y.onStep();

    if (prevPlayer) {
      this.player.hp           = Math.min(prevPlayer.hp, prevPlayer.maxHp);
      this.player.maxHp        = prevPlayer.maxHp;
      this.player.mp           = prevPlayer.mp;
      this.player.maxMp        = prevPlayer.maxMp;
      this.player.atk          = prevPlayer.atk;
      this.player.def          = prevPlayer.def;
      this.player.level        = prevPlayer.level;
      this.player.xp           = prevPlayer.xp;
      this.player.xpNext       = prevPlayer.xpNext;
      this.player.gold         = prevPlayer.gold;
      this.player.inventory    = prevPlayer.inventory;
      this.player.equipment    = prevPlayer.equipment;
      this.player.kills        = prevPlayer.kills;
      this.player.floorsCleared= prevPlayer.floorsCleared;
    }

    this.camera.smoothX = this.player.x - CANVAS_W / 2;
    this.camera.smoothY = this.player.y - CANVAS_H / 2;

    if (floor === BOSS_FLOOR && !this.bossWarningDone) {
      this.bossWarningTimer = 3000;
      this.bossWarningDone  = true;
    }
  }

  _interact() {
    const p = this.player;
    const tx = p.tileX;
    const ty = p.tileY;

    const tile = this.dungeon.map[ty]?.[tx];
    if (tile === TILE.STAIRS) {
      p.floorsCleared++;
      if (this.floor >= DUNGEON_FLOORS) {
        this.state = STATE.WIN;
        return;
      }
      this.floor++;
      this._loadFloor(this.floor);
      return;
    }

    for (const chest of this.dungeon.chests) {
      if (chest.opened) continue;
      const cx = Math.abs(chest.x - tx);
      const cy = Math.abs(chest.y - ty);
      if (cx <= 1 && cy <= 1) {
        chest.opened = true;
        this.dungeon.map[chest.y][chest.x] = TILE.FLOOR;
        this.audio.chestOpen();
        const loot = generateChestLoot(this.floor);
        loot.forEach(item => {
          if (item.type === 'gold') {
            p.gold += item.value;
            p.addFloat('+' + item.value + ' Oro', p.x, p.y - 30, '#ffd700');
          } else {
            p.addItem(item);
            p.addFloat('!' + item.name, p.x, p.y - 30, item.color || '#fff');
          }
        });
        break;
      }
    }

    for (const e of this.dungeon.enemies) {
      if (!e.dead || !e.dropItem) continue;
      const dx = Math.abs(e.x - p.x);
      const dy = Math.abs(e.y - p.y);
      if (dx < 40 && dy < 40) {
        const item = e.dropItem;
        e.dropItem = null;
        if (item.type === 'gold') {
          p.gold += item.value;
          p.addFloat('+' + item.value + ' Oro', p.x, p.y - 30, '#ffd700');
        } else {
          p.addItem(item);
          p.addFloat('!' + item.name, p.x, p.y - 30, item.color || '#fff');
        }
      }
    }
  }

  _update(dt) {
    this.a11y.update(dt);
    if (this.state !== STATE.PLAYING) return;

    if (this.bossWarningTimer > 0) {
      this.bossWarningTimer -= dt;
      return;
    }

    this.player.update(dt, this.keys, this.mouse, this.dungeon.map, this.dungeon.enemies);
    updateEnemies(this.dungeon.enemies, this.player, this.dungeon.map, dt);

    const boss = this.dungeon.enemies.find(e => e.isBoss);
    if (boss && boss.dead && !this._bossDeadHandled) {
      this._bossDeadHandled = true;
      setTimeout(() => { if (this.state === STATE.PLAYING) this.state = STATE.WIN; }, 1500);
    }

    if (this.player.hp <= 0) {
      this.state = STATE.DEAD;
    }

    this.camera.follow(this.player, this.dungeon.width, this.dungeon.height);
  }

  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (this.state === STATE.MENU) {
      renderMenu(ctx);
      return;
    }
    if (this.state === STATE.CONTROLS) {
      renderControls2(ctx);
      return;
    }

    if (this.dungeon) {
      renderDungeon(ctx, this.dungeon, this.camera);
      renderEntities(ctx, this.dungeon, this.player, this.camera);
      renderFloatingTexts(ctx, this.player, this.camera);
      renderHUD(ctx, this.player, this.floor, DUNGEON_FLOORS, this.showInventory);
    }

    if (this.bossWarningTimer > 0) {
      const alpha = Math.min(1, this.bossWarningTimer / 800);
      renderBossWarning(ctx, alpha);
    }

    if (this.state === STATE.PAUSED) { renderPause(ctx); }
    if (this.state === STATE.DEAD)   { renderDead(ctx, this.player); }
    if (this.state === STATE.WIN)    { renderWin(ctx, this.player); }
  }

  _loop(timestamp) {
    const dt = Math.min(timestamp - this.lastTime, 50);
    this.lastTime = timestamp;
    this._update(dt);
    this._render();
    requestAnimationFrame(t => this._loop(t));
  }
}

function inBounds(mx, my, b) {
  return mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
}

function generateChestLoot(floor) {
  const loot = [];
  const r = Math.random();
  if (r < 0.4) {
    loot.push({ type: 'health_potion', name: 'Poción de Vida', value: 40, color: '#e74c3c' });
  } else if (r < 0.7) {
    loot.push({ type: 'gold', name: 'Oro', value: Math.floor(Math.random() * 30 + 10) * floor, color: '#ffd700' });
  }
  if (Math.random() < 0.4) {
    const weapons = [
      { type: 'equipment', slot: 'weapon', name: 'Espada de Hierro',   atk: 5 + floor * 2, color: '#aaddff', autoEquip: true },
      { type: 'equipment', slot: 'weapon', name: 'Hacha de Guerra',    atk: 7 + floor * 2, color: '#ffaaaa', autoEquip: true },
      { type: 'equipment', slot: 'armor',  name: 'Armadura de Cuero',  def: 2 + floor,     color: '#aa8844', autoEquip: true },
      { type: 'equipment', slot: 'armor',  name: 'Cota de Malla',      def: 4 + floor,     color: '#aaaaaa', autoEquip: true },
      { type: 'equipment', slot: 'ring',   name: 'Anillo de Poder',    atk: 3,   mp: 15,   color: '#ff88ff', autoEquip: true },
    ];
    loot.push(weapons[Math.floor(Math.random() * weapons.length)]);
  }
  if (loot.length === 0) {
    loot.push({ type: 'mana_potion', name: 'Poción de Maná', value: 30, color: '#3498db' });
  }
  return loot;
}
