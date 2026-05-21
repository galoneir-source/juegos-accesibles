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
  // Space Invaders: player shoots
  siShoot(pan = 0) {
    playPannedTone(1200, 0.02, pan, 0.18)
    playPannedTone(900, 0.03, pan, 0.14, 0.02)
    playPannedTone(600, 0.04, pan, 0.1, 0.05)
  },
  // Space Invaders: player ship position beacon (pan = ship position -1..1)
  siPlayerPos(pan: number) {
    playPannedTone(1400, 0.05, pan, 0.28)
    playPannedTone(1750, 0.08, pan, 0.22, 0.06)
    playPannedTone(1400, 0.05, pan, 0.18, 0.16)
  },
  // Space Invaders: alien destroyed (pan = horizontal position -1..1)
  siAlienHit(pan: number) {
    playPannedTone(300, 0.04, pan, 0.38)
    playPannedTone(180, 0.08, pan, 0.3, 0.05)
    playPannedTone(90, 0.16, pan, 0.2, 0.12)
  },
  // Space Invaders: alien fires a bullet (pan = shooter position -1..1)
  siAlienShoot(pan: number) {
    playPannedTone(350, 0.03, pan, 0.2)
    playPannedTone(200, 0.06, pan, 0.16, 0.04)
  },
  // Space Invaders: player ship hit
  siPlayerHit() {
    playTone(160, 0.06, 'sawtooth', 0.45)
    playTone(100, 0.12, 'sawtooth', 0.38, 0.07)
    playTone(60, 0.25, 'sine', 0.32, 0.18)
    playTone(80, 0.35, 'sine', 0.22, 0.4)
  },
  // Space Invaders: march beat (beat = 0-3 cycle, pan = grid center -1..1)
  siMarch(beat: number, pan: number) {
    const freqs = [220, 180, 140, 110]
    playPannedTone(freqs[beat % 4], 0.07, pan, 0.28)
  },
  // Space Invaders: wave cleared — ascending fanfare
  siWaveClear() {
    ;[392, 494, 587, 698, 784, 988, 1047, 1319].forEach((f, i) =>
      playTone(f, 0.1, 'sine', 0.3, i * 0.08)
    )
  },
  // Tetris: piece locks onto the board
  tetrisPlace() {
    playTone(220, 0.04, 'square', 0.22)
    playTone(160, 0.08, 'sine',   0.16, 0.04)
  },
  // Tetris: lines cleared (1–4)
  tetrisClear(lines: number) {
    const sets: number[][] = [
      [523, 659],
      [523, 659, 784],
      [523, 659, 784, 988],
      [523, 659, 784, 988, 1047, 1319, 1568],
    ]
    const freqs = sets[Math.min(lines, 4) - 1]
    freqs.forEach((f, i) => playTone(f, lines === 4 ? 0.18 : 0.12, 'sine', 0.32, i * 0.07))
  },
  // Tetris: piece rotated
  tetrisRotate() {
    playTone(660, 0.04, 'square', 0.14)
  },
  // Tetris: piece moved left/right
  tetrisMove() {
    playTone(440, 0.03, 'sine', 0.1)
  },
  // Tetris: column height scan tone — pan = column position, freq encodes free space
  tetrisColHeight(freq: number, pan: number) {
    playPannedTone(freq, 0.07, pan, 0.22)
  },
  // Tetris: hard drop
  tetrisDrop() {
    playTone(280, 0.04, 'sawtooth', 0.3)
    playTone(180, 0.08, 'sine',     0.22, 0.04)
  },
  // Frogger: brief chime — next row ahead is clear/safe to jump
  frogClear() {
    playTone(1047, 0.05, 'sine', 0.2)
    playTone(1319, 0.04, 'sine', 0.16, 0.07)
  },
  // Frogger: frog hop
  frogJump() {
    playTone(900, 0.02, 'sine', 0.18)
    playTone(680, 0.04, 'sine', 0.14, 0.02)
  },
  // Frogger: reached a home slot
  frogHome() {
    ;[523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.1, 'sine', 0.3, i * 0.08))
  },
  // Frogger: vehicle danger nearby (pan = position -1..1)
  frogDanger(pan: number) {
    playPannedTone(320, 0.05, pan, 0.22)
  },
  // Frogger: continuous car engine rumble — gain 0..1 scales with proximity
  frogCar(pan: number, gain: number) {
    playPannedTone(130, 0.16, pan, gain)
    playPannedTone(85,  0.16, pan, gain * 0.55, 0.04)
  },
  // Frogger: log location pulse — gain 0..1 scales with proximity
  frogLog(pan: number, gain = 0.22) {
    playPannedTone(520, 0.04, pan, gain)
    playPannedTone(380, 0.07, pan, gain * 0.7, 0.03)
    playPannedTone(260, 0.10, pan, gain * 0.5, 0.07)
  },
  // Frogger: soft rhythmic bump while riding a log (confirms safe position)
  frogOnLog(pan: number) {
    playPannedTone(440, 0.07, pan, 0.18)
    playPannedTone(320, 0.09, pan, 0.12, 0.05)
  },
  // Buscaminas: cursor move click (pan = column position -1..1)
  mineCursor(pan: number) {
    playPannedTone(700, 0.03, pan, 0.14)
  },
  // Buscaminas: reveal cell — tone encodes adjacent mine count (0=bright, 8=harsh)
  mineReveal(count: number) {
    const freq = count === 0 ? 880 : Math.max(160, 600 - count * 52)
    const type: OscillatorType = count >= 5 ? 'sawtooth' : count >= 3 ? 'square' : 'sine'
    playTone(freq, 0.09, type, 0.18 + count * 0.02)
  },
  // Buscaminas: flag placed
  mineFlag() {
    playTone(660, 0.04, 'square', 0.18)
    playTone(880, 0.07, 'sine',   0.14, 0.05)
  },
  // Buscaminas: flag removed
  mineUnflag() {
    playTone(440, 0.04, 'square', 0.14)
    playTone(330, 0.06, 'sine',   0.10, 0.04)
  },
  // Buscaminas: mine exploded — game over
  mineExplosion() {
    playTone(120, 0.07, 'sawtooth', 0.45)
    playTone(80,  0.14, 'sawtooth', 0.40, 0.07)
    playTone(50,  0.30, 'sine',     0.35, 0.14)
    playTone(35,  0.50, 'sine',     0.28, 0.40)
  },
  // Buscaminas: cascade reveal (many empty cells opened at once)
  mineCascade() {
    ;[523, 659, 784].forEach((f, i) => playTone(f, 0.10, 'sine', 0.22, i * 0.07))
  },
  // Asteroids: ship engine thrust pulse
  asteroidsThrust() {
    playTone(75, 0.11, 'sawtooth', 0.17)
    playTone(55, 0.11, 'sine',     0.11, 0.04)
  },
  // Asteroids: bullet fired
  asteroidsFire() {
    playTone(1400, 0.02, 'square',   0.22)
    playTone(900,  0.03, 'sawtooth', 0.15, 0.02)
    playTone(500,  0.05, 'sine',     0.09, 0.04)
  },
  // Asteroids: asteroid hit — sound depends on size
  asteroidsHit(size: 'large' | 'medium' | 'small', pan: number) {
    if (size === 'large') {
      playPannedTone(80, 0.12, pan, 0.42)
      playPannedTone(55, 0.22, pan, 0.36, 0.06)
      playPannedTone(35, 0.35, pan, 0.28, 0.15)
    } else if (size === 'medium') {
      playPannedTone(130, 0.08, pan, 0.36)
      playPannedTone(85,  0.16, pan, 0.28, 0.05)
      playPannedTone(55,  0.24, pan, 0.20, 0.10)
    } else {
      playPannedTone(240, 0.05, pan, 0.30)
      playPannedTone(150, 0.10, pan, 0.22, 0.03)
      playPannedTone(90,  0.16, pan, 0.15, 0.07)
    }
  },
  // Asteroids: player ship destroyed
  asteroidsShipDie() {
    ;[160, 120, 90, 60, 40].forEach((f, i) => playTone(f, 0.15, 'sawtooth', 0.40, i * 0.09))
    playTone(28, 0.55, 'sine', 0.38, 0.50)
  },
  // Asteroids: proximity pulse for ambient scan (pan=position, freq=size cue)
  asteroidsPulse(pan: number, freq: number, gain: number) {
    playPannedTone(freq, 0.10, pan, gain)
  },
  // Pac-Man: eat a dot
  pacChompDot() {
    playTone(480, 0.03, 'square', 0.12)
  },
  // Pac-Man: eat a power pellet
  pacPower() {
    ;[330, 440, 550, 660].forEach((f, i) => playTone(f, 0.1, 'sine', 0.28, i * 0.06))
  },
  // Pac-Man: eat a scared ghost
  pacEatGhost() {
    playTone(880, 0.05, 'square', 0.3)
    playTone(1100, 0.08, 'sine', 0.25, 0.06)
    playTone(660, 0.12, 'sine', 0.2, 0.15)
  },
  // Pac-Man: caught by ghost
  pacDie() {
    ;[494, 440, 392, 349, 294, 247, 196, 147].forEach((f, i) =>
      playTone(f, 0.12, 'sawtooth', 0.3, i * 0.1)
    )
  },
  // Sokoban: player footstep (pan = column position -1..1)
  sokobanStep(pan: number) {
    playPannedTone(600, 0.04, pan, 0.16)
    playPannedTone(450, 0.06, pan, 0.10, 0.03)
  },
  // Sokoban: push a box (pan = destination column -1..1)
  sokobanPush(pan: number) {
    playPannedTone(280, 0.04, pan, 0.26)
    playPannedTone(200, 0.08, pan, 0.20, 0.04)
    playPannedTone(150, 0.14, pan, 0.14, 0.10)
  },
  // Sokoban: box lands on goal — ascending chime
  sokobanGoal() {
    playTone(523, 0.08, 'sine', 0.28)
    playTone(659, 0.08, 'sine', 0.28, 0.10)
    playTone(784, 0.18, 'sine', 0.34, 0.21)
  },
  // Sokoban: box moved off goal — short descending tone
  sokobanOffGoal() {
    playTone(523, 0.07, 'sine', 0.20)
    playTone(415, 0.12, 'sine', 0.16, 0.09)
  },
  // Sokoban: bump into wall or immovable box
  sokobanWall() {
    playTone(180, 0.05, 'sawtooth', 0.22)
    playTone(130, 0.08, 'sawtooth', 0.16, 0.05)
  },
  // Sokoban: undo move
  sokobanUndo() {
    playTone(440, 0.05, 'sine', 0.18)
    playTone(370, 0.08, 'sine', 0.13, 0.06)
  },
  // Sokoban: level complete fanfare
  sokobanWin() {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => playTone(f, 0.14, 'sine', 0.32, i * 0.10))
    playTone(1568, 0.55, 'sine', 0.38, 0.56)
  },
  // Tragaperras: rodillos girando
  slotSpin() {
    playTone(320, 0.18, 'sawtooth', 0.10)
    playTone(260, 0.14, 'sawtooth', 0.08, 0.16)
    playTone(200, 0.14, 'sawtooth', 0.06, 0.28)
  },
  // Tragaperras: un rodillo se detiene (pan = posición -1..1)
  slotStop(pan: number) {
    playPannedTone(300, 0.04, pan, 0.28)
    playPannedTone(200, 0.07, pan, 0.22, 0.04)
  },
  // Tragaperras: premio pequeño (dos cerezas)
  slotWinSmall() {
    playTone(523, 0.09, 'sine', 0.28)
    playTone(659, 0.12, 'sine', 0.26, 0.11)
  },
  // Tragaperras: premio medio (tres frutas)
  slotWinMedium() {
    ;[523, 659, 784, 988].forEach((f, i) => playTone(f, 0.11, 'sine', 0.30, i * 0.09))
  },
  // Tragaperras: jackpot (tres campanas o tres sietes)
  slotWinBig() {
    ;[523, 659, 784, 988, 1047, 1319, 1568].forEach((f, i) => playTone(f, 0.14, 'sine', 0.34, i * 0.07))
    playTone(2093, 0.7, 'sine', 0.42, 0.54)
  },
  // Tragaperras: sin premio
  slotLose() {
    playTone(340, 0.05, 'sine', 0.16)
    playTone(270, 0.09, 'sine', 0.12, 0.07)
  },
  // Tragaperras: retener/liberar rodillo
  slotHold() {
    playTone(700, 0.04, 'square', 0.16)
  },
  // Tragaperras: partida terminada sin créditos
  slotGameOver() {
    ;[400, 350, 300, 250, 200].forEach((f, i) => playTone(f, 0.13, 'sine', 0.26, i * 0.11))
  },
}
