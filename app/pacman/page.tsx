'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── Board ─────────────────────────────────────────────────────────────────────
const COLS = 19
const ROWS = 19
const CELL = 28
const W = COLS * CELL   // 532
const H = ROWS * CELL   // 532

const WALL  = 0
const EMPTY = 1
const DOT   = 2
const POWER = 3

// ── Timing ────────────────────────────────────────────────────────────────────
const PAC_MS    = 165   // ms per Pac-Man step
const GHOST_MS  = 230   // ms per ghost step (normal)
const SCARED_MS = 420   // ms per ghost step (scared)
const POWER_MS  = 8000  // scared duration ms
const DEATH_MS  = 1400  // death animation ms

// ── Positions ─────────────────────────────────────────────────────────────────
const PAC_START:    [number, number]   = [9, 9]
const GHOST_STARTS: [number, number][] = [[3, 9], [15, 9]]
const GHOST_COLORS = ['#ef4444', '#f9a8d4']

// ── Maze (19 cols × 19 rows) ──────────────────────────────────────────────────
// Verified: each row = exactly 19 chars
// Row 9 (middle): walls at cols 0,6,12,18 — Pac-Man at col 9 is a dot ✓
// Ghost starts: row 3 col 9 = dot ✓, row 15 col 9 = dot ✓
const MAZE_DEF = [
  '###################',  // 0
  '#o.....#.....#...o#',  // 1
  '#.###.##.###.##.###',  // 2
  '#.#.........#.#...#',  // 3
  '#.###.###.#.###.###',  // 4
  '#...........#.....#',  // 5
  '###.###.#.#.###.###',  // 6
  '#.#.#.......#.#.#.#',  // 7
  '#.#.##.#.#.#.##.#.#',  // 8
  '#.....#.....#.....#',  // 9  ← Pac-Man row
  '#.#.##.#.#.#.##.#.#',  // 10
  '#.#.#.......#.#.#.#',  // 11
  '###.###.#.#.###.###',  // 12
  '#...........#.....#',  // 13
  '#.###.###.#.###.###',  // 14
  '#.#.........#.#...#',  // 15
  '#.###.##.###.##.###',  // 16
  '#o.....#.....#...o#',  // 17
  '###################',  // 18
]

const DIRS = [
  { dr: -1, dc:  0 },  // up
  { dr:  1, dc:  0 },  // down
  { dr:  0, dc: -1 },  // left
  { dr:  0, dc:  1 },  // right
]

const KEY_DIR: Record<string, { dr: number; dc: number }> = {
  ArrowUp: DIRS[0], w: DIRS[0], W: DIRS[0],
  ArrowDown: DIRS[1], s: DIRS[1], S: DIRS[1],
  ArrowLeft: DIRS[2], a: DIRS[2], A: DIRS[2],
  ArrowRight: DIRS[3], d: DIRS[3], D: DIRS[3],
}

const INSTRUCTIONS =
  'Pac-Man. Come todos los puntos del laberinto con las flechas o WASD. ' +
  'Evita los dos fantasmas: si te atrapan pierdes una vida. ' +
  'Come las cuatro pastillas de poder, los puntos grandes en las esquinas, ' +
  'para asustar a los fantasmas y poder comérselos durante 8 segundos. ' +
  'Los fantasmas suenan en estéreo según su posición. ' +
  'Tecla E: escuchar la posición de cada fantasma ahora mismo. ' +
  'R: leer estado. H: repetir instrucciones.'

// ── Pure helpers ──────────────────────────────────────────────────────────────

function parseMAZE(): number[][] {
  return MAZE_DEF.map(row =>
    row.split('').map(c =>
      c === '#' ? WALL : c === 'o' ? POWER : c === ' ' ? EMPTY : DOT
    )
  )
}

function countDots(grid: number[][]): number {
  return grid.flat().filter(c => c === DOT || c === POWER).length
}

function blocked(grid: number[][], r: number, c: number): boolean {
  return !grid[r] || grid[r][c] === WALL
}

