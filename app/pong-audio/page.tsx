'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

type Phase = 'idle' | 'playing' | 'won' | 'lost'

const W = 560
const H = 320
const PADDLE_H = 72
const PADDLE_W = 12
const BALL_R = 7
const PADDLE_MARGIN = 16
const WIN_SCORE = 7
const PLAYER_SPEED = 5
// Ball ping intervals in ms: faster when ball approaches player
const PING_APPROACHING = 210
const PING_AWAY = 480

interface Level {
  name: string
  ballSpeed: number
  aiLerp: number   // lerp factor per frame: low = slow reaction, high = sharp tracking
  baseScore: number
}

const LEVELS: Level[] = [
  { name: 'Fácil',   ballSpeed: 3.5, aiLerp: 0.025, baseScore: 100 },
  { name: 'Medio',   ballSpeed: 5.0, aiLerp: 0.06,  baseScore: 200 },
  { name: 'Difícil', ballSpeed: 7.0, aiLerp: 0.12,  baseScore: 400 },
]

const INSTRUCTIONS =
  'Pong de Audio. Controla la paleta izquierda con las flechas arriba y abajo, o las teclas W y S. ' +
  'Escucha el sonido de la pelota: el canal izquierdo o derecho indica su posición horizontal, ' +
  'y el tono agudo o grave indica si está arriba o abajo en la pantalla. ' +
  'Cuando la pelota se acerca a tu paleta, el ping suena con más frecuencia. ' +
  `Marca ${WIN_SCORE} puntos antes que el rival para ganar. ` +
  'Barra espaciadora: escuchar posición de la pelota ahora mismo. ' +
  'H: repetir estas instrucciones.'

