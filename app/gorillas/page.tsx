'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── Constants ─────────────────────────────────────────────────────────────────

const CW = 800
const CH = 400
const GRAVITY = 22
const GORILLA_R = 18
const BANANA_R = 5
const N_BLDGS = 9
const BLDG_W = 74
const GAP = Math.floor((CW - N_BLDGS * BLDG_W) / (N_BLDGS + 1))
const PLAYER_IDX = 1
const AI_IDX = 7

const INSTRUCTIONS =
  'Gorilas. Dos gorilas en lo alto de edificios se lanzan plátanos explosivos. ' +
  'Introduce el ángulo en grados (1–89) y la velocidad (10–200) y pulsa Intro para lanzar. ' +
  'Después de cada fallo, el juego te dice a cuántos metros y en qué dirección cayó el plátano. ' +
  'El viento cambia cada ronda y afecta la trayectoria. Partida al mejor de 3 rondas. ' +
  'H para repetir instrucciones.'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'player-turn' | 'throwing' | 'ai-turn' | 'ai-throwing' | 'round-end' | 'game-end'

interface Bldg {
  x: number; w: number; h: number
  wins: Array<{ wx: number; wy: number; lit: boolean }>
}

interface BPos { x: number; y: number; vx: number; vy: number }

// ── Module-level helpers ──────────────────────────────────────────────────────

function makeBldgs(): Bldg[] {
  return Array.from({ length: N_BLDGS }, (_, i) => {
    const x = GAP + i * (BLDG_W + GAP)
    const h = 80 + Math.random() * 200
    const wins: Bldg['wins'] = []
    for (let wy = 8; wy < h - 8; wy += 18) {
      for (let wx = 6; wx < BLDG_W - 6; wx += 16) {
        wins.push({ wx, wy, lit: Math.random() > 0.4 })
      }
    }
    return { x, w: BLDG_W, h, wins }
  })
}

function gorillaXY(bldgs: Bldg[], idx: number) {
  const b = bldgs[idx]
  return { x: b.x + b.w / 2, y: CH - b.h - GORILLA_R }
}

