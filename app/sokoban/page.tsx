'use client'

import { useEffect, useRef, useState } from 'react'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ─── Types ────────────────────────────────────────────────────────────────────

type Cell = 'wall' | 'floor' | 'goal'
type Pos = { r: number; c: number }

interface LevelState {
  grid: Cell[][]
  rows: number
  cols: number
  player: Pos
  boxes: Set<string>
  goals: Set<string>
}

interface HistEntry {
  player: Pos
  boxes: Set<string>
}

// ─── Levels ───────────────────────────────────────────────────────────────────
// Symbols: # wall  space floor  @ player  $ box  . goal  * box-on-goal  + player-on-goal

const LEVELS_RAW: string[][] = [
  // 1: empujar derecha (1 movimiento)
  ['#####', '#@$.#', '#####'],

  // 2: empujar arriba (1 movimiento)
  ['#####', '# . #', '# $ #', '# @ #', '#####'],

  // 3: empujar abajo (1 movimiento)
  ['#####', '# @ #', '# $ #', '# . #', '#####'],

  // 4: rodear y empujar izquierda (4 movimientos)
  ['#####', '#   #', '#.$ #', '#@  #', '#####'],

  // 5: empujar izquierda dos veces y luego abajo (7 movimientos)
  ['######', '#  @ #', '#  $ #', '#.   #', '######'],

  // 6: empujar izquierda dos veces y luego arriba (7 movimientos)
  ['######', '#.   #', '#  $ #', '#  @ #', '######'],

  // 7: empujar derecha y luego abajo (5 movimientos)
  ['######', '#@   #', '# $  #', '#  . #', '######'],

  // 8: pasillo largo (7 movimientos)
  ['########', '#@     #', '#  $   #', '#    . #', '########'],

  // 9: dos cajas, empujar cada una arriba (7 movimientos)
  ['#######', '#..   #', '#$$@  #', '#     #', '#######'],

  // 10: dos cajas en diagonal (7 movimientos)
  ['########', '#.  .  #', '#  $$  #', '#  @   #', '########'],
]

// ─── Parser ───────────────────────────────────────────────────────────────────

function pk(r: number, c: number) { return `${r},${c}` }

function parseLevel(raw: string[]): LevelState {
  const rows = raw.length
  const cols = Math.max(...raw.map(l => l.length))
  const grid: Cell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 'wall' as Cell)
  )
  let player: Pos = { r: 0, c: 0 }
  const boxes = new Set<string>()
  const goals = new Set<string>()

  for (let r = 0; r < rows; r++) {
    const line = raw[r] ?? ''
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]
      if (ch === '#') continue
      if (ch === ' ') { grid[r][c] = 'floor'; continue }
      if (ch === '.' || ch === '*' || ch === '+') {
        grid[r][c] = 'goal'
        goals.add(pk(r, c))
      } else {
        grid[r][c] = 'floor'
      }
      if (ch === '@' || ch === '+') player = { r, c }
      if (ch === '$' || ch === '*') boxes.add(pk(r, c))
    }
  }
  return { grid, rows, cols, player, boxes, goals }
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

const CANVAS = 480

