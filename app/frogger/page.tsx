'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── Board ─────────────────────────────────────────────────────────────────────
const COLS = 11
const ROWS = 9
const CELL = 48
const W = COLS * CELL   // 528
const H = ROWS * CELL   // 432

// Row layout (0 = top, 8 = bottom)
// 0: home    1-3: water    4: safe median    5-7: road    8: safe start
const WATER_ROWS = [1, 2, 3]
const ROAD_ROWS  = [5, 6, 7]

// 5 home slots at columns 1, 3, 5, 7, 9
const HOME_COLS  = [1, 3, 5, 7, 9]

const FROG_START_COL = 5
const FROG_START_ROW = 8
const TIMER_SECS     = 45
const TOTAL_HOMES    = 5

const INSTRUCTIONS =
  'Frogger. Lleva a la rana desde abajo hasta las cinco casas en la cima. ' +
  'Flechas o WASD para saltar en las cuatro direcciones. ' +
  'En la carretera esquiva los coches; si te atropellan pierdes una vida. ' +
  'En el agua salta solo sobre los troncos: si caes al agua pierdes una vida. ' +
  'Los coches suenan con un rumor grave; los troncos con un toque agudo de madera. ' +
  'Cuanto más cerca, más fuerte; cuanto más a la izquierda o derecha, el sonido se desvía a ese lado. ' +
  'La fila que tienes delante suena más alta que la de detrás para que puedas distinguirlas. ' +
  'Cada medio segundo oirás un campaneo suave si la siguiente fila es segura para saltar. ' +
  'Cuando estás subido en un tronco oyes un golpecito rítmico que confirma que estás a salvo. ' +
  'Tecla E: escuchar los peligros y si el camino al frente está libre. ' +
  'Tienes 3 vidas y 45 segundos por intento. R: estado. H: instrucciones.'

// ── Lane definitions ──────────────────────────────────────────────────────────

interface LaneDef {
  row: number
  type: 'water' | 'road'
  dir: 1 | -1
  speed: number   // px/s
  vehicles: Array<{ x: number; w: number }>
}

