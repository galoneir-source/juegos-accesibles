let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.3, delay = 0) {
  const ac = getCtx()
  const osc = ac.createOscillator()
  const gn = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  gn.gain.setValueAtTime(0, ac.currentTime + delay)
  gn.gain.linearRampToValueAtTime(gain, ac.currentTime + delay + 0.01)
  gn.gain.linearRampToValueAtTime(0, ac.currentTime + delay + duration)
  osc.connect(gn)
  gn.connect(ac.destination)
  osc.start(ac.currentTime + delay)
  osc.stop(ac.currentTime + delay + duration + 0.05)
}

function playPannedTone(freq: number, duration: number, pan: number, gain = 0.3, delay = 0) {
  const ac = getCtx()
  const osc = ac.createOscillator()
  const gn = ac.createGain()
  const panner = ac.createStereoPanner()
  osc.type = 'sine'
  osc.frequency.value = freq
  panner.pan.value = Math.max(-1, Math.min(1, pan))
  gn.gain.setValueAtTime(0, ac.currentTime + delay)
  gn.gain.linearRampToValueAtTime(gain, ac.currentTime + delay + 0.02)
  gn.gain.linearRampToValueAtTime(0, ac.currentTime + delay + duration)
  osc.connect(gn)
  gn.connect(panner)
  panner.connect(ac.destination)
  osc.start(ac.currentTime + delay)
  osc.stop(ac.currentTime + delay + duration + 0.05)
}

