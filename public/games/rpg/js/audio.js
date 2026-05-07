export class AudioManager {
  constructor() {
    this.enabled  = false;
    this.ctx      = null;
    this.master   = null;
    try { this._footVol = parseFloat(localStorage.getItem('footVol') ?? '1.5'); }
    catch { this._footVol = 1.5; }
    this._try_init();
  }

  _try_init() {
    try {
      this.ctx    = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.enabled = true;
      this._initFootSlider();
    } catch (e) {
      console.warn('Web Audio no disponible');
    }
  }

  _initFootSlider() {
    const slider  = document.getElementById('foot-vol');
    const display = document.getElementById('foot-vol-display');
    if (!slider) return;

    slider.value        = this._footVol;
    display.textContent = this._footVol.toFixed(1);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      this._footVol = v;
      display.textContent = v.toFixed(1);
      localStorage.setItem('footVol', v);
      // Sin redirigir el foco — el usuario necesita seguir en el slider
    });
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  changeFootVolume(delta) {
    const v = Math.max(0, Math.min(5, this._footVol + delta));
    this._footVol = v;
    localStorage.setItem('footVol', v);
    const slider  = document.getElementById('foot-vol');
    const display = document.getElementById('foot-vol-display');
    if (slider)  slider.value        = v;
    if (display) display.textContent = v.toFixed(1);
  }

  getFootVolume() { return this._footVol; }

  // ── Primitives ────────────────────────────────────────────────────
  _tone(freq, dur, type = 'sine', vol = 0.3, pan = 0, delay = 0) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    const p   = this.ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    p.pan.value = Math.max(-1, Math.min(1, pan));
    osc.connect(g); g.connect(p); p.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.01);
  }

  _noise(dur, cutoff = 800, vol = 0.2, pan = 0, delay = 0) {
    if (!this.enabled) return;
    const t       = this.ctx.currentTime + delay;
    const samples = Math.floor(this.ctx.sampleRate * (dur + 0.05));
    const buf     = this.ctx.createBuffer(1, samples, this.ctx.sampleRate);
    const data    = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    const flt = this.ctx.createBiquadFilter();
    const g   = this.ctx.createGain();
    const p   = this.ctx.createStereoPanner();
    flt.type = 'bandpass'; flt.frequency.value = cutoff; flt.Q.value = 1.2;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.buffer = buf;
    src.connect(flt); flt.connect(g); g.connect(p); p.connect(this.master);
    src.start(t);
  }

  // ── Game sounds ───────────────────────────────────────────────────
  footstep() {
    if (!this.enabled || this._footVol <= 0) return;
    const t   = this.ctx.currentTime;
    const vol = this._footVol;

    // Clic de impacto: ruido corto filtrado en zona media-alta
    const samples = Math.floor(this.ctx.sampleRate * 0.05);
    const buf  = this.ctx.createBuffer(1, samples, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    const flt = this.ctx.createBiquadFilter();
    const gn  = this.ctx.createGain();
    flt.type = 'bandpass'; flt.frequency.value = 600; flt.Q.value = 0.5;
    gn.gain.setValueAtTime(vol * 0.6, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.buffer = buf;
    src.connect(flt); flt.connect(gn); gn.connect(this.master);
    src.start(t);

    // Resonancia breve del suelo
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 280;
    g.gain.setValueAtTime(vol * 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.11);
  }

  wallBump() {
    this._noise(0.12, 120, 0.18);
    this._tone(80, 0.1, 'sine', 0.12);
  }

  swing() {
    this._noise(0.18, 2200, 0.22);
    this._tone(220, 0.08, 'sawtooth', 0.08);
  }

  hitEnemy(pan = 0) {
    this._noise(0.09, 1800, 0.28, pan);
    this._tone(160, 0.07, 'square', 0.18, pan);
  }

  playerHurt() {
    this._noise(0.18, 280, 0.28);
    this._tone(110, 0.25, 'sawtooth', 0.35);
  }

  enemyDeath(pan = 0) {
    [280, 230, 180, 130].forEach((f, i) => {
      this._tone(f, 0.12, 'sawtooth', 0.18, pan, i * 0.065);
    });
    this._noise(0.35, 420, 0.22, pan);
  }

  playerDeath() {
    [260, 220, 180, 140, 100, 70].forEach((f, i) => {
      this._tone(f, 0.45, 'sine', 0.28, 0, i * 0.18);
    });
    this._noise(0.8, 200, 0.2, 0, 0.1);
  }

  levelUp() {
    [262, 330, 392, 523, 659].forEach((f, i) => {
      this._tone(f, 0.28, 'sine', 0.28, 0, i * 0.11);
    });
  }

  pickup() {
    this._tone(880, 0.09, 'sine', 0.22, 0, 0);
    this._tone(1109, 0.09, 'sine', 0.18, 0, 0.09);
  }

  heal() {
    [523, 659, 784].forEach((f, i) => {
      this._tone(f, 0.18, 'sine', 0.18, 0, i * 0.07);
    });
  }

  chestOpen() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      this._tone(f, 0.18, 'sine', 0.22, 0, i * 0.09);
    });
  }

  stairs() {
    this._tone(440, 0.25, 'sine', 0.25, 0, 0);
    this._tone(554, 0.25, 'sine', 0.22, 0, 0.14);
    this._tone(659, 0.35, 'sine', 0.20, 0, 0.28);
  }

  bossRoar() {
    for (let i = 0; i < 3; i++) {
      this._tone(55, 0.6, 'sawtooth', 0.38, 0, i * 0.55);
      this._noise(0.5, 90, 0.22, 0, i * 0.55 + 0.05);
    }
  }

  victory() {
    [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => {
      this._tone(f, 0.4, 'sine', 0.25, 0, i * 0.12);
    });
  }

  uiSelect() { this._tone(660, 0.08, 'sine', 0.18); }

  uiConfirm() {
    this._tone(880,  0.08, 'sine', 0.2,  0, 0);
    this._tone(1108, 0.1,  'sine', 0.18, 0, 0.08);
  }

  enemyPing(type, pan, dist) {
    const base = { goblin: 520, skeleton: 680, orc: 260, troll: 200, dragon: 130 };
    const freq = base[type] ?? 400;
    const vol  = Math.max(0.04, 0.22 * (1 - dist / 400));
    this._tone(freq,       0.14, 'sine', vol,        pan);
    this._tone(freq * 1.5, 0.06, 'sine', vol * 0.4, pan, 0.07);
  }

  enemyAlert(pan) {
    this._tone(660, 0.06, 'square', 0.22, pan);
    this._tone(880, 0.06, 'square', 0.18, pan, 0.07);
  }

  itemPing(pan) {
    this._tone(1400, 0.06, 'sine', 0.18, pan);
    this._tone(1760, 0.05, 'sine', 0.12, pan, 0.07);
  }

  stairsPing(pan) {
    this._tone(220, 0.30, 'sine', 0.20, pan);
    this._tone(330, 0.20, 'sine', 0.12, pan, 0.10);
  }

  enterRoom() {
    this._tone(330, 0.18, 'sine', 0.12, 0, 0);
    this._noise(0.12, 300, 0.06, 0, 0.05);
  }

  explorePing(pan) {
    this._tone(528, 0.20, 'sine', 0.20, pan, 0.00);
    this._tone(528, 0.15, 'sine', 0.12, pan, 0.25);
    this._tone(528, 0.10, 'sine', 0.07, pan, 0.45);
  }
}
