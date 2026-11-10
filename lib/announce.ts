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

let pendingPolite = 0

export function announcePolite(message: string) {
  if (typeof document === 'undefined') return
  const el = document.getElementById('status-announcer')
  if (!el) return
  // Se vacía y se escribe en el fotograma siguiente para que un mensaje igual
  // al anterior se vuelva a leer. Si llega otro antes de ese fotograma, el
  // pendiente se descarta: con pulsaciones rápidas se escribe solo el último.
  cancelAnimationFrame(pendingPolite)
  el.textContent = ''
  pendingPolite = requestAnimationFrame(() => {
    el.textContent = message
  })
}