function renderLevel(canvas: HTMLCanvasElement, s: LevelState) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const cell = Math.min(
    Math.floor(CANVAS / s.cols),
    Math.floor(CANVAS / s.rows),
    64,
  )
  const offX = Math.floor((CANVAS - cell * s.cols) / 2)
  const offY = Math.floor((CANVAS - cell * s.rows) / 2)

  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, CANVAS, CANVAS)

  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      const x = offX + c * cell
      const y = offY + r * cell
      const cellType = s.grid[r][c]
      const key = pk(r, c)

      if (cellType === 'wall') {
        ctx.fillStyle = '#4a4a4a'
        ctx.fillRect(x, y, cell, cell)
        ctx.strokeStyle = '#333'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1)
      } else {
        ctx.fillStyle = '#181818'
        ctx.fillRect(x, y, cell, cell)

        if (cellType === 'goal' && !s.boxes.has(key)) {
          ctx.fillStyle = '#7a5800'
          const rad = Math.max(3, Math.floor(cell * 0.18))
          ctx.beginPath()
          ctx.arc(x + cell / 2, y + cell / 2, rad, 0, Math.PI * 2)
          ctx.fill()
        }

        if (s.boxes.has(key)) {
          const onGoal = s.goals.has(key)
          const pad = Math.max(2, Math.floor(cell * 0.10))
          ctx.fillStyle = onGoal ? '#1e6b1e' : '#7a3d10'
          ctx.fillRect(x + pad, y + pad, cell - 2 * pad, cell - 2 * pad)
          ctx.strokeStyle = onGoal ? '#4CAF50' : '#c05820'
          ctx.lineWidth = 2
          ctx.strokeRect(x + pad + 1, y + pad + 1, cell - 2 * pad - 2, cell - 2 * pad - 2)
          if (onGoal) {
            ctx.fillStyle = '#4CAF50'
            ctx.font = `bold ${Math.floor(cell * 0.4)}px monospace`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('✓', x + cell / 2, y + cell / 2)
          }
        }
      }
    }
  }

  // Player
  const px = offX + s.player.c * cell
  const py = offY + s.player.r * cell
  const pr = Math.max(4, Math.floor(cell * 0.34))
  ctx.fillStyle = '#ffd700'
  ctx.beginPath()
  ctx.arc(px + cell / 2, py + cell / 2, pr, 0, Math.PI * 2)
  ctx.fill()
  if (s.goals.has(pk(s.player.r, s.player.c))) {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sokoban() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const assertRef = useRef<HTMLDivElement>(null)
  const politeRef = useRef<HTMLDivElement>(null)

  const [phase, setPhase] = useState<'start' | 'playing' | 'won'>('start')
  const phaseRef = useRef<'start' | 'playing' | 'won'>('start')

  const stateRef = useRef<LevelState | null>(null)
  const histRef = useRef<HistEntry[]>([])
  const movesRef = useRef(0)
  const totalScoreRef = useRef(0)
  const levelIdxRef = useRef(0)
  const winningRef = useRef(false)

  function setPhaseSync(p: 'start' | 'playing' | 'won') {
    phaseRef.current = p
    setPhase(p)
  }

  function assertive(msg: string) {
    if (!assertRef.current) return
    assertRef.current.textContent = ''
    requestAnimationFrame(() => {
      if (assertRef.current) assertRef.current.textContent = msg
    })
  }

  function polite(msg: string) {
    if (!politeRef.current) return
    politeRef.current.textContent = ''
    requestAnimationFrame(() => {
      if (politeRef.current) politeRef.current.textContent = msg
    })
  }

  function doRender() {
    const canvas = canvasRef.current
    const s = stateRef.current
    if (canvas && s) renderLevel(canvas, s)
  }

  function checkWin(s: LevelState): boolean {
    for (const g of s.goals) {
      if (!s.boxes.has(g)) return false
    }
    return true
  }

  async function handleWin() {
    if (winningRef.current) return
    winningRef.current = true
    const levelScore = Math.max(0, 300 - movesRef.current)
    totalScoreRef.current += levelScore
    audio.sokobanWin()
    const isLast = levelIdxRef.current >= LEVELS_RAW.length - 1
    assertive(
      `¡Nivel completado en ${movesRef.current} movimientos! +${levelScore} puntos.` +
      (isLast ? ' ¡Has completado todos los niveles!' : ' Siguiente nivel en 2 segundos.')
    )
    if (isLast) {
      saveScore('sokoban', totalScoreRef.current)
      setTimeout(() => setPhaseSync('won'), 2500)
    } else {
      setTimeout(() => {
        levelIdxRef.current++
        doLoadLevel(levelIdxRef.current)
      }, 2000)
    }
  }

  function doLoadLevel(idx: number) {
    stateRef.current = parseLevel(LEVELS_RAW[idx])
    histRef.current = []
    movesRef.current = 0
    winningRef.current = false
    doRender()
    const s = stateRef.current
    polite(
      `Nivel ${idx + 1} de ${LEVELS_RAW.length}. ` +
      `${s.goals.size} caja${s.goals.size > 1 ? 's' : ''} para colocar.`
    )
  }

  function doMove(dr: number, dc: number) {
    const s = stateRef.current
    if (!s || winningRef.current) return

    const nr = s.player.r + dr
    const nc = s.player.c + dc

    if (nr < 0 || nr >= s.rows || nc < 0 || nc >= s.cols || s.grid[nr][nc] === 'wall') {
      audio.sokobanWall()
      return
    }

    const nk = pk(nr, nc)

    if (s.boxes.has(nk)) {
      const br = nr + dr
      const bc = nc + dc
      if (
        br < 0 || br >= s.rows || bc < 0 || bc >= s.cols ||
        s.grid[br][bc] === 'wall' || s.boxes.has(pk(br, bc))
      ) {
        audio.sokobanWall()
        return
      }

      histRef.current.push({ player: { ...s.player }, boxes: new Set(s.boxes) })

      const wasOnGoal = s.goals.has(nk)
      s.boxes.delete(nk)
      const bk = pk(br, bc)
      s.boxes.add(bk)
      const nowOnGoal = s.goals.has(bk)

      s.player = { r: nr, c: nc }
      movesRef.current++

      const pan = s.cols > 1 ? (bc / (s.cols - 1)) * 2 - 1 : 0
      audio.sokobanPush(pan)
      if (nowOnGoal) {
        setTimeout(() => audio.sokobanGoal(), 65)
        polite('Caja en meta')
      } else if (wasOnGoal) {
        audio.sokobanOffGoal()
      }

      doRender()
      if (checkWin(s)) handleWin()
    } else {
      histRef.current.push({ player: { ...s.player }, boxes: new Set(s.boxes) })
      s.player = { r: nr, c: nc }
      movesRef.current++

      const pan = s.cols > 1 ? (nc / (s.cols - 1)) * 2 - 1 : 0
      audio.sokobanStep(pan)
      doRender()
    }
  }

  function doUndo() {
    const s = stateRef.current
    if (!s || histRef.current.length === 0) {
      assertive('Sin movimientos para deshacer')
      return
    }
    const prev = histRef.current.pop()!
    s.player = prev.player
    s.boxes = prev.boxes
    movesRef.current = Math.max(0, movesRef.current - 1)
    audio.sokobanUndo()
    doRender()
  }

  function doRestart() {
    doLoadLevel(levelIdxRef.current)
    assertive('Nivel reiniciado')
  }

  function doNextLevel() {
    if (levelIdxRef.current >= LEVELS_RAW.length - 1) {
      assertive('Es el último nivel')
      return
    }
    levelIdxRef.current++
    doLoadLevel(levelIdxRef.current)
  }

  function doScan() {
    const s = stateRef.current
    if (!s) return

    const { r, c } = s.player
    const parts: string[] = []

    const DIRS = [
      { dr: -1, dc: 0, name: 'Norte' },
      { dr: 1,  dc: 0, name: 'Sur' },
      { dr:  0, dc: -1, name: 'Oeste' },
      { dr:  0, dc:  1, name: 'Este' },
    ]

    for (const { dr, dc, name } of DIRS) {
      let dist = 1
      let found = 'libre'
      while (dist <= Math.max(s.rows, s.cols)) {
        const rr = r + dr * dist
        const cc = c + dc * dist
        if (rr < 0 || rr >= s.rows || cc < 0 || cc >= s.cols) break
        const key2 = pk(rr, cc)
        if (s.grid[rr][cc] === 'wall') { found = `pared a ${dist}`; break }
        if (s.boxes.has(key2)) {
          found = `caja${s.goals.has(key2) ? ' en meta' : ''} a ${dist}`; break
        }
        if (s.grid[rr][cc] === 'goal') { found = `meta a ${dist}`; break }
        dist++
      }
      parts.push(`${name}: ${found}.`)
    }

    let onGoals = 0
    for (const b of s.boxes) if (s.goals.has(b)) onGoals++
    parts.push(`Cajas colocadas: ${onGoals} de ${s.goals.size}.`)
    parts.push(`Movimientos: ${movesRef.current}.`)

    assertive(parts.join(' '))
  }

  function startGame() {
    levelIdxRef.current = 0
    totalScoreRef.current = 0
    setPhaseSync('playing')
    setTimeout(() => {
      doLoadLevel(0)
      canvasRef.current?.focus()
    }, 50)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ph = phaseRef.current
      if (ph === 'start') {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame() }
        return
      }
      if (ph === 'won') return

      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); doMove(-1,  0); break
        case 'ArrowDown':  case 's': case 'S': e.preventDefault(); doMove( 1,  0); break
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); doMove( 0, -1); break
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); doMove( 0,  1); break
        case 'z': case 'Z': e.preventDefault(); doUndo(); break
        case 'r': case 'R': e.preventDefault(); doRestart(); break
        case 'n': case 'N': e.preventDefault(); doNextLevel(); break
        case 'e': case 'E': e.preventDefault(); doScan(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4 gap-6">
      <div ref={assertRef} role="status" aria-live="assertive" aria-atomic="true" className="sr-only" />
      <div ref={politeRef} role="status" aria-live="polite"    aria-atomic="true" className="sr-only" />

      <h1 className="text-2xl font-bold text-[#ffd700]">Sokoban</h1>

      {phase === 'start' && (
        <div className="text-center space-y-4 max-w-md">
          <p className="text-[#aaa]">
            Empuja las cajas marrones hasta las metas doradas. Cuando todas las cajas estén en su meta, el nivel se completa.
          </p>
          <p className="text-[#666] text-sm leading-relaxed">
            Flechas o WASD: mover / empujar<br />
            Z: deshacer último movimiento<br />
            R: reiniciar nivel<br />
            N: saltar al siguiente nivel<br />
            E: explorar el entorno (descripción por voz)
          </p>
          <button
            className="px-6 py-3 bg-[#ffd700] text-black font-bold rounded hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffd700] focus:ring-offset-2 focus:ring-offset-black"
            onClick={startGame}
            autoFocus
          >
            Empezar (Enter)
          </button>
        </div>
      )}

      {phase === 'playing' && (
        <div className="flex flex-col items-center gap-3">
          <canvas
            ref={canvasRef}
            width={CANVAS}
            height={CANVAS}
            aria-hidden="true"
            tabIndex={-1}
            className="border border-[#333] rounded"
            style={{ maxWidth: '100%' }}
          />
          <p className="text-[#555] text-xs text-center">
            Flechas/WASD: mover · Z: deshacer · R: reiniciar · N: siguiente nivel · E: explorar
          </p>
        </div>
      )}

      {phase === 'won' && (
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-xl text-[#ffd700]">¡Enhorabuena! Has completado todos los niveles.</p>
          <p className="text-2xl font-bold">Puntuación: {totalScoreRef.current}</p>
          <button
            className="px-6 py-3 bg-[#ffd700] text-black font-bold rounded hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffd700] focus:ring-offset-2 focus:ring-offset-black"
            onClick={() => { totalScoreRef.current = 0; setPhaseSync('start') }}
            autoFocus
          >
            Jugar de nuevo
          </button>
        </div>
      )}
    </div>
  )
}