// BFS: next cell toward goal. Returns [nextRow, nextCol] or null.
function bfsNext(
  sr: number, sc: number,
  gr: number, gc: number,
  grid: number[][]
): [number, number] | null {
  if (sr === gr && sc === gc) return null
  const visited = new Uint8Array(ROWS * COLS)
  visited[sr * COLS + sc] = 1
  const queue: Array<{ r: number; c: number; first: [number, number] | null }> = [
    { r: sr, c: sc, first: null },
  ]
  while (queue.length) {
    const { r, c, first } = queue.shift()!
    for (const d of DIRS) {
      const nr = r + d.dr, nc = c + d.dc
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue
      if (visited[nr * COLS + nc]) continue
      if (blocked(grid, nr, nc)) continue
      const step: [number, number] = first ?? [nr, nc]
      if (nr === gr && nc === gc) return step
      visited[nr * COLS + nc] = 1
      queue.push({ r: nr, c: nc, first: step })
    }
  }
  return null
}

// Random valid direction (prefer not reversing)
function randomDir(
  r: number, c: number,
  grid: number[][],
  curDir: { dr: number; dc: number }
): { dr: number; dc: number } {
  const fwd = DIRS.filter(
    d => !(d.dr === -curDir.dr && d.dc === -curDir.dc) && !blocked(grid, r + d.dr, c + d.dc)
  )
  const any = DIRS.filter(d => !blocked(grid, r + d.dr, c + d.dc))
  const pool = fwd.length ? fwd : any
  return pool[Math.floor(Math.random() * pool.length)] ?? DIRS[0]
}

// ── Component ─────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'playing' | 'lost' | 'won'

interface Ghost {
  row: number; col: number
  startRow: number; startCol: number
  scared: boolean; dead: boolean; deadTimer: number
  dir: { dr: number; dc: number }
  colorIdx: number
}

