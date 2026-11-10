'use client'

import { useSyncExternalStore } from 'react'
import { getVolume, setVolume, subscribeVolume } from '@/lib/audio'

// Volumen de los efectos de sonido de todos los juegos, sin tocar la voz del
// lector de pantalla. Se guarda en el navegador entre partidas.
export default function VolumeControl() {
  // En el servidor no hay localStorage: se pinta al 100 % y se corrige al hidratar.
  const volume = useSyncExternalStore(subscribeVolume, getVolume, () => 1)
  const percent = Math.round(volume * 100)

  return (
    <label className="inline-flex items-center gap-3 text-sm text-[#ccc]">
      Volumen de efectos
      <input
        type="range"
        min={0}
        max={100}
        step={10}
        value={percent}
        aria-valuetext={percent === 0 ? 'Silencio' : `${percent} %`}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
        // Los juegos escuchan el teclado en window: sin esto, las flechas que
        // mueven el control también moverían el cursor del juego.
        onKeyDown={(e) => e.stopPropagation()}
        className="w-32 accent-[#ffd700]"
      />
      <span aria-hidden="true" className="font-mono w-10 text-right">{percent} %</span>
    </label>
  )
}