function drawGorilla(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  alive: boolean, isPlayer: boolean
) {
  if (!alive) {
    ctx.fillStyle = '#555'
    ctx.beginPath(); ctx.arc(x, y, GORILLA_R, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#f44'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke()
    return
  }
  ctx.fillStyle = isPlayer ? '#ffd700' : '#ff6644'
  ctx.beginPath(); ctx.arc(x, y, GORILLA_R, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#000'
  ctx.beginPath(); ctx.arc(x - 6, y - 5, 3, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x + 6, y - 5, 3, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(x, y + 2, 6, 0.2, Math.PI - 0.2); ctx.stroke()
  // raised arm toward enemy
  const armX = isPlayer ? x + GORILLA_R : x - GORILLA_R
  ctx.strokeStyle = isPlayer ? '#ffd700' : '#ff6644'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(armX, y); ctx.lineTo(armX + (isPlayer ? 10 : -10), y - 12); ctx.stroke()
  ctx.fillStyle = '#fff'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
  ctx.fillText(isPlayer ? 'TÚ' : 'IA', x, y + GORILLA_R + 12)
}

function simThrow(
  sx: number, sy: number, angleDeg: number, speed: number,
  wind: number, bldgs: Bldg[], tx: number, ty: number, fromLeft: boolean
): { hit: boolean; finalX: number } {
  const sign = fromLeft ? 1 : -1
  const rad = (angleDeg * Math.PI) / 180
  let x = sx, y = sy
  let vx = sign * speed * Math.cos(rad)
  let vy = -speed * Math.sin(rad)
  const dt = 0.04

  for (let i = 0; i < 500; i++) {
    x += vx * dt; y += vy * dt
    vy += GRAVITY * dt; vx += wind * dt
    if (y > CH + 60 || x < -60 || x > CW + 60) return { hit: false, finalX: x }
    const dx = x - tx, dy = y - ty
    if (Math.sqrt(dx * dx + dy * dy) < GORILLA_R + BANANA_R) return { hit: true, finalX: x }
    for (const b of bldgs) {
      if (x >= b.x && x <= b.x + b.w && y >= CH - b.h) return { hit: false, finalX: x }
    }
  }
  return { hit: false, finalX: x }
}

function aiAim(
  ax: number, ay: number, px: number, py: number,
  wind: number, bldgs: Bldg[], noise: number
): { angle: number; speed: number } {
  for (let speed = 50; speed <= 190; speed += 6) {
    for (let angle = 8; angle <= 82; angle += 1) {
      const r = simThrow(ax, ay, angle, speed, wind, bldgs, px, py, false)
      if (r.hit) {
        const an = angle + (Math.random() - 0.5) * 2 * noise
        const sn = speed + (Math.random() - 0.5) * 2 * (noise * 0.6)
        return { angle: Math.max(5, Math.min(85, an)), speed: Math.max(20, Math.min(200, sn)) }
      }
    }
  }
  return { angle: 35 + Math.random() * 20, speed: 80 + Math.random() * 50 }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GorillasPage() {
  const [phase, setPhase]           = useState<Phase>('idle')
  const [angleVal, setAngleVal]     = useState('')
  const [speedVal, setSpeedVal]     = useState('')
  const [playerWins, setPlayerWins] = useState(0)
  const [aiWins, setAiWins]         = useState(0)
  const [score, setScore]           = useState(0)
  const [roundMsg, setRoundMsg]     = useState('')
  const [wind, setWind]             = useState(0)
  const [saved, setSaved]           = useState(false)
  const [saveError, setSaveError]   = useState('')

  const canvasRef        = useRef<HTMLCanvasElement>(null)
  const animRef          = useRef(0)
  const bldgsRef         = useRef<Bldg[]>([])
  const windRef          = useRef(0)
  const playerPosRef     = useRef({ x: 0, y: 0 })
  const aiPosRef         = useRef({ x: 0, y: 0 })
  const playerAliveRef   = useRef(true)
  const aiAliveRef       = useRef(true)
  const bananaRef        = useRef<BPos | null>(null)
  const explosionRef     = useRef<{ x: number; y: number; r: number } | null>(null)
  const phaseRef         = useRef<Phase>('idle')
  const playerWinsRef    = useRef(0)
  const aiWinsRef        = useRef(0)
  const scoreRef         = useRef(0)
  const throwsRef        = useRef(0)
  const aiNoiseRef       = useRef(16)
  const angleInputRef    = useRef<HTMLInputElement>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { windRef.current = wind }, [wind])

  // ── Draw ──────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const bldgs = bldgsRef.current

    ctx.fillStyle = '#080818'
    ctx.fillRect(0, 0, CW, CH)

    // Moon
    ctx.fillStyle = '#ffffcc'
    ctx.beginPath(); ctx.arc(CW - 60, 35, 22, 0, Math.PI * 2); ctx.fill()

    // Stars
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 40; i++) {
      const sx = (i * 173) % CW
      const sy = (i * 97) % (CH / 2)
      ctx.fillRect(sx, sy, 1, 1)
    }

    // Buildings
    for (const b of bldgs) {
      ctx.fillStyle = '#1e2235'
      ctx.fillRect(b.x, CH - b.h, b.w, b.h)
      ctx.fillStyle = '#ffe88a'
      for (const w of b.wins) {
        if (w.lit) ctx.fillRect(b.x + w.wx, CH - b.h + w.wy, 7, 9)
      }
      ctx.strokeStyle = '#2d3450'; ctx.lineWidth = 1
      ctx.strokeRect(b.x, CH - b.h, b.w, b.h)
    }

    // Ground
    ctx.fillStyle = '#111'
    ctx.fillRect(0, CH - 4, CW, 4)

    // Explosion
    const exp = explosionRef.current
    if (exp) {
      const g = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.r)
      g.addColorStop(0, 'rgba(255,220,50,0.9)')
      g.addColorStop(0.5, 'rgba(255,100,20,0.6)')
      g.addColorStop(1, 'rgba(200,50,0,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(exp.x, exp.y, exp.r, 0, Math.PI * 2); ctx.fill()
    }

    // Gorillas
    drawGorilla(ctx, playerPosRef.current.x, playerPosRef.current.y, playerAliveRef.current, true)
    drawGorilla(ctx, aiPosRef.current.x, aiPosRef.current.y, aiAliveRef.current, false)

    // Banana
    const bn = bananaRef.current
    if (bn) {
      ctx.fillStyle = '#ffe000'
      ctx.beginPath(); ctx.arc(bn.x, bn.y, BANANA_R, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#aa8800'
      ctx.beginPath(); ctx.arc(bn.x, bn.y, 2, 0, Math.PI * 2); ctx.fill()
    }
  }, [])

  // ── Animation loop ────────────────────────────────────────────────────────

  const runAnimation = useCallback((
    start: BPos, bldgs: Bldg[],
    tx: number, ty: number,
    onHit: () => void,
    onMiss: (landX: number) => void,
  ) => {
    cancelAnimationFrame(animRef.current)
    bananaRef.current = { ...start }
    const dt = 0.04

    function tick() {
      const bn = bananaRef.current!
      bn.x += bn.vx * dt; bn.y += bn.vy * dt
      bn.vy += GRAVITY * dt; bn.vx += windRef.current * dt

      if (bn.y > CH + 60 || bn.x < -60 || bn.x > CW + 60) {
        bananaRef.current = null; draw(); onMiss(bn.x); return
      }

      const dx = bn.x - tx, dy = bn.y - ty
      if (Math.sqrt(dx * dx + dy * dy) < GORILLA_R + BANANA_R) {
        bananaRef.current = null
        explosionRef.current = { x: tx, y: ty, r: 5 }
        animateExplosion(onHit); return
      }

      for (const b of bldgs) {
        if (bn.x >= b.x && bn.x <= b.x + b.w && bn.y >= CH - b.h) {
          bananaRef.current = null
          explosionRef.current = { x: bn.x, y: bn.y, r: 5 }
          animateExplosion(() => onMiss(bn.x)); return
        }
      }

      draw()
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
  }, [draw])

  function animateExplosion(onDone: () => void) {
    let r = 5
    function expand() {
      r += 4
      explosionRef.current = { ...explosionRef.current!, r }
      draw()
      if (r < 40) { animRef.current = requestAnimationFrame(expand) }
      else {
        explosionRef.current = null; draw(); onDone()
      }
    }
    animRef.current = requestAnimationFrame(expand)
  }

  // ── Setup round ───────────────────────────────────────────────────────────

  const setupRound = useCallback(() => {
    const bldgs = makeBldgs()
    bldgsRef.current = bldgs
    playerPosRef.current = gorillaXY(bldgs, PLAYER_IDX)
    aiPosRef.current = gorillaXY(bldgs, AI_IDX)
    playerAliveRef.current = true
    aiAliveRef.current = true
    throwsRef.current = 0

    const w = Math.round((Math.random() - 0.5) * 32)
    windRef.current = w
    setWind(w)
    setPhase('player-turn')
    phaseRef.current = 'player-turn'
    setAngleVal(''); setSpeedVal('')
    draw()

    const windTxt = w === 0 ? 'sin viento'
      : w > 0 ? `viento ${w} hacia la derecha` : `viento ${Math.abs(w)} hacia la izquierda`
    announcePolite(`Nueva ronda. ${windTxt}. Tu gorila a la izquierda, enemigo a la derecha. Introduce ángulo y velocidad.`)
    setTimeout(() => angleInputRef.current?.focus(), 80)
  }, [draw])

  // ── Game start ────────────────────────────────────────────────────────────

  function startGame() {
    playerWinsRef.current = 0; aiWinsRef.current = 0
    scoreRef.current = 0; aiNoiseRef.current = 16
    setPlayerWins(0); setAiWins(0); setScore(0)
    setSaved(false); setSaveError(''); setRoundMsg('')
    audio.start()
    setupRound()
  }

  // ── Check round/game end ──────────────────────────────────────────────────

  const checkEnd = useCallback(() => {
    const pw = playerWinsRef.current, aw = aiWinsRef.current
    if (pw >= 2 || aw >= 2) {
      setPhase('game-end'); phaseRef.current = 'game-end'
      if (pw >= 2) {
        audio.start()
        announceAssertive(`¡Ganaste la partida ${pw}–${aw}! Puntuación: ${scoreRef.current}.`)
        setRoundMsg(`¡Ganaste ${pw}–${aw}!`)
      } else {
        audio.gameOver()
        announceAssertive(`La IA ganó la partida ${aw}–${pw}. Puntuación: ${scoreRef.current}.`)
        setRoundMsg(`La IA ganó ${aw}–${pw}`)
      }
    } else {
      setRoundMsg(`Tú: ${pw} — IA: ${aw}`)
      announcePolite(`Ronda terminada. Marcador: tú ${pw}, IA ${aw}. Siguiente ronda en breve.`)
      setTimeout(() => setupRound(), 2200)
    }
  }, [setupRound])

  // ── AI turn ───────────────────────────────────────────────────────────────

  const doAiTurn = useCallback(() => {
    setPhase('ai-turn'); phaseRef.current = 'ai-turn'
    const ap = aiPosRef.current, pp = playerPosRef.current
    const { angle, speed } = aiAim(ap.x, ap.y, pp.x, pp.y, windRef.current, bldgsRef.current, aiNoiseRef.current)

    announcePolite(`La IA lanza. Ángulo ${Math.round(angle)}°, velocidad ${Math.round(speed)}.`)

    setTimeout(() => {
      const rad = (angle * Math.PI) / 180
      const banana: BPos = { x: ap.x, y: ap.y, vx: -speed * Math.cos(rad), vy: -speed * Math.sin(rad) }
      setPhase('ai-throwing'); phaseRef.current = 'ai-throwing'
      audio.gorillaThrow()

      runAnimation(banana, bldgsRef.current, pp.x, pp.y,
        () => {
          playerAliveRef.current = false; draw()
          aiWinsRef.current += 1; setAiWins(aiWinsRef.current)
          audio.gorillaHit()
          announceAssertive('¡La IA te golpeó! Perdiste la ronda.')
          setTimeout(() => checkEnd(), 1800)
        },
        (landX) => {
          aiNoiseRef.current = Math.max(2, aiNoiseRef.current - 3)
          const diff = Math.round(landX - pp.x)
          const metros = Math.abs(diff)
          const dir = diff > 0 ? 'a la derecha' : 'a la izquierda'
          audio.gorillaExplode()
          announcePolite(`La IA falló. Cayó ${metros} metros ${dir} de tu gorila. Tu turno.`)
          setPhase('player-turn'); phaseRef.current = 'player-turn'
          setTimeout(() => angleInputRef.current?.focus(), 80)
        },
      )
    }, 900)
  }, [draw, runAnimation, checkEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Player throw ──────────────────────────────────────────────────────────

  function handleThrow() {
    if (phaseRef.current !== 'player-turn') return
    const angle = parseFloat(angleVal)
    const speed = parseFloat(speedVal)
    if (isNaN(angle) || angle < 1 || angle > 89) {
      announceAssertive('Ángulo inválido. Introduce un valor entre 1 y 89 grados.'); return
    }
    if (isNaN(speed) || speed < 10 || speed > 200) {
      announceAssertive('Velocidad inválida. Introduce un valor entre 10 y 200.'); return
    }

    const pp = playerPosRef.current, ap = aiPosRef.current
    const rad = (angle * Math.PI) / 180
    const banana: BPos = { x: pp.x, y: pp.y, vx: speed * Math.cos(rad), vy: -speed * Math.sin(rad) }

    throwsRef.current += 1
    setPhase('throwing'); phaseRef.current = 'throwing'
    audio.gorillaThrow()
    announcePolite(`Lanzando. Ángulo ${angle}°, velocidad ${speed}.`)

    runAnimation(banana, bldgsRef.current, ap.x, ap.y,
      () => {
        aiAliveRef.current = false; draw()
        const bonus = Math.max(0, 50 - (throwsRef.current - 1) * 10)
        const pts = 100 + bonus
        scoreRef.current += pts; setScore(scoreRef.current)
        playerWinsRef.current += 1; setPlayerWins(playerWinsRef.current)
        audio.gorillaHit()
        announceAssertive(`¡Impacto! ¡Derribaste al gorila enemigo! +${pts} puntos.`)
        setTimeout(() => checkEnd(), 1800)
      },
      (landX) => {
        const diff = Math.round(landX - ap.x)
        const metros = Math.abs(diff)
        const dir = diff > 0 ? 'a la derecha' : 'a la izquierda'
        audio.gorillaExplode()
        announcePolite(`Fallaste. El plátano cayó ${metros} metros ${dir} del objetivo. Turno de la IA.`)
        setTimeout(() => doAiTurn(), 1200)
      },
    )
  }

  // ── Keys ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); announcePolite(INSTRUCTIONS) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { draw() }, [draw])

  // ── Save score ────────────────────────────────────────────────────────────

  async function handleSave() {
    const res = await saveScore('gorillas', score)
    if (res?.error) { setSaveError(res.error); announceAssertive(res.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const windLabel = wind === 0 ? 'Sin viento'
    : wind > 0 ? `Viento → ${wind}` : `Viento ← ${Math.abs(wind)}`
  const isBusy = phase === 'throwing' || phase === 'ai-throwing' || phase === 'ai-turn'

  if (phase === 'idle') {
    return (
      <GameShell title="Gorilas" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Gorilas</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame} className="w-full">Iniciar partida</Button>
        </div>
      </GameShell>
    )
  }

  return (
    <GameShell title="Gorilas" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-4">

        {/* Scoreboard */}
        <div className="flex justify-between text-sm font-mono">
          <span className="text-[#ffd700]">Tú: {'★'.repeat(playerWins)}{'☆'.repeat(2 - playerWins)}</span>
          <span className="text-[#888]">{windLabel}</span>
          <span className="text-[#ff6644]">IA: {'★'.repeat(aiWins)}{'☆'.repeat(2 - aiWins)}</span>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef} width={CW} height={CH} aria-hidden="true"
          className="w-full rounded border border-[#333]"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Status */}
        <p className="text-center text-sm text-[#ffd700] min-h-5" aria-live="polite">
          {phase === 'player-turn' && 'Tu turno — introduce ángulo y velocidad'}
          {phase === 'throwing' && 'El plátano vuela…'}
          {phase === 'ai-turn' && 'La IA calcula la trayectoria…'}
          {phase === 'ai-throwing' && 'El plátano de la IA vuela…'}
          {phase === 'round-end' && roundMsg}
        </p>

        {/* Inputs */}
        <div className="flex flex-wrap gap-4 items-end justify-center">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[#888]">Ángulo (1–89°)</span>
            <input
              ref={angleInputRef}
              type="number" min={1} max={89} step={1}
              value={angleVal}
              onChange={e => setAngleVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleThrow() }}
              disabled={isBusy || phase === 'game-end'}
              className="w-24 px-3 py-2 bg-[#111] border border-[#333] rounded text-white text-center
                         focus:border-[#ffd700] focus:outline-none disabled:opacity-40"
              aria-label="Ángulo de lanzamiento en grados"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[#888]">Velocidad (10–200)</span>
            <input
              type="number" min={10} max={200} step={1}
              value={speedVal}
              onChange={e => setSpeedVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleThrow() }}
              disabled={isBusy || phase === 'game-end'}
              className="w-24 px-3 py-2 bg-[#111] border border-[#333] rounded text-white text-center
                         focus:border-[#ffd700] focus:outline-none disabled:opacity-40"
              aria-label="Velocidad de lanzamiento"
            />
          </label>
          <Button onClick={handleThrow} disabled={isBusy || phase === 'game-end'}>
            Lanzar
          </Button>
        </div>

        {/* Game-end overlay */}
        {phase === 'game-end' && (
          <div className="text-center space-y-4 border-t border-[#333] pt-4">
            <h2
              className="text-2xl font-bold"
              style={{ color: playerWins >= 2 ? '#22c55e' : '#ef4444' }}
            >
              {roundMsg}
            </h2>
            <p className="text-xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
            {!saved ? (
              <>
                <Button onClick={handleSave}>Guardar puntuación</Button>
                {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
              </>
            ) : (
              <p role="status" className="text-[#22c55e]">Guardado.</p>
            )}
            <Button variant="secondary" onClick={startGame}>Jugar de nuevo</Button>
          </div>
        )}

        <p className="text-xs text-[#555] text-center">
          Intro en cualquier campo para lanzar &nbsp;|&nbsp; H: instrucciones
        </p>
      </div>
    </GameShell>
  )
}
