import { TILE_SIZE } from './constants.js';

const CHASE_RANGE   = 200;
const ATTACK_RANGE  = 28;
const ATTACK_PERIOD = 1200;

export function updateEnemies(enemies, player, map, dt) {
  for (const e of enemies) {
    if (e.dead) continue;
    updateEnemy(e, player, map, dt);
  }
}

function updateEnemy(e, player, map, dt) {
  // Knockback
  if (e.knockTimer > 0) {
    e.knockTimer -= dt;
    const nx = e.x + e.knockX;
    const ny = e.y + e.knockY;
    if (!tileBlocked(nx, e.y, map)) e.x = nx;
    if (!tileBlocked(e.x, ny, map)) e.y = ny;
    e.knockX *= 0.8;
    e.knockY *= 0.8;
    return;
  }

  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy);

  e.attackTimer = Math.max(0, e.attackTimer - dt);

  if (dist < ATTACK_RANGE + e.size) {
    e.state = 'attack';
    if (e.attackTimer <= 0) {
      player.takeDamage(e.atk);
      e.attackTimer = e.isBoss ? ATTACK_PERIOD * 0.6 : ATTACK_PERIOD;
    }
  } else if (dist < CHASE_RANGE + (e.isBoss ? 100 : 0)) {
    e.state = 'chase';
    const speed = e.spd * (e.isBoss ? 1.1 : 1);
    const nx = e.x + (dx / dist) * speed;
    const ny = e.y + (dy / dist) * speed;
    if (!tileBlocked(nx, e.y, map)) e.x = nx;
    if (!tileBlocked(e.x, ny, map)) e.y = ny;
    e.dir = { x: dx / dist, y: dy / dist };
  } else {
    e.state = 'idle';
    e.patrolTimer -= dt;
    if (e.patrolTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      e.patrolDir = { x: Math.cos(angle), y: Math.sin(angle) };
      e.patrolTimer = 1000 + Math.random() * 2000;
    }
    const nx = e.x + e.patrolDir.x * 0.6;
    const ny = e.y + e.patrolDir.y * 0.6;
    if (!tileBlocked(nx, e.y, map)) e.x = nx;
    if (!tileBlocked(e.x, ny, map)) e.y = ny;
  }
}

function tileBlocked(x, y, map) {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  const row = map[ty];
  if (!row) return true;
  const t = row[tx];
  return t === undefined || t === 0 || t === 2;
}
