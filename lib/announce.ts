let assertiveSlot = 0

export function announceAssertive(message: string) {
  if (typeof document === 'undefined') return
  const prev = document.getElementById(`game-announcer-${assertiveSlot}`)
  assertiveSlot ^= 1
  const next = document.getElementById(`game-announcer-${assertiveSlot}`)
  if (!prev || !next) return
  prev.textContent = ''
  next.textContent = message
}

export function announcePolite(message: string) {
  if (typeof document === 'undefined') return
  const el = document.getElementById('status-announcer')
  if (!el) return
  el.textContent = ''
  requestAnimationFrame(() => {
    el.textContent = message
  })
}
