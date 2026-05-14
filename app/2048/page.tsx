'use client'

import { useState, useEffect, useRef } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

const SIZE = 4

type Board = number[][]
type Dir   = 'left' | 'right' | 'up' | 'down'
type Phase = 'idle' | 'playing' | 'over'

const INSTRUCTIONS =
  '2048. Desliza todas las fichas en una dirección con las flechas o WASD. ' +
  'Cuando dos fichas con el mismo número chocan se fusionan. ' +
  'Llega a la ficha 2048 para ganar. La puntuación es la suma de todas las fusiones.'

// ── Board logic ───────────────────────────────────────────────────────────────

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
}

function addTile(board: Board): Board {
  const empty: [number, number][] = []
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (board[r][c] === 0) empty.push([r, c])
  if (!empty.length) return board
  const [r, c] = empty[Math.floor(Math.random() * empty.length)]
  const b = board.map(row => [...row])
  b[r][c] = Math.random() < 0.9 ? 2 : 4
  return b
}

function processRow(row: number[]): { vals: number[]; gain: number; topMerge: number; moved: boolean } {
  const orig = [...row]
  const v = row.filter(x => x !== 0)
  let gain = 0, topMerge = 0
  for (let i = 0; i < v.length - 1; i++) {
    if (v[i] === v[i + 1]) {
      v[i] *= 2; gain += v[i]; topMerge = Math.max(topMerge, v[i])
      v.splice(i + 1, 1)
    }
  }
  while (v.length < SIZE) v.push(0)
  return { vals: v, gain, topMerge, moved: !v.every((x, j) => x === orig[j]) }
}

function slide(board: Board, dir: Dir): { board: Board; gain: number; topMerge: number; moved: boolean } {
  let gain = 0, topMerge = 0, anyMoved = false
  const b = board.map(r => [...r])

  if (dir === 'left' || dir === 'right') {
    for (let r = 0; r < SIZE; r++) {
      const row = dir === 'right' ? [...b[r]].reverse() : b[r]
      const res = processRow(row)
      b[r] = dir === 'right' ? res.vals.reverse() : res.vals
      gain += res.gain; topMerge = Math.max(topMerge, res.topMerge)
      if (res.moved) anyMoved = true
    }
  } else {
    for (let c = 0; c < SIZE; c++) {
      const col = b.map(row => row[c])
      const row = dir === 'down' ? [...col].reverse() : col
      const res = processRow(row)
      const vals = dir === 'down' ? [...res.vals].reverse() : res.vals
      vals.forEach((x, r) => { b[r][c] = x })
      gain += res.gain; topMerge = Math.max(topMerge, res.topMerge)
      if (res.moved) anyMoved = true
    }
  }

  return { board: b, gain, topMerge, moved: anyMoved }
}

function hasMovesLeft(board: Board): boolean {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) return true
      if (c + 1 < SIZE && board[r][c] === board[r][c + 1]) return true
      if (r + 1 < SIZE && board[r][c] === board[r + 1][c]) return true
    }
  return false
}

function maxTile(board: Board): number {
  return board.flat().reduce((a, b) => Math.max(a, b), 0)
}

// ── Tile style ────────────────────────────────────────────────────────────────

const TILE_COLORS: Record<number, [string, string]> = {
  0:    ['#0d1b2a', '#0d1b2a'],
  2:    ['#eee4da', '#776e65'],
  4:    ['#ede0c8', '#776e65'],
  8:    ['#f2b179', '#f9f6f2'],
  16:   ['#f59563', '#f9f6f2'],
  32:   ['#f67c5f', '#f9f6f2'],
  64:   ['#f65e3b', '#f9f6f2'],
  128:  ['#edcf72', '#f9f6f2'],
  256:  ['#edcc61', '#f9f6f2'],
  512:  ['#edc850', '#f9f6f2'],
  1024: ['#edc53f', '#f9f6f2'],
  2048: ['#edc22e', '#f9f6f2'],
}

function tileStyle(val: number): { backgroundColor: string; color: string } {
  const [bg, col] = TILE_COLORS[val] ?? ['#3c3a32', '#f9f6f2']
  return { backgroundColor: bg, color: col }
}

