'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── Canvas ────────────────────────────────────────────────────────────────────
const W = 560
const H = 420

// ── Player ────────────────────────────────────────────────────────────────────
const PLAYER_W = 44
const PLAYER_H = 12
const PLAYER_Y = H - 36
const PLAYER_SPEED = 4

// ── Player bullet ─────────────────────────────────────────────────────────────
const BULLET_W = 3
const BULLET_H = 14
const BULLET_SPEED = 10

// ── Alien grid ────────────────────────────────────────────────────────────────
const COLS = 10
const ROWS = 4
const CELL_W = 48    // per alien cell (alien + gap)
const CELL_H = 30
const ALIEN_W = 32
const ALIEN_H = 18
const GRID_X0 = (W - COLS * CELL_W) / 2   // = 40
const GRID_Y0 = 44
const GRID_STEP = 16  // drop pixels per reversal
const GRID_MARGIN = 8

// ── Alien bullet ─────────────────────────────────────────────────────────────
const ABUL_W = 3
const ABUL_H = 10
const ABUL_SPEED = 3.5

// ── Points per row (top → bottom) ────────────────────────────────────────────
const ROW_POINTS = [30, 20, 20, 10]
const TOTAL_ALIENS = ROWS * COLS

// ── Invincibility window after player hit (ms) ────────────────────────────────
const INVINCIBLE_MS = 1200

type Phase = 'idle' | 'playing' | 'won' | 'lost'

interface Level {
  name: string
  baseMarchMs: number
  shootIntervalMs: number
  maxAlienBullets: number
  scoreMultiplier: number
  practice: boolean
}

const LEVELS: Level[] = [
  { name: 'Práctica', baseMarchMs: 1100, shootIntervalMs: Infinity, maxAlienBullets: 0, scoreMultiplier: 0, practice: true },
  { name: 'Fácil',   baseMarchMs: 950,  shootIntervalMs: 2800, maxAlienBullets: 1, scoreMultiplier: 1, practice: false },
  { name: 'Medio',   baseMarchMs: 650,  shootIntervalMs: 1600, maxAlienBullets: 2, scoreMultiplier: 2, practice: false },
  { name: 'Difícil', baseMarchMs: 420,  shootIntervalMs: 900,  maxAlienBullets: 3, scoreMultiplier: 3, practice: false },
]

const INSTRUCTIONS =
  'Space Invaders. Mueve tu nave con las flechas izquierda y derecha, o las teclas A y D. ' +
  'Pulsa Espacio para disparar. Solo puedes tener un disparo en vuelo a la vez. ' +
  'Destruye todos los alienígenas antes de que lleguen a tu posición. ' +
  'La marcha de los aliens suena en estéreo: el canal izquierdo o derecho indica dónde está el grupo. ' +
  'Cuando un alien dispara también lo oyes en su posición. ' +
  'Tecla E: escuchar primero un pitido con la posición de tu nave y después la marcha con la posición de los aliens. ' +
  'El disparo también suena en estéreo según dónde esté tu nave. ' +
  'Tienes 3 vidas. R: leer posición de nave y estado. H: repetir instrucciones.'

interface Alien { row: number; col: number; alive: boolean }
interface Bullet { x: number; y: number }

