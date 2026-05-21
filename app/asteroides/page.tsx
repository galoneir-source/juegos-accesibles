'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── Constants ─────────────────────────────────────────────────────────────────
const W = 600
const H = 600
const SHIP_ACCEL    = 210    // px/s²
const ROT_SPEED     = 210    // deg/s
const BULLET_SPEED  = 430    // px/s
const BULLET_TTL    = 1.4    // seconds
const MAX_BULLETS   = 4
const INVINCIBLE_MS = 2200   // ms after respawn
const FRICTION_60   = 0.985  // friction coefficient per frame at 60 fps

const RADII = { large: 52, medium: 26, small: 13 } as const
type AsteroidSize = keyof typeof RADII

const POINTS: Record<AsteroidSize, number> = { large: 20, medium: 50, small: 100 }

const INSTRUCTIONS =
  'Asteroides. Tu nave está en el centro. Los asteroides flotan en todas direcciones. ' +
  'Flechas izquierda y derecha o A D para girar. ' +
  'Flecha arriba o W para propulsar hacia donde apunta la nave. ' +
  'Espacio para disparar. ' +
  'Cada asteroide emite un zumbido continuo: el estéreo indica izquierda o derecha respecto a tu nave, ' +
  'el tono indica arriba o abajo. Los grandes suenan muy graves, los medianos medios y los pequeños agudos. ' +
  'Al destruir un grande se divide en dos medianos; un mediano en dos pequeños. ' +
  'Tienes 3 vidas. 2 segundos de invencibilidad al reaparecer. ' +
  'Tecla E: escucha la posición de cada asteroide y anuncia el más cercano. ' +
  'R: estado. H: instrucciones.'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ship  { x: number; y: number; vx: number; vy: number; angle: number }
interface Asteroid {
  id: number; x: number; y: number; vx: number; vy: number
  size: AsteroidSize; rot: number; rotSpeed: number
}
interface Bullet { id: number; x: number; y: number; vx: number; vy: number; ttl: number }

type Phase = 'idle' | 'playing' | 'lost'

// ── Pure helpers (outside component) ─────────────────────────────────────────

let _uid = 1
function uid() { return _uid++ }

function wrap(v: number, max: number) { return ((v % max) + max) % max }

function wrapDist(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx)
  const dy = Math.abs(ay - by)
  return Math.hypot(Math.min(dx, W - dx), Math.min(dy, H - dy))
}

function spawnAsteroids(count: number, sx: number, sy: number): Asteroid[] {
  return Array.from({ length: count }, () => {
    let x: number, y: number
    do { x = Math.random() * W; y = Math.random() * H }
    while (Math.hypot(x - sx, y - sy) < 140)
    const ang = Math.random() * Math.PI * 2
    const spd = 38 + Math.random() * 42
    return {
      id: uid(), x, y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      size: 'large', rot: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 80,
    }
  })
}

