'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// Cell walls: true = wall exists
type Cell = { n: boolean; e: boolean; s: boolean; w: boolean }
type Grid = Cell[][]
type Phase = 'idle' | 'playing' | 'won' | 'lost'
type Dir = 'n' | 'e' | 's' | 'w'

interface Level {
  name: string
  cols: number
  rows: number
  maxSteps: number
  baseScore: number
  stepPenalty: number
}

const LEVELS: Level[] = [
  { name: 'Fácil',   cols: 7,  rows: 7,  maxSteps: 80,  baseScore: 500,  stepPenalty: 4 },
  { name: 'Medio',   cols: 11, rows: 11, maxSteps: 200, baseScore: 1000, stepPenalty: 4 },
  { name: 'Difícil', cols: 15, rows: 15, maxSteps: 400, baseScore: 2000, stepPenalty: 4 },
]

const CANVAS_SIZE = 420

const DIR_DELTA: Record<Dir, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }
const DIR_OPP: Record<Dir, Dir> = { n: 's', s: 'n', e: 'w', w: 'e' }
const DIR_NAME: Record<Dir, string> = { n: 'norte', e: 'este', s: 'sur', w: 'oeste' }

const INSTRUCTIONS =
  'Laberinto de Audio. Estás en la esquina superior izquierda. La salida está en la esquina inferior derecha. ' +
  'Teclas de flecha o W A S D para moverte. ' +
  'Barra espaciadora: brújula de audio, indica dirección y distancia a la salida. ' +
  'R: releer posición actual y salidas disponibles. ' +
  'H: repetir estas instrucciones. ' +
  'La brújula suena más aguda cuando estás cerca de la salida. ' +
  'El canal izquierdo o derecho indica si la salida está a tu izquierda o derecha. ' +
  'Cada 5 segundos escucharás un pulso automático de la brújula.'

// ─── Maze generation ──────────────────────────────────────────────────────────

function generateMaze(cols: number, rows: number): Grid {
  const grid: Grid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ n: true, e: true, s: true, w: true }))
  )
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false))

  function carve(x: number, y: number) {
    visited[y][x] = true
    const dirs: Dir[] = ['n', 'e', 's', 'w']
    dirs.sort(() => Math.random() - 0.5)
    for (const dir of dirs) {
      const [dx, dy] = DIR_DELTA[dir]
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !visited[ny][nx]) {
        grid[y][x][dir] = false
        grid[ny][nx][DIR_OPP[dir]] = false
        carve(nx, ny)
      }
    }
  }

  carve(0, 0)
  return grid
}

// ─── Canvas rendering ─────────────────────────────────────────────────────────

function drawMaze(
  canvas: HTMLCanvasElement,
  grid: Grid,
  pos: { x: number; y: number },
  cols: number,
  rows: number
) {
  const ctx = canvas.getContext('2d')!
  const cw = CANVAS_SIZE / cols
  const ch = CANVAS_SIZE / rows

  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

  // Goal cell background
  ctx.fillStyle = '#052e16'
  ctx.fillRect((cols - 1) * cw, (rows - 1) * ch, cw, ch)

  // Draw walls
  ctx.strokeStyle = '#ffd700'
  ctx.lineWidth = 1.5

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = grid[y][x]
      const px = x * cw
      const py = y * ch
      ctx.beginPath()
      if (cell.n) { ctx.moveTo(px, py);      ctx.lineTo(px + cw, py) }
      if (cell.s) { ctx.moveTo(px, py + ch); ctx.lineTo(px + cw, py + ch) }
      if (cell.w) { ctx.moveTo(px, py);      ctx.lineTo(px, py + ch) }
      if (cell.e) { ctx.moveTo(px + cw, py); ctx.lineTo(px + cw, py + ch) }
      ctx.stroke()
    }
  }

  // Goal marker (green circle)
  const goalX = (cols - 1) * cw + cw / 2
  const goalY = (rows - 1) * ch + ch / 2
  ctx.fillStyle = '#22c55e'
  ctx.beginPath()
  ctx.arc(goalX, goalY, Math.min(cw, ch) * 0.28, 0, Math.PI * 2)
  ctx.fill()

  // Player (gold circle)
  ctx.fillStyle = '#ffd700'
  ctx.beginPath()
  ctx.arc(pos.x * cw + cw / 2, pos.y * ch + ch / 2, Math.min(cw, ch) * 0.32, 0, Math.PI * 2)
  ctx.fill()
}

