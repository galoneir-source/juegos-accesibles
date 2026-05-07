import { TILE_SIZE } from './constants.js';

const ATTACK_DURATION = 200;
const ATTACK_COOLDOWN  = 400;
const SWORD_RANGE = 48;
const SWORD_ARC   = Math.PI * 0.7;

export class Player {
  constructor(tx, ty) {
    this.x = tx * TILE_SIZE + TILE_SIZE / 2;
    this.y = ty * TILE_SIZE + TILE_SIZE / 2;
    this.size = 14;

    // Tile-based movement state
    this._tileMoving   = false;
    this._tileMoveTimer = 0;
    this._tilePrevDX   = 0;
    this._tilePrevDY   = 0;

    this.hp    = 100;
    this.maxHp = 100;
    this.mp    = 60;
    this.maxMp = 60;
    this.atk   = 12;
    this.def   = 3;
    this.level = 1;
    this.xp    = 0;
    this.xpNext = 100;

    this.gold  = 0;
    this.inventory = [];
    this.equipment = { weapon: null, armor: null, ring: null };

    this.facing    = { x: 1, y: 0 };
    this.attacking = false;
    this.attackTimer  = 0;
    this.cooldownTimer= 0;
    this.attackAngle  = 0;
    this.swingAngle   = 0;

    this.invincible    = false;
    this.invincibleTimer = 0;

    this.floatingTexts = [];
    this.kills = 0;
    this.floorsCleared = 0;

    // Accessibility callbacks (set by AccessibilityManager)
    this.onSwing    = null;
    this.onHitEnemy = null;
    this.onStep     = null;
  }

  get tileX() { return Math.floor(this.x / TILE_SIZE); }
  get tileY() { return Math.floor(this.y / TILE_SIZE); }

  update(dt, keys, mouse, map, enemies) {
    this._move(dt, keys, map);
    this._handleAttack(dt, keys, mouse, enemies);
    this._updateInvincible(dt);
    this._updateFloatingTexts(dt);
    this._updateMpRegen(dt);
  }

  // 1 key-press = 1 tile; hold key = repeat after initial delay.
  // Cardinal only: if both axes pressed simultaneously, prefer vertical.
  _move(dt, keys, map) {
    if (this.attacking) {
      this._tileMoving = false;
      this._tileMoveTimer = 0;
      return;
    }

    let dx = 0, dy = 0;
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) dx -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
    if (keys['ArrowUp']    || keys['w'] || keys['W']) dy -= 1;
    if (keys['ArrowDown']  || keys['s'] || keys['S']) dy += 1;

    if (dx === 0 && dy === 0) {
      this._tileMoving    = false;
      this._tileMoveTimer = 0;
      return;
    }

    // Cardinal only — prefer vertical when both axes active
    if (dx !== 0 && dy !== 0) dx = 0;

    const dirChanged = dx !== this._tilePrevDX || dy !== this._tilePrevDY;

    if (!this._tileMoving || dirChanged) {
      this._stepTile(dx, dy, map);
      this._tileMoving    = true;
      this._tilePrevDX    = dx;
      this._tilePrevDY    = dy;
      this._tileMoveTimer = 220; // initial delay before repeat
    } else {
      this._tileMoveTimer -= dt;
      if (this._tileMoveTimer <= 0) {
        this._stepTile(dx, dy, map);
        this._tileMoveTimer = 160; // repeat rate while held
      }
    }

