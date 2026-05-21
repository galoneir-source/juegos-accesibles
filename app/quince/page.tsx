'use client'

import { useEffect, useRef, useState } from 'react'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ─── Types & constants ────────────────────────────────────────────────────────

type Diff  = 'easy' | 'medium' | 'hard'
type Phase = 'start' | 'playing' | 'won'

const SIZE = 4
const CELL = 100
const CS   = SIZE * CELL  // canvas size = 400

const SCRAMBLE:   Record<Diff, number> = { easy: 30,  medium: 100, hard: 500 }
const BASE_SCORE: Record<Diff, number> = { easy: 500, medium: 800, hard: 1200 }
const DIFF_LABEL: Record<Diff, string> = { easy: 'Fácil', medium: 'Normal', hard: 'Difícil' }

// ─── Puzzle logic ─────────────────────────────────────────────────────────────

function isGoal(t: number[]): boolean {
  for (let i = 0; i < SIZE * SIZE - 1; i++) if (t[i] !== i + 1) return false
  return t[SIZE * SIZE - 1] === 0
}

function makeScrambled(n: number): number[] {
  const t = Array.from({ length: SIZE * SIZE }, (_, i) => (i < SIZE * SIZE - 1 ? i + 1 : 0))
  let blank = SIZE * SIZE - 1
  let prev  = -1
  for (let i = 0; i < n; i++) {
    const r = Math.floor(blank / SIZE), c = blank % SIZE
    const ns: number[] = []
    if (r > 0)        ns.push(blank - SIZE)
    if (r < SIZE - 1) ns.push(blank + SIZE)
    if (c > 0)        ns.push(blank - 1)
    if (c < SIZE - 1) ns.push(blank + 1)
    const cands = ns.filter(x => x !== prev)
    const next  = cands[Math.floor(Math.random() * cands.length)]
    t[blank] = t[next]
    t[next]  = 0
    prev  = blank
    blank = next
  }
  return t
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

function drawBoard(canvas: HTMLCanvasElement, tiles: number[], hlDest: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, CS, CS)

  for (let i = 0; i < SIZE * SIZE; i++) {
    const r   = Math.floor(i / SIZE), c = i % SIZE
    const x   = c * CELL, y = r * CELL
    const val = tiles[i]

    if (val === 0) {
      ctx.fillStyle = '#111'
      ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6)
      // dot in blank
      ctx.fillStyle = '#2a2a2a'
      ctx.beginPath()
      ctx.arc(x + CELL / 2, y + CELL / 2, 6, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const correct = val === i + 1
      const fresh   = i === hlDest

      ctx.fillStyle = correct ? '#0d2a0d' : (fresh ? '#1a1a30' : '#161620')
      ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6)

      ctx.strokeStyle = correct ? '#4CAF50' : (fresh ? '#6060cc' : '#2a2a2a')
      ctx.lineWidth   = correct || fresh ? 2 : 1
      ctx.strokeRect(x + 4, y + 4, CELL - 8, CELL - 8)

      ctx.fillStyle = correct ? '#4CAF50' : '#ffd700'
      ctx.font      = `bold ${val < 10 ? 40 : 34}px monospace`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(val), x + CELL / 2, y + CELL / 2)
    }
  }

  // subtle grid
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth   = 1
  for (let i = 1; i < SIZE; i++) {
    ctx.beginPath(); ctx.moveTo(i * CELL, 0);  ctx.lineTo(i * CELL, CS); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i * CELL);  ctx.lineTo(CS, i * CELL); ctx.stroke()
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Quince() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const assertRef = useRef<HTMLDivElement>(null)
  const politeRef = useRef<HTMLDivElement>(null)

  const [phase, setPhase] = useState<Phase>('start')
  const phaseRef = useRef<Phase>('start')
  const [diff,  setDiff]  = useState<Diff>('medium')
  const diffRef = useRef<Diff>('medium')
  const [moves, setMoves] = useState(0)
  const movesRef = useRef(0)
  const [correctCount, setCorrectCount] = useState(0)
  const tilesRef  = useRef<number[]>(Array.from({ length: SIZE * SIZE }, (_, i) => i < SIZE * SIZE - 1 ? i + 1 : 0))
  const hlRef     = useRef(-1)

  function setPhaseSync(p: Phase) { phaseRef.current = p; setPhase(p) }

  function assertive(msg: string) {
    if (!assertRef.current) return
    assertRef.current.textContent = ''
    requestAnimationFrame(() => { if (assertRef.current) assertRef.current.textContent = msg })
  }
  function polite(msg: string) {
    if (!politeRef.current) return
    politeRef.current.textContent = ''
    requestAnimationFrame(() => { if (politeRef.current) politeRef.current.textContent = msg })
  }

  function redraw(t: number[], hl: number) {
    const canvas = canvasRef.current
    if (canvas) drawBoard(canvas, t, hl)
    setCorrectCount(t.filter((v, i) => v !== 0 && v === i + 1).length)
  }

  function doMove(dir: 'up' | 'down' | 'left' | 'right') {
    if (phaseRef.current !== 'playing') return

    const t     = tilesRef.current
    const blank = t.indexOf(0)
    const br    = Math.floor(blank / SIZE), bc = blank % SIZE

    let target = -1
    if (dir === 'up'    && br > 0)        target = blank - SIZE
    if (dir === 'down'  && br < SIZE - 1) target = blank + SIZE
    if (dir === 'left'  && bc > 0)        target = blank - 1
    if (dir === 'right' && bc < SIZE - 1) target = blank + 1

    if (target === -1) { audio.quinceWall(); return }

    const tileNum = t[target]
    const newT    = [...t]
    newT[blank]  = tileNum
    newT[target] = 0

    const isCorrect = blank < SIZE * SIZE - 1 && tileNum === blank + 1
    const pan       = (bc / (SIZE - 1)) * 2 - 1

    tilesRef.current = newT
    hlRef.current    = blank
    const nm = movesRef.current + 1
    movesRef.current = nm
    setMoves(nm)
    redraw(newT, blank)

    audio.quinceTile(pan)
    if (isCorrect) {
      setTimeout(() => audio.quinceCorrect(), 65)
      assertive(`Ficha ${tileNum} en su sitio.`)
    } else {
      polite(`Ficha ${tileNum}.`)
    }

    if (isGoal(newT)) setTimeout(() => handleWin(), 220)
  }

  async function handleWin() {
    const score = Math.max(0, BASE_SCORE[diffRef.current] - movesRef.current)
    audio.quinceWin()
    assertive(`¡Puzle resuelto en ${movesRef.current} movimientos! Puntuación: ${score}.`)
    await saveScore('quince', score)
    setPhaseSync('won')
  }

  function doScan() {
    const t     = tilesRef.current
    const blank = t.indexOf(0)
    const br    = Math.floor(blank / SIZE), bc = blank % SIZE

    const adj: string[] = []
    if (br > 0)        adj.push(`norte: ${t[blank - SIZE]}`)
    if (br < SIZE - 1) adj.push(`sur: ${t[blank + SIZE]}`)
    if (bc > 0)        adj.push(`oeste: ${t[blank - 1]}`)
    if (bc < SIZE - 1) adj.push(`este: ${t[blank + 1]}`)

    const correct = t.filter((v, i) => v !== 0 && v === i + 1).length
    assertive(
      `Hueco en fila ${br + 1}, columna ${bc + 1}. ` +
      `Fichas adyacentes: ${adj.join(', ')}. ` +
      `${correct} de 15 en posición correcta. ` +
      `Movimientos: ${movesRef.current}.`
    )
  }

  function doBoard() {
    const t    = tilesRef.current
    const rows = []
    for (let r = 0; r < SIZE; r++) {
      const cells = []
      for (let c = 0; c < SIZE; c++) {
        const v = t[r * SIZE + c]
        cells.push(v === 0 ? 'hueco' : String(v))
      }
      rows.push(`Fila ${r + 1}: ${cells.join(', ')}`)
    }
    assertive(rows.join('. '))
  }

  function startGame(d: Diff) {
    diffRef.current  = d
    const t          = makeScrambled(SCRAMBLE[d])
    tilesRef.current = t
    movesRef.current = 0
    hlRef.current    = -1
    setDiff(d)
    setMoves(0)
    setPhaseSync('playing')
    setTimeout(() => {
      redraw(t, -1)
      canvasRef.current?.focus()
      polite(`Puzle ${DIFF_LABEL[d]}. Flechas o WASD para deslizar fichas hacia el hueco. E para explorar, B para leer el tablero completo, R para reiniciar.`)
    }, 50)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phaseRef.current === 'start' || phaseRef.current === 'won') return
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); doMove('up');    break
        case 'ArrowDown':  case 's': case 'S': e.preventDefault(); doMove('down');  break
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); doMove('left');  break
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); doMove('right'); break
        case 'e': case 'E': e.preventDefault(); doScan();  break
        case 'b': case 'B': e.preventDefault(); doBoard(); break
        case 'r': case 'R': e.preventDefault(); startGame(diffRef.current); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const calcScore = Math.max(0, BASE_SCORE[diff] - moves)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4 gap-6">
      <div ref={assertRef} role="status" aria-live="assertive" aria-atomic="true" className="sr-only" />
      <div ref={politeRef} role="status" aria-live="polite"    aria-atomic="true" className="sr-only" />

      <h1 className="text-2xl font-bold text-[#ffd700]">Puzle Quince</h1>

      {phase === 'start' && (
        <div className="text-center space-y-5 max-w-md">
          <p className="text-[#aaa]">
            Ordena las 15 fichas del 1 al 15 deslizándolas hacia el hueco. La meta es la secuencia 1–4 en la primera fila, 5–8 en la segunda, 9–12 en la tercera y 13–15 en la cuarta con el hueco al final.
          </p>
          <p className="text-[#666] text-sm leading-relaxed">
            Flechas o WASD: mover hueco · E: leer hueco y vecinos · B: leer tablero completo · R: reiniciar
          </p>
          <p className="text-[#888] text-sm font-semibold">Elige dificultad:</p>
          <div className="flex gap-3 justify-center flex-wrap">
            {(['easy', 'medium', 'hard'] as Diff[]).map((d, idx) => (
              <button
                key={d}
                autoFocus={idx === 1}
                className="px-5 py-2 bg-[#1a1a1a] border border-[#333] rounded hover:border-[#ffd700] focus:outline-none focus:ring-2 focus:ring-[#ffd700] focus:ring-offset-2 focus:ring-offset-black"
                onClick={() => startGame(d)}
              >
                {DIFF_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'playing' && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-8 text-center">
            <div>
              <p className="text-[#888] text-xs uppercase tracking-wider">Movimientos</p>
              <p className="text-3xl font-bold text-[#ffd700]">{moves}</p>
            </div>
            <div>
              <p className="text-[#888] text-xs uppercase tracking-wider">En posición</p>
              <p className="text-3xl font-bold">{correctCount}<span className="text-lg text-[#666]">/15</span></p>
            </div>
            <div>
              <p className="text-[#888] text-xs uppercase tracking-wider">Puntos est.</p>
              <p className="text-3xl font-bold text-[#4CAF50]">{calcScore}</p>
            </div>
          </div>
          <canvas
            ref={canvasRef}
            width={CS}
            height={CS}
            aria-hidden="true"
            tabIndex={-1}
            className="border border-[#333] rounded"
            style={{ maxWidth: '100%' }}
          />
          <p className="text-[#555] text-xs">
            Flechas/WASD: deslizar · E: explorar hueco · B: leer tablero · R: reiniciar
          </p>
        </div>
      )}

      {phase === 'won' && (
        <div className="text-center space-y-4">
          <p className="text-xl text-[#ffd700]">¡Puzle resuelto!</p>
          <p className="text-lg text-[#aaa]">{DIFF_LABEL[diff]} · {moves} movimientos</p>
          <p className="text-4xl font-bold">{calcScore} pts</p>
          <p className="text-[#888] text-sm">(puntuación guardada)</p>
          <p className="text-[#888] text-sm font-semibold mt-4">Jugar de nuevo:</p>
          <div className="flex gap-3 justify-center flex-wrap">
            {(['easy', 'medium', 'hard'] as Diff[]).map((d, idx) => (
              <button
                key={d}
                autoFocus={idx === 1}
                className="px-5 py-2 bg-[#1a1a1a] border border-[#333] rounded hover:border-[#ffd700] focus:outline-none focus:ring-2 focus:ring-[#ffd700] focus:ring-offset-2 focus:ring-offset-black"
                onClick={() => startGame(d)}
              >
                {DIFF_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