// ─── Audio helpers ────────────────────────────────────────────────────────────

function calcCompass(x: number, y: number, lv: Level): { pan: number; freq: number } {
  const dx = (lv.cols - 1) - x
  const dy = (lv.rows - 1) - y
  const maxDist = (lv.cols - 1) + (lv.rows - 1)
  const dist = Math.abs(dx) + Math.abs(dy)
  const distRatio = 1 - dist / maxDist        // 0 = far, 1 = near
  const freq = 200 + distRatio * 700          // 200 Hz (far) → 900 Hz (near)
  const pan = dx / Math.max(lv.cols - 1, 1)  // −1 (goal left) → +1 (goal right)
  return { pan, freq }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface GameState {
  pos: { x: number; y: number }
  steps: number
  levelIdx: number
  grid: Grid | null
  phase: Phase
}

export default function LaberintoAudioPage() {
  const [phase, setPhase]     = useState<Phase>('idle')
  const [levelIdx, setLevelIdx] = useState(0)
  const [grid, setGrid]       = useState<Grid | null>(null)
  const [pos, setPos]         = useState({ x: 0, y: 0 })
  const [steps, setSteps]     = useState(0)
  const [score, setScore]     = useState(0)
  const [saved, setSaved]     = useState(false)
  const [saveError, setSaveError] = useState('')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pulseRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  // Ref mirror avoids stale closures in event handlers
  const stateRef  = useRef<GameState>({ pos: { x: 0, y: 0 }, steps: 0, levelIdx: 0, grid: null, phase: 'idle' })

  useEffect(() => {
    stateRef.current = { pos, steps, levelIdx, grid, phase }
  }, [pos, steps, levelIdx, grid, phase])

  // Redraw canvas whenever relevant state changes
  useEffect(() => {
    if (!grid || !canvasRef.current) return
    const lv = LEVELS[levelIdx]
    drawMaze(canvasRef.current, grid, pos, lv.cols, lv.rows)
  }, [grid, pos, levelIdx])

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getExitList(cell: Cell): string {
    const exits = (['n', 'e', 's', 'w'] as Dir[]).filter(d => !cell[d]).map(d => DIR_NAME[d])
    return exits.length ? 'Salidas: ' + exits.join(', ') : 'Sin salidas'
  }

  function posDesc(x: number, y: number, g: Grid, lv: Level): string {
    const dist = Math.abs(x - (lv.cols - 1)) + Math.abs(y - (lv.rows - 1))
    const distTxt = dist === 0 ? '¡Estás en la salida!' : `Distancia a la salida: ${dist}.`
    return `Columna ${x + 1} de ${lv.cols}, fila ${y + 1} de ${lv.rows}. ${getExitList(g[y][x])}. ${distTxt}`
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function startGame(lIdx: number) {
    const lv = LEVELS[lIdx]
    const newGrid = generateMaze(lv.cols, lv.rows)
    setGrid(newGrid)
    setPos({ x: 0, y: 0 })
    setSteps(0)
    setScore(0)
    setSaved(false)
    setSaveError('')
    setLevelIdx(lIdx)
    setPhase('playing')
    audio.start()
    announcePolite(
      `Laberinto ${lv.name}, ${lv.cols} por ${lv.rows}. ` +
      posDesc(0, 0, newGrid, lv) +
      ` Máximo ${lv.maxSteps} pasos. Pulsa H para instrucciones completas.`
    )
  }

  const handleMove = useCallback((dir: Dir) => {
    const { pos: p, steps: st, levelIdx: lIdx, grid: g, phase: ph } = stateRef.current
    if (ph !== 'playing' || !g) return

    const lv = LEVELS[lIdx]
    const cell = g[p.y][p.x]

    if (cell[dir]) {
      audio.wall()
      announceAssertive(`Pared al ${DIR_NAME[dir]}.`)
      return
    }

    const [dx, dy] = DIR_DELTA[dir]
    const np = { x: p.x + dx, y: p.y + dy }
    const ns = st + 1
    setPos(np)
    setSteps(ns)
    audio.step()

    if (np.x === lv.cols - 1 && np.y === lv.rows - 1) {
      const finalScore = Math.max(0, lv.baseScore - ns * lv.stepPenalty)
      setScore(finalScore)
      setPhase('won')
      audio.correct()
      announceAssertive(`¡Salida encontrada! Pasos: ${ns}. Puntuación: ${finalScore}.`)
      return
    }

    if (ns >= lv.maxSteps) {
      setPhase('lost')
      audio.gameOver()
      announceAssertive(`Pasos agotados. Fin del laberinto. Usaste ${ns} pasos.`)
      return
    }

    announcePolite(posDesc(np.x, np.y, g, lv))
    const { pan, freq } = calcCompass(np.x, np.y, lv)
    audio.compass(pan, freq, 0.28)
  }, [])

  // ── Keyboard handler ──────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'playing') return

    function handleKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const { pos: p, grid: g, levelIdx: lIdx } = stateRef.current
      const lv = LEVELS[lIdx]

      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); handleMove('n'); break
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); handleMove('e'); break
        case 'ArrowDown':  case 's': case 'S': e.preventDefault(); handleMove('s'); break
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); handleMove('w'); break
        case ' ':
          e.preventDefault()
          {
            const { pan, freq } = calcCompass(p.x, p.y, lv)
            audio.compass(pan, freq)
            announcePolite('Brújula de audio.')
          }
          break
        case 'r': case 'R':
          if (g) announcePolite(posDesc(p.x, p.y, g, lv))
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [phase, handleMove])

  // ── Periodic compass pulse ────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'playing') {
      if (pulseRef.current) { clearInterval(pulseRef.current); pulseRef.current = null }
      return
    }
    pulseRef.current = setInterval(() => {
      const { pos: p, levelIdx: lIdx, phase: ph } = stateRef.current
      if (ph !== 'playing') return
      const { pan, freq } = calcCompass(p.x, p.y, LEVELS[lIdx])
      audio.compass(pan, freq, 0.12)
    }, 5000)
    return () => { if (pulseRef.current) { clearInterval(pulseRef.current); pulseRef.current = null } }
  }, [phase])

  // ── Score save ────────────────────────────────────────────────────────────

  async function handleSave() {
    const result = await saveScore('laberinto', score)
    if (result?.error) {
      setSaveError(result.error)
      announceAssertive(result.error)
    } else {
      setSaved(true)
      announcePolite('Puntuación guardada.')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const lv = LEVELS[levelIdx]

  if (phase === 'idle') {
    return (
      <GameShell title="Laberinto de Audio" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Laberinto de Audio</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <div className="space-y-3" role="group" aria-label="Seleccionar dificultad">
            {LEVELS.map((l, i) => (
              <Button key={i} size="lg" onClick={() => startGame(i)} className="w-full text-left">
                {l.name} — laberinto {l.cols}×{l.rows}, máximo {l.maxSteps} pasos
              </Button>
            ))}
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Laberinto de Audio" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2
            className="text-2xl font-bold"
            style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}
          >
            {phase === 'won' ? '¡Salida encontrada!' : '¡Pasos agotados!'}
          </h2>

          {phase === 'won' && (
            <>
              <p className="text-3xl font-mono font-bold" aria-live="polite">
                Puntuación: {score}
              </p>
              <p className="text-[#888]">Pasos usados: {steps} de {lv.maxSteps}</p>
              {!saved ? (
                <>
                  <Button onClick={handleSave}>Guardar puntuación</Button>
                  {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
                </>
              ) : (
                <p role="status" className="text-[#22c55e]">Guardado.</p>
              )}
            </>
          )}

          {phase === 'lost' && (
            <p className="text-[#888]">
              Agotaste los {lv.maxSteps} pasos sin encontrar la salida.
            </p>
          )}

          <div className="flex flex-col gap-3 items-center">
            <Button onClick={() => startGame(levelIdx)}>
              Jugar de nuevo ({lv.name})
            </Button>
            <Button variant="secondary" onClick={() => setPhase('idle')}>
              Cambiar dificultad
            </Button>
          </div>
        </div>
      </GameShell>
    )
  }

  return (
    <GameShell title="Laberinto de Audio" instructions={INSTRUCTIONS} score={score}>
      <div className="space-y-4">
        <div className="flex justify-between text-sm text-[#888]" aria-live="polite">
          <span>Nivel: <strong className="text-white">{lv.name}</strong></span>
          <span>Pasos restantes: <strong className="text-white">{lv.maxSteps - steps}</strong></span>
        </div>

        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          aria-hidden="true"
          className="w-full max-w-[420px] border border-[#333] rounded block mx-auto"
        />

        <p className="text-xs text-[#555] text-center">
          Flechas / WASD — moverse &nbsp;|&nbsp; Espacio — brújula &nbsp;|&nbsp; R — releer posición
        </p>
      </div>
    </GameShell>
  )
}
