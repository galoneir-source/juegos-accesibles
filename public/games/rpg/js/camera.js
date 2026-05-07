import { CANVAS_W, CANVAS_H, TILE_SIZE } from './constants.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.smoothX = 0;
    this.smoothY = 0;
  }

  follow(target, mapW, mapH) {
    const targetX = target.x - CANVAS_W / 2;
    const targetY = target.y - CANVAS_H / 2;

    const maxX = mapW * TILE_SIZE - CANVAS_W;
    const maxY = mapH * TILE_SIZE - CANVAS_H;

    this.x = Math.max(0, Math.min(maxX, targetX));
    this.y = Math.max(0, Math.min(maxY, targetY));

    this.smoothX += (this.x - this.smoothX) * 0.12;
    this.smoothY += (this.y - this.smoothY) * 0.12;
  }

  get rx() { return Math.floor(this.smoothX); }
  get ry() { return Math.floor(this.smoothY); }

  toWorld(screenX, screenY) {
    return { x: screenX + this.rx, y: screenY + this.ry };
  }

  isVisible(wx, wy, margin = 64) {
    return wx > this.rx - margin && wx < this.rx + CANVAS_W + margin &&
           wy > this.ry - margin && wy < this.ry + CANVAS_H + margin;
  }
}
