'use client'

import { useEffect, useId, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { TOUCH_CONTROLS, type TouchKey } from '@/lib/touch-controls'

// Botones para jugar sin teclado físico. Cada botón envía a `window` la misma
// pulsación de tecla que el juego ya escucha (ver lib/touch-controls.ts). Solo
// se muestran cuando el puntero principal es táctil (móvil y tableta): en el
// ordenador quedan ocultos también para el lector de pantalla.

// En los botones que se mantienen pulsados, la tecla dura al menos esto: con
// VoiceOver o TalkBack un doble toque llega como pulsación instantánea, y así
// el juego llega a moverse un poco con cada toque.
const MIN_HOLD_MS = 250

function sendKey(type: 'keydown' | 'keyup', key: string) {
  window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }))
}

function TouchButton({ k }: { k: TouchKey }) {
  // Si el dedo ya ha enviado keydown/keyup, el clic que llega después no
  // debe repetir la pulsación.
  const pointerHandled = useRef(false)
  const heldSince = useRef<number | null>(null)
  const key = k.key

  function press() {
    if (heldSince.current !== null) return
    heldSince.current = performance.now()
    sendKey('keydown', key)
  }

  function release() {
    if (heldSince.current === null) return
    const wait = MIN_HOLD_MS - (performance.now() - heldSince.current)
    heldSince.current = null
    if (wait > 0) setTimeout(() => sendKey('keyup', key), wait)
    else sendKey('keyup', key)
  }

  // Al salir de la página con el dedo encima, la tecla no se queda pulsada.
  useEffect(() => () => {
    if (heldSince.current !== null) sendKey('keyup', key)
  }, [key])

  return (
    <button
      type="button"
      className="min-h-12 min-w-12 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] text-base active:bg-[#333] select-none touch-manipulation"
      onPointerDown={
        k.hold
          ? () => {
              pointerHandled.current = true
              press()
            }
          : undefined
      }
      onPointerUp={k.hold ? release : undefined}
      onPointerCancel={k.hold ? release : undefined}
      onPointerLeave={k.hold ? release : undefined}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (pointerHandled.current) {
          pointerHandled.current = false
          return
        }
        if (k.hold) {
          press()
          release()
        } else {
          sendKey('keydown', key)
          sendKey('keyup', key)
        }
      }}
      // Con un teclado conectado, Enter o Espacio sobre el botón no deben
      // llegar también al juego como su propia tecla.
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
      }}
    >
      {k.label}
    </button>
  )
}

// Hasta tres botones por fila, para que en un móvil «Izquierda», «Disparar» y
// «Derecha» queden juntos; las letras y los números van en una rejilla densa.
function columns(keys: TouchKey[]): string {
  if (keys.every((k) => k.label.length <= 2)) return 'repeat(auto-fill, minmax(3rem, 1fr))'
  return `repeat(${Math.min(keys.length, 3)}, minmax(0, 1fr))`
}

export default function TouchControls() {
  const slug = usePathname().replace(/^\//, '')
  const groups = TOUCH_CONTROLS[slug]
  const headingId = useId()
  if (!groups) return null

  return (
    <section aria-labelledby={headingId} className="hidden pointer-coarse:block mt-8 border-t border-[#333] pt-4">
      <h2 id={headingId} className="text-lg font-bold text-[#ffd700] mb-3">
        Controles táctiles
      </h2>
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.label} role="group" aria-label={g.label}>
            <p aria-hidden="true" className="text-sm text-[#aaa] mb-1">
              {g.label}
            </p>
            {g.layout === 'dpad' ? (
              <div className="grid grid-cols-3 gap-2 w-fit">
                <span />
                <TouchButton k={g.keys[0]} />
                <span />
                <TouchButton k={g.keys[1]} />
                <span />
                <TouchButton k={g.keys[2]} />
                <span />
                <TouchButton k={g.keys[3]} />
                <span />
              </div>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: columns(g.keys) }}>
                {g.keys.map((k) => (
                  <TouchButton key={k.key} k={k} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
