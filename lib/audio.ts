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
  // Maze: spatial compass tone — pan indicates horizontal direction to goal, freq indicates distance
  compass(pan: number, freq: number, gain = 0.35) {
    playPannedTone(freq, 0.4, pan, gain)
    playPannedTone(freq * 1.2, 0.15, pan, gain * 0.4, 0.44)
  },
}
