import { CANVAS_W, CANVAS_H, COLORS } from './constants.js';

export function renderHUD(ctx, player, floor, totalFloors, showInventory = true) {
  const pad = 12;

  // Background panel
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(pad, pad, 200, 90);

  // HP
  drawBar(ctx, pad + 8, pad + 10, 180, 14, player.hp / player.maxHp, '#e74c3c', '#1a0a0a');
  ctx.fillStyle = '#fff';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`❤ ${player.hp}/${player.maxHp}`, pad + 12, pad + 21);

  // MP
  drawBar(ctx, pad + 8, pad + 30, 180, 14, player.mp / player.maxMp, '#3498db', '#0a0a1a');
  ctx.fillStyle = '#fff';
  ctx.fillText(`✦ ${player.mp}/${player.maxMp}`, pad + 12, pad + 41);

  // XP
  drawBar(ctx, pad + 8, pad + 50, 180, 10, player.xp / player.xpNext, '#f39c12', '#1a1a0a');
  ctx.fillStyle = '#fff';
  ctx.fillText(`Nv ${player.level}  XP ${player.xp}/${player.xpNext}`, pad + 12, pad + 59);

  // Gold
  ctx.fillStyle = '#ffd700';
  ctx.fillText(`⚙ ${player.gold} oro`, pad + 12, pad + 76);

  // Floor indicator
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  const floorText = `Piso ${floor}/${totalFloors}`;
  const tw = ctx.measureText(floorText).width + 16;
  ctx.fillRect(CANVAS_W / 2 - tw / 2, pad, tw, 22);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(floorText, CANVAS_W / 2, pad + 14);

  if (showInventory) renderInventory(ctx, player);
  renderControls(ctx);
}

function renderInventory(ctx, player) {
  const slotSize = 40;
  const cols = 6;
  const rows = Math.ceil(Math.max(player.inventory.length, cols) / cols);
  const startX = CANVAS_W - (cols * (slotSize + 4)) - 12;
  const startY = 12;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(startX - 4, startY - 4, cols * (slotSize + 4) + 4, rows * (slotSize + 4) + 28);

  ctx.fillStyle = '#aaa';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('INVENTARIO', startX, startY + 8);

  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (slotSize + 4);
    const y = startY + 14 + row * (slotSize + 4);

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x, y, slotSize, slotSize);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, slotSize, slotSize);

    const item = player.inventory[i];
    if (item) {
      ctx.fillStyle = item.color || '#aaa';
      ctx.beginPath();
      ctx.arc(x + slotSize / 2, y + slotSize / 2, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      const label = item.type === 'health_potion' ? 'HP' :
                    item.type === 'mana_potion'   ? 'MP' :
                    item.type === 'gold'           ? 'ORO' :
                    item.name?.slice(0, 3)         || '?';
      ctx.fillText(label, x + slotSize / 2, y + slotSize - 4);
    }
  }

  ctx.fillStyle = '#888';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('[1-6] Usar item', startX, startY + 14 + rows * (slotSize + 4) + 12);

  // Equipment display
  renderEquipment(ctx, player, startX, startY + 14 + rows * (slotSize + 4) + 22);
}

function renderEquipment(ctx, player, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x - 4, y - 4, 200, 65);

  ctx.fillStyle = '#aaa';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('EQUIPAMIENTO', x, y + 8);

  const eq = player.equipment;
  const slots = [
    ['weapon', '⚔', eq.weapon?.name || 'Sin arma'],
    ['armor',  '🛡', eq.armor?.name  || 'Sin armadura'],
    ['ring',   '💍', eq.ring?.name   || 'Sin anillo'],
  ];
  slots.forEach(([slot, icon, label], i) => {
    ctx.fillStyle = player.equipment[slot] ? '#ffd700' : '#555';
    ctx.fillText(`${icon} ${label}`, x, y + 22 + i * 14);
  });
}

function renderControls(ctx) {
  const lines = ['WASD/↑↓←→ mover', 'Espacio/Click atacar', 'E interactuar', '1-6 usar item'];
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(12, CANVAS_H - 75, 150, 68);
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, 18, CANVAS_H - 58 + i * 14));
}

export function renderMenu(ctx) {
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 48px serif';
  ctx.textAlign = 'center';
  ctx.fillText('MAZMORRA', CANVAS_W / 2, 180);

  ctx.fillStyle = '#cc9900';
  ctx.font = 'bold 24px serif';
  ctx.fillText('OSCURA', CANVAS_W / 2, 220);

  ctx.fillStyle = '#888';
  ctx.font = '14px monospace';
  ctx.fillText('RPG de Aventura Medieval', CANVAS_W / 2, 260);

  drawMenuButton(ctx, CANVAS_W / 2, 330, 'NUEVA PARTIDA', '#e74c3c');
  drawMenuButton(ctx, CANVAS_W / 2, 390, 'CONTROLES', '#3498db');

  ctx.fillStyle = '#555';
  ctx.font = '11px monospace';
  ctx.fillText('WASD - Mover  |  Espacio/Click - Atacar  |  E - Interactuar  |  I - Inventario', CANVAS_W / 2, CANVAS_H - 30);
}

