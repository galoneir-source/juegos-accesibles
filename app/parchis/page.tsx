'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── tipos ──────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'player_roll' | 'player_choose' | 'ai_turn' | 'finished'

// ── constantes del tablero ─────────────────────────────────────────────────

const RED_EXIT = 5    // casilla absoluta de salida para el rojo
const BLUE_EXIT = 22  // casilla absoluta de salida para el azul
const BOARD_SIZE = 68 // casillas en el circuito principal
const GOAL = 73       // paso 73 = ficha en la meta (pasillo 68-72 + meta)

// Casillas seguras: salidas de los colores y casillas marcadas en tablero
const SAFE = new Set([0, 5, 8, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63])

const INSTRUCTIONS = `Parchís 1 contra 1. Tú juegas con las fichas rojas, la IA con las azules. Cada jugador tiene 4 fichas.
Lanza el dado con la tecla R. Luego elige qué ficha mover con las teclas 1, 2, 3 o 4.
Para sacar una ficha de casa necesitas sacar un 5. Si sacas un 6 repites turno. Capturar una ficha rival también da turno extra.
Las fichas avanzan según el dado. Al completar el circuito entran en el pasillo final (5 casillas) y llegan a la meta. Gana quien meta las 4 fichas primero.
Las casillas seguras (salidas y marcadas) no permiten capturas. Tecla I para escuchar el estado de la partida.`

// ── lógica de tablero ──────────────────────────────────────────────────────

// Posición absoluta en el tablero (null si está en casa, pasillo o meta)
function absPos(exit: number, step: number): number | null {
  if (step < 0 || step >= BOARD_SIZE) return null
  return (exit + step) % BOARD_SIZE
}

// Paso resultante de mover `dice` desde `step`, o null si el movimiento no es válido
function nextStep(step: number, dice: number): number | null {
  if (step === -1) return dice === 5 ? 0 : null   // salir de casa solo con 5
  if (step >= GOAL) return null                     // ya en meta
  const next = step + dice
  return next > GOAL ? null : next                 // no puede pasarse de meta
}

// Índices de fichas enemigas capturadas al moverse a `myStep`
function capturedPieces(myExit: number, myStep: number, enemyExit: number, enemyPieces: number[]): number[] {
  if (myStep < 0 || myStep >= BOARD_SIZE) return []
  const myAbs = absPos(myExit, myStep)!
  if (SAFE.has(myAbs)) return []
  return enemyPieces.reduce<number[]>((acc, s, i) => {
    if (s >= 0 && s < BOARD_SIZE && absPos(enemyExit, s) === myAbs) acc.push(i)
    return acc
  }, [])
}

// Descripción de posición para el lector de pantalla
function posLabel(exit: number, step: number): string {
  if (step === -1) return 'en casa'
  if (step >= GOAL) return 'en la meta'
  if (step >= BOARD_SIZE) return `en el pasillo final, casilla ${step - BOARD_SIZE + 1} de 5`
  const abs = absPos(exit, step)!
  return `en la casilla ${abs}${SAFE.has(abs) ? ' (segura)' : ''}`
}

// Etiqueta corta para mostrar en botón
function stepTag(exit: number, step: number): string {
  if (step === -1) return 'Casa'
  if (step >= GOAL) return 'Meta'
  if (step >= BOARD_SIZE) return `PF${step - BOARD_SIZE + 1}`
  return `${absPos(exit, step)}`
}

// ── IA ─────────────────────────────────────────────────────────────────────

function aiPickPiece(aiPieces: number[], playerPieces: number[], dice: number): number | null {
  const moves = aiPieces
    .map((s, i) => ({ i, next: nextStep(s, dice) }))
    .filter((m): m is { i: number; next: number } => m.next !== null)

  if (moves.length === 0) return null

  // Prioridad 1: capturar ficha del jugador
  for (const { i, next } of moves) {
    if (capturedPieces(BLUE_EXIT, next, RED_EXIT, playerPieces).length > 0) return i
  }
  // Prioridad 2: sacar ficha de casa
  const exiting = moves.find(m => aiPieces[m.i] === -1)
  if (exiting) return exiting.i
  // Prioridad 3: avanzar la más adelantada
  return moves.reduce((best, m) =>
    m.next > (nextStep(aiPieces[best.i], dice) ?? -1) ? m : best
  , moves[0]).i
}

// ── componente principal ────────────────────────────────────────────────────