const LANE_DEFS: LaneDef[] = [
  { row: 1, type: 'water', dir:  1, speed:  52, vehicles: [{ x:  20, w: 120 }, { x: 290, w: 160 }] },
  { row: 2, type: 'water', dir: -1, speed:  40, vehicles: [{ x: 100, w: 112 }, { x: 360, w:  96 }] },
  { row: 3, type: 'water', dir:  1, speed:  68, vehicles: [{ x:  30, w:  96 }, { x: 230, w: 128 }, { x: 430, w: 96 }] },
  { row: 5, type: 'road',  dir: -1, speed:  82, vehicles: [{ x: 420, w:  48 }, { x: 200, w:  48 }] },
  { row: 6, type: 'road',  dir:  1, speed:  65, vehicles: [{ x:  28, w:  48 }, { x: 288, w:  48 }] },
  { row: 7, type: 'road',  dir: -1, speed: 100, vehicles: [{ x: 450, w:  48 }, { x: 148, w:  48 }, { x: 308, w: 48 }] },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowZone(row: number): 'home' | 'water' | 'safe' | 'road' {
  if (row === 0) return 'home'
  if (WATER_ROWS.includes(row)) return 'water'
  if (ROAD_ROWS.includes(row))  return 'road'
  return 'safe'
}

type Phase = 'idle' | 'playing' | 'lost' | 'won'

// ── Component ─────────────────────────────────────────────────────────────────

export default function FroggerPage() {
  const [phase,     setPhase]     = useState<Phase>('idle')
  const [score,     setScore]     = useState(0)
  const [lives,     setLives]     = useState(3)
  const [timer,     setTimer]     = useState(TIMER_SECS)
  const [homes,     setHomes]     = useState<boolean[]>(Array(TOTAL_HOMES).fill(false))
  const [saved,     setSaved]     = useState(false)
  const [saveError, setSaveError] = useState('')

  const phaseRef  = useRef<Phase>('idle')
  const scoreRef  = useRef(0)
  const livesRef  = useRef(3)
  const timerRef  = useRef(TIMER_SECS)
  const homesRef  = useRef<boolean[]>(Array(TOTAL_HOMES).fill(false))

  // Frog state
  const frogXRef   = useRef(FROG_START_COL * CELL + CELL / 2)  // pixel center X
  const frogRowRef = useRef(FROG_START_ROW)
  const aliveRef   = useRef(true)   // false during death animation

  // Vehicle positions — mutable array parallel to LANE_DEFS
  const veхsRef = useRef<Array<Array<{ x: number; w: number }>>>([])

  const rafRef       = useRef(0)
  const lastTimeRef  = useRef(0)
  const lastTimerRef = useRef(0)
  const lastScanRef  = useRef(0)
  const lastOnLogRef = useRef(0)   // confirmation pulse while riding a log
  const lastSafeRef  = useRef(0)   // safe-path chime timer
  const canvasRef    = useRef<HTMLCanvasElement>(null)

  const syncPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  // ── Vehicle helpers ─────────────────────────────────────────────────────────

  function getVehicles(row: number) {
    const li = LANE_DEFS.findIndex(l => l.row === row)
    return li === -1 ? [] : (veхsRef.current[li] ?? [])
  }

  function logUnder(frogX: number, row: number) {
    if (!WATER_ROWS.includes(row)) return null
    return getVehicles(row).find(v => v.x + 6 < frogX && frogX < v.x + v.w - 6) ?? null
  }

  function hitByCar(frogX: number, row: number): boolean {
    if (!ROAD_ROWS.includes(row)) return false
    const half = CELL / 2 - 4
    return getVehicles(row).some(v => v.x < frogX + half && v.x + v.w > frogX - half)
  }

  // ── Death & respawn ─────────────────────────────────────────────────────────

  function die(reason: 'squish' | 'splash') {
    if (!aliveRef.current) return
    aliveRef.current = false
    if (reason === 'squish') {
      audio.siPlayerHit()
      announceAssertive('¡Atropellada! Vida perdida.')
    } else {
      audio.incorrect()
      announceAssertive('¡Al agua! Vida perdida.')
    }
    const nl = livesRef.current - 1
    livesRef.current = nl
    setLives(nl)

    setTimeout(() => {
      if (nl <= 0) {
        syncPhase('lost')
        audio.gameOver()
        announceAssertive(`Sin vidas. Puntuación final: ${scoreRef.current}.`)
        return
      }
      frogXRef.current   = FROG_START_COL * CELL + CELL / 2
      frogRowRef.current = FROG_START_ROW
      timerRef.current   = TIMER_SECS
      setTimer(TIMER_SECS)
      aliveRef.current   = true
      lastTimerRef.current = performance.now()
      announcePolite(`${nl} ${nl === 1 ? 'vida restante' : 'vidas restantes'}. De vuelta al inicio.`)
    }, 800)
  }

  // ── Danger scan audio ───────────────────────────────────────────────────────

  // Max hearing range and pan divisor (steeper = wider stereo spread)
  const HEAR_CELLS = 5
  const PAN_CELLS  = 2   // 2 cells away = full ±1 pan; clamped beyond that

  function panFor(cx: number, frogX: number) {
    return Math.max(-1, Math.min(1, (cx - frogX) / (CELL * PAN_CELLS)))
  }

  // Returns true when the next row ahead (frogRow-1) is safe to jump into
  function isNextRowSafe(frogX: number, frogRow: number): boolean {
    const nextRow = frogRow - 1
    if (nextRow <= 0) return true   // home row: attempt is always valid
    const zone = rowZone(nextRow)
    if (zone === 'safe' || zone === 'home') return true
    if (zone === 'road') {
      return !getVehicles(nextRow).some(v => Math.abs(v.x + v.w / 2 - frogX) < CELL * 1.5)
    }
    if (zone === 'water') {
      return logUnder(frogX, nextRow) !== null
    }
    return false
  }

  // Continuous scan: called every ~150 ms.
  // Current row: full gain. Front row (ahead): 60% gain. Back row: 18% (barely audible).
  // Pan uses PAN_CELLS divisor for clear left/right separation.
  function scanDanger(frogX: number, frogRow: number) {
    const scanDefs: Array<[number, number]> = [
      [frogRow,     1.00],
      [frogRow - 1, 0.60],   // ahead — louder warning
      [frogRow + 1, 0.18],   // behind — whisper
    ]

    for (const [r, mult] of scanDefs) {
      if (r <= 0 || r >= ROWS) continue
      const vehs = getVehicles(r)
      const lane = LANE_DEFS.find(l => l.row === r)
      if (!vehs.length || !lane) continue

      for (const v of vehs) {
        const cx   = v.x + v.w / 2
        const dist = Math.abs(cx - frogX)
        if (dist > CELL * HEAR_CELLS) continue
        const proximity = 1 - dist / (CELL * HEAR_CELLS)
        const pan = panFor(cx, frogX)
        if (lane.type === 'road') {
          audio.frogCar(pan, proximity * mult * 0.44)
        } else if (lane.type === 'water') {
          audio.frogLog(pan, proximity * mult * 0.38)
        }
      }
    }
  }

  // On-demand scan (key E): plays sound + returns text description of nearest threat
  function scanDangerOnDemand(frogX: number, frogRow: number): string {
    const rows = [frogRow - 1, frogRow, frogRow + 1].filter(r => r > 0 && r < ROWS)
    const parts: string[] = []

    // Safe-forward report (first in announcement)
    const nextSafe = isNextRowSafe(frogX, frogRow)
    if (nextSafe) {
      audio.frogClear()
      parts.push('Camino al frente libre')
    }

    rows.forEach((r, i) => {
      const vehs = getVehicles(r)
      if (!vehs.length) return
      const lane = LANE_DEFS.find(l => l.row === r)
      if (!lane) return
      const closest = [...vehs].sort(
        (a, b) => Math.abs(a.x + a.w / 2 - frogX) - Math.abs(b.x + b.w / 2 - frogX)
      )[0]
      const cx    = closest.x + closest.w / 2
      const pan   = panFor(cx, frogX)
      const distCells = Math.round(Math.abs(cx - frogX) / CELL)
      const side  = cx < frogX - CELL * 0.4 ? 'izquierda' : cx > frogX + CELL * 0.4 ? 'derecha' : 'justo enfrente'
      const label = r === frogRow ? 'Tu fila' : r < frogRow ? 'Fila anterior' : 'Fila siguiente'
      const delay = (nextSafe ? 250 : 0) + i * 100
      if (lane.type === 'road') {
        setTimeout(() => audio.frogDanger(pan), delay)
        parts.push(`${label}: coche a ${distCells} celda${distCells !== 1 ? 's' : ''} a la ${side}`)
      } else {
        setTimeout(() => audio.frogLog(pan, 0.28), delay)
        parts.push(`${label}: tronco a ${distCells} celda${distCells !== 1 ? 's' : ''} a la ${side}`)
      }
    })
    return parts.length ? parts.join('. ') + '.' : 'Sin vehículos cercanos.'
  }

  // ── Main tick ───────────────────────────────────────────────────────────────

  const tick = useCallback((now: number) => {
    if (phaseRef.current !== 'playing') return

    const dt = Math.min(now - lastTimeRef.current, 50)
    lastTimeRef.current = now

    // Timer
    if (aliveRef.current && now - lastTimerRef.current >= 1000) {
      lastTimerRef.current = now
      const nt = timerRef.current - 1
      timerRef.current = nt
      setTimer(nt)
      if (nt <= 5 && nt > 0) audio.tick()
      if (nt <= 0) { die('splash'); rafRef.current = requestAnimationFrame(tick); return }
    }

    if (!aliveRef.current) { rafRef.current = requestAnimationFrame(tick); return }

    // Move vehicles
    LANE_DEFS.forEach((lane, li) => {
      const vehs = veхsRef.current[li]
      if (!vehs) return
      const dx = lane.dir * lane.speed * dt / 1000
      vehs.forEach(v => {
        v.x += dx
        if (lane.dir === 1  && v.x > W)       v.x = -v.w
        if (lane.dir === -1 && v.x + v.w < 0) v.x = W
      })
    })

    // Ride log
    const row = frogRowRef.current
    if (WATER_ROWS.includes(row)) {
      const lane = LANE_DEFS.find(l => l.row === row)!
      const log  = logUnder(frogXRef.current, row)
      if (log) {
        frogXRef.current += lane.dir * lane.speed * dt / 1000
        if (frogXRef.current < CELL / 2 || frogXRef.current > W - CELL / 2) {
          die('splash'); rafRef.current = requestAnimationFrame(tick); return
        }
        // Rhythmic confirmation pulse: "you are on a log" — center pan (frog is on the log)
        if (now - lastOnLogRef.current >= 500) {
          lastOnLogRef.current = now
          audio.frogOnLog(0)
        }
      } else {
        die('splash'); rafRef.current = requestAnimationFrame(tick); return
      }
    }

    // Car collision (continuous)
    if (ROAD_ROWS.includes(row) && hitByCar(frogXRef.current, row)) {
      die('squish'); rafRef.current = requestAnimationFrame(tick); return
    }

    // Continuous proximity audio — 150 ms keeps tones crisp without overlap
    if (now - lastScanRef.current >= 150) {
      lastScanRef.current = now
      scanDanger(frogXRef.current, row)
    }

    // Safe-path chime: soft ascending tone every 600 ms when next row is clear
    if (now - lastSafeRef.current >= 600) {
      lastSafeRef.current = now
      if (isNextRowSafe(frogXRef.current, row)) audio.frogClear()
    }

    // Draw
    const canvas = canvasRef.current
    if (canvas) draw(canvas.getContext('2d')!)

    rafRef.current = requestAnimationFrame(tick)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncPhase])

  // ── Draw ────────────────────────────────────────────────────────────────────

  function draw(ctx: CanvasRenderingContext2D) {
    // Zone backgrounds
    for (let r = 0; r < ROWS; r++) {
      const zone = rowZone(r)
      ctx.fillStyle =
        zone === 'home'  ? '#0a2e0a' :
        zone === 'water' ? '#0a1a3e' :
        zone === 'road'  ? '#1c1c1c' : '#0d2e0d'
      ctx.fillRect(0, r * CELL, W, CELL)
    }

    // Road dashes
    ROAD_ROWS.forEach(r => {
      ctx.fillStyle = '#2a2a2a'
      for (let x = 0; x < W; x += 64)
        ctx.fillRect(x, r * CELL + CELL / 2 - 2, 36, 4)
    })

    // Home slots (row 0)
    HOME_COLS.forEach((col, i) => {
      const hx = col * CELL
      ctx.fillStyle = homesRef.current[i] ? '#14532d' : '#1a3a1a'
      ctx.fillRect(hx + 3, 3, CELL - 6, CELL - 6)
      if (homesRef.current[i]) {
        ctx.fillStyle = '#22c55e'
        ctx.beginPath()
        ctx.arc(hx + CELL / 2, CELL / 2, CELL / 2 - 10, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.strokeStyle = '#2a5a2a'
        ctx.lineWidth = 1
        ctx.strokeRect(hx + 3, 3, CELL - 6, CELL - 6)
      }
    })

    // Logs
    LANE_DEFS.forEach((lane, li) => {
      if (lane.type !== 'water') return
      const vehs = veхsRef.current[li] ?? []
      vehs.forEach(v => {
        const y = lane.row * CELL
        ctx.fillStyle = '#7c4a1e'
        ctx.fillRect(v.x + 2, y + 9, v.w - 4, CELL - 18)
        ctx.fillStyle = '#9a5c28'
        ctx.fillRect(v.x + 4, y + 11, v.w - 8, 5)
        // Wood grain rings
        ctx.fillStyle = '#5a3510'
        const rings = Math.floor(v.w / 50)
        for (let i = 1; i < rings; i++)
          ctx.fillRect(v.x + i * 50, y + 9, 2, CELL - 18)
      })
    })

    // Cars
    const CAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#06b6d4', '#a855f7']
    LANE_DEFS.forEach((lane, li) => {
      if (lane.type !== 'road') return
      const vehs = veхsRef.current[li] ?? []
      vehs.forEach((v, vi) => {
        const y = lane.row * CELL
        ctx.fillStyle = CAR_COLORS[(li * 2 + vi) % CAR_COLORS.length]
        ctx.fillRect(v.x + 2, y + 8, v.w - 4, CELL - 16)
        ctx.fillStyle = 'rgba(200,230,255,0.35)'
        const ww = (v.w - 14) / 2
        ctx.fillRect(v.x + 6,          y + 12, ww, CELL - 28)
        ctx.fillRect(v.x + 6 + ww + 2, y + 12, ww, CELL - 28)
      })
    })

    // Frog
    if (aliveRef.current) {
      const fx = frogXRef.current
      const fy = frogRowRef.current * CELL + CELL / 2
      ctx.fillStyle = '#4ade80'
      ctx.beginPath()
      ctx.ellipse(fx, fy, CELL / 2 - 7, CELL / 2 - 9, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#86efac'
      ctx.beginPath()
      ctx.ellipse(fx, fy - 3, CELL / 2 - 12, CELL / 2 - 14, 0, 0, Math.PI * 2)
      ctx.fill()
      // Eyes
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(fx - 8, fy - 9, 5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(fx + 8, fy - 9, 5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#111'
      ctx.beginPath(); ctx.arc(fx - 8, fy - 9, 2, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(fx + 8, fy - 9, 2, 0, Math.PI * 2); ctx.fill()
    }

    // Timer bar at bottom
    const pct = timerRef.current / TIMER_SECS
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, H - 5, W, 5)
    ctx.fillStyle = pct > 0.4 ? '#22c55e' : pct > 0.2 ? '#eab308' : '#ef4444'
    ctx.fillRect(0, H - 5, W * pct, 5)
  }

  // ── Jump handler ────────────────────────────────────────────────────────────

  function jump(dRow: number, dCol: number) {
    if (!aliveRef.current || phaseRef.current !== 'playing') return

    const newRow = Math.max(0, Math.min(ROWS - 1, frogRowRef.current + dRow))
    let newX = frogXRef.current + dCol * CELL
    // Snap X to nearest column center and clamp to board
    newX = Math.round((newX - CELL / 2) / CELL) * CELL + CELL / 2
    newX = Math.max(CELL / 2, Math.min(W - CELL / 2, newX))

    frogRowRef.current = newRow
    frogXRef.current   = newX
    audio.frogJump()

    const zone = rowZone(newRow)

    // ── Reached home row ──────────────────────────────────────────────────────
    if (zone === 'home') {
      const col = Math.round((newX - CELL / 2) / CELL)
      const hi  = HOME_COLS.indexOf(col)
      if (hi !== -1 && !homesRef.current[hi]) {
        const nh = [...homesRef.current]
        nh[hi] = true
        homesRef.current = nh
        setHomes([...nh])
        scoreRef.current += 50
        setScore(scoreRef.current)
        audio.frogHome()
        const filled = nh.filter(Boolean).length
        announceAssertive(`¡Casa ${filled} de ${TOTAL_HOMES}! +50 puntos.`)
        if (filled === TOTAL_HOMES) {
          syncPhase('won')
          audio.siWaveClear()
          announceAssertive(`¡Ganaste! Todas las casas llenas. Puntuación: ${scoreRef.current}.`)
          return
        }
      } else {
        announcePolite('Posición inválida. Vuelve a intentarlo.')
      }
      // Reset frog for next attempt
      frogXRef.current   = FROG_START_COL * CELL + CELL / 2
      frogRowRef.current = FROG_START_ROW
      timerRef.current   = TIMER_SECS
      setTimer(TIMER_SECS)
      lastTimerRef.current = performance.now()
      return
    }

    // ── Zone announcement ─────────────────────────────────────────────────────
    const zoneLabel =
      zone === 'water' ? 'Agua' :
      zone === 'road'  ? 'Carretera' : 'Zona segura'
    const rowFromBottom = ROWS - 1 - newRow
    announcePolite(`${zoneLabel}. Fila ${rowFromBottom}.`)

    // ── Immediate collision checks ────────────────────────────────────────────
    if (zone === 'road' && hitByCar(newX, newRow)) { die('squish'); return }
    if (zone === 'water' && !logUnder(newX, newRow)) { die('splash'); return }

    // Score forward hop
    if (dRow < 0) { scoreRef.current += 10; setScore(scoreRef.current) }
  }

  // ── Start ───────────────────────────────────────────────────────────────────

  function startGame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    veхsRef.current = LANE_DEFS.map(lane => lane.vehicles.map(v => ({ ...v })))
    scoreRef.current = 0
    livesRef.current = 3
    timerRef.current = TIMER_SECS
    homesRef.current = Array(TOTAL_HOMES).fill(false)
    frogXRef.current   = FROG_START_COL * CELL + CELL / 2
    frogRowRef.current = FROG_START_ROW
    aliveRef.current   = true

    setScore(0); setLives(3); setTimer(TIMER_SECS)
    setHomes(Array(TOTAL_HOMES).fill(false))
    setSaved(false); setSaveError('')
    syncPhase('playing')
    audio.start()

    const now = performance.now()
    lastTimeRef.current  = now
    lastTimerRef.current = now
    lastScanRef.current  = 0
    lastOnLogRef.current = 0
    lastSafeRef.current  = 0

    announcePolite(
      `Frogger. Lleva la rana a las ${TOTAL_HOMES} casas en lo alto. ` +
      `3 vidas, ${TIMER_SECS} segundos por intento.`
    )
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'playing') return
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); jump(-1,  0); break
        case 'ArrowDown':  case 's': case 'S': e.preventDefault(); jump( 1,  0); break
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); jump( 0, -1); break
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); jump( 0,  1); break
        case 'e': case 'E':
          e.preventDefault()
          {
            const desc = scanDangerOnDemand(frogXRef.current, frogRowRef.current)
            const zone = rowZone(frogRowRef.current)
            const zoneLabel = zone === 'water' ? 'Agua' : zone === 'road' ? 'Carretera' : 'Zona segura'
            announcePolite(`${zoneLabel}, fila ${ROWS - 1 - frogRowRef.current}. ${desc}`)
          }
          break
        case 'r': case 'R':
          announcePolite(
            `Puntos: ${scoreRef.current}. Vidas: ${livesRef.current}. ` +
            `Tiempo: ${timerRef.current}s. Casas: ${homesRef.current.filter(Boolean).length} de ${TOTAL_HOMES}.`
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
    const result = await saveScore('frogger', scoreRef.current)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── Screens ──────────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Frogger" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Frogger</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame} className="w-full">Jugar</Button>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Frogger" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl font-bold" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Ganaste!' : 'Game Over'}
          </h2>
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
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
    <GameShell title="Frogger" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-3">
        <div className="flex justify-between text-sm font-mono">
          <span>
            Vidas:{' '}
            <strong className="text-[#22c55e]">
              {Array.from({ length: lives }, (_, i) => <span key={i} aria-hidden="true">♥</span>)}
              <span className="sr-only">{lives}</span>
            </strong>
          </span>
          <span>
            Casas: <strong className="text-[#ffd700]">{homes.filter(Boolean).length}/{TOTAL_HOMES}</strong>
          </span>
          <span>
            Tiempo:{' '}
            <strong className={timer <= 10 ? 'text-[#ef4444]' : 'text-[#f0f0f0]'}>{timer}s</strong>
          </span>
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
          ↑ ↓ ← → / WASD — saltar &nbsp;|&nbsp; E — escuchar peligros &nbsp;|&nbsp; R — estado &nbsp;|&nbsp; H — instrucciones
        </p>
      </div>
    </GameShell>
  )
}