export default function SpaceInvadersPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [levelIdx, setLevelIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const phaseRef     = useRef<Phase>('idle')
  const levelIdxRef  = useRef(0)
  const scoreRef     = useRef(0)
  const livesRef     = useRef(3)

  const aliensRef        = useRef<Alien[]>([])
  const playerXRef       = useRef(W / 2)
  const bulletRef        = useRef<Bullet | null>(null)
  const alienBulletsRef  = useRef<Bullet[]>([])

  const gridXRef   = useRef(GRID_X0)
  const gridYRef   = useRef(GRID_Y0)
  const gridDirRef = useRef(1)

  const keysRef          = useRef({ left: false, right: false, shoot: false })
  const prevShootRef     = useRef(false)
  const lastMarchRef     = useRef(0)
  const marchBeatRef     = useRef(0)
  const lastAlienShootRef = useRef(0)
  const invincibleRef    = useRef(0)

  const rafRef    = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const syncPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  function buildAliens(): Alien[] {
    const arr: Alien[] = []
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        arr.push({ row: r, col: c, alive: true })
    return arr
  }

  function alienPos(a: Alien) {
    return {
      x: gridXRef.current + a.col * CELL_W + (CELL_W - ALIEN_W) / 2,
      y: gridYRef.current + a.row * CELL_H + (CELL_H - ALIEN_H) / 2,
    }
  }

  const tick = useCallback(() => {
    if (phaseRef.current !== 'playing') return

    const lv    = LEVELS[levelIdxRef.current]
    const now   = performance.now()
    const alive = aliensRef.current.filter(a => a.alive)

    // ── Move player ───────────────────────────────────────────────────────────
    if (keysRef.current.left)
      playerXRef.current = Math.max(PLAYER_W / 2, playerXRef.current - PLAYER_SPEED)
    if (keysRef.current.right)
      playerXRef.current = Math.min(W - PLAYER_W / 2, playerXRef.current + PLAYER_SPEED)

    // ── Shoot (edge-triggered so holding Space doesn't auto-fire) ─────────────
    if (keysRef.current.shoot && !prevShootRef.current && !bulletRef.current) {
      bulletRef.current = {
        x: playerXRef.current,
        y: PLAYER_Y - PLAYER_H / 2 - BULLET_H,
      }
      audio.siShoot((playerXRef.current / W) * 2 - 1)
    }
    prevShootRef.current = keysRef.current.shoot

    // ── Move player bullet ────────────────────────────────────────────────────
    if (bulletRef.current) {
      bulletRef.current.y -= BULLET_SPEED
      if (bulletRef.current.y + BULLET_H < 0) bulletRef.current = null
    }

    // ── March aliens ──────────────────────────────────────────────────────────
    const aliveCount   = alive.length
    const speedFactor  = Math.max(0.15, aliveCount / TOTAL_ALIENS)
    const marchInterval = lv.baseMarchMs * speedFactor

    if (now - lastMarchRef.current >= marchInterval) {
      lastMarchRef.current = now
      marchBeatRef.current = (marchBeatRef.current + 1) % 4

      gridXRef.current += 8 * gridDirRef.current

      const aliveCols = alive.map(a => a.col)
      const minCol    = Math.min(...aliveCols)
      const maxCol    = Math.max(...aliveCols)

      // Pan = center of alive alien group
      const gridCenterX = gridXRef.current + (minCol + maxCol + 1) * CELL_W / 2
      const marchPan    = (gridCenterX / W) * 2 - 1
      audio.siMarch(marchBeatRef.current, marchPan)
      const gridLeft  = gridXRef.current + minCol * CELL_W
      const gridRight = gridXRef.current + (maxCol + 1) * CELL_W

      if (gridDirRef.current === 1 && gridRight >= W - GRID_MARGIN) {
        gridDirRef.current = -1
        gridYRef.current  += GRID_STEP
      } else if (gridDirRef.current === -1 && gridLeft <= GRID_MARGIN) {
        gridDirRef.current = 1
        gridYRef.current  += GRID_STEP
      }

      // Aliens reached the player line → game over
      const maxRow  = Math.max(...alive.map(a => a.row))
      const lowestY = gridYRef.current + maxRow * CELL_H + ALIEN_H
      if (lowestY >= PLAYER_Y - 8) {
        syncPhase('lost')
        audio.gameOver()
        announceAssertive(`¡Los alienígenas llegaron a tu nave! Puntuación final: ${scoreRef.current}.`)
        return
      }
    }

    // ── Alien shoots ──────────────────────────────────────────────────────────
    if (
      now - lastAlienShootRef.current >= lv.shootIntervalMs &&
      alienBulletsRef.current.length < lv.maxAlienBullets &&
      alive.length > 0
    ) {
      lastAlienShootRef.current = now
      const cols      = [...new Set(alive.map(a => a.col))]
      const col       = cols[Math.floor(Math.random() * cols.length)]
      const inCol     = alive.filter(a => a.col === col)
      const shooter   = inCol.reduce((a, b) => (a.row > b.row ? a : b))
      const pos       = alienPos(shooter)
      const shootX = pos.x + ALIEN_W / 2
      alienBulletsRef.current.push({ x: shootX, y: pos.y + ALIEN_H })
      audio.siAlienShoot((shootX / W) * 2 - 1)
    }

    // ── Move alien bullets ────────────────────────────────────────────────────
    alienBulletsRef.current = alienBulletsRef.current
      .map(b => ({ ...b, y: b.y + ABUL_SPEED }))
      .filter(b => b.y < H)

    // ── Player bullet hits alien ──────────────────────────────────────────────
    if (bulletRef.current) {
      const bx = bulletRef.current.x
      const by = bulletRef.current.y
      for (const alien of aliensRef.current) {
        if (!alien.alive) continue
        const p = alienPos(alien)
        if (bx >= p.x && bx <= p.x + ALIEN_W && by >= p.y && by <= p.y + ALIEN_H) {
          alien.alive       = false
          bulletRef.current = null
          const pts         = ROW_POINTS[alien.row] * lv.scoreMultiplier
          scoreRef.current += pts
          setScore(scoreRef.current)
          const pan = (p.x + ALIEN_W / 2) / W * 2 - 1
          audio.siAlienHit(pan)
          const remaining = aliensRef.current.filter(a => a.alive).length
          announceAssertive(`Impacto +${pts}. Quedan ${remaining} alienígenas.`)
          if (remaining === 0) {
            syncPhase('won')
            audio.siWaveClear()
            announceAssertive(`¡Oleada destruida! Puntuación: ${scoreRef.current}.`)
            return
          }
          break
        }
      }
    }

    // ── Alien bullet hits player ──────────────────────────────────────────────
    if (now > invincibleRef.current) {
      const px = playerXRef.current
      const py = PLAYER_Y
      for (let i = alienBulletsRef.current.length - 1; i >= 0; i--) {
        const b = alienBulletsRef.current[i]
        if (
          b.x >= px - PLAYER_W / 2 && b.x <= px + PLAYER_W / 2 &&
          b.y >= py - PLAYER_H / 2 && b.y <= py + PLAYER_H / 2
        ) {
          alienBulletsRef.current.splice(i, 1)
          invincibleRef.current = now + INVINCIBLE_MS
          const newLives = livesRef.current - 1
          livesRef.current = newLives
          setLives(newLives)
          audio.siPlayerHit()
          if (newLives <= 0) {
            syncPhase('lost')
            audio.gameOver()
            announceAssertive(`Nave destruida. Sin vidas. Puntuación final: ${scoreRef.current}.`)
            return
          }
          announceAssertive(`Nave golpeada. ${newLives} ${newLives === 1 ? 'vida restante' : 'vidas restantes'}.`)
          break
        }
      }
    }

    if (phaseRef.current !== 'playing') return

    // ── Draw canvas ───────────────────────────────────────────────────────────
    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(tick); return }
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    // Ground line
    ctx.fillStyle = '#0d2e0d'
    ctx.fillRect(0, PLAYER_Y + PLAYER_H / 2 + 6, W, 2)

    // Aliens
    const rowColors = ['#00bcd4', '#4caf50', '#4caf50', '#ffd700']
    for (const alien of aliensRef.current) {
      if (!alien.alive) continue
      const p = alienPos(alien)
      const c = rowColors[alien.row]

      // Blink during march on beat 0/2
      const blink = marchBeatRef.current % 2 === 0
      ctx.fillStyle = blink ? c : (c + 'cc')

      // Body
      ctx.fillRect(p.x + 6,  p.y,     ALIEN_W - 12, ALIEN_H - 5)
      // Side arms
      ctx.fillRect(p.x,      p.y + 4, 6,            8)
      ctx.fillRect(p.x + ALIEN_W - 6, p.y + 4, 6,  8)
      // Legs
      ctx.fillRect(p.x + 4,           p.y + ALIEN_H - 7, 6, 7)
      ctx.fillRect(p.x + ALIEN_W - 10, p.y + ALIEN_H - 7, 6, 7)
      // Eyes
      ctx.fillStyle = '#000'
      ctx.fillRect(p.x + 10,          p.y + 4, 4, 4)
      ctx.fillRect(p.x + ALIEN_W - 14, p.y + 4, 4, 4)
    }

    // Player (flashes when invincible)
    const invFlash = now < invincibleRef.current && Math.floor(now / 100) % 2 === 0
    if (!invFlash) {
      ctx.fillStyle = '#22c55e'
      const px = playerXRef.current
      // Barrel
      ctx.fillRect(px - 3, PLAYER_Y - PLAYER_H - 2, 6, PLAYER_H / 2 + 4)
      // Hull
      ctx.fillRect(px - PLAYER_W / 2, PLAYER_Y - PLAYER_H / 2, PLAYER_W, PLAYER_H / 2 + 2)
    }

    // Player bullet
    if (bulletRef.current) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(bulletRef.current.x - BULLET_W / 2, bulletRef.current.y, BULLET_W, BULLET_H)
    }

    // Alien bullets
    ctx.fillStyle = '#ff4444'
    for (const b of alienBulletsRef.current) {
      ctx.fillRect(b.x - ABUL_W / 2, b.y, ABUL_W, ABUL_H)
    }

    // Lives HUD
    ctx.fillStyle = '#555'
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('VIDAS', 10, H - 14)
    ctx.fillStyle = '#22c55e'
    for (let i = 0; i < livesRef.current; i++) {
      ctx.fillRect(58 + i * 16, H - 22, 10, 10)
    }

    // Score HUD
    ctx.fillStyle = '#ffd700'
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`${scoreRef.current}`, W - 10, H - 12)

    rafRef.current = requestAnimationFrame(tick)
  }, [syncPhase])

  function startGame(lIdx: number) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    levelIdxRef.current   = lIdx
    scoreRef.current      = 0
    livesRef.current      = 3
    aliensRef.current     = buildAliens()
    playerXRef.current    = W / 2
    bulletRef.current     = null
    alienBulletsRef.current = []
    gridXRef.current      = GRID_X0
    gridYRef.current      = GRID_Y0
    gridDirRef.current    = 1
    keysRef.current       = { left: false, right: false, shoot: false }
    prevShootRef.current  = false
    marchBeatRef.current  = 0
    invincibleRef.current = 0

    const now = performance.now()
    lastMarchRef.current      = now
    lastAlienShootRef.current = now

    setLevelIdx(lIdx)
    setScore(0)
    setLives(3)
    setSaved(false)
    setSaveError('')
    syncPhase('playing')
    audio.start()
    announcePolite(
      LEVELS[lIdx].practice
        ? `Modo práctica. ${TOTAL_ALIENS} alienígenas en ${ROWS} filas. Los aliens no disparan. Aprende los sonidos sin presión.`
        : `Space Invaders ${LEVELS[lIdx].name}. ${TOTAL_ALIENS} alienígenas en ${ROWS} filas. Tienes 3 vidas. ¡Buena suerte!`
    )
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  useEffect(() => {
    if (phase !== 'playing') return

    function onKey(e: KeyboardEvent) {
      const down = e.type === 'keydown'
      switch (e.key) {
        case 'ArrowLeft':
        case 'a': case 'A':
          e.preventDefault(); keysRef.current.left = down; break
        case 'ArrowRight':
        case 'd': case 'D':
          e.preventDefault(); keysRef.current.right = down; break
        case ' ':
          e.preventDefault(); keysRef.current.shoot = down; break
        case 'r': case 'R': {
          if (!down) break
          const playerPan = (playerXRef.current / W) * 2 - 1
          const playerSide = playerPan < -0.3 ? 'izquierda' : playerPan > 0.3 ? 'derecha' : 'centro'
          announcePolite(
            `Tu nave en ${playerSide}. Puntuación: ${scoreRef.current}. Vidas: ${livesRef.current}. ` +
            `Alienígenas restantes: ${aliensRef.current.filter(a => a.alive).length}.`
          )
          break
        }
        case 'e': case 'E': {
          if (!down) break
          // Player position beacon first
          const playerPan2 = (playerXRef.current / W) * 2 - 1
          audio.siPlayerPos(playerPan2)
          const playerSide2 = playerPan2 < -0.3 ? 'izquierda' : playerPan2 > 0.3 ? 'derecha' : 'centro'
          // Alien group after a short delay
          const aliveNow = aliensRef.current.filter(a => a.alive)
          if (aliveNow.length > 0) {
            const cols2   = aliveNow.map(a => a.col)
            const minC    = Math.min(...cols2)
            const maxC    = Math.max(...cols2)
            const centerX = gridXRef.current + (minC + maxC + 1) * CELL_W / 2
            const pan2    = (centerX / W) * 2 - 1
            setTimeout(() => audio.siMarch(0, pan2), 280)
            const alienSide = pan2 < -0.3 ? 'izquierda' : pan2 > 0.3 ? 'derecha' : 'centro'
            announcePolite(`Tu nave en ${playerSide2}. Aliens en ${alienSide}. ${aliveNow.length} restantes.`)
          } else {
            announcePolite(`Tu nave en ${playerSide2}.`)
          }
          break
        }
        case 'h': case 'H':
          if (!down) break
          announcePolite(INSTRUCTIONS)
          break
      }
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [phase])

  async function handleSave() {
    const result = await saveScore('space-invaders', scoreRef.current)
    if (result?.error) {
      setSaveError(result.error)
      announceAssertive(result.error)
    } else {
      setSaved(true)
      announcePolite('Puntuación guardada.')
    }
  }

  const lv = LEVELS[levelIdx]

  // ── Idle screen ───────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <GameShell title="Space Invaders" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Space Invaders</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <div className="space-y-3" role="group" aria-label="Seleccionar dificultad">
            {LEVELS.map((l, i) => (
              <Button key={i} size="lg" onClick={() => startGame(i)} className="w-full text-left">
                {l.name}
              </Button>
            ))}
          </div>
        </div>
      </GameShell>
    )
  }

  // ── End screen ────────────────────────────────────────────────────────────────
  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Space Invaders" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2
            className="text-2xl font-bold"
            style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}
          >
            {phase === 'won' ? (lv.practice ? '¡Práctica completada!' : '¡Oleada destruida!') : '¡Game Over!'}
          </h2>
          {lv.practice ? (
            <p className="text-[#888]">Modo práctica — sin puntuación. Prueba ahora un nivel real.</p>
          ) : (
            <>
              <p className="text-3xl font-mono font-bold" aria-live="polite">
                Puntuación: {score}
              </p>
              {!saved ? (
                <>
                  <Button onClick={handleSave}>Guardar puntuación</Button>
                  {saveError && (
                    <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>
                  )}
                </>
              ) : (
                <p role="status" className="text-[#22c55e]">Guardado.</p>
              )}
            </>
          )}
          <div className="flex flex-col gap-3 items-center">
            <Button onClick={() => startGame(levelIdx)}>
              Jugar de nuevo ({lv.name})
            </Button>
            <Button variant="secondary" onClick={() => syncPhase('idle')}>
              Cambiar dificultad
            </Button>
          </div>
        </div>
      </GameShell>
    )
  }

  // ── Playing screen ────────────────────────────────────────────────────────────
  return (
    <GameShell title="Space Invaders" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-4">
        <div className="flex justify-between text-sm font-mono">
          <span>
            Vidas:{' '}
            <strong className="text-[#22c55e]">
              {Array.from({ length: lives }, (_, i) => (
                <span key={i} aria-hidden="true">♥</span>
              ))}
              <span className="sr-only">{lives}</span>
            </strong>
          </span>
          <span className="text-[#555]">{lv.name}</span>
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-hidden="true"
          className="w-full max-w-[560px] border border-[#333] rounded block mx-auto bg-black"
        />
        <p className="text-xs text-[#555] text-center">
          ← → / A D — mover &nbsp;|&nbsp; Espacio — disparar &nbsp;|&nbsp; E — ubicar nave y aliens &nbsp;|&nbsp; R — estado &nbsp;|&nbsp; H — instrucciones
        </p>
      </div>
    </GameShell>
  )
}
