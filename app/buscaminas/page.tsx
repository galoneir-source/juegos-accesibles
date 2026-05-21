'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_SIZE = 480

const DIFF = {
  easy:   { label: 'Fácil',   rows: 9,  cols: 9,  mines: 10 },
  medium: { label: 'Medio',   rows: 12, cols: 12, mines: 25 },
  hard:   { label: 'Difícil', rows: 16, cols: 16, mines: 40 },
} as const

type Difficulty = keyof typeof DIFF
type Phase = 'setup' | 'playing' | 'won' | 'lost'

interface Cell {
  mine: boolean
  revealed: boolean
  flagged: boolean
  count: number    // adjacent mine count
}

const BASE_SCORE: Record<Difficulty, number> = { easy: 1000, medium: 3000, hard: 6000 }

const INSTRUCTIONS =
  'Buscaminas. Descubre todas las celdas que no tienen mina sin explotar ninguna. ' +
  'Flechas o WASD para mover el cursor. Enter o Espacio para revelar una celda. ' +
  'F para colocar o quitar una bandera en una celda sospechosa. ' +
  'Al revelar una celda oirás un tono: agudo y suave significa sin minas alrededor, ' +
  'grave y áspero significa muchas minas. ' +
  'El cursor se anuncia automáticamente al moverse: oculta, número, o marcada. ' +
  'Si una celda no tiene minas vecinas se abre en cascada y oirás un acorde ascendente. ' +
  'Tecla E: leer la celda actual y sus ocho celdas vecinas. ' +
  'R: minas sin marcar y celdas pendientes. H: instrucciones.'

// ── Pure logic (outside component) ───────────────────────────────────────────

function emptyBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, revealed: false, flagged: false, count: 0 }))
  )
}

function placeMines(
  board: Cell[][], rows: number, cols: number, mines: number, safeR: number, safeC: number
): Cell[][] {
  const b = board.map(row => row.map(c => ({ ...c })))
  let placed = 0
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows)
    const c = Math.floor(Math.random() * cols)
    if (b[r][c].mine) continue
    if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue  // safe zone
    b[r][c].mine = true
    placed++
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (b[r][c].mine) continue
      let cnt = 0
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr; const nc = c + dc
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && b[nr][nc].mine) cnt++
        }
      b[r][c].count = cnt
    }
  }
  return b
}

