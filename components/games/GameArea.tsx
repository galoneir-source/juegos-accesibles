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
// Recibe el foco al montarse (al empezar la partida). Con Tab se sale de ella
// y se puede volver a entrar. Los juegos siguen escuchando el teclado en
// window: la pulsación sube desde aquí hasta allí.
export default function GameArea({
  label,
  className = '',
  children,
}: {
  // Nombre del juego y sus teclas: es lo que lee el lector al entrar.
  label: string
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <div
      ref={ref}
      role="application"
      tabIndex={0}
      aria-label={label}
      className={`rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd700] focus-visible:ring-offset-4 focus-visible:ring-offset-black ${className}`}
    >
      {children}
    </div>
  )
}
