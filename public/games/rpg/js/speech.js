// Announcements via ARIA live regions — the screen reader handles TTS.
// #a11y-live  (assertive) → critical / high priority
// #a11y-status (polite)   → normal priority
//
// Queue + timer spacing prevents flooding the screen reader when many
// events fire in the same frame. Delay is estimated from text length.

const CHARS_PER_MS = 0.012; // ~12 chars/s → matches typical SR reading speed
const MIN_DELAY_MS = 600;

export class SpeechManager {
  constructor() {
    this._assertiveEl = document.getElementById('a11y-live');
    this._politeEl    = document.getElementById('a11y-status');
    this._queue       = [];
    this._busy        = false;
    this._timer       = null;
  }

  // priority: 'critical' | 'high' | 'normal'
  // interrupt: clear queue and announce immediately
  speak(text, priority = 'normal', interrupt = false) {
    if (interrupt || priority === 'critical') {
      clearTimeout(this._timer);
      this._queue = [];
      this._busy  = false;
      this._announce(text, priority);
      return;
    }

    if (priority === 'high') {
      // Keep only the most recent high-priority item
      this._queue = this._queue.filter(q => q.priority !== 'high');
      this._queue.unshift({ text, priority });
    } else {
      this._queue.push({ text, priority });
    }

    if (!this._busy) this._next();
  }

  cancel() {
    clearTimeout(this._timer);
    this._queue = [];
    this._busy  = false;
    this._clear();
  }

  // ── internals ───────────────────────────────────────────────────────

  _next() {
    if (!this._queue.length) { this._busy = false; return; }
    this._busy = true;
    const { text, priority } = this._queue.shift();
    this._announce(text, priority);
    const delay = Math.max(MIN_DELAY_MS, text.length / CHARS_PER_MS);
    this._timer = setTimeout(() => this._next(), delay);
  }

  _announce(text, priority) {
    const el = priority === 'normal' ? this._politeEl : this._assertiveEl;
    if (!el) return;
    // Clear first so the SR re-reads even if the text is identical
    el.textContent = '';
    requestAnimationFrame(() => { el.textContent = text; });
  }

  _clear() {
    if (this._assertiveEl) this._assertiveEl.textContent = '';
    if (this._politeEl)    this._politeEl.textContent    = '';
  }
}
