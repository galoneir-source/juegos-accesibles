import { Game } from './game.js';
import { CANVAS_W, CANVAS_H } from './constants.js';

const canvas = document.getElementById('gameCanvas');
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

new Game(canvas);
