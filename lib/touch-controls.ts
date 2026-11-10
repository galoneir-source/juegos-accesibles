// Botones en pantalla para jugar sin teclado físico (móvil y tableta). Cada
// botón genera la misma pulsación de tecla que el juego ya atiende en
// `window`, así que los juegos no cambian: solo hay que describir aquí qué
// teclas usa cada uno. Los muestra components/games/TouchControls.tsx, solo
// en dispositivos cuyo puntero principal es táctil.
//
// Si un juego cambia una tecla, hay que cambiarla también aquí (y en
// lib/game-guides.ts). Wordle y Memory de Sonidos ya tienen sus propios
// botones; las aventuras de texto y los juegos de escribir usan el teclado
// del propio móvil.

export type TouchKey = {
  key: string
  label: string
  // Juegos en tiempo real que miran si la tecla sigue pulsada (keydown y
  // keyup): el botón la mantiene mientras el dedo siga encima.
  hold?: boolean
}

export type TouchGroup = {
  label: string
  // dpad: cruceta (arriba, izquierda, derecha, abajo, en ese orden).
  layout?: 'dpad' | 'row'
  keys: TouchKey[]
}

const UP: TouchKey = { key: 'ArrowUp', label: 'Arriba' }
const DOWN: TouchKey = { key: 'ArrowDown', label: 'Abajo' }
const LEFT: TouchKey = { key: 'ArrowLeft', label: 'Izquierda' }
const RIGHT: TouchKey = { key: 'ArrowRight', label: 'Derecha' }
const DPAD = (label = 'Moverse'): TouchGroup => ({ label, layout: 'dpad', keys: [UP, LEFT, RIGHT, DOWN] })

const HELP_H: TouchKey = { key: 'h', label: 'Instrucciones' }
const HELP_I: TouchKey = { key: 'i', label: 'Instrucciones' }
const STATE_R: TouchKey = { key: 'r', label: 'Releer estado' }

const numbers = (prefix: string, keys: string[]): TouchKey[] =>
  keys.map((k, i) => ({ key: k, label: `${prefix} ${i + 1}` }))

const LETTERS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('').map((l) => ({ key: l, label: l }))

