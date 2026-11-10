'use client'

import { useEffect, useRef } from 'react'

// Zona de juego de los juegos que se controlan solo con el teclado.
//
// NVDA y JAWS están por defecto en modo exploración y se quedan las teclas
// antes de que lleguen a la página: las flechas mueven su cursor virtual, F
// salta al siguiente campo de formulario, E al siguiente cuadro de edición,
// R a la siguiente región… Con role="application" y el foco dentro, pasan
// solos al modo foco y dejan pasar todas las teclas al juego.
//
// Recibe el foco al montarse (al empezar la partida). Escape lleva el foco al
// título del juego, fuera de la zona, para leer la página en modo exploración;
// con Tab también se sale, y con Tab o Mayús+Tab se vuelve a entrar. Los juegos siguen escuchando el teclado en
// window: la pulsación sube desde aquí hasta allí.
export default function GameArea({
  label,
  className = '',
  escapeLeaves = true,
  children,
}: {
  // Nombre del juego y sus teclas: es lo que lee el lector al entrar.
  label: string
  className?: string
  // false en los juegos que usan Escape para jugar (el Solitario la usa para
  // cancelar la selección): entonces Escape les llega a ellos.
  escapeLeaves?: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const area = ref.current
    if (!area) return
    area.focus()
    // Si desaparece el botón que tenía el foco (las acciones cambian en cada
    // turno de los juegos de cartas), el foco caería en <body> y el lector
    // volvería al modo exploración: se devuelve a la zona. Solo si no está en
    // ningún otro sitio, para no quitárselo a quien está fuera de la zona.
    const observer = new MutationObserver(() => {
      const active = document.activeElement
      if (!active || active === document.body) area.focus()
    })
    observer.observe(area, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    if (!escapeLeaves || e.key !== 'Escape') return
    // No llega al juego: Escape solo significa «salir de la zona».
    e.preventDefault()
    e.stopPropagation()
    const title = document.querySelector('h1')
    if (!title) return
    if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1')
    title.focus()
  }

  return (
    <div
      ref={ref}
      role="application"
      tabIndex={0}
      aria-label={escapeLeaves ? `${label} Escape para salir de la zona de juego.` : label}
      onKeyDown={onKeyDown}
      className={`rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd700] focus-visible:ring-offset-4 focus-visible:ring-offset-black ${className}`}
    >
      {children}
    </div>
  )
}