function splitAsteroid(a: Asteroid): Asteroid[] {
  if (a.size === 'small') return []
  const newSize: AsteroidSize = a.size === 'large' ? 'medium' : 'small'
  return [0, 1].map(() => {
    const ang = Math.random() * Math.PI * 2
    const spd = 58 + Math.random() * 60
    return {
      id: uid(), x: a.x, y: a.y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      size: newSize, rot: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 120,
    }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AsteroidsPage() {
  const [phase,     setPhase]     = useState<Phase>('idle')
  const [score,     setScore]     = useState(0)
  const [lives,     setLives]     = useState(3)
  const [wave,      setWave]      = useState(1)
  const [saved,     setSaved]     = useState(false)
  const [saveError, setSaveError] = useState('')

  const phaseRef  = useRef<Phase>('idle')
  const scoreRef  = useRef(0)
  const livesRef  = useRef(3)
  const waveRef   = useRef(1)

  const shipRef       = useRef<Ship>({ x: W / 2, y: H / 2, vx: 0, vy: 0, angle: 0 })
  const asteroidsRef  = useRef<Asteroid[]>([])
  const bulletsRef    = useRef<Bullet[]>([])
  const invincibleRef = useRef(0)     // timestamp until invincible expires

  const isThrustRef  = useRef(false)
  const isLeftRef    = useRef(false)
  const isRightRef   = useRef(false)

  const rafRef        = useRef(0)
  const lastTimeRef   = useRef(0)
  const lastScanRef   = useRef(0)
  const lastThrustRef = useRef(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  const syncPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  // ── Audio helpers ───────────────────────────────────────────────────────────

  function asteroidPan(ax: number): number {
    return Math.max(-1, Math.min(1, (ax - shipRef.current.x) / (W * 0.4)))
  }

  function asteroidFreq(a: Asteroid): number {
    const base = a.size === 'large' ? 65 : a.size === 'medium' ? 130 : 260
    // vertical offset: asteroid above ship (lower y) = higher tone
    const dy = shipRef.current.y - a.y
    return Math.max(base * 0.7, Math.min(base * 1.4, base + dy * 0.08))
  }

  function scanDanger() {
    const ship = asteroidsRef.current
    const RANGE = W * 0.6
    const nearest = [...asteroidsRef.current]
      .map(a => ({ a, d: wrapDist(a.x, a.y, shipRef.current.x, shipRef.current.y) }))
      .filter(({ d }) => d < RANGE)
      .sort((x, y) => x.d - y.d)
      .slice(0, 4)

    for (const { a, d } of nearest) {
      const proximity = 1 - d / RANGE
      const gain = proximity * 0.36
      const pan  = asteroidPan(a.x)
      const freq = asteroidFreq(a)
      audio.asteroidsPulse(pan, freq, gain)
    }
  }

  // ── Main tick ───────────────────────────────────────────────────────────────

  const tick = useCallback((now: number) => {
    if (phaseRef.current !== 'playing') return

    const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05)
    lastTimeRef.current = now

    const ship = { ...shipRef.current }

    // Rotation
    if (isLeftRef.current)  ship.angle -= ROT_SPEED * dt
    if (isRightRef.current) ship.angle += ROT_SPEED * dt

    // Thrust
    if (isThrustRef.current) {
      const rad = (ship.angle - 90) * Math.PI / 180
      ship.vx += Math.cos(rad) * SHIP_ACCEL * dt
      ship.vy += Math.sin(rad) * SHIP_ACCEL * dt
      if (now - lastThrustRef.current >= 100) {
        lastThrustRef.current = now
        audio.asteroidsThrust()
      }
    }

    // Friction
    const f = Math.pow(FRICTION_60, dt * 60)
    ship.vx *= f
    ship.vy *= f

    // Speed cap
    const spd = Math.hypot(ship.vx, ship.vy)
    if (spd > 400) { ship.vx = ship.vx / spd * 400; ship.vy = ship.vy / spd * 400 }

    ship.x = wrap(ship.x + ship.vx * dt, W)
    ship.y = wrap(ship.y + ship.vy * dt, H)
    shipRef.current = ship

    // Move bullets
    bulletsRef.current = bulletsRef.current
      .map(b => ({
        ...b,
        x: wrap(b.x + b.vx * dt, W),
        y: wrap(b.y + b.vy * dt, H),
        ttl: b.ttl - dt,
      }))
      .filter(b => b.ttl > 0)

    // Move asteroids
    asteroidsRef.current = asteroidsRef.current.map(a => ({
      ...a,
      x: wrap(a.x + a.vx * dt, W),
      y: wrap(a.y + a.vy * dt, H),
      rot: a.rot + a.rotSpeed * dt,
    }))

    // Bullet–asteroid collisions
    let rocks   = [...asteroidsRef.current]
    let bullets = [...bulletsRef.current]
    let gained  = 0

    for (const b of [...bullets]) {
      for (const a of [...rocks]) {
        if (wrapDist(b.x, b.y, a.x, a.y) < RADII[a.size] + 4) {
          gained   += POINTS[a.size]
          const pan = asteroidPan(a.x)
          audio.asteroidsHit(a.size, pan)
          bullets = bullets.filter(x => x.id !== b.id)
          rocks   = rocks.filter(x => x.id !== a.id)
          rocks   = [...rocks, ...splitAsteroid(a)]
          break
        }
      }
    }

    if (gained > 0) { scoreRef.current += gained; setScore(scoreRef.current) }
    bulletsRef.current  = bullets
    asteroidsRef.current = rocks

    // Wave cleared
    if (rocks.length === 0) {
      const nw = waveRef.current + 1
      waveRef.current = nw
      setWave(nw)
      audio.siWaveClear()
      const count = Math.min(3 + nw - 1, 8)
      announcePolite(`¡Ola ${nw - 1} despejada! Ola ${nw}: ${count} asteroides.`)
      asteroidsRef.current = spawnAsteroids(count, ship.x, ship.y)
    }

    // Ship collision
    if (now > invincibleRef.current) {
      for (const a of asteroidsRef.current) {
        if (wrapDist(ship.x, ship.y, a.x, a.y) < RADII[a.size] + 10) {
          const nl = livesRef.current - 1
          livesRef.current = nl
          setLives(nl)
          audio.asteroidsShipDie()
          if (nl <= 0) {
            syncPhase('lost')
            announceAssertive(`Nave destruida. Game over. Puntuación: ${scoreRef.current}.`)
            return
          }
          shipRef.current   = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: 0 }
          invincibleRef.current = now + INVINCIBLE_MS
          announceAssertive(`Destruida. ${nl} vida${nl !== 1 ? 's' : ''} restante${nl !== 1 ? 's' : ''}.`)
          break
        }
      }
    }

    // Continuous danger scan every 200 ms
    if (now - lastScanRef.current >= 200) {
      lastScanRef.current = now
      scanDanger()
    }

    const canvas = canvasRef.current
    if (canvas) draw(canvas.getContext('2d')!, now)

    rafRef.current = requestAnimationFrame(tick)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncPhase])

  // ── Draw ────────────────────────────────────────────────────────────────────

  function draw(ctx: CanvasRenderingContext2D, now: number) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    // Decorative stars
    ctx.fillStyle = '#2a2a2a'
    for (let i = 0; i < 48; i++) {
      ctx.fillRect((i * 179 + 37) % W, (i * 113 + 61) % H, 1, 1)
    }

    // Asteroids
    for (const a of asteroidsRef.current) {
      const r = RADII[a.size]
      ctx.save()
      ctx.translate(a.x, a.y)
      ctx.rotate(a.rot * Math.PI / 180)
      ctx.strokeStyle = a.size === 'large' ? '#777' : a.size === 'medium' ? '#999' : '#bbb'
      ctx.lineWidth = 2
      const sides = a.size === 'large' ? 10 : a.size === 'medium' ? 8 : 6
      ctx.beginPath()
      for (let i = 0; i < sides; i++) {
        const ang = (i / sides) * Math.PI * 2
        const jag = r * (0.76 + ((a.id * (i + 7) * 11) % 24) / 100)
        const px  = Math.cos(ang) * jag
        const py  = Math.sin(ang) * jag
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }

    // Bullets
    ctx.fillStyle = '#ffffaa'
    for (const b of bulletsRef.current) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Ship (blinks when invincible)
    const blink = now < invincibleRef.current && Math.floor(now / 110) % 2 === 0
    if (!blink) {
      const ship = shipRef.current
      ctx.save()
      ctx.translate(ship.x, ship.y)
      ctx.rotate(ship.angle * Math.PI / 180)
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, -16)
      ctx.lineTo(11, 13)
      ctx.lineTo(0, 7)
      ctx.lineTo(-11, 13)
      ctx.closePath()
      ctx.stroke()
      if (isThrustRef.current) {
        ctx.strokeStyle = '#f97316'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(-5, 9)
        ctx.lineTo(0, 19 + Math.random() * 7)
        ctx.lineTo(5, 9)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  // ── Start ────────────────────────────────────────────────────────────────────

  function startGame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    shipRef.current       = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: 0 }
    bulletsRef.current    = []
    asteroidsRef.current  = spawnAsteroids(3, W / 2, H / 2)
    scoreRef.current      = 0
    livesRef.current      = 3
    waveRef.current       = 1
    invincibleRef.current = 0
    isThrustRef.current   = false
    isLeftRef.current     = false
    isRightRef.current    = false

    setScore(0); setLives(3); setWave(1)
    setSaved(false); setSaveError('')
    syncPhase('playing')
    audio.start()

    const now = performance.now()
    lastTimeRef.current   = now
    lastScanRef.current   = 0
    lastThrustRef.current = 0

    announcePolite('Asteroides. Tu nave en el centro. 3 asteroides. ¡Destruye todo!')
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'playing') return

    function onDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); isLeftRef.current  = true; break
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); isRightRef.current = true; break
        case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); isThrustRef.current = true; break
        case ' ': {
          e.preventDefault()
          if (bulletsRef.current.length >= MAX_BULLETS) break
          const ship = shipRef.current
          const rad  = (ship.angle - 90) * Math.PI / 180
          bulletsRef.current = [...bulletsRef.current, {
            id: uid(),
            x:  ship.x + Math.cos(rad) * 18,
            y:  ship.y + Math.sin(rad) * 18,
            vx: ship.vx + Math.cos(rad) * BULLET_SPEED,
            vy: ship.vy + Math.sin(rad) * BULLET_SPEED,
            ttl: BULLET_TTL,
          }]
          audio.asteroidsFire()
          break
        }
        case 'e': case 'E': {
          e.preventDefault()
          const ship = shipRef.current
          const sorted = [...asteroidsRef.current]
            .map(a => ({ a, d: wrapDist(a.x, a.y, ship.x, ship.y) }))
            .sort((x, y) => x.d - y.d)

          sorted.forEach(({ a }, i) => {
            const pan  = asteroidPan(a.x)
            const freq = asteroidFreq(a)
            setTimeout(() => audio.asteroidsPulse(pan, freq, 0.42), i * 130)
          })

          const near = sorted[0]
          if (!near) { announcePolite('Sin asteroides.'); break }
          const dx  = near.a.x - ship.x
          const dy  = near.a.y - ship.y
          const lad = dx < -25 ? 'izquierda' : dx > 25 ? 'derecha' : 'recto'
          const ver = dy < -25 ? 'arriba' : dy > 25 ? 'abajo' : 'misma altura'
          const units = Math.round(near.d / 55)
          const label = near.a.size === 'large' ? 'grande' : near.a.size === 'medium' ? 'mediano' : 'pequeño'
          announcePolite(
            `${asteroidsRef.current.length} asteroide${asteroidsRef.current.length !== 1 ? 's' : ''}. ` +
            `Más cercano: ${label}, ${lad}, ${ver}, ${units} unidades.`
          )
          break
        }
        case 'r': case 'R':
          announcePolite(
            `Puntos: ${scoreRef.current}. Vidas: ${livesRef.current}. ` +
            `Ola: ${waveRef.current}. Asteroides: ${asteroidsRef.current.length}.`
          )
          break
        case 'h': case 'H':
          announcePolite(INSTRUCTIONS)
          break
      }
    }

    function onUp(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowLeft':  case 'a': case 'A': isLeftRef.current   = false; break
        case 'ArrowRight': case 'd': case 'D': isRightRef.current  = false; break
        case 'ArrowUp':    case 'w': case 'W': isThrustRef.current = false; break
      }
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup',   onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup',   onUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  async function handleSave() {
    const result = await saveScore('asteroids', scoreRef.current)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── Screens ──────────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Asteroides" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Asteroides</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame} className="w-full">Jugar</Button>
        </div>
      </GameShell>
    )
  }

  if (phase === 'lost') {
    return (
      <GameShell title="Asteroides" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl font-bold text-[#ef4444]">Game Over</h2>
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
          <p className="text-[#888]">Olas completadas: {wave - 1}</p>
          {!saved ? (
            <>
              <Button onClick={handleSave}>Guardar puntuación</Button>
              {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
            </>
          ) : (
            <p role="status" className="text-[#22c55e]">Guardado.</p>
          )}
          <Button onClick={startGame}>Jugar de nuevo</Button>
        </div>
      </GameShell>
    )
  }

  return (
    <GameShell title="Asteroides" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-3">
        <div className="flex justify-between text-sm font-mono">
          <span>Vidas: <strong className="text-[#22c55e]">{lives}</strong></span>
          <span>Ola: <strong className="text-[#ffd700]">{wave}</strong></span>
          <span>Puntos: <strong className="text-[#f0f0f0]">{score}</strong></span>
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
          ← → / A D — girar &nbsp;|&nbsp; ↑ / W — propulsar &nbsp;|&nbsp; Espacio — disparar &nbsp;|&nbsp; E — escanear &nbsp;|&nbsp; R — estado
        </p>
      </div>
    </GameShell>
  )
}