// Clave: la ruta del juego sin la barra inicial.
export const TOUCH_CONTROLS: Record<string, TouchGroup[]> = {
  '2048': [DPAD('Deslizar fichas'), { label: 'Ayuda', keys: [STATE_R, HELP_H] }],

  ahorcado: [
    { label: 'Letras', keys: LETTERS },
    { label: 'Ayuda', keys: [{ key: '1', label: 'Instrucciones' }, { key: '2', label: 'Releer palabra' }] },
  ],

  asteroides: [
    {
      label: 'Nave',
      keys: [
        { key: 'ArrowLeft', label: 'Girar a la izquierda', hold: true },
        { key: 'ArrowUp', label: 'Propulsar', hold: true },
        { key: 'ArrowRight', label: 'Girar a la derecha', hold: true },
        { key: ' ', label: 'Disparar' },
      ],
    },
    { label: 'Ayuda', keys: [{ key: 'e', label: 'Escanear' }, STATE_R, HELP_H] },
  ],

  'batalla-naval': [
    DPAD('Mover el cursor'),
    {
      label: 'Acciones',
      keys: [
        { key: 'Enter', label: 'Colocar o disparar' },
        { key: 'r', label: 'Girar barco o releer' },
        { key: 'a', label: 'Colocar barcos solos' },
      ],
    },
    { label: 'Ayuda', keys: [HELP_H] },
  ],

  bingo: [
    { label: 'Partida', keys: [{ key: ' ', label: 'Pedir bola' }] },
    { label: 'Ayuda', keys: [STATE_R, HELP_H] },
  ],

  blackjack: [
    {
      label: 'Jugada',
      keys: [
        { key: 'p', label: 'Pedir carta' },
        { key: 's', label: 'Plantarse' },
        { key: 'd', label: 'Doblar' },
        { key: 'n', label: 'Nueva partida' },
      ],
    },
    { label: 'Ayuda', keys: [{ key: 'r', label: 'Releer mano' }, HELP_I] },
  ],

  buscaminas: [
    DPAD('Mover el cursor'),
    { label: 'Acciones', keys: [{ key: 'Enter', label: 'Revelar' }, { key: 'f', label: 'Bandera' }] },
    { label: 'Ayuda', keys: [{ key: 'e', label: 'Celda y vecinas' }, { key: 'r', label: 'Minas restantes' }, HELP_H] },
  ],

  'conecta-cuatro': [
    {
      label: 'Jugada',
      keys: [
        { key: 'ArrowLeft', label: 'Columna a la izquierda' },
        { key: 'Enter', label: 'Soltar ficha' },
        { key: 'ArrowRight', label: 'Columna a la derecha' },
      ],
    },
    { label: 'Ayuda', keys: [{ key: 'i', label: 'Leer columna' }, STATE_R, HELP_H] },
  ],

  frogger: [DPAD('Saltar'), { label: 'Ayuda', keys: [{ key: 'e', label: 'Peligros' }, STATE_R, HELP_H] }],

  generala: [
    { label: 'Dados', keys: [{ key: 'r', label: 'Tirar' }, ...numbers('Guardar dado', ['1', '2', '3', '4', '5'])] },
    {
      label: 'Categorías',
      keys: [
        { key: 'ArrowUp', label: 'Categoría anterior' },
        { key: 'ArrowDown', label: 'Categoría siguiente' },
        { key: 'Enter', label: 'Anotar' },
      ],
    },
    { label: 'Ayuda', keys: [{ key: 'e', label: 'Releer turno' }, HELP_H] },
  ],

  'gin-rummy': [
    { label: 'Robar', keys: [{ key: 'm', label: 'Robar del mazo' }, { key: 'd', label: 'Robar del descarte' }] },
    { label: 'Tu mano', keys: numbers('Carta', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) },
    {
      label: 'Acciones',
      keys: [
        { key: 'r', label: 'Descartar' },
        { key: 'l', label: 'Cerrar' },
        { key: 'g', label: 'Gin' },
        { key: 'n', label: 'Nueva partida' },
      ],
    },
    { label: 'Ayuda', keys: [{ key: 'h', label: 'Leer mano' }, HELP_I] },
  ],

  'laberinto-audio': [
    DPAD(),
    { label: 'Ayuda', keys: [{ key: ' ', label: 'Brújula' }, { key: 'r', label: 'Posición y salidas' }, HELP_H] },
  ],

  parchis: [
    { label: 'Turno', keys: [{ key: 'r', label: 'Tirar dado' }, ...numbers('Ficha', ['1', '2', '3', '4'])] },
    { label: 'Ayuda', keys: [{ key: 'i', label: 'Estado' }] },
  ],

  penaltis: [
    {
      label: 'Tiro o parada',
      keys: [
        { key: 'ArrowLeft', label: 'Izquierda' },
        { key: 'ArrowDown', label: 'Centro' },
        { key: 'ArrowRight', label: 'Derecha' },
      ],
    },
    { label: 'Ayuda', keys: [HELP_H] },
  ],

  poker: [
    {
      label: 'Apuesta',
      keys: [
        { key: 'f', label: 'Retirarse' },
        { key: 'c', label: 'Igualar o pasar' },
        { key: 'r', label: 'Subir' },
        { key: '+', label: 'Más subida' },
        { key: '-', label: 'Menos subida' },
      ],
    },
    { label: 'Partida', keys: [{ key: 'i', label: 'Estado' }, { key: 'n', label: 'Nueva mano' }] },
  ],

  'pong-audio': [
    {
      label: 'Paleta',
      keys: [
        { key: 'ArrowUp', label: 'Subir', hold: true },
        { key: 'ArrowDown', label: 'Bajar', hold: true },
      ],
    },
    { label: 'Ayuda', keys: [{ key: ' ', label: 'Escuchar pelota' }, { key: 'r', label: 'Marcador' }, HELP_H] },
  ],

  quince: [
    DPAD('Deslizar ficha'),
    {
      label: 'Ayuda',
      keys: [{ key: 'e', label: 'Explorar el hueco' }, { key: 'b', label: 'Leer tablero' }, { key: 'r', label: 'Reiniciar' }],
    },
  ],

  secuencias: [
    {
      label: 'Saltar',
      keys: [
        { key: 'ArrowLeft', label: 'Saltar a la izquierda' },
        { key: 'ArrowRight', label: 'Saltar a la derecha' },
      ],
    },
    { label: 'Ayuda', keys: [STATE_R, HELP_H] },
  ],

  sokoban: [
    DPAD(),
    {
      label: 'Acciones',
      keys: [
        { key: 'z', label: 'Deshacer' },
        { key: 'r', label: 'Reiniciar nivel' },
        { key: 'n', label: 'Siguiente nivel' },
        { key: 'e', label: 'Describir entorno' },
      ],
    },
  ],

  solitario: [
    {
      label: 'Moverse',
      keys: [
        { key: 'ArrowLeft', label: 'Pila anterior' },
        { key: 'Enter', label: 'Coger o dejar' },
        { key: 'ArrowRight', label: 'Pila siguiente' },
      ],
    },
    { label: 'Columnas', keys: numbers('Columna', ['1', '2', '3', '4', '5', '6', '7']) },
    {
      label: 'Mazo y fundaciones',
      keys: [
        { key: 'd', label: 'Robar' },
        { key: 's', label: 'Ir al mazo' },
        { key: 'w', label: 'Ir al descarte' },
        { key: 'f', label: 'Fundaciones' },
        { key: 'a', label: 'A la fundación' },
        { key: 'Escape', label: 'Cancelar' },
      ],
    },
    { label: 'Ayuda', keys: [{ key: 'r', label: 'Describir pila' }, { key: 'n', label: 'Nueva partida' }, HELP_I] },
  ],

  'space-invaders': [
    {
      label: 'Nave',
      keys: [
        { key: 'ArrowLeft', label: 'Izquierda', hold: true },
        { key: ' ', label: 'Disparar' },
        { key: 'ArrowRight', label: 'Derecha', hold: true },
      ],
    },
    { label: 'Ayuda', keys: [{ key: 'e', label: 'Ubicar' }, STATE_R, HELP_H] },
  ],

  tetris: [
    {
      label: 'Pieza',
      keys: [
        { key: 'ArrowLeft', label: 'Izquierda' },
        { key: 'ArrowUp', label: 'Rotar' },
        { key: 'ArrowRight', label: 'Derecha' },
        { key: 'ArrowDown', label: 'Bajar' },
        { key: ' ', label: 'Dejar caer' },
      ],
    },
    { label: 'Ayuda', keys: [{ key: 'e', label: 'Barrido' }, STATE_R, { key: 'p', label: 'Pausa' }, HELP_H] },
  ],

  tragaperras: [
    { label: 'Rodillos', keys: [{ key: ' ', label: 'Girar' }, ...numbers('Retener rodillo', ['1', '2', '3'])] },
    { label: 'Partida', keys: [{ key: 'q', label: 'Terminar y guardar' }] },
  ],

  'tres-en-raya': [
    DPAD('Mover el cursor'),
    { label: 'Jugada', keys: [{ key: 'Enter', label: 'Marcar' }] },
    { label: 'Ayuda', keys: [{ key: 'r', label: 'Leer casilla' }, HELP_H] },
  ],

  truco: [
    { label: 'Cartas', keys: numbers('Carta', ['1', '2', '3']) },
    {
      label: 'Cantos',
      keys: [
        { key: 'e', label: 'Envido' },
        { key: 't', label: 'Truco' },
        { key: 's', label: 'Aceptar' },
        { key: 'n', label: 'Rechazar' },
      ],
    },
    { label: 'Ayuda', keys: [{ key: 'i', label: 'Estado' }] },
  ],
}