    this.facing = { x: dx, y: dy };
  }

  _stepTile(dx, dy, map) {
    const ntx = this.tileX + dx;
    const nty = this.tileY + dy;
    const t = map[nty]?.[ntx];
    if (t !== undefined && t !== 0 && t !== 2) {
      this.x = ntx * TILE_SIZE + TILE_SIZE / 2;
      this.y = nty * TILE_SIZE + TILE_SIZE / 2;
      this.onStep?.();
    }
  }

  _handleAttack(dt, keys, mouse, enemies) {
    this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);

    if (this.attacking) {
      this.attackTimer -= dt;
      this.swingAngle = 1 - this.attackTimer / ATTACK_DURATION;
      if (this.attackTimer <= 0) {
        this.attacking = false;
      }
    }

    const wantAttack = keys[' '] || keys['Space'] || mouse.left;
    if (wantAttack && !this.attacking && this.cooldownTimer <= 0) {
      this.attacking = true;
      this.attackTimer   = ATTACK_DURATION;
      this.cooldownTimer = ATTACK_COOLDOWN;
      this.swingAngle    = 0;

      const fAngle = Math.atan2(this.facing.y, this.facing.x);
      this.attackAngle = fAngle;

      this.onSwing?.();
      this._hitEnemiesInArc(enemies, fAngle);
    }
  }

  _hitEnemiesInArc(enemies, fAngle) {
    const totalAtk = this.atk + (this.equipment.weapon?.atk || 0) + (this.equipment.ring?.atk || 0);
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > SWORD_RANGE + e.size) continue;
      const angle = Math.atan2(dy, dx);
      let diff = angle - fAngle;
      while (diff > Math.PI)  diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > SWORD_ARC / 2) continue;

      const dmg = Math.max(1, totalAtk - e.def + Math.floor(Math.random() * 5));
      e.hp -= dmg;
      e.knockX = (dx / dist) * 6;
      e.knockY = (dy / dist) * 6;
      e.knockTimer = 150;
      this.addFloat('-' + dmg, e.x, e.y, '#ff6644');
      this.onHitEnemy?.(e, dmg);

      if (e.hp <= 0 && !e.dead) {
        e.dead = true;
        this.gainXp(e.xp);
        this.kills++;
        if (Math.random() < 0.3) {
          e.dropItem = randomDrop();
        }
      }
    }
  }

  _updateInvincible(dt) {
    if (this.invincible) {
      this.invincibleTimer -= dt;
      if (this.invincibleTimer <= 0) this.invincible = false;
    }
  }

  _updateFloatingTexts(dt) {
    this.floatingTexts = this.floatingTexts.filter(t => {
      t.life -= dt;
      t.y -= 0.5;
      return t.life > 0;
    });
  }

  _mpRegenTimer = 0;
  _updateMpRegen(dt) {
    this._mpRegenTimer += dt;
    if (this._mpRegenTimer >= 2000) {
      this._mpRegenTimer = 0;
      if (this.mp < this.maxMp) this.mp = Math.min(this.maxMp, this.mp + 2);
    }
  }

  takeDamage(amount) {
    if (this.invincible) return;
    const totalDef = this.def + (this.equipment.armor?.def || 0);
    const dmg = Math.max(1, amount - totalDef);
    this.hp -= dmg;
    this.invincible = true;
    this.invincibleTimer = 500;
    this.addFloat('-' + dmg, this.x, this.y - 20, '#ff4444');
    return dmg;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.addFloat('+' + amount + ' HP', this.x, this.y - 20, '#44ff88');
  }

  gainXp(amount) {
    this.xp += amount;
    this.addFloat('+' + amount + ' XP', this.x, this.y - 35, '#ffcc00');
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.levelUp();
    }
  }

  levelUp() {
    this.level++;
    this.xpNext = Math.floor(this.xpNext * 1.5);
    this.maxHp  += 15;
    this.hp      = this.maxHp;
    this.maxMp  += 5;
    this.mp      = this.maxMp;
    this.atk    += 3;
    this.def    += 1;
    this.addFloat('NIVEL ' + this.level + '!', this.x, this.y - 50, '#fff700');
  }

  addFloat(text, x, y, color) {
    this.floatingTexts.push({ text, x, y, color, life: 1200 });
  }

  addItem(item) {
    this.inventory.push(item);
    if (item.autoEquip && !this.equipment[item.slot]) {
      this.equip(item);
    }
  }

  equip(item) {
    if (!item.slot) return;
    const old = this.equipment[item.slot];
    if (old?.mp) {
      this.maxMp -= old.mp;
      this.mp = Math.min(this.mp, this.maxMp);
    }
    this.equipment[item.slot] = item;
    if (item.mp) {
      this.maxMp += item.mp;
      this.mp += item.mp;
    }
    this.inventory = this.inventory.filter(i => i !== item);
  }

  useItem(item) {
    if (item.type === 'health_potion') {
      this.heal(item.value);
      this.inventory = this.inventory.filter(i => i !== item);
    } else if (item.type === 'mana_potion') {
      this.mp = Math.min(this.maxMp, this.mp + item.value);
      this.addFloat('+' + item.value + ' MP', this.x, this.y - 20, '#44aaff');
      this.inventory = this.inventory.filter(i => i !== item);
    } else if (item.type === 'equipment') {
      this.equip(item);
      this.addFloat('Equipado: ' + item.name, this.x, this.y - 20, item.color || '#fff');
    }
  }

  getSwordEndpoints() {
    const baseAngle = this.attackAngle - SWORD_ARC / 2 + SWORD_ARC * this.swingAngle;
    const sx = this.x + Math.cos(baseAngle) * SWORD_RANGE;
    const sy = this.y + Math.sin(baseAngle) * SWORD_RANGE;
    return { sx, sy, angle: baseAngle, range: SWORD_RANGE };
  }
}

function randomDrop() {
  const r = Math.random();
  if (r < 0.6) return { type: 'health_potion', name: 'Poción de Vida', value: 30, color: '#e74c3c' };
  if (r < 0.8) return { type: 'mana_potion',   name: 'Poción de Maná', value: 25, color: '#3498db' };
  if (r < 0.9) return { type: 'gold', name: 'Monedas de Oro', value: Math.floor(Math.random() * 20) + 5, color: '#ffd700' };
  const eq = [
    { type: 'equipment', slot: 'weapon', name: 'Espada Afilada', atk: Math.floor(Math.random()*5)+3, color: '#aaddff', autoEquip: true },
    { type: 'equipment', slot: 'armor',  name: 'Cota de Malla',  def: Math.floor(Math.random()*3)+2, color: '#aaaaaa', autoEquip: true },
    { type: 'equipment', slot: 'ring',   name: 'Anillo Mágico',  mp: 20, color: '#ff88ff', autoEquip: true },
  ];
  return eq[Math.floor(Math.random() * eq.length)];
}