function tileFontSize(val: number): string {
  if (val >= 10000) return 'text-sm'
  if (val >= 1000)  return 'text-base'
  if (val >= 100)   return 'text-xl'
  return 'text-2xl'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Page2048() {
  const boardRef    = useRef<Board>(emptyBoard())
  const scoreRef    = useRef(0)
  const phaseRef    = useRef<Phase>('idle')
  const won2048Ref  = useRef(false)

  const [phase,    setPhaseState] = useState<Phase>('idle')
  const [board,    setBoard]      = useState<Board>(emptyBoard())
  const [score,    setScore]      = useState(0)
  const [won2048,  setWon2048]    = useState(false)
  const [saved,    setSaved]      = useState(false)
  const [saveError,setSaveError]  = useState('')

  function goPhase(p: Phase) { phaseRef.current = p; setPhaseState(p) }

  function startGame() {
    let b = emptyBoard()
    b = addTile(b); b = addTile(b)
    boardRef.current   = b
    scoreRef.current   = 0
    won2048Ref.current = false
    setBoard(b.map(r => [...r]))
    setScore(0)
    setWon2048(false)
    setSaved(false)
    setSaveError('')
    goPhase('playing')
    audio.start()
    announcePolite('2048. Usa las flechas para deslizar las fichas y fusionarlas.')
  }

  function handleMove(dir: Dir) {
    if (phaseRef.current !== 'playing') return
    const result = slide(boardRef.current, dir)
    if (!result.moved) { audio.incorrect(); return }

    const withNew = addTile(result.board)
    boardRef.current = withNew
    const newScore = scoreRef.current + result.gain
    scoreRef.current = newScore
    setBoard(withNew.map(r => [...r]))
    setScore(newScore)

    // Tone based on highest merged value
    if (result.topMerge > 0) {
      audio.memoryTone(Math.min(7, Math.max(0, Math.floor(Math.log2(result.topMerge)) - 2)))
    } else {
      audio.click()
    }

    // Win at 2048
    const top = maxTile(withNew)
    if (top >= 2048 && !won2048Ref.current) {
      won2048Ref.current = true
      setWon2048(true)
      audio.start()
      announceAssertive('¡Has alcanzado 2048! Puedes seguir jugando para mejorar tu puntuación.')
    }

    // Game over
    if (!hasMovesLeft(withNew)) {
      goPhase('over')
      audio.gameOver()
      announceAssertive(`Sin movimientos posibles. Partida terminada. Puntuación: ${newScore}.`)
      return
    }

    const dirLabel = { left: 'izquierda', right: 'derecha', up: 'arriba', down: 'abajo' }[dir]
    const gained = result.gain > 0 ? ` +${result.gain}` : ''
    announcePolite(`${dirLabel}${gained}. Total: ${newScore}. Máxima ficha: ${top}.`)
  }

  useEffect(() => {
    const DIRS: Record<string, Dir> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down',
      A: 'left', D: 'right', W: 'up', S: 'down',
    }
    function onKey(e: KeyboardEvent) {
      if (phaseRef.current !== 'playing') return
      if (DIRS[e.key]) { e.preventDefault(); handleMove(DIRS[e.key]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleSaveScore() {
    const result = await saveScore('2048', score)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const top = maxTile(board)

  if (phase === 'idle') {
    return (
      <GameShell title="2048" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">2048</h2>
          <p className="text-[#888] text-sm max-w-xs mx-auto">
            Desliza las fichas con las flechas o WASD. Fusiona fichas iguales
            para alcanzar la ficha 2048.
          </p>
          <Button size="lg" onClick={startGame}>Nueva partida</Button>
        </div>
      </GameShell>
    )
  }

  return (
    <GameShell
      title="2048"
      instructions={INSTRUCTIONS}
      score={score}
      onReread={() =>
        announcePolite(
          `Puntuación: ${scoreRef.current}. Ficha máxima: ${maxTile(boardRef.current)}. ` +
          `Tablero: ${boardRef.current.flat().filter(x => x > 0).sort((a, b) => b - a).slice(0, 6).join(', ')}.`
        )
      }
    >
      <div className="flex flex-col items-center gap-5">

        {/* Status bar */}
        <div className="flex items-center gap-6 text-sm" aria-live="polite">
          <div className="text-center">
            <p className="text-[#888] text-xs">PUNTUACIÓN</p>
            <p className="text-[#ffd700] font-mono font-bold text-lg">{score}</p>
          </div>
          <div className="text-center">
            <p className="text-[#888] text-xs">MÁXIMA FICHA</p>
            <p className="font-mono font-bold text-lg" style={{ color: TILE_COLORS[top]?.[0] ?? '#f9f6f2' }}>
              {top}
            </p>
          </div>
          {won2048 && (
            <p className="text-[#22c55e] text-sm font-bold">¡2048!</p>
          )}
        </div>

        {/* Board */}
        <div
          role="grid"
          aria-label="Tablero 2048"
          className="bg-[#bbada0] p-2 rounded-xl gap-2 grid"
          style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}
        >
          {board.map((row, r) =>
            row.map((val, c) => (
              <div
                key={`${r}-${c}`}
                role="gridcell"
                aria-label={val > 0 ? String(val) : 'vacío'}
                className={`
                  w-16 h-16 sm:w-20 sm:h-20 rounded-lg
                  flex items-center justify-center
                  font-bold font-mono transition-colors duration-100 select-none
                  ${tileFontSize(val)}
                `}
                style={tileStyle(val)}
              >
                {val > 0 ? val : ''}
              </div>
            ))
          )}
        </div>

        {/* Game over overlay */}
        {phase === 'over' && (
          <div className="text-center space-y-4">
            <p className="text-[#ef4444] text-2xl font-bold">Partida terminada</p>
            <p className="text-[#888] text-sm">Ficha máxima alcanzada: {top}</p>
            {!saved ? (
              <>
                <Button onClick={handleSaveScore}>Guardar puntuación</Button>
                {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
              </>
            ) : (
              <p role="status" className="text-[#22c55e]">Guardado.</p>
            )}
            <Button variant="secondary" onClick={startGame}>Jugar de nuevo</Button>
          </div>
        )}

        {/* Controls hint */}
        {phase === 'playing' && (
          <p className="text-xs text-[#555]">
            Flechas o WASD para deslizar · R para releer el estado
          </p>
        )}

        {/* Swipe-style buttons for touch/mouse */}
        {phase === 'playing' && (
          <div className="flex flex-col items-center gap-1">
            <Button size="sm" variant="secondary" onClick={() => handleMove('up')}>↑ Arriba</Button>
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => handleMove('left')}>← Izq</Button>
              <Button size="sm" variant="secondary" onClick={() => handleMove('down')}>↓ Abajo</Button>
              <Button size="sm" variant="secondary" onClick={() => handleMove('right')}>Der →</Button>
            </div>
          </div>
        )}
      </div>
    </GameShell>
  )
}
