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
  disableKeyShortcuts?: boolean
}

export default function GameShell({ title, instructions, score, children, onHelp, onReread, disableKeyShortcuts }: GameShellProps) {
  useEffect(() => {
    if (disableKeyShortcuts) return
    function handleKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'h' || e.key === 'H') {
        onHelp?.()
        announcePolite(instructions)
      }
      if (e.key === 'r' || e.key === 'R') {
        onReread?.()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [instructions, onHelp, onReread, disableKeyShortcuts])

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
        <h1 className="text-xl font-bold text-[#ffd700]">{title}</h1>
        <div className="flex items-center gap-4">
          <span aria-live="polite" aria-label={`Puntuación: ${score}`} className="text-lg font-mono">
            Puntos: <strong>{score}</strong>
          </span>
          <Link href="/" className="text-[#ffd700] underline hover:text-white text-sm">
            ← Lobby
          </Link>
        </div>
      </header>

      <div className="bg-[#111] px-6 py-2 text-sm text-[#888] border-b border-[#222]" role="note">
        Tecla <kbd className="bg-[#333] px-1 rounded">H</kbd> = instrucciones &nbsp;|&nbsp;
        Tecla <kbd className="bg-[#333] px-1 rounded">R</kbd> = releer estado
      </div>

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
