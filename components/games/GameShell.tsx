'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { announcePolite } from '@/lib/announce'

interface GameShellProps {
  title: string
  instructions: string
  score: number
  children: React.ReactNode
  onHelp?: () => void
  onReread?: () => void
  // El juego atiende el teclado por su cuenta: GameShell no escucha H ni R,
  // pero la barra sigue mostrando helpKey y rereadKey, que el juego debe
  // ajustar a las teclas que de verdad usa.
  disableKeyShortcuts?: boolean
  // Teclas de los atajos comunes. Los juegos que usan H o R para jugar (el
  // Ahorcado, que recibe cualquier letra, o la Generala, que tira con R) las
  // cambian aquí para que una pulsación no haga dos cosas a la vez. null: el
  // juego no tiene ese atajo y la barra no lo anuncia.
  helpKey?: string | null
  rereadKey?: string | null
}

export default function GameShell({
  title, instructions, score, children, onHelp, onReread, disableKeyShortcuts,
  helpKey = 'h', rereadKey = 'r',
}: GameShellProps) {
  useEffect(() => {
    if (disableKeyShortcuts) return
    function handleKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const key = e.key.toLowerCase()
      if (helpKey && key === helpKey) {
        onHelp?.()
        announcePolite(instructions)
      }
      if (rereadKey && key === rereadKey) {
        onReread?.()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [instructions, onHelp, onReread, disableKeyShortcuts, helpKey, rereadKey])

  const shortcuts = [
    helpKey && { key: helpKey, label: 'instrucciones' },
    rereadKey && { key: rereadKey, label: 'releer estado' },
  ].filter((s) => !!s)

  return (
    <div className="min-h-screen flex flex-col">
      {/* La barra de atajos va dentro del <header> para que no quede fuera de
          toda región (axe: «region»). */}
      <header>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
          <h1 className="text-xl font-bold text-[#ffd700]">{title} accesible para ciegos</h1>
          <div className="flex items-center gap-4">
            <span aria-live="polite" aria-label={`Puntuación: ${score}`} className="text-lg font-mono">
              Puntos: <strong>{score}</strong>
            </span>
            <Link href="/" className="text-[#ffd700] underline hover:text-white text-sm">
              ← Lobby
            </Link>
          </div>
        </div>

        {shortcuts.length > 0 && (
          <div className="bg-[#111] px-6 py-2 text-sm text-[#888] border-b border-[#222]" role="note">
            {shortcuts.map((s, i) => (
              <span key={s.key}>
                {i > 0 && <>{' '}&nbsp;|&nbsp;{' '}</>}
                Tecla <kbd className="bg-[#333] text-[#f0f0f0] px-1 rounded">{s.key.toUpperCase()}</kbd> = {s.label}
              </span>
            ))}
          </div>
        )}
      </header>

      <main id="main-content" className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full">
        {children}
      </main>

      <footer className="px-6 py-3 border-t border-[#333] text-center">
        <Button variant="ghost" size="sm" onClick={() => announcePolite(instructions)}>
          Escuchar instrucciones
        </Button>
      </footer>
    </div>
  )
}