export default function PongAudioPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [levelIdx, setLevelIdx] = useState(0)
  const [playerScore, setPlayerScore] = useState(0)
  const [aiScore, setAiScore] = useState(0)
  const [finalScore, setFinalScore] = useState(0)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastPingRef = useRef(0)
  const paddleAtEdgeRef = useRef<'top' | 'bottom' | null>(null)
  const lastPaddlePingRef = useRef(0)

  // All mutable game state lives in refs so the rAF loop never closes over stale values
  const ballRef = useRef({ x: W / 2, y: H / 2, vx: 0, vy: 0 })
  const playerYRef = useRef(H / 2)
  const aiYRef = useRef(H / 2)
  const playerScoreRef = useRef(0)
  const aiScoreRef = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const levelIdxRef = useRef(0)
  const maxSpeedRef = useRef(3.5)
  const keysRef = useRef({ up: false, down: false })

  const syncPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const tick = useCallback(() => {
    if (phaseRef.current !== 'playing') return

    const lv = LEVELS[levelIdxRef.current]
    const ball = ballRef.current

    function resetBall(serveTowardPlayer: boolean) {
      const speed = lv.ballSpeed
      const angleAbs = Math.PI / 9 + Math.random() * (Math.PI / 12)  // 20–35 deg
      const vertSign = Math.random() < 0.5 ? 1 : -1
      const horizDir = serveTowardPlayer ? -1 : 1
      ballRef.current = {
        x: W / 2,
        y: H / 2,
        vx: horizDir * speed * Math.cos(angleAbs),
        vy: vertSign * speed * Math.sin(angleAbs),
      }
      maxSpeedRef.current = speed
    }

    // ── Move player paddle ────────────────────────────────────────────────────
    if (keysRef.current.up) {
      const newY = Math.max(PADDLE_H / 2, playerYRef.current - PLAYER_SPEED)
      playerYRef.current = newY
      if (newY === PADDLE_H / 2 && paddleAtEdgeRef.current !== 'top') {
        audio.pongEdge(true)
        paddleAtEdgeRef.current = 'top'
      } else if (newY > PADDLE_H / 2) {
        paddleAtEdgeRef.current = null
      }
    }
    if (keysRef.current.down) {
      const newY = Math.min(H - PADDLE_H / 2, playerYRef.current + PLAYER_SPEED)
      playerYRef.current = newY
      if (newY === H - PADDLE_H / 2 && paddleAtEdgeRef.current !== 'bottom') {
        audio.pongEdge(false)
        paddleAtEdgeRef.current = 'bottom'
      } else if (newY < H - PADDLE_H / 2) {
        paddleAtEdgeRef.current = null
      }
    }

    // Tono de posición de paleta: suena cada 80 ms mientras el jugador se mueve
    if (keysRef.current.up || keysRef.current.down) {
      const now = performance.now()
      if (now - lastPaddlePingRef.current >= 80) {
        const t = (playerYRef.current - PADDLE_H / 2) / (H - PADDLE_H) // 0 = arriba, 1 = abajo
        const freq = 800 - t * 600  // 800 Hz (arriba) → 200 Hz (abajo)
        audio.pongPaddlePos(freq)
        lastPaddlePingRef.current = now
      }
    }

    // ── Move ball ─────────────────────────────────────────────────────────────
    ball.x += ball.vx
    ball.y += ball.vy

    // Top/bottom walls
    if (ball.y - BALL_R <= 0) {
      ball.y = BALL_R
      ball.vy = Math.abs(ball.vy)
      audio.pongWall()
    } else if (ball.y + BALL_R >= H) {
      ball.y = H - BALL_R
      ball.vy = -Math.abs(ball.vy)
      audio.pongWall()
    }

    // ── Paddle collisions ─────────────────────────────────────────────────────
    const playerRight = PADDLE_MARGIN + PADDLE_W
    if (ball.vx < 0 && ball.x - BALL_R <= playerRight && ball.x >= PADDLE_MARGIN - 2) {
      const pY = playerYRef.current
      if (ball.y >= pY - PADDLE_H / 2 - BALL_R && ball.y <= pY + PADDLE_H / 2 + BALL_R) {
        const offset = Math.max(-1, Math.min(1, (ball.y - pY) / (PADDLE_H / 2)))
        const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.04, maxSpeedRef.current * 1.5)
        const angle = offset * (Math.PI / 3)
        ball.vx = speed * Math.cos(angle)
        ball.vy = speed * Math.sin(angle)
        ball.x = playerRight + BALL_R
        audio.pongPaddle(true)
      }
    }

    const aiLeft = W - PADDLE_MARGIN - PADDLE_W
    if (ball.vx > 0 && ball.x + BALL_R >= aiLeft && ball.x <= W - PADDLE_MARGIN + 2) {
      const aY = aiYRef.current
      if (ball.y >= aY - PADDLE_H / 2 - BALL_R && ball.y <= aY + PADDLE_H / 2 + BALL_R) {
        const offset = Math.max(-1, Math.min(1, (ball.y - aY) / (PADDLE_H / 2)))
        const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.04, maxSpeedRef.current * 1.5)
        const angle = offset * (Math.PI / 3)
        ball.vx = -speed * Math.cos(angle)
        ball.vy = speed * Math.sin(angle)
        ball.x = aiLeft - BALL_R
        audio.pongPaddle(false)
      }
    }

    // ── Scoring ───────────────────────────────────────────────────────────────
    if (ball.x + BALL_R < 0) {
      // AI scores
      const ns = aiScoreRef.current + 1
      aiScoreRef.current = ns
      setAiScore(ns)
      if (ns >= WIN_SCORE) {
        syncPhase('lost')
        audio.gameOver()
        announceAssertive(`Fin del juego. Has perdido. Resultado final: tú ${playerScoreRef.current}, rival ${ns}.`)
        return
      }
      audio.incorrect()
      announceAssertive(`Punto para el rival. ${playerScoreRef.current} – ${ns}.`)
      resetBall(false)
    } else if (ball.x - BALL_R > W) {
      // Player scores
      const ns = playerScoreRef.current + 1
      playerScoreRef.current = ns
      setPlayerScore(ns)
      if (ns >= WIN_SCORE) {
        const pts = lv.baseScore + Math.max(0, ns - aiScoreRef.current) * 30
        setFinalScore(pts)
        syncPhase('won')
        audio.correct()
        announceAssertive(`¡Has ganado! Resultado: tú ${ns}, rival ${aiScoreRef.current}. Puntuación: ${pts}.`)
        return
      }
      audio.correct()
      announceAssertive(`¡Punto tuyo! ${ns} – ${aiScoreRef.current}.`)
      resetBall(true)
    }

    // ── AI movement (lerp toward ball) ────────────────────────────────────────
    aiYRef.current += (ballRef.current.y - aiYRef.current) * lv.aiLerp
    aiYRef.current = Math.max(PADDLE_H / 2, Math.min(H - PADDLE_H / 2, aiYRef.current))

    // ── Ball position ping ────────────────────────────────────────────────────
    const now = performance.now()
    const approaching = ballRef.current.vx < 0
    const pingInterval = approaching ? PING_APPROACHING : PING_AWAY
    if (now - lastPingRef.current >= pingInterval) {
      const b = ballRef.current
      const pan = (b.x / W) * 2 - 1
      const freqY = 750 - (b.y / H) * 450  // top = 750 Hz, bottom = 300 Hz
      audio.pongBall(pan, freqY)
      lastPingRef.current = now
    }

    // ── Draw canvas (visual aid, aria-hidden) ─────────────────────────────────
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')!
      const b = ballRef.current
      const pY = playerYRef.current
      const aY = aiYRef.current

      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, W, H)

      ctx.setLineDash([6, 8])
      ctx.strokeStyle = '#2a2a2a'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke()
      ctx.setLineDash([])

      ctx.font = 'bold 26px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffd700'
      ctx.fillText(`${playerScoreRef.current}`, W / 2 - 55, 34)
      ctx.fillStyle = '#ef4444'
      ctx.fillText(`${aiScoreRef.current}`, W / 2 + 55, 34)

      ctx.fillStyle = '#ffd700'
      ctx.fillRect(PADDLE_MARGIN, pY - PADDLE_H / 2, PADDLE_W, PADDLE_H)

      ctx.fillStyle = '#ef4444'
      ctx.fillRect(W - PADDLE_MARGIN - PADDLE_W, aY - PADDLE_H / 2, PADDLE_W, PADDLE_H)

      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
      ctx.fill()
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [syncPhase])

  function startGame(lIdx: number) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const lv = LEVELS[lIdx]
    levelIdxRef.current = lIdx
    playerScoreRef.current = 0
    aiScoreRef.current = 0
    playerYRef.current = H / 2
    aiYRef.current = H / 2
    maxSpeedRef.current = lv.ballSpeed
    keysRef.current = { up: false, down: false }
    paddleAtEdgeRef.current = null
    lastPaddlePingRef.current = 0

    const angleAbs = Math.PI / 9 + Math.random() * (Math.PI / 12)
    const vertSign = Math.random() < 0.5 ? 1 : -1
    ballRef.current = {
      x: W / 2, y: H / 2,
      vx: -lv.ballSpeed * Math.cos(angleAbs),
      vy: vertSign * lv.ballSpeed * Math.sin(angleAbs),
    }

    setLevelIdx(lIdx)
    setPlayerScore(0)
    setAiScore(0)
    setFinalScore(0)
    setSaved(false)
    setSaveError('')
    syncPhase('playing')
    audio.start()
    lastPingRef.current = performance.now()
    announcePolite(`Pong ${lv.name}. Marca ${WIN_SCORE} puntos para ganar. La pelota viene hacia ti.`)
    rafRef.current = requestAnimationFrame(tick)
  }

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  // Keyboard controls while playing
  useEffect(() => {
    if (phase !== 'playing') return

    function onKey(e: KeyboardEvent) {
      const down = e.type === 'keydown'
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          keysRef.current.up = down
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          keysRef.current.down = down
          break
        case ' ':
          if (!down) break
          e.preventDefault()
          {
            const b = ballRef.current
            const pan = (b.x / W) * 2 - 1
            const freqY = 750 - (b.y / H) * 450
            audio.pongBall(pan, freqY)
            lastPingRef.current = performance.now()
          }
          break
        case 'h':
        case 'H':
          if (!down) break
          announcePolite(INSTRUCTIONS)
          break
        case 'r':
        case 'R':
          if (!down) break
          announcePolite(
            `Tú ${playerScoreRef.current}, rival ${aiScoreRef.current}. ` +
            `Pelota ${ballRef.current.vx < 0 ? 'viene hacia ti' : 'va hacia el rival'}.`
          )
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
    const result = await saveScore('pong', finalScore)
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
      <GameShell title="Pong de Audio" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Pong de Audio</h2>
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
      <GameShell title="Pong de Audio" instructions={INSTRUCTIONS} score={finalScore}>
        <div className="text-center space-y-6">
          <h2
            className="text-2xl font-bold"
            style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}
          >
            {phase === 'won' ? '¡Has ganado!' : '¡Has perdido!'}
          </h2>

          <p className="text-xl font-mono" aria-live="polite">
            Resultado:{' '}
            <span className="text-[#ffd700]">{playerScoreRef.current}</span>
            {' – '}
            <span className="text-[#ef4444]">{aiScoreRef.current}</span>
          </p>

          {phase === 'won' && (
            <>
              <p className="text-3xl font-mono font-bold" aria-live="polite">
                Puntuación: {finalScore}
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
    <GameShell title="Pong de Audio" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
      <div className="space-y-4">
        <div
          className="flex justify-between text-lg font-mono"
          aria-live="polite"
          aria-label={`Marcador: tú ${playerScore}, rival ${aiScore}`}
        >
          <span className="text-[#ffd700]">
            Tú: <strong>{playerScore}</strong>
          </span>
          <span className="text-[#555] text-sm self-center">— meta: {WIN_SCORE} —</span>
          <span className="text-[#ef4444]">
            Rival: <strong>{aiScore}</strong>
          </span>
        </div>

        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-hidden="true"
          className="w-full max-w-[560px] border border-[#333] rounded block mx-auto bg-[#0a0a0a]"
        />

        <p className="text-xs text-[#555] text-center">
          ↑↓ / W S — mover paleta &nbsp;|&nbsp; Espacio — escuchar pelota &nbsp;|&nbsp; R — leer estado &nbsp;|&nbsp; H — instrucciones
        </p>
      </div>
    </GameShell>
  )
}