export default function ParchisPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [playerPieces, setPlayerPieces] = useState([-1, -1, -1, -1])
  const [aiPieces, setAiPieces] = useState([-1, -1, -1, -1])
  const [dice, setDice] = useState<number | null>(null)
  const [sixStreak, setSixStreak] = useState(0)
  const [score, setScore] = useState(0)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [lastMsg, setLastMsg] = useState('')

  const stateRef = useRef({ phase, playerPieces, aiPieces, dice, sixStreak })
  useEffect(() => {
    stateRef.current = { phase, playerPieces, aiPieces, dice, sixStreak }
  })

  // ── iniciar partida ──────────────────────────────────────────────────────

  function startGame() {
    setPlayerPieces([-1, -1, -1, -1])
    setAiPieces([-1, -1, -1, -1])
    setDice(null)
    setSixStreak(0)
    setScore(0)
    setSaved(false)
    setSaveError('')
    setLastMsg('')
    setPhase('player_roll')
    audio.deal()
    announcePolite(
      'Parchís. Fichas rojas eres tú, azules la IA. Las 4 fichas están en casa. ' +
      'Pulsa R para lanzar el dado.'
    )
  }

  // ── lanzar dado ─────────────────────────────────────────────────────────

  function rollDice() {
    const { phase: ph, playerPieces: pp } = stateRef.current
    if (ph !== 'player_roll') return

    const d = Math.floor(Math.random() * 6) + 1
    setDice(d)
    audio.deal()

    // tres seises seguidos: perder turno
    if (d === 6) {
      const streak = sixStreak + 1
      setSixStreak(streak)
      if (streak >= 3) {
        setSixStreak(0)
        setDice(null)
        announceAssertive('¡Tres seises seguidos! Pierdes el turno.')
        setTimeout(() => triggerAiTurn(), 900)
        return
      }
    } else {
      setSixStreak(0)
    }

    const hasMoves = pp.some(s => nextStep(s, d) !== null)
    if (!hasMoves) {
      announcePolite(`Sacas un ${d}. Ninguna ficha puede moverse. Turno de la IA.`)
      setDice(null)
      setTimeout(() => triggerAiTurn(), 800)
      return
    }

    const movable = pp.map((s, i) => ({ i, canMove: nextStep(s, d) !== null })).filter(m => m.canMove)
    setPhase('player_choose')
    announcePolite(
      `Sacas un ${d}.${d === 6 ? ' ¡Seis! Repetirás turno.' : ''} ` +
      `Puedes mover: ficha ${movable.map(m => m.i + 1).join(', ')}. Pulsa 1-4 para elegir.`
    )
  }

  // ── mover ficha del jugador ──────────────────────────────────────────────

  function movePiece(idx: number) {
    const { phase: ph, playerPieces: pp, aiPieces: ap, dice: d } = stateRef.current
    if (ph !== 'player_choose' || d === null || idx < 0 || idx > 3) return

    const next = nextStep(pp[idx], d)
    if (next === null) {
      announceAssertive(`La ficha ${idx + 1} no puede moverse con un ${d}.`)
      return
    }

    const newPP = [...pp]; newPP[idx] = next
    const captured = capturedPieces(RED_EXIT, next, BLUE_EXIT, ap)
    const newAP = [...ap]; captured.forEach(ci => { newAP[ci] = -1 })

    setPlayerPieces(newPP)
    setAiPieces(newAP)
    setDice(null)

    const enterStretch = next === BOARD_SIZE
    const reachedGoal = next >= GOAL
    const captureMsg = captured.length > 0
      ? ` Capturas ficha ${captured.map(c => c + 1).join(' y ')} de la IA. ¡Turno extra!`
      : ''
    const stretchMsg = enterStretch ? ' Entra en el pasillo final.' : reachedGoal ? ' ¡Llega a la meta!' : ''
    const msg = `Ficha ${idx + 1} — ${posLabel(RED_EXIT, next)}.${stretchMsg}${captureMsg}`
    setLastMsg(msg)

    if (reachedGoal || captured.length > 0) audio.correct()
    else audio.click()

    // ¿ganaste?
    if (newPP.every(s => s >= GOAL)) {
      const pts = 100
      setScore(pts)
      setPhase('finished')
      announceAssertive('¡Ganaste! Todas tus fichas llegaron a la meta.')
      return
    }

    announcePolite(msg)
    const extraTurn = d === 6 || captured.length > 0
    if (extraTurn) {
      setPhase('player_roll')
      if (!captureMsg) announcePolite('Turno extra por el seis. R para lanzar.')
    } else {
      setPhase('ai_turn')
      setTimeout(() => runAiStep(newPP, newAP), 800)
    }
  }

  // ── turno de la IA ───────────────────────────────────────────────────────

  function triggerAiTurn() {
    const { playerPieces: pp, aiPieces: ap } = stateRef.current
    runAiStep(pp, ap)
  }

  function runAiStep(pp: number[], ap: number[]) {
    const d = Math.floor(Math.random() * 6) + 1
    const idx = aiPickPiece([...ap], [...pp], d)

    if (idx === null) {
      announcePolite(`La IA saca un ${d} pero no puede mover. Tu turno. R para lanzar.`)
      setPhase('player_roll')
      return
    }

    const next = nextStep(ap[idx], d)!
    const newAP = [...ap]; newAP[idx] = next
    const captured = capturedPieces(BLUE_EXIT, next, RED_EXIT, pp)
    const newPP = [...pp]; captured.forEach(ci => { newPP[ci] = -1 })

    setAiPieces(newAP)
    setPlayerPieces(newPP)

    const enterStretch = next === BOARD_SIZE
    const reachedGoal = next >= GOAL
    const captureMsg = captured.length > 0
      ? ` Captura tu ficha ${captured.map(c => c + 1).join(' y ')}.`
      : ''
    const stretchMsg = enterStretch ? ' Entra en su pasillo final.' : reachedGoal ? ' ¡Llega a la meta!' : ''
    const msg = `IA saca ${d}, mueve ficha ${idx + 1} — ${posLabel(BLUE_EXIT, next)}.${stretchMsg}${captureMsg}`
    setLastMsg(msg)

    if (captured.length > 0) audio.gameOver()
    else if (reachedGoal) audio.correct()

    // ¿ganó la IA?
    if (newAP.every(s => s >= GOAL)) {
      setPhase('finished')
      announceAssertive(`${msg} ¡La IA gana la partida!`)
      return
    }

    announcePolite(msg)
    const extraTurn = d === 6 || captured.length > 0
    if (extraTurn) {
      announcePolite('La IA tiene turno extra.')
      setTimeout(() => runAiStep(newPP, newAP), 1000)
    } else {
      setPhase('player_roll')
      announcePolite('Tu turno. R para lanzar el dado.')
    }
  }

  // ── leer estado ──────────────────────────────────────────────────────────

  const readStatus = useCallback(() => {
    const { playerPieces: pp, aiPieces: ap, phase: ph, dice: d } = stateRef.current
    const phLabel =
      ph === 'player_roll' ? 'Tu turno — pulsa R para lanzar.' :
      ph === 'player_choose' ? `Dado: ${d}. Elige ficha con 1-4.` :
      ph === 'ai_turn' ? 'Turno de la IA.' : 'Partida terminada.'
    announcePolite(
      `${phLabel} ` +
      `Tus fichas: ${pp.map((s, i) => `${i + 1}: ${posLabel(RED_EXIT, s)}`).join(', ')}. ` +
      `IA: ${ap.map((s, i) => `${i + 1}: ${posLabel(BLUE_EXIT, s)}`).join(', ')}.`
    )
  }, [])

  // ── teclado ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'idle') return
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      const key = e.key.toLowerCase()
      const { phase: ph } = stateRef.current
      switch (key) {
        case 'r': if (ph === 'player_roll') rollDice(); break
        case 'i': readStatus(); break
        case 'n': if (ph === 'finished') startGame(); break
        case '1': movePiece(0); break
        case '2': movePiece(1); break
        case '3': movePiece(2); break
        case '4': movePiece(3); break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [phase, readStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── guardar puntuación ────────────────────────────────────────────────────

  async function handleSave() {
    const result = await saveScore('parchis', score)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── render: inicio ────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Parchís" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Parchís</h2>
          <p className="text-[#888] text-sm leading-relaxed max-w-lg mx-auto">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame}>Comenzar partida</Button>
        </div>
      </GameShell>
    )
  }

  // ── render: juego ─────────────────────────────────────────────────────────

  const isMyTurn = phase === 'player_roll' || phase === 'player_choose'
  const movablePieces = phase === 'player_choose' && dice !== null
    ? playerPieces.map((s, i) => ({ i, canMove: nextStep(s, dice) !== null }))
    : playerPieces.map((_, i) => ({ i, canMove: false }))

  const playerGoal = playerPieces.filter(s => s >= GOAL).length
  const aiGoal = aiPieces.filter(s => s >= GOAL).length

  return (
    <GameShell title="Parchís" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-5">

        {/* Progreso */}
        <section aria-label={`Progreso: tú ${playerGoal} de 4 fichas en meta, IA ${aiGoal} de 4`}>
          <div className="flex gap-6 text-sm">
            <span>Tú en meta: <strong className="text-[#ffd700]">{playerGoal}</strong>/4</span>
            <span>IA en meta: <strong className="text-[#888]">{aiGoal}</strong>/4</span>
          </div>
        </section>

        {/* Dado */}
        <section aria-label={dice !== null ? `Dado: ${dice}` : 'Dado sin lanzar'}>
          <div className="flex items-center gap-4">
            <div
              aria-hidden="true"
              className={`w-14 h-14 rounded-lg border-2 flex items-center justify-center text-2xl font-bold select-none ${
                dice !== null ? 'border-[#ffd700] text-[#ffd700]' : 'border-[#444] text-[#555]'
              }`}
            >
              {dice ?? '?'}
            </div>
            {phase === 'player_roll' && (
              <Button onClick={rollDice} aria-label="Lanzar dado (tecla R)">R — Lanzar dado</Button>
            )}
            {phase === 'ai_turn' && (
              <span className="text-[#888] text-sm" aria-live="polite">Turno de la IA…</span>
            )}
          </div>
        </section>

        {/* Fichas del jugador */}
        <section aria-label={`Tus fichas (rojas): ${playerPieces.map((s, i) => `ficha ${i + 1} ${posLabel(RED_EXIT, s)}`).join(', ')}`}>
          <p className="text-[#888] text-xs mb-2">
            Tus fichas <span aria-hidden="true" className="text-[#ef4444]">●</span> rojas
          </p>
          <div className="flex gap-2 flex-wrap">
            {playerPieces.map((step, i) => {
              const canMove = movablePieces[i].canMove
              return (
                <button
                  key={i}
                  onClick={() => movePiece(i)}
                  disabled={!canMove}
                  aria-label={`Ficha ${i + 1}: ${posLabel(RED_EXIT, step)}${canMove ? ' — pulsa para mover' : ''}`}
                  className={`px-3 py-2 rounded text-sm font-mono border-2 transition-colors disabled:cursor-default ${
                    step >= GOAL
                      ? 'border-[#22c55e] text-[#22c55e] bg-[#22c55e]/10'
                      : canMove
                      ? 'border-[#ffd700] text-[#ffd700] bg-[#ffd700]/10 hover:bg-[#ffd700]/20'
                      : 'border-[#ef4444] text-[#ef4444] opacity-60'
                  }`}
                >
                  {i + 1}: {stepTag(RED_EXIT, step)}
                </button>
              )
            })}
          </div>
        </section>

        {/* Fichas de la IA */}
        <section aria-label={`Fichas de la IA (azules): ${aiPieces.map((s, i) => `ficha ${i + 1} ${posLabel(BLUE_EXIT, s)}`).join(', ')}`}>
          <p className="text-[#888] text-xs mb-2">
            Fichas IA <span aria-hidden="true" className="text-[#60a5fa]">●</span> azules
          </p>
          <div className="flex gap-2 flex-wrap">
            {aiPieces.map((step, i) => (
              <div
                key={i}
                aria-hidden="true"
                className={`px-3 py-2 rounded text-sm font-mono border ${
                  step >= GOAL
                    ? 'border-[#22c55e] text-[#22c55e]'
                    : 'border-[#60a5fa] text-[#60a5fa] opacity-70'
                }`}
              >
                {i + 1}: {stepTag(BLUE_EXIT, step)}
              </div>
            ))}
          </div>
        </section>

        {/* Último mensaje */}
        {lastMsg && (
          <p className="text-sm text-[#aaa]" aria-live="polite">{lastMsg}</p>
        )}

        {/* Botones de acción cuando el jugador elige ficha */}
        {phase === 'player_choose' && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Elige ficha a mover">
            {movablePieces.filter(m => m.canMove).map(({ i }) => (
              <Button key={i} onClick={() => movePiece(i)} aria-label={`Mover ficha ${i + 1} (tecla ${i + 1})`}>
                {i + 1} — Ficha {i + 1} ({stepTag(RED_EXIT, playerPieces[i])})
              </Button>
            ))}
          </div>
        )}

        {/* Fin de partida */}
        {phase === 'finished' && (
          <div className="space-y-3">
            <p role="status" className={`text-lg font-bold ${playerPieces.every(s => s >= GOAL) ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
              {playerPieces.every(s => s >= GOAL) ? '¡Ganaste la partida!' : 'La IA ganó la partida.'}
            </p>
            <div className="flex flex-wrap gap-3 items-center">
              <Button onClick={startGame} aria-label="Nueva partida (tecla N)">N — Nueva partida</Button>
              {!saved ? (
                <>
                  <Button variant="secondary" onClick={handleSave}>Guardar puntuación</Button>
                  {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
                </>
              ) : (
                <p role="status" className="text-[#22c55e] text-sm">Guardado.</p>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-[#555]">
          R: lanzar dado · 1-4: mover ficha · I: estado · N: nueva partida
        </p>
      </div>
    </GameShell>
  )
}
