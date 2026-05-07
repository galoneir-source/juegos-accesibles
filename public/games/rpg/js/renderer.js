import { TILE, TILE_SIZE, COLORS } from './constants.js';

const WALL_H = 10;

export function renderDungeon(ctx, dungeon, camera) {
  const { map, chests } = dungeon;
  const startTX = Math.floor(camera.rx / TILE_SIZE);
  const startTY = Math.floor(camera.ry / TILE_SIZE);
  const endTX   = startTX + Math.ceil(ctx.canvas.width  / TILE_SIZE) + 2;
  const endTY   = startTY + Math.ceil(ctx.canvas.height / TILE_SIZE) + 2;

  for (let ty = startTY; ty < endTY; ty++) {
    for (let tx = startTX; tx < endTX; tx++) {
      const row = map[ty];
      if (!row) continue;
      const tile = row[tx];
      if (tile === TILE.EMPTY) continue;

      const sx = tx * TILE_SIZE - camera.rx;
      const sy = ty * TILE_SIZE - camera.ry;

      switch (tile) {
        case TILE.FLOOR:    drawFloor(ctx, sx, sy, tx, ty); break;
        case TILE.WALL:     drawWall(ctx, sx, sy, map, tx, ty); break;
        case TILE.DOOR:     drawDoor(ctx, sx, sy); break;
        case TILE.STAIRS:   drawFloor(ctx, sx, sy, tx, ty); drawStairs(ctx, sx, sy); break;
        case TILE.CHEST:    drawFloor(ctx, sx, sy, tx, ty); break;
      }
    }
  }

  for (const chest of chests) {
    if (!camera.isVisible(chest.x * TILE_SIZE, chest.y * TILE_SIZE)) continue;
    const sx = chest.x * TILE_SIZE - camera.rx;
    const sy = chest.y * TILE_SIZE - camera.ry;
    drawChest(ctx, sx, sy, chest.opened);
  }
}

function drawFloor(ctx, sx, sy, tx, ty) {
  ctx.fillStyle = (tx + ty) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
  ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
}

function drawWall(ctx, sx, sy, map, tx, ty) {
  const below = map[ty + 1]?.[tx];
  const isFloorBelow = below === TILE.FLOOR || below === TILE.STAIRS || below === TILE.CHEST || below === TILE.DOOR;

  if (isFloorBelow) {
    ctx.fillStyle = COLORS.wallFace;
    ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = COLORS.wallTop;
    ctx.fillRect(sx, sy, TILE_SIZE, WALL_H);
  } else {
    ctx.fillStyle = COLORS.wallTop;
    ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
  }
}

function drawDoor(ctx, sx, sy) {
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = COLORS.door;
  ctx.fillRect(sx + 6, sy + 2, TILE_SIZE - 12, TILE_SIZE - 4);
}

function drawStairs(ctx, sx, sy) {
  ctx.fillStyle = COLORS.stairs;
  ctx.strokeStyle = '#aa8800';
  ctx.lineWidth = 1;
  ctx.fillRect(sx + 6, sy + 6, TILE_SIZE - 12, TILE_SIZE - 12);
  ctx.strokeRect(sx + 6, sy + 6, TILE_SIZE - 12, TILE_SIZE - 12);
  ctx.fillStyle = '#aa8800';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('▼', sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 + 5);
}

function drawChest(ctx, sx, sy, opened) {
  ctx.fillStyle = opened ? '#6a4a10' : '#c8940a';
  ctx.fillRect(sx + 4, sy + 8, TILE_SIZE - 8, TILE_SIZE - 12);
  ctx.fillStyle = opened ? '#4a3008' : '#a07008';
  ctx.fillRect(sx + 4, sy + 8, TILE_SIZE - 8, 6);
  if (!opened) {
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(sx + TILE_SIZE / 2 - 2, sy + 12, 4, 4);
  }
}

export function renderEntities(ctx, dungeon, player, camera) {
  const dropsToRemove = [];

  for (const e of dungeon.enemies) {
    if (e.dead) {
      if (e.dropItem) {
        renderDrop(ctx, e, camera);
      }
      continue;
    }
    if (!camera.isVisible(e.x, e.y)) continue;
    renderEnemy(ctx, e, camera);
  }

  renderPlayer(ctx, player, camera);
}

function renderEnemy(ctx, e, camera) {
  const sx = e.x - camera.rx;
  const sy = e.y - camera.ry;

  if (e.isBoss) {
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 15;
  }

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(sx, sy, e.size, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;

  if (e.isBoss) {
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const eyeOff = e.dir?.x !== 0 || e.dir?.y !== 0
    ? { x: e.dir.x * 5, y: e.dir.y * 5 }
    : { x: 4, y: 0 };

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(sx + eyeOff.x - 2, sy + eyeOff.y - 3, 3, 0, Math.PI * 2);
  ctx.arc(sx + eyeOff.x + 2, sy + eyeOff.y - 3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(sx + eyeOff.x - 2, sy + eyeOff.y - 3, 1.5, 0, Math.PI * 2);
  ctx.arc(sx + eyeOff.x + 2, sy + eyeOff.y - 3, 1.5, 0, Math.PI * 2);
  ctx.fill();

  drawBar(ctx, sx - 18, sy - e.size - 10, 36, 5, e.hp / e.maxHp, '#e74c3c', '#333');
}

function renderDrop(ctx, e, camera) {
  const sx = e.x - camera.rx;
  const sy = e.y - camera.ry;
  if (!camera.isVisible(e.x, e.y)) return;
  ctx.fillStyle = e.dropItem.color || '#ffd700';
  ctx.beginPath();
  ctx.arc(sx, sy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function renderPlayer(ctx, player, camera) {
  const sx = player.x - camera.rx;
  const sy = player.y - camera.ry;

  if (player.invincible && Math.floor(Date.now() / 80) % 2 === 0) return;

  if (player.attacking) {
    const { angle, range } = player.getSwordEndpoints();
    const arc = Math.PI * 0.7;
    const startA = angle - arc / 2;
    const endA   = angle - arc / 2 + arc * player.swingAngle;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, range, startA, endA);
    ctx.closePath();
    ctx.fillStyle = 'rgba(200,220,255,0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,220,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = '#4af';
  ctx.beginPath();
  ctx.arc(sx, sy, player.size, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2288cc';
  ctx.beginPath();
  ctx.arc(sx, sy, player.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6ac8ff';
  ctx.beginPath();
  ctx.arc(sx - 3, sy - 3, player.size * 0.5, 0, Math.PI * 2);
  ctx.fill();

  const eyeX = player.facing.x * 6;
  const eyeY = player.facing.y * 6;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(sx + eyeX - player.facing.y * 3, sy + eyeY + player.facing.x * 3, 3, 0, Math.PI * 2);
  ctx.arc(sx + eyeX + player.facing.y * 3, sy + eyeY - player.facing.x * 3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(sx + eyeX - player.facing.y * 3, sy + eyeY + player.facing.x * 3, 1.5, 0, Math.PI * 2);
  ctx.arc(sx + eyeX + player.facing.y * 3, sy + eyeY - player.facing.x * 3, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

export function renderFloatingTexts(ctx, player, camera) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px monospace';
  for (const t of player.floatingTexts) {
    ctx.globalAlpha = Math.min(1, t.life / 400);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x - camera.rx, t.y - camera.ry);
  }
  ctx.globalAlpha = 1;
}

function drawBar(ctx, x, y, w, h, pct, fillColor, bgColor) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, Math.max(0, w * pct), h);
}
