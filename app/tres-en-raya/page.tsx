'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ─── Types & constants ────────────────────────────────────────────────────────

type Cell = 'X' | 'O' | null
type Phase = 'idle' | 'playing' | 'end'
type Result = 'win' | 'loss' | 'draw' | null

const LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

const INSTRUCTIONS =
  'Tres en Raya contra la IA. Tablero de 3 por 3. ' +
  'Flechas para mover el cursor. Enter para colocar tu marca. Eres las X. ' +
  'R para leer la celda actual. H para repetir instrucciones.'

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function cellName(i: number) {
  return `fila ${Math.floor(i / 3) + 1}, columna ${(i % 3) + 1}`
}

function checkWinner(b: Cell[]): Cell {
  for (const [a, x, c] of LINES) {
    if (b[a] && b[a] === b[x] && b[a] === b[c]) return b[a]
  }
  return null
}

// ─── Minimax AI ───────────────────────────────────────────────────────────────

function minimax(b: Cell[], isMax: boolean): number {
  const w = checkWinner(b)
  if (w === 'O') return 10
  if (w === 'X') return -10
  if (b.every(Boolean)) return 0

  let best = isMax ? -Infinity : Infinity
  for (let i = 0; i < 9; i++) {
    if (!b[i]) {
      b[i] = isMax ? 'O' : 'X'
      const val = minimax(b, !isMax)
      b[i] = null
      best = isMax ? Math.max(best, val) : Math.min(best, val)
    }
  }
  return best
}