export function renderControls2(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 28px serif';
  ctx.textAlign = 'center';
  ctx.fillText('CONTROLES', CANVAS_W / 2, 80);

  const controls = [
    ['WASD / Flechas', 'Mover personaje'],
    ['Espacio / Click izq.', 'Atacar con espada'],
    ['E', 'Interactuar / Abrir cofre / Bajar escaleras'],
    ['I', 'Mostrar/Ocultar inventario'],
    ['1 - 6', 'Usar ítem del inventario'],
    ['ESC', 'Pausar juego'],
    ['— Accesibilidad —', ''],
    ['R', 'Radar: enemigos cercanos con audio espacial'],
    ['T', 'Describir alrededores (paredes, puertas, cofres)'],
    ['Q', 'Leer estadísticas del personaje'],
    ['P', 'Leer inventario'],
    ['H', 'Ayuda completa de controles'],
    ['X', 'Navegar a zona inexplorada más cercana'],
    ['Re Pág / Av Pág', 'Subir / Bajar volumen de pasos'],
  ];

  ctx.font = '13px monospace';
  controls.forEach(([key, desc], i) => {
    const y = 128 + i * 32;
    if (desc === '') {
      ctx.fillStyle = 'rgba(255,215,0,0.15)';
      ctx.fillRect(CANVAS_W / 2 - 280, y - 14, 560, 22);
      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'center';
      ctx.fillText(key, CANVAS_W / 2, y);
      return;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(CANVAS_W / 2 - 280, y - 14, 560, 22);
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'right';
    ctx.fillText(key, CANVAS_W / 2 - 20, y);
    ctx.fillStyle = '#ccc';
    ctx.textAlign = 'left';
    ctx.fillText(desc, CANVAS_W / 2 + 20, y);
  });

  drawMenuButton(ctx, CANVAS_W / 2, CANVAS_H - 40, 'VOLVER', '#555');
}

export function renderPause(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSA', CANVAS_W / 2, CANVAS_H / 2 - 20);
  ctx.fillStyle = '#aaa';
  ctx.font = '16px monospace';
  ctx.fillText('ESC para continuar', CANVAS_W / 2, CANVAS_H / 2 + 20);
}

export function renderDead(ctx, player) {
  ctx.fillStyle = 'rgba(80,0,0,0.85)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 52px serif';
  ctx.textAlign = 'center';
  ctx.fillText('HAS MUERTO', CANVAS_W / 2, CANVAS_H / 2 - 60);

  ctx.fillStyle = '#aaa';
  ctx.font = '16px monospace';
  ctx.fillText(`Nivel ${player.level}  |  ${player.kills} enemigos  |  ${player.gold} oro`, CANVAS_W / 2, CANVAS_H / 2);

  drawMenuButton(ctx, CANVAS_W / 2, CANVAS_H / 2 + 70, 'MENÚ PRINCIPAL', '#e74c3c');
}

export function renderWin(ctx, player) {
  ctx.fillStyle = 'rgba(0,40,0,0.88)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 42px serif';
  ctx.textAlign = 'center';
  ctx.fillText('¡VICTORIA!', CANVAS_W / 2, CANVAS_H / 2 - 80);

  ctx.fillStyle = '#ccc';
  ctx.font = '18px monospace';
  ctx.fillText('Has derrotado al Dragón Oscuro', CANVAS_W / 2, CANVAS_H / 2 - 30);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#aaa';
  ctx.fillText(`Nivel ${player.level}  |  ${player.kills} enemigos eliminados  |  ${player.gold} oro`, CANVAS_W / 2, CANVAS_H / 2 + 10);
  ctx.fillText(`Pisos recorridos: ${player.floorsCleared}`, CANVAS_W / 2, CANVAS_H / 2 + 35);

  drawMenuButton(ctx, CANVAS_W / 2, CANVAS_H / 2 + 100, 'JUGAR DE NUEVO', '#ffd700');
}

export function renderBossWarning(ctx, alpha) {
  ctx.fillStyle = `rgba(150,0,0,${alpha * 0.6})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = `rgba(255,50,50,${alpha})`;
  ctx.font = 'bold 36px serif';
  ctx.textAlign = 'center';
  ctx.fillText('¡EL DRAGÓN OSCURO DESPIERTA!', CANVAS_W / 2, CANVAS_H / 2);
}

function drawMenuButton(ctx, cx, cy, label, color) {
  const w = 220, h = 40;
  ctx.fillStyle = color;
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, cy + 6);
}

function drawBar(ctx, x, y, w, h, pct, fill, bg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.max(0, w * pct), h);
}

export function getMenuButtonBounds() {
  return {
    newGame:   { x: CANVAS_W/2 - 110, y: 310, w: 220, h: 40 },
    controls:  { x: CANVAS_W/2 - 110, y: 370, w: 220, h: 40 },
    back:      { x: CANVAS_W/2 - 110, y: CANVAS_H - 60,  w: 220, h: 40 },
    deadMenu:  { x: CANVAS_W/2 - 110, y: CANVAS_H/2 + 50, w: 220, h: 40 },
    winReplay: { x: CANVAS_W/2 - 110, y: CANVAS_H/2 + 80, w: 220, h: 40 },
  };
}