export default function PacManPage() {
  const [phase,     setPhase]     = useState<Phase>('idle')
  const [score,     setScore]     = useState(0)
  const [lives,     setLives]     = useState(3)
  const [dotsLeft,  setDotsLeft]  = useState(0)
  const [saved,     setSaved]     = useState(false)
  const [saveError, setSaveError] = useState('')

  const phaseRef = useRef<Phase>('idle')
  const scoreRef = useRef(0)
  const livesRef = useRef(3)

  const gridRef      = useRef<number[][]>([])
  const dotsRef      = useRef(0)

  // Pac-Man
  const pacRowRef = useRef(PAC_START[0])
  const pacColRef = useRef(PAC_START[1])
  const pacDirRef = useRef(DIRS[3])
  const reqDirRef = useRef(DIRS[3])
  const pacAlive  = useRef(true)
  const chompRef  = useRef(0)
  const deathRef  = useRef(0)   // death animation countdown

  // Ghosts
  const ghostsRef = useRef<Ghost[]>([])

  // Timers
  const rafRef         = useRef(0)
  const lastTimeRef    = useRef(0)
  const pacTimerRef    = useRef(0)
  const ghostTimerRef  = useRef(0)
  const powerTimerRef  = useRef(0)
  const scanTimerRef   = useRef(0)
  const ghostEatRef    = useRef(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  const syncPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  function buildGhosts(): Ghost[] {
    return GHOST_STARTS.map((pos, i) => ({
      row: pos[0], col: pos[1],
      startRow: pos[0], startCol: pos[1],
      scared: false, dead: false, deadTimer: 0,
      dir: DIRS[i === 0 ? 1 : 0],
      colorIdx: i,
    }))
  }

  // ── Pac-Man step ────────────────────────────────────────────────────────────

  function stepPac() {
    if (!pacAlive.current) return
    const grid  = gridRef.current
    const r     = pacRowRef.current
    const c     = pacColRef.current
    const req   = reqDirRef.current
    const cur   = pacDirRef.current

    let moved = false
    for (const dir of [req, cur]) {
      const nr = r + dir.dr, nc = c + dir.dc
      if (!blocked(grid, nr, nc)) {
        if (dir === req) pacDirRef.current = dir
        pacRowRef.current = nr
        pacColRef.current = nc
        moved = true
        break
      }
    }
    if (!moved) return

    chompRef.current++

    const nr = pacRowRef.current, nc = pacColRef.current
    const cell = grid[nr][nc]

    if (cell === DOT) {
      grid[nr][nc] = EMPTY
      scoreRef.current += 10
      dotsRef.current--
      setScore(scoreRef.current)
      setDotsLeft(dotsRef.current)
      audio.pacChompDot()
      if (dotsRef.current <= 0) {
        syncPhase('won')
        audio.correct()
        announceAssertive(`¡Laberinto despejado! Puntuación: ${scoreRef.current}.`)
        return
      }
    } else if (cell === POWER) {
      grid[nr][nc] = EMPTY
      scoreRef.current += 50
      dotsRef.current--
      setScore(scoreRef.current)
      setDotsLeft(dotsRef.current)
      powerTimerRef.current = POWER_MS
      ghostEatRef.current   = 0
      ghostsRef.current.forEach(g => { if (!g.dead) g.scared = true })
      audio.pacPower()
      announceAssertive('¡Poder activado! Fantasmas asustados 8 segundos.')
    }
  }

  // ── Ghost step ──────────────────────────────────────────────────────────────

  function stepGhost(g: Ghost) {
    if (g.dead) return
    const grid = gridRef.current

    if (g.scared) {
      const d = randomDir(g.row, g.col, grid, g.dir)
      g.dir = d
      g.row += d.dr
      g.col += d.dc
    } else {
      const step = bfsNext(g.row, g.col, pacRowRef.current, pacColRef.current, grid)
      if (step) {
        g.dir = { dr: step[0] - g.row, dc: step[1] - g.col }
        g.row = step[0]
        g.col = step[1]
      }
    }
  }

  // ── Collision check ─────────────────────────────────────────────────────────

  function checkCollisions() {
    if (!pacAlive.current || phaseRef.current !== 'playing') return
    const pr = pacRowRef.current, pc = pacColRef.current

    for (const g of ghostsRef.current) {
      if (g.dead) continue
      if (g.row !== pr || g.col !== pc) continue

      if (g.scared) {
        g.dead    = true
        g.scared  = false
        g.deadTimer = 3000
        const pts = 200 * (1 << ghostEatRef.current)
        ghostEatRef.current++
        scoreRef.current += pts
        setScore(scoreRef.current)
        audio.pacEatGhost()
        announceAssertive(`¡Fantasma comido! +${pts} puntos.`)
      } else {
        pacAlive.current = false
        deathRef.current = DEATH_MS
        audio.pacDie()
        const nl = livesRef.current - 1
        livesRef.current = nl
        setLives(nl)
        if (nl <= 0) {
          setTimeout(() => {
            if (phaseRef.current !== 'playing') return
            syncPhase('lost')
            audio.gameOver()
            announceAssertive(`Sin vidas. Puntuación final: ${scoreRef.current}.`)
          }, DEATH_MS)
        } else {
          announceAssertive(`Atrapado. ${nl} ${nl === 1 ? 'vida restante' : 'vidas restantes'}.`)
          setTimeout(() => {
            pacRowRef.current = PAC_START[0]
            pacColRef.current = PAC_START[1]
            pacDirRef.current = DIRS[3]
            reqDirRef.current = DIRS[3]
            ghostsRef.current.forEach((g2, i) => {
              g2.row = GHOST_STARTS[i][0]; g2.col = GHOST_STARTS[i][1]
              g2.scared = false; g2.dead = false; g2.deadTimer = 0
            })
            powerTimerRef.current = 0
            pacAlive.current = true
            deathRef.current = 0
            lastTimeRef.current = performance.now()
            pacTimerRef.current = 0; ghostTimerRef.current = 0
          }, DEATH_MS)
        }
        return
      }
    }
  }

  // ── Draw ────────────────────────────────────────────────────────────────────

  function draw(ctx: CanvasRenderingContext2D, now: number) {
    const grid = gridRef.current
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    // Cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL, y = r * CELL
        switch (grid[r]?.[c]) {
          case WALL:
            ctx.fillStyle = '#1e3a8a'
            ctx.fillRect(x, y, CELL, CELL)
            ctx.fillStyle = '#1d4ed8'
            ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4)
            break
          case DOT:
            ctx.fillStyle = '#fde68a'
            ctx.beginPath()
            ctx.arc(x + CELL / 2, y + CELL / 2, 3, 0, Math.PI * 2)
            ctx.fill()
            break
          case POWER: {
            const pulse = Math.sin(now / 200) * 2
            ctx.fillStyle = '#fde68a'
            ctx.beginPath()
            ctx.arc(x + CELL / 2, y + CELL / 2, 7 + pulse, 0, Math.PI * 2)
            ctx.fill()
            break
          }
        }
      }
    }

    // Ghosts
    const powerFlash =
      powerTimerRef.current > 0 &&
      powerTimerRef.current < 2500 &&
      Math.floor(now / 250) % 2 === 0

    ghostsRef.current.forEach(g => {
      if (g.dead) return
      const gx = g.col * CELL + CELL / 2
      const gy = g.row * CELL + CELL / 2
      const r  = CELL / 2 - 3
      const scared = g.scared
      const color = scared
        ? (powerFlash ? '#fff' : '#3b82f6')
        : GHOST_COLORS[g.colorIdx]

      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(gx, gy - 2, r, Math.PI, 0)
      ctx.lineTo(gx + r, gy + r - 1)
      // 3 wavy bumps at bottom
      for (let b = 2; b >= 0; b--) {
        const bx = gx - r + (3 - b) * (r * 2 / 3)
        ctx.quadraticCurveTo(bx - r / 3, gy + r + 4, bx - r * 2 / 3, gy + r - 1)
      }
      ctx.lineTo(gx - r, gy - 2)
      ctx.closePath()
      ctx.fill()

      if (!scared) {
        ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(gx - 5, gy - 4, 3.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(gx + 5, gy - 4, 3.5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#1e3a8a'
        ctx.beginPath(); ctx.arc(gx - 5 + g.dir.dc * 2, gy - 4 + g.dir.dr * 2, 2, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(gx + 5 + g.dir.dc * 2, gy - 4 + g.dir.dr * 2, 2, 0, Math.PI * 2); ctx.fill()
      }
    })

    // Pac-Man
    if (pacAlive.current) {
      const px  = pacColRef.current * CELL + CELL / 2
      const py  = pacRowRef.current * CELL + CELL / 2
      const rot = Math.atan2(pacDirRef.current.dr, pacDirRef.current.dc)
      const mouth = (chompRef.current % 2 === 0 ? 0.22 : 0.04) * Math.PI

      ctx.fillStyle = '#fbbf24'
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.arc(px, py, CELL / 2 - 3, rot + mouth, rot + Math.PI * 2 - mouth)
      ctx.closePath()
      ctx.fill()
    } else if (deathRef.current > 0) {
      const pct = deathRef.current / DEATH_MS
      const px  = pacColRef.current * CELL + CELL / 2
      const py  = pacRowRef.current * CELL + CELL / 2
      ctx.fillStyle = `rgba(251,191,36,${pct})`
      ctx.beginPath()
      ctx.arc(px, py, (CELL / 2 - 3) * pct, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ── Main tick ────────────────────────────────────────────────────────────────

  const tick = useCallback((now: number) => {
    if (phaseRef.current !== 'playing') return

    const dt = Math.min(now - lastTimeRef.current, 50)
    lastTimeRef.current = now

    // Death animation countdown
    if (deathRef.current > 0) {
      deathRef.current = Math.max(0, deathRef.current - dt)
    }

    // Power timer
    if (powerTimerRef.current > 0) {
      powerTimerRef.current -= dt
      if (powerTimerRef.current <= 0) {
        powerTimerRef.current = 0
        ghostsRef.current.forEach(g => { g.scared = false })
        announcePolite('Poder agotado. Cuidado.')
      }
    }

    // Ghost respawn
    ghostsRef.current.forEach(g => {
      if (!g.dead) return
      g.deadTimer -= dt
      if (g.deadTimer <= 0) {
        g.dead = false; g.deadTimer = 0
        g.row = g.startRow; g.col = g.startCol
        g.scared = powerTimerRef.current > 0
      }
    })

    // Pac-Man step
    pacTimerRef.current += dt
    if (pacTimerRef.current >= PAC_MS) {
      pacTimerRef.current = 0
      stepPac()
      if (phaseRef.current === 'playing') checkCollisions()
    }

    // Ghost step
    ghostTimerRef.current += dt
    const gInterval = ghostsRef.current.some(g => g.scared && !g.dead) ? SCARED_MS : GHOST_MS
    if (ghostTimerRef.current >= gInterval) {
      ghostTimerRef.current = 0
      ghostsRef.current.forEach(g => stepGhost(g))
      if (phaseRef.current === 'playing') checkCollisions()
    }

    // Periodic ghost audio scan
    scanTimerRef.current += dt
    if (scanTimerRef.current >= 1100) {
      scanTimerRef.current = 0
      ghostsRef.current.forEach(g => {
        if (g.dead) return
        const pan = (g.col / (COLS - 1)) * 2 - 1
        g.scared ? audio.frogLog(pan) : audio.frogDanger(pan)
      })
    }

    const canvas = canvasRef.current
    if (canvas) draw(canvas.getContext('2d')!, now)

    rafRef.current = requestAnimationFrame(tick)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncPhase])

  // ── Start ────────────────────────────────────────────────────────────────────

  function startGame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const grid  = parseMAZE()
    const total = countDots(grid)
    gridRef.current  = grid
    dotsRef.current  = total
    scoreRef.current = 0
    livesRef.current = 3

    pacRowRef.current = PAC_START[0]; pacColRef.current = PAC_START[1]
    pacDirRef.current = DIRS[3];      reqDirRef.current = DIRS[3]
    pacAlive.current  = true;         chompRef.current  = 0
    deathRef.current  = 0

    ghostsRef.current = buildGhosts()
    pacTimerRef.current = 0; ghostTimerRef.current = 0
    powerTimerRef.current = 0; scanTimerRef.current = 0; ghostEatRef.current = 0

    setScore(0); setLives(3); setDotsLeft(total)
    setSaved(false); setSaveError('')
    syncPhase('playing')
    audio.start()
    lastTimeRef.current = performance.now()
    announcePolite(`Pac-Man. Come ${total} puntos. Dos fantasmas te persiguen.`)
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'playing') return

    function onKey(e: KeyboardEvent) {
      const d = KEY_DIR[e.key]
      if (d) { e.preventDefault(); reqDirRef.current = d; return }

      switch (e.key) {
        case 'e': case 'E':
          e.preventDefault()
          ghostsRef.current.forEach((g, i) => {
            if (g.dead) {
              announcePolite(`Fantasma ${i + 1} comido, reaparecerá pronto.`)
              return
            }
            const pan  = (g.col / (COLS - 1)) * 2 - 1
            g.scared ? audio.frogLog(pan) : audio.frogDanger(pan)
            const side = g.col < pacColRef.current - 2 ? 'izquierda'
                       : g.col > pacColRef.current + 2 ? 'derecha' : 'cerca'
            const dist = Math.abs(g.row - pacRowRef.current) + Math.abs(g.col - pacColRef.current)
            announcePolite(
              `Fantasma ${i + 1} ${g.scared ? 'asustado' : ''} a ${dist} casillas al ${side}.`
            )
          })
          break
        case 'r': case 'R':
          announcePolite(
            `Puntos: ${scoreRef.current}. Vidas: ${livesRef.current}. ` +
            `Puntos restantes: ${dotsRef.current}. ` +
            (powerTimerRef.current > 0 ? `Poder: ${Math.ceil(powerTimerRef.current / 1000)}s.` : 'Sin poder activo.')
          )
          break
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
    const result = await saveScore('pacman', scoreRef.current)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── Screens ──────────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Pac-Man" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Pac-Man</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame} className="w-full">Jugar</Button>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Pac-Man" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl font-bold" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Laberinto despejado!' : 'Game Over'}
          </h2>
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
          {!saved ? (
            <>
              <Button onClick={handleSave}>Guardar puntuación</Button>
              {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
            </>
          ) : <p role="status" className="text-[#22c55e]">Guardado.</p>}
          <Button onClick={startGame}>Jugar de nuevo</Button>
        </div>
      </GameShell>
    )
  }

  return (
    <GameShell title="Pac-Man" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-3">
        <div className="flex justify-between text-sm font-mono">
          <span>
            Vidas:{' '}
            <strong className="text-[#22c55e]">
              {Array.from({ length: lives }, (_, i) => <span key={i} aria-hidden="true">♥</span>)}
              <span className="sr-only">{lives}</span>
            </strong>
          </span>
          <span>Puntos restantes: <strong className="text-[#ffd700]">{dotsLeft}</strong></span>
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-hidden="true"
          className="block mx-auto border border-[#333] rounded bg-black"
          style={{ maxWidth: '100%' }}
        />
        <p className="text-xs text-[#555] text-center">
          ↑ ↓ ← → / WASD — moverse &nbsp;|&nbsp; E — ubicar fantasmas &nbsp;|&nbsp; R — estado &nbsp;|&nbsp; H — instrucciones
        </p>
      </div>
    </GameShell>
  )
}
