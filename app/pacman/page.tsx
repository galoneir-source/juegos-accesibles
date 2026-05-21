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
const PAC_MS    = 210   // ms per Pac-Man step  (was 165 — slowed for blind play)
const GHOST_MS  = 370   // ms per ghost step (normal)  (was 230)
const SCARED_MS = 620   // ms per ghost step (scared)  (was 420)
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
  const pelletTimerRef = useRef(0)
  const ghostEatRef    = useRef(0)
  const wallBlockedRef = useRef(false)  // edge-trigger: only beep on first wall contact

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

    // Wall feedback: only when player tried to change direction and it's blocked
    const reqChanged  = req.dr !== cur.dr || req.dc !== cur.dc
    const reqIsWalled = reqChanged && blocked(grid, r + req.dr, c + req.dc)
    if (reqIsWalled && !wallBlockedRef.current) audio.pacWall()
    wallBlockedRef.current = reqIsWalled

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

    // Junction cue: 3+ open paths at new position
    const openPaths = DIRS.filter(d => !blocked(grid, nr + d.dr, nc + d.dc)).length
    if (openPaths >= 3) audio.pacJunction()

    // Forward dot sonar: brief ping whose pitch = dot count in next 4 cells ahead
    const fwd = pacDirRef.current
    let dotsFwd = 0
    for (let i = 1; i <= 4; i++) {
      const sr = nr + fwd.dr * i, sc = nc + fwd.dc * i
      if (blocked(grid, sr, sc)) break
      if (grid[sr]?.[sc] === DOT || grid[sr]?.[sc] === POWER) dotsFwd++
    }
    audio.pacDotSonar(dotsFwd)

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
      // 28% random movement so the player has breathing room
      const useRandom = Math.random() < 0.28
      const step = useRandom
        ? null
        : bfsNext(g.row, g.col, pacRowRef.current, pacColRef.current, grid)
      if (step) {
        g.dir = { dr: step[0] - g.row, dc: step[1] - g.col }
        g.row = step[0]
        g.col = step[1]
      } else {
        const d = randomDir(g.row, g.col, grid, g.dir)
        g.dir = d
        g.row += d.dr
        g.col += d.dc
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

    // Periodic ghost radar (egocentric: pan and freq relative to Pac-Man)
    scanTimerRef.current += dt
    if (scanTimerRef.current >= 600) {
      scanTimerRef.current = 0
      const pr = pacRowRef.current, pc = pacColRef.current
      ghostsRef.current.forEach(g => {
        if (g.dead) return
        const dx   = g.col - pc
        const dy   = g.row - pr
        const dist = Math.abs(dx) + Math.abs(dy)
        const gain = Math.max(0, 0.38 - dist * 0.028)
        if (gain < 0.04) return
        const pan  = Math.max(-1, Math.min(1, dx / 5))
        // Frequency encodes vertical direction: ghost above → higher pitch
        const freq = g.scared
          ? Math.max(350, Math.min(700, 520 - dy * 18))
          : Math.max(180, Math.min(420, 300 - dy * 14))
        audio.pacGhostPulse(pan, freq, gain, g.scared)
      })
    }

    // Power-pellet beacon — soft pulse toward nearest uncollected pellet
    pelletTimerRef.current += dt
    if (pelletTimerRef.current >= 900) {
      pelletTimerRef.current = 0
      if (powerTimerRef.current <= 0) {
        const pr = pacRowRef.current, pc = pacColRef.current
        let nearDist = Infinity, nearPan = 0
        const grid2 = gridRef.current
        for (let r2 = 0; r2 < ROWS; r2++) {
          for (let c2 = 0; c2 < COLS; c2++) {
            if (grid2[r2]?.[c2] === POWER) {
              const d2 = Math.abs(r2 - pr) + Math.abs(c2 - pc)
              if (d2 < nearDist) { nearDist = d2; nearPan = Math.max(-1, Math.min(1, (c2 - pc) / 5)) }
            }
          }
        }
        if (nearDist < 12) {
          audio.pacPelletBeacon(nearPan, Math.max(0.06, 0.28 - nearDist * 0.02))
        }
      }
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
    powerTimerRef.current = 0; scanTimerRef.current = 0; pelletTimerRef.current = 0
    ghostEatRef.current = 0; wallBlockedRef.current = false

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
        case 'e': case 'E': {
          e.preventDefault()
          const pr = pacRowRef.current, pc = pacColRef.current
          const grid = gridRef.current
          const parts: string[] = []

          // Helper: scan a direction, return dot count and wall distance
          function scanDir(dr: number, dc: number) {
            let dots = 0, wallAt = 0
            for (let i = 1; i <= 8; i++) {
              const nr2 = pr + dr * i, nc2 = pc + dc * i
              if (blocked(grid, nr2, nc2)) { wallAt = i; break }
              if (grid[nr2]?.[nc2] === DOT || grid[nr2]?.[nc2] === POWER) dots++
            }
            return { dots, wallAt }
          }

          // Directions: play audio sweep then build text
          const SCAN_DIRS = [
            { dr: -1, dc:  0, name: 'Norte', pan:  0.0  },
            { dr:  1, dc:  0, name: 'Sur',   pan:  0.0  },
            { dr:  0, dc: -1, name: 'Oeste', pan: -1.0  },
            { dr:  0, dc:  1, name: 'Este',  pan:  1.0  },
          ]
          let delay = 0
          for (const sd of SCAN_DIRS) {
            const { dots, wallAt } = scanDir(sd.dr, sd.dc)
            if (wallAt === 1) {
              parts.push(`${sd.name}: pared.`)
            } else {
              const wallTxt = wallAt > 0 ? `, pared a ${wallAt}` : ''
              parts.push(`${sd.name}: ${dots > 0 ? `${dots} punto${dots > 1 ? 's' : ''}` : 'vacío'}${wallTxt}.`)
              setTimeout(() => audio.pacDotScan(sd.pan, dots), delay)
              delay += 180
            }
          }

          // Nearest power pellet
          let nearDist2 = Infinity, nearDir2 = ''
          for (let r2 = 0; r2 < ROWS; r2++) {
            for (let c2 = 0; c2 < COLS; c2++) {
              if (grid[r2]?.[c2] === POWER) {
                const d2 = Math.abs(r2 - pr) + Math.abs(c2 - pc)
                if (d2 < nearDist2) {
                  nearDist2 = d2
                  const dx2 = c2 - pc, dy2 = r2 - pr
                  nearDir2 = Math.abs(dx2) >= Math.abs(dy2)
                    ? (dx2 > 0 ? 'este' : 'oeste')
                    : (dy2 < 0 ? 'norte' : 'sur')
                }
              }
            }
          }
          if (nearDist2 < Infinity) parts.push(`Pastilla de poder al ${nearDir2}, ${nearDist2} casillas.`)

          // Ghosts (egocentric)
          ghostsRef.current.forEach((g, i) => {
            if (g.dead) { parts.push(`Fantasma ${i + 1}: comido, reaparecerá pronto.`); return }
            const dx = g.col - pc, dy = g.row - pr
            const dist = Math.abs(dx) + Math.abs(dy)
            const side = Math.abs(dx) >= Math.abs(dy)
              ? (dx > 0 ? 'este' : 'oeste')
              : (dy < 0 ? 'norte' : 'sur')
            const pan2  = Math.max(-1, Math.min(1, dx / 5))
            const freq2 = g.scared
              ? Math.max(350, Math.min(700, 520 - dy * 18))
              : Math.max(180, Math.min(420, 300 - dy * 14))
            setTimeout(() => audio.pacGhostPulse(pan2, freq2, 0.35, g.scared), delay)
            delay += 160
            parts.push(`Fantasma ${i + 1}${g.scared ? ' asustado' : ''}: al ${side}, ${dist} casillas.`)
          })

          announceAssertive(parts.join(' '))
          break
        }
        case 'r': case 'R': {
          const pr2 = pacRowRef.current, pc2 = pacColRef.current
          const grid2 = gridRef.current
          // Dot count in each open direction
          const dirInfo: string[] = []
          const RKEY_DIRS = [
            { dr: -1, dc: 0, name: 'norte' },
            { dr:  1, dc: 0, name: 'sur'   },
            { dr:  0, dc:-1, name: 'oeste' },
            { dr:  0, dc: 1, name: 'este'  },
          ]
          for (const d2 of RKEY_DIRS) {
            if (blocked(grid2, pr2 + d2.dr, pc2 + d2.dc)) continue
            let dots2 = 0
            for (let i = 1; i <= 6; i++) {
              const nr2 = pr2 + d2.dr * i, nc2 = pc2 + d2.dc * i
              if (blocked(grid2, nr2, nc2)) break
              if (grid2[nr2]?.[nc2] === DOT || grid2[nr2]?.[nc2] === POWER) dots2++
            }
            dirInfo.push(`${d2.name}: ${dots2}`)
          }
          announcePolite(
            `Fila ${pr2 + 1}, columna ${pc2 + 1}. ` +
            `Puntos por dirección: ${dirInfo.join(', ')}. ` +
            `Total restante: ${dotsRef.current}. Vidas: ${livesRef.current}. ` +
            (powerTimerRef.current > 0 ? `Poder: ${Math.ceil(powerTimerRef.current / 1000)}s.` : '')
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