export const audio = {
  correct() {
    playTone(523, 0.12)
    playTone(659, 0.12, 'sine', 0.3, 0.13)
    playTone(784, 0.2, 'sine', 0.3, 0.26)
  },
  incorrect() {
    playTone(300, 0.08, 'sawtooth', 0.2)
    playTone(240, 0.12, 'sawtooth', 0.2, 0.1)
    playTone(180, 0.2, 'sawtooth', 0.2, 0.24)
  },
  click() {
    playTone(800, 0.06, 'square', 0.15)
  },
  start() {
    [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.15, 'sine', 0.3, i * 0.12))
  },
  gameOver() {
    [523, 466, 415, 370].forEach((f, i) => playTone(f, 0.2, 'sine', 0.3, i * 0.18))
  },
  tick() {
    playTone(1200, 0.05, 'square', 0.1)
  },
  // 8 distinct tones for memory game (C4–C5)
  memoryTone(index: number) {
    const freqs = [262, 294, 330, 349, 392, 440, 494, 523]
    playTone(freqs[index % 8], 0.4, 'sine', 0.4)
  },
  // Maze: soft footstep
  step() {
    playTone(380, 0.05, 'sine', 0.12)
  },
  // Maze: wall collision thud
  wall() {
    playTone(160, 0.08, 'sawtooth', 0.25)
    playTone(110, 0.12, 'sawtooth', 0.18, 0.07)
  },
  deal() {
    playTone(660, 0.04, 'square', 0.12)
    playTone(880, 0.06, 'sine', 0.1, 0.05)
  },
  // Maze: spatial compass tone — pan indicates horizontal direction to goal, freq indicates distance
  compass(pan: number, freq: number, gain = 0.35) {
    playPannedTone(freq, 0.4, pan, gain)
    playPannedTone(freq * 1.2, 0.15, pan, gain * 0.4, 0.44)
  },
  // Pong: ball position ping (pan = horizontal, freqY = vertical pitch)
  pongBall(pan: number, freqY: number) {
    playPannedTone(freqY, 0.07, pan, 0.22)
  },
  // Pong: paddle hit (isPlayer = player side, otherwise AI)
  pongPaddle(isPlayer: boolean) {
    playTone(isPlayer ? 920 : 540, 0.035, 'square', isPlayer ? 0.28 : 0.18)
  },
  // Pong: ball bounces off top/bottom wall
  pongWall() {
    playTone(360, 0.04, 'square', 0.16)
  },
  // Pong: tono de posición de paleta (agudo = arriba, grave = abajo)
  pongPaddlePos(freq: number) {
    playTone(freq, 0.07, 'sine', 0.25)
  },
  // Pong: player paddle reaches top (atTop=true) or bottom edge
  pongEdge(atTop: boolean) {
    playTone(atTop ? 980 : 220, 0.06, 'sine', 0.22)
  },
  // Naval: player scores a hit on enemy ship
  navalHit() {
    playTone(300, 0.04, 'sawtooth', 0.38)
    playTone(820, 0.06, 'square', 0.3, 0.05)
    playTone(480, 0.14, 'sawtooth', 0.22, 0.1)
  },
  // Naval: player misses (water splash)
  navalMiss() {
    playTone(180, 0.09, 'sine', 0.28)
    playTone(120, 0.18, 'sine', 0.18, 0.09)
  },
  // Naval: player sinks an enemy ship
  navalSink() {
    ;[880, 784, 698, 587, 523, 440].forEach((f, i) => playTone(f, 0.14, 'sine', 0.32, i * 0.1))
    playTone(392, 0.45, 'sine', 0.28, 0.64)
  },
  // Naval: enemy hits player's ship
  navalEnemyHit() {
    playTone(220, 0.07, 'sawtooth', 0.38)
    playTone(160, 0.12, 'sawtooth', 0.3, 0.08)
    playTone(110, 0.2, 'sawtooth', 0.22, 0.22)
  },
  // Naval: enemy misses (distant splash)
  navalEnemyMiss() {
    playTone(130, 0.07, 'sine', 0.18)
    playTone(95, 0.14, 'sine', 0.12, 0.07)
  },
  // Naval: ship placed on board
  navalPlace() {
    playTone(520, 0.04, 'square', 0.18)
    playTone(720, 0.08, 'sine', 0.14, 0.05)
  },
  // Penaltis: ball kick impact
  penaltyKick() {
    playTone(180, 0.04, 'sawtooth', 0.4)
    playTone(120, 0.07, 'sine', 0.25, 0.04)
  },
  // Penaltis: goal scored — crowd-like ascent
  penaltyGoal() {
    ;[392, 494, 587, 698, 784, 988].forEach((f, i) => playTone(f, 0.14, 'sine', 0.35, i * 0.09))
    playTone(1047, 0.5, 'sine', 0.4, 0.58)
  },
  // Penaltis: save — thud + descending
  penaltySave() {
    playTone(260, 0.06, 'sawtooth', 0.38)
    playTone(190, 0.1, 'sawtooth', 0.28, 0.07)
    playTone(140, 0.18, 'sine', 0.2, 0.19)
  },
  // Tres en Raya: AI places its mark — softer, lower than player click
  tresAiMark() {
    playTone(440, 0.06, 'sine', 0.22)
    playTone(330, 0.1, 'sine', 0.15, 0.07)
  },
  // Tres en Raya: draw result — neutral two-tone
  tresDraw() {
    playTone(523, 0.1, 'sine', 0.25)
    playTone(466, 0.2, 'sine', 0.2, 0.13)
  },
  // Gorillas: banana throw whoosh
  gorillaThrow() {
    playTone(600, 0.04, 'square', 0.18)
    playTone(480, 0.06, 'sine', 0.14, 0.05)
    playTone(360, 0.08, 'sine', 0.1, 0.12)
  },
  // Gorillas: explosion on building or miss
  gorillaExplode() {
    playTone(90, 0.1, 'sawtooth', 0.45)
    playTone(130, 0.08, 'sawtooth', 0.38, 0.05)
    playTone(60, 0.22, 'sine', 0.32, 0.1)
  },
  // Gorillas: direct gorilla hit — dramatic descending fanfare
  gorillaHit() {
    ;[880, 784, 659, 523, 392, 294].forEach((f, i) => playTone(f, 0.1, 'sawtooth', 0.42, i * 0.07))
    playTone(196, 0.45, 'sine', 0.32, 0.48)
  },
}