function bestAiMove(b: Cell[]): number {
  let best = -Infinity, move = -1
  for (let i = 0; i < 9; i++) {
    if (!b[i]) {
      b[i] = 'O'
      const val = minimax(b, false)
      b[i] = null
      if (val > best) { best = val; move = i }
    }
  }
  return move
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TresEnRayaPage() {
  const [phase, setPhase]         = useState<Phase>('idle')
  const [board, setBoard]         = useState<Cell[]>(Array(9).fill(null))
  const [cursor, setCursor]       = useState(4)
  const [result, setResult]       = useState<Result>(null)
  const [score, setScore]         = useState(0)
  const [aiThinking, setAiThinking] = useState(false)
  const [saved, setSaved]         = useState(false)
  const [saveError, setSaveError] = useState('')

  const boardRef  = useRef<Cell[]>(Array(9).fill(null))
  const phaseRef  = useRef<Phase>('idle')
  const cursorRef = useRef(4)
  const busyRef   = useRef(false)

  useEffect(() => { boardRef.current  = board  }, [board])
  useEffect(() => { phaseRef.current  = phase  }, [phase])
  useEffect(() => { cursorRef.current = cursor }, [cursor])

  // ── Start ─────────────────────────────────────────────────────────────────

  function startGame() {
    const empty = Array(9).fill(null) as Cell[]
    boardRef.current  = empty
    phaseRef.current  = 'playing'
    busyRef.current   = false
    cursorRef.current = 4

    setBoard(empty)
    setPhase('playing')
    setCursor(4)
    setResult(null)
    setScore(0)
    setAiThinking(false)
    setSaved(false)
    setSaveError('')

    audio.start()
    announcePolite('Partida iniciada. Cursor en el centro, fila 2, columna 2. Es tu turno.')
  }

  // ── AI move ───────────────────────────────────────────────────────────────

  const doAiMove = useCallback((current: Cell[]) => {
    setAiThinking(true)
    setTimeout(() => {
      const move = bestAiMove([...current])
      const next = [...current] as Cell[]
      next[move] = 'O'
      boardRef.current = next
      setBoard(next)
      audio.tresAiMark()

      const winner = checkWinner(next)
      if (winner === 'O') {
        phaseRef.current = 'end'
        setScore(0)
        setResult('loss')
        setPhase('end')
        setAiThinking(false)
        busyRef.current = false
        audio.gameOver()
        announceAssertive(`La IA coloca en ${cellName(move)}. ¡Has perdido!`)
      } else if (next.every(Boolean)) {
        phaseRef.current = 'end'
        setScore(30)
        setResult('draw')
        setPhase('end')
        setAiThinking(false)
        busyRef.current = false
        audio.tresDraw()
        announceAssertive(`La IA coloca en ${cellName(move)}. ¡Empate!`)
      } else {
        setAiThinking(false)
        busyRef.current = false
        announcePolite(`La IA coloca en ${cellName(move)}. Tu turno.`)
      }
    }, 500)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard ──────────────────────────────────────────────────────────────

  const handleKey = useCallback((e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    if (e.key === 'h' || e.key === 'H') { announcePolite(INSTRUCTIONS); return }
    if (phaseRef.current !== 'playing') return

    const cur = cursorRef.current
    const row = Math.floor(cur / 3)
    const col = cur % 3

    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      const cell = boardRef.current[cur]
      announcePolite(`${cellName(cur)}: ${cell === 'X' ? 'tu X' : cell === 'O' ? 'O de la IA' : 'vacía'}.`)
      return
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (row > 0) { const n = cur - 3; cursorRef.current = n; setCursor(n); audio.click(); announcePolite(cellName(n)) }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (row < 2) { const n = cur + 3; cursorRef.current = n; setCursor(n); audio.click(); announcePolite(cellName(n)) }
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (col > 0) { const n = cur - 1; cursorRef.current = n; setCursor(n); audio.click(); announcePolite(cellName(n)) }
        break
      case 'ArrowRight':
        e.preventDefault()
        if (col < 2) { const n = cur + 1; cursorRef.current = n; setCursor(n); audio.click(); announcePolite(cellName(n)) }
        break
      case 'Enter': {
        e.preventDefault()
        if (busyRef.current) return
        const b = boardRef.current
        if (b[cur]) { audio.wall(); announcePolite('Celda ocupada.'); return }

        busyRef.current = true
        const newBoard = [...b] as Cell[]
        newBoard[cur] = 'X'
        boardRef.current = newBoard
        setBoard(newBoard)
        audio.click()

        if (checkWinner(newBoard) === 'X') {
          phaseRef.current = 'end'
          setScore(100)
          setResult('win')
          setPhase('end')
          busyRef.current = false
          audio.start()
          announceAssertive(`Colocas en ${cellName(cur)}. ¡Has ganado!`)
        } else if (newBoard.every(Boolean)) {
          phaseRef.current = 'end'
          setScore(30)
          setResult('draw')
          setPhase('end')
          busyRef.current = false
          audio.tresDraw()
          announceAssertive(`Colocas en ${cellName(cur)}. ¡Empate!`)
        } else {
          announcePolite(`Colocas en ${cellName(cur)}. La IA piensa…`)
          doAiMove(newBoard)
        }
        break
      }
    }
  }, [doAiMove])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // ── Score save ────────────────────────────────────────────────────────────

  async function handleSave() {
    const res = await saveScore('tres-en-raya', score)
    if (res?.error) { setSaveError(res.error); announceAssertive(res.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Tres en Raya" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Tres en Raya</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame} className="w-full">Iniciar partida</Button>
        </div>
      </GameShell>
    )
  }

  if (phase === 'end') {
    const label = result === 'win' ? '¡Ganaste!' : result === 'draw' ? 'Empate' : '¡Perdiste!'
    const color = result === 'win' ? '#22c55e' : result === 'draw' ? '#ffd700' : '#ef4444'
    return (
      <GameShell title="Tres en Raya" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
        <div className="text-center space-y-6">
          <h2 className="text-3xl font-bold" style={{ color }}>{label}</h2>
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
          {!saved ? (
            <>
              <Button onClick={handleSave}>Guardar puntuación</Button>
              {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
            </>
          ) : (
            <p role="status" className="text-[#22c55e]">Guardado.</p>
          )}
          <Button variant="secondary" onClick={startGame}>Jugar de nuevo</Button>
        </div>
      </GameShell>
    )
  }

  // Playing phase
  return (
    <GameShell title="Tres en Raya" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-6">
        <p className="text-center text-sm text-[#ffd700]" aria-live="polite">
          {aiThinking ? 'La IA piensa…' : 'Tu turno — coloca tu X'}
        </p>

        <div className="grid grid-cols-3 gap-1.5 max-w-[210px] mx-auto" aria-hidden="true">
          {board.map((cell, i) => (
            <div
              key={i}
              className={[
                'h-[65px] flex items-center justify-center text-3xl font-bold rounded border transition-colors',
                i === cursor ? 'border-[#ffd700] bg-[#1a1a00]' : 'border-[#333] bg-[#111]',
                cell === 'X' ? 'text-[#ffd700]' : 'text-[#888]',
              ].join(' ')}
            >
              {cell ?? ''}
            </div>
          ))}
        </div>

        <p className="text-xs text-[#555] text-center">
          Flechas: mover &nbsp;|&nbsp; Enter: colocar &nbsp;|&nbsp; R: leer celda &nbsp;|&nbsp; H: instrucciones
        </p>
      </div>
    </GameShell>
  )
}