function floodReveal(board: Cell[][], rows: number, cols: number, r: number, c: number): Cell[][] {
  const b = board.map(row => row.map(cell => ({ ...cell })))
  const stack: [number, number][] = [[r, c]]
  while (stack.length) {
    const [cr, cc] = stack.pop()!
    if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) continue
    const cell = b[cr][cc]
    if (cell.revealed || cell.flagged || cell.mine) continue
    cell.revealed = true
    if (cell.count === 0) {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (dr !== 0 || dc !== 0) stack.push([cr + dr, cc + dc])
    }
  }
  return b
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BuscaminasPage() {
  const [phase,      setPhase]      = useState<Phase>('setup')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [score,      setScore]      = useState(0)
  const [flagsLeft,  setFlagsLeft]  = useState(10)
  const [saved,      setSaved]      = useState(false)
  const [saveError,  setSaveError]  = useState('')

  const phaseRef     = useRef<Phase>('setup')
  const diffRef      = useRef<Difficulty>('easy')
  const boardRef     = useRef<Cell[][]>([])
  const curRRef      = useRef(0)
  const curCRef      = useRef(0)
  const minedRef     = useRef(false)   // mines placed after first click
  const scoreRef     = useRef(0)
  const startTimeRef = useRef(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef(0)

  const syncPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  function cfg() { return DIFF[diffRef.current] }

  // ── Draw ────────────────────────────────────────────────────────────────────

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { rows, cols } = cfg()
    const cw = CANVAS_SIZE / cols
    const ch = CANVAS_SIZE / rows
    const board = boardRef.current

    ctx.fillStyle = '#080818'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell   = board[r]?.[c]
        if (!cell) continue
        const x      = c * cw
        const y      = r * ch
        const cursor = r === curRRef.current && c === curCRef.current

        ctx.fillStyle = cell.revealed
          ? (cell.mine ? '#5b0a0a' : '#111827')
          : cursor ? '#1e3a5a' : '#162032'
        ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2)

        ctx.strokeStyle = cursor ? '#60a5fa' : '#1e3a5f'
        ctx.lineWidth   = cursor ? 2 : 0.5
        ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2)

        const fs = Math.floor(Math.min(cw, ch) * 0.52)
        ctx.font         = `bold ${fs}px monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'

        if (!cell.revealed) {
          if (cell.flagged) {
            ctx.fillStyle = '#ef4444'
            ctx.fillText('F', x + cw / 2, y + ch / 2)
          }
        } else if (cell.mine) {
          ctx.fillStyle = '#f87171'
          ctx.fillText('*', x + cw / 2, y + ch / 2)
        } else if (cell.count > 0) {
          const COLORS = ['','#60a5fa','#4ade80','#f87171','#818cf8','#f97316','#2dd4bf','#f472b6','#94a3b8']
          ctx.fillStyle = COLORS[cell.count]
          ctx.fillText(`${cell.count}`, x + cw / 2, y + ch / 2)
        }
      }
    }
  }

  // ── Game loop ────────────────────────────────────────────────────────────────

  const loop = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    draw()
    rafRef.current = requestAnimationFrame(loop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Start ────────────────────────────────────────────────────────────────────

  function startGame(diff: Difficulty) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    diffRef.current = diff
    setDifficulty(diff)

    const { rows, cols, mines } = DIFF[diff]
    boardRef.current  = emptyBoard(rows, cols)
    curRRef.current   = Math.floor(rows / 2)
    curCRef.current   = Math.floor(cols / 2)
    minedRef.current  = false
    scoreRef.current  = 0
    startTimeRef.current = performance.now()

    setScore(0)
    setFlagsLeft(mines)
    setSaved(false); setSaveError('')
    syncPhase('playing')
    audio.start()

    announcePolite(
      `Buscaminas ${DIFF[diff].label}. Cuadrícula ${rows}×${cols} con ${mines} minas. ` +
      `Flechas para moverte, Enter para revelar, F para bandera.`
    )
    rafRef.current = requestAnimationFrame(loop)
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function cellLabel(cell: Cell): string {
    if (cell.flagged)   return 'marcada'
    if (!cell.revealed) return 'oculta'
    if (cell.mine)      return 'mina'
    return cell.count === 0 ? 'vacía' : `${cell.count}`
  }

  function countRevealed(board: Cell[][]): number {
    return board.flat().filter(c => c.revealed).length
  }

  function countFlagged(board: Cell[][]): number {
    return board.flat().filter(c => c.flagged).length
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'playing') return

    function moveCursor(dr: number, dc: number) {
      const { rows, cols } = cfg()
      const newR = Math.max(0, Math.min(rows - 1, curRRef.current + dr))
      const newC = Math.max(0, Math.min(cols - 1, curCRef.current + dc))
      if (newR === curRRef.current && newC === curCRef.current) return
      curRRef.current = newR
      curCRef.current = newC

      const cell = boardRef.current[newR]?.[newC]
      if (!cell) return
      const pan = cols > 1 ? (newC / (cols - 1)) * 2 - 1 : 0

      // Play tone matching cell state
      if (cell.revealed && !cell.mine) audio.mineReveal(cell.count)
      else audio.mineCursor(pan)

      announcePolite(`Fila ${newR + 1}, columna ${newC + 1}: ${cellLabel(cell)}.`)
    }

    function revealCurrent() {
      const r = curRRef.current
      const c = curCRef.current
      const cell = boardRef.current[r]?.[c]
      if (!cell || cell.revealed || cell.flagged) return

      // Place mines on first reveal (first-click protection)
      if (!minedRef.current) {
        const { rows, cols, mines } = cfg()
        boardRef.current = placeMines(boardRef.current, rows, cols, mines, r, c)
        minedRef.current = true
      }

      const current = boardRef.current[r][c]

      if (current.mine) {
        // Show all mines
        boardRef.current = boardRef.current.map(row =>
          row.map(cel => cel.mine ? { ...cel, revealed: true } : cel)
        )
        syncPhase('lost')
        audio.mineExplosion()
        announceAssertive('¡Mina! Has perdido.')
        draw()
        return
      }

      const { rows, cols } = cfg()
      const prevRevealed = countRevealed(boardRef.current)
      const newBoard     = floodReveal(boardRef.current, rows, cols, r, c)
      boardRef.current   = newBoard

      const nowRevealed = countRevealed(newBoard)
      const cascaded    = nowRevealed > prevRevealed + 1
      const total       = rows * cols - cfg().mines

      if (cascaded) {
        audio.mineCascade()
        announcePolite(`Celda vacía. ${nowRevealed} de ${total} descubiertas.`)
      } else {
        audio.mineReveal(current.count)
        announcePolite(current.count === 0 ? 'Vacía.' : `${current.count}.`)
      }

      if (nowRevealed >= total) {
        const secs = Math.round((performance.now() - startTimeRef.current) / 1000)
        const pts  = Math.max(100, BASE_SCORE[diffRef.current] - secs * 3)
        scoreRef.current = pts
        setScore(pts)
        syncPhase('won')
        audio.siWaveClear()
        announceAssertive(`¡Ganaste! Tiempo: ${secs} segundos. Puntuación: ${pts}.`)
      }
    }

    function toggleFlag() {
      const r = curRRef.current
      const c = curCRef.current
      const cell = boardRef.current[r]?.[c]
      if (!cell || cell.revealed) return

      const newFlagged = !cell.flagged
      boardRef.current = boardRef.current.map((row, ri) =>
        row.map((cel, ci) => ri === r && ci === c ? { ...cel, flagged: newFlagged } : cel)
      )

      const fl = cfg().mines - countFlagged(boardRef.current)
      setFlagsLeft(fl)

      if (newFlagged) {
        audio.mineFlag()
        announcePolite(`Bandera colocada. ${fl} minas sin marcar.`)
      } else {
        audio.mineUnflag()
        announcePolite(`Bandera retirada. ${fl} minas sin marcar.`)
      }
    }

    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); moveCursor(-1,  0); break
        case 'ArrowDown':  case 's': case 'S': e.preventDefault(); moveCursor( 1,  0); break
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); moveCursor( 0, -1); break
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); moveCursor( 0,  1); break
        case 'Enter': case ' ':    e.preventDefault(); revealCurrent(); break
        case 'f': case 'F':        e.preventDefault(); toggleFlag();    break
        case 'e': case 'E': {
          e.preventDefault()
          const r    = curRRef.current
          const c    = curCRef.current
          const { rows, cols } = cfg()
          const board = boardRef.current
          const cell  = board[r]?.[c]
          if (!cell) break

          // Play tone for current cell
          const pan = cols > 1 ? (c / (cols - 1)) * 2 - 1 : 0
          if (cell.revealed && !cell.mine) audio.mineReveal(cell.count)
          else audio.mineCursor(pan)

          // Describe current cell + 8 neighbors
          const DIRS: [string, number, number][] = [
            ['arriba-izquierda', -1, -1], ['arriba', -1, 0], ['arriba-derecha', -1, 1],
            ['izquierda', 0, -1],                             ['derecha', 0, 1],
            ['abajo-izquierda',  1, -1], ['abajo',  1, 0], ['abajo-derecha',  1, 1],
          ]
          const nbrs = DIRS
            .filter(([, dr, dc]) => {
              const nr = r + dr; const nc = c + dc
              return nr >= 0 && nr < rows && nc >= 0 && nc < cols
            })
            .map(([dir, dr, dc]) => `${dir}: ${cellLabel(board[r + dr][c + dc])}`)
            .join(', ')

          announcePolite(
            `Fila ${r + 1}, columna ${c + 1}: ${cellLabel(cell)}. Vecinas — ${nbrs}.`
          )
          break
        }
        case 'r': case 'R': {
          const { rows, cols } = cfg()
          const revealed = countRevealed(boardRef.current)
          const total    = rows * cols - cfg().mines
          const fl       = cfg().mines - countFlagged(boardRef.current)
          announcePolite(
            `Minas sin marcar: ${fl}. Celdas descubiertas: ${revealed} de ${total}.`
          )
          break
        }
        case 'h': case 'H':
          announcePolite(INSTRUCTIONS)
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  async function handleSave() {
    const result = await saveScore('buscaminas', scoreRef.current)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── Screens ──────────────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <GameShell title="Buscaminas" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Buscaminas</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <div className="space-y-3">
            {(Object.entries(DIFF) as [Difficulty, typeof DIFF[Difficulty]][]).map(([key, d]) => (
              <Button key={key} size="lg" onClick={() => startGame(key)} className="w-full">
                {d.label} — {d.rows}×{d.cols}, {d.mines} minas
              </Button>
            ))}
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Buscaminas" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2
            className="text-2xl font-bold"
            style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}
          >
            {phase === 'won' ? '¡Ganaste!' : '¡Has pisado una mina!'}
          </h2>
          {phase === 'won' && (
            <p className="text-3xl font-mono font-bold" aria-live="polite">
              Puntuación: {score}
            </p>
          )}
          {phase === 'won' && !saved && (
            <>
              <Button onClick={handleSave}>Guardar puntuación</Button>
              {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
            </>
          )}
          {phase === 'won' && saved && (
            <p role="status" className="text-[#22c55e]">Guardado.</p>
          )}
          <Button onClick={() => { syncPhase('setup') }}>Jugar de nuevo</Button>
        </div>
      </GameShell>
    )
  }

  return (
    <GameShell title="Buscaminas" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-3">
        <div className="flex justify-between text-sm font-mono">
          <span>Banderas: <strong className="text-[#ef4444]">{flagsLeft}</strong> restantes</span>
          <span className="text-[#888]">{DIFF[difficulty].label} — {DIFF[difficulty].rows}×{DIFF[difficulty].cols}</span>
        </div>
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          aria-hidden="true"
          className="block mx-auto border border-[#333] rounded bg-black"
          style={{ maxWidth: '100%' }}
        />
        <p className="text-xs text-[#555] text-center">
          ↑ ↓ ← → / WASD — mover &nbsp;|&nbsp; Enter / Espacio — revelar &nbsp;|&nbsp; F — bandera &nbsp;|&nbsp; E — leer vecinas &nbsp;|&nbsp; R — estado
        </p>
      </div>
    </GameShell>
  )
}
