'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ─── Types & constants ────────────────────────────────────────────────────────

type Dir = 'left' | 'center' | 'right'
type Phase = 'idle' | 'shooting' | 'defending' | 'end'

const DIR_NAME: Record<Dir, string> = { left: 'izquierda', center: 'centro', right: 'derecha' }
const DIR_ARROW: Record<Dir, string> = { left: '←', center: '↓', right: '→' }
const DIRS: Dir[] = ['left', 'center', 'right']
const ROUNDS = 5

const INSTRUCTIONS =
  'Penaltis. Cinco tandas. Primero tiras tú, luego tira el rival. ' +
  'Al tirar: flecha izquierda para disparar a la izquierda, ' +
  'flecha abajo o espacio para el centro, flecha derecha para la derecha. ' +
  'Al defender: mismas teclas para lanzarte en esa dirección. ' +
  'H para repetir instrucciones.'

// ─── AI logic ─────────────────────────────────────────────────────────────────

function aiKeeper(history: Dir[]): Dir {
  // Look at last 3 shots and bias toward the most frequent one (50 % of the time)
  const last = history.slice(-3)
  if (last.length >= 2) {
    const counts: Record<Dir, number> = { left: 0, center: 0, right: 0 }
    last.forEach(d => counts[d]++)
    const top = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as Dir)
    if (Math.random() < 0.5) return top
  }
  const r = Math.random()
  return r < 0.33 ? 'left' : r < 0.67 ? 'center' : 'right'
}

function aiKick(): Dir {
  const r = Math.random()
  return r < 0.35 ? 'left' : r < 0.65 ? 'center' : 'right'
}

// ─── Zone visual ──────────────────────────────────────────────────────────────

function GoalVisual({ shot, keeper, label }: {
  shot: Dir | null
  keeper: Dir | null
  label: string
}) {
  return (
    <div className="my-4" aria-hidden="true">
      <p className="text-xs text-[#555] text-center mb-1">{label}</p>
      <div className="flex border border-[#444] rounded overflow-hidden max-w-xs mx-auto">
        {DIRS.map(dir => {
          const isShot   = shot   === dir
          const isKeeper = keeper === dir
          const isGoal   = isShot && !isKeeper
          const isSaved  = isShot && isKeeper
          return (
            <div
              key={dir}
              className={[
                'flex-1 h-20 flex flex-col items-center justify-center gap-1 border-r last:border-r-0 border-[#333] text-xs transition-colors',
                isGoal  ? 'bg-[#052e16] text-[#22c55e]'  :
                isSaved ? 'bg-[#450a0a] text-[#f87171]'  :
                isKeeper && !isShot ? 'bg-[#1a1a2e] text-[#818cf8]' :
                'bg-[#0d0d0d] text-[#555]',
              ].join(' ')}
            >
              <span className="text-base">{DIR_ARROW[dir]}</span>
              {isGoal   && <span className="font-bold">GOL</span>}
              {isSaved  && <span className="font-bold">PARADO</span>}
              {isKeeper && !isShot && <span>🧤</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Score display ─────────────────────────────────────────────────────────────

function ScoreBar({ round, playerGoals, aiGoals }: { round: number; playerGoals: number; aiGoals: number }) {
  return (
    <div className="flex items-center justify-between text-sm mb-4" aria-live="polite">
      <span className="text-[#ffd700] font-bold text-lg">{playerGoals}</span>
      <span className="text-[#555] text-xs">
        Tanda {Math.min(round, ROUNDS)} de {ROUNDS}
      </span>
      <span className="text-[#888] font-bold text-lg">{aiGoals}</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PenaltisPage() {
  const [phase, setPhase]             = useState<Phase>('idle')
  const [round, setRound]             = useState(1)
  const [playerGoals, setPlayerGoals] = useState(0)
  const [aiGoals, setAiGoals]         = useState(0)
  const [playerSaves, setPlayerSaves] = useState(0)
  const [lastMsg, setLastMsg]         = useState('')
  const [shotDir, setShotDir]         = useState<Dir | null>(null)
  const [keeperDir, setKeeperDir]     = useState<Dir | null>(null)
  const [score, setScore]             = useState(0)
  const [saved, setSaved]             = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [busy, setBusy]               = useState(false)

  // Refs for always-current values (avoids stale closures in callbacks)
  const phaseRef        = useRef<Phase>('idle')
  const busyRef         = useRef(false)
  const roundRef        = useRef(1)
  const playerGoalsRef  = useRef(0)
  const aiGoalsRef      = useRef(0)
  const playerSavesRef  = useRef(0)
  const historyRef      = useRef<Dir[]>([])

  // ── Start game ──────────────────────────────────────────────────────────────

  function startGame() {
    busyRef.current       = false
    setBusy(false)
    roundRef.current      = 1
    playerGoalsRef.current = 0
    aiGoalsRef.current    = 0
    playerSavesRef.current = 0
    historyRef.current    = []
    phaseRef.current      = 'shooting'

    setPhase('shooting')
    setRound(1)
    setPlayerGoals(0)
    setAiGoals(0)
    setPlayerSaves(0)
    setLastMsg('')
    setShotDir(null)
    setKeeperDir(null)
    setScore(0)
    setSaved(false)
    setSaveError('')

    audio.start()
    announcePolite(`Tanda 1 de ${ROUNDS}. Es tu turno de tirar. Elige dirección.`)
  }

  // ── Shoot ───────────────────────────────────────────────────────────────────

  const shoot = useCallback((dir: Dir) => {
    if (busyRef.current || phaseRef.current !== 'shooting') return
    busyRef.current = true
    setBusy(true)

    const keeper = aiKeeper(historyRef.current)
    const isGoal = dir !== keeper

    audio.penaltyKick()
    historyRef.current = [...historyRef.current, dir]

    if (isGoal) playerGoalsRef.current++
    setPlayerGoals(playerGoalsRef.current)
    setShotDir(dir)
    setKeeperDir(keeper)

    setTimeout(() => { isGoal ? audio.penaltyGoal() : audio.penaltySave() }, 350)

    const msg = isGoal
      ? `¡GOL! Disparaste a la ${DIR_NAME[dir]}. El portero fue a la ${DIR_NAME[keeper]}.`
      : `Parado. Disparaste a la ${DIR_NAME[dir]}. El portero fue a la ${DIR_NAME[keeper]}.`
    setLastMsg(msg)
    setTimeout(() => announceAssertive(msg), 360)

    setTimeout(() => {
      phaseRef.current = 'defending'
      setPhase('defending')
      setShotDir(null)
      setKeeperDir(null)
      setLastMsg('')
      busyRef.current = false
      setBusy(false)
      announcePolite('El rival tira. ¿Hacia dónde te lanzas?')
    }, 2300)
  }, [])

  // ── Defend ──────────────────────────────────────────────────────────────────

  const defend = useCallback((dir: Dir) => {
    if (busyRef.current || phaseRef.current !== 'defending') return
    busyRef.current = true
    setBusy(true)

    const kickDir = aiKick()
    const isSave = dir === kickDir

    audio.penaltyKick()

    if (!isSave) aiGoalsRef.current++
    else         playerSavesRef.current++
    setAiGoals(aiGoalsRef.current)
    setPlayerSaves(playerSavesRef.current)
    setShotDir(kickDir)
    setKeeperDir(dir)

    setTimeout(() => { isSave ? audio.penaltySave() : audio.penaltyGoal() }, 350)

    const msg = isSave
      ? `¡Parado! El rival disparó a la ${DIR_NAME[kickDir]}. Tú fuiste a la ${DIR_NAME[dir]}.`
      : `Gol del rival. Disparó a la ${DIR_NAME[kickDir]}, tú fuiste a la ${DIR_NAME[dir]}.`
    setLastMsg(msg)
    setTimeout(() => announceAssertive(msg), 360)

    setTimeout(() => {
      const nextRound = roundRef.current + 1
      roundRef.current = nextRound
      setRound(nextRound)
      setShotDir(null)
      setKeeperDir(null)
      setLastMsg('')

      if (nextRound > ROUNDS) {
        const pg = playerGoalsRef.current
        const ag = aiGoalsRef.current
        const ps = playerSavesRef.current
        const bonus = pg > ag ? 300 : pg === ag ? 100 : 0
        const final = pg * 100 + ps * 50 + bonus
        setScore(final)
        phaseRef.current = 'end'
        setPhase('end')

        const result = pg > ag ? '¡Ganaste la tanda!' : pg === ag ? 'Empate.' : '¡Perdiste!'
        announceAssertive(`${result} ${pg} a ${ag}. Puntuación: ${final}.`)
      } else {
        phaseRef.current = 'shooting'
        setPhase('shooting')
        busyRef.current = false
        setBusy(false)
        announcePolite(`Tanda ${nextRound} de ${ROUNDS}. Es tu turno de tirar.`)
      }
    }, 2300)
  }, [])

  // ── Keyboard ────────────────────────────────────────────────────────────────

  const handleKey = useCallback((e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    if (e.key === 'h' || e.key === 'H') { announcePolite(INSTRUCTIONS); return }

    const ph = phaseRef.current
    if (ph === 'shooting' || ph === 'defending') {
      const action = ph === 'shooting' ? shoot : defend
      if (e.key === 'ArrowLeft')                     { e.preventDefault(); action('left')   }
      if (e.key === 'ArrowDown' || e.key === ' ')    { e.preventDefault(); action('center') }
      if (e.key === 'ArrowRight')                    { e.preventDefault(); action('right')  }
    }
  }, [shoot, defend])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // ── Score save ────────────────────────────────────────────────────────────

  async function handleSave() {
    const result = await saveScore('penaltis', score)
    if (result?.error) {
      setSaveError(result.error)
      announceAssertive(result.error)
    } else {
      setSaved(true)
      announcePolite('Puntuación guardada.')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Penaltis" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Tiros de Penalti</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame} className="w-full">
            Iniciar tanda
          </Button>
        </div>
      </GameShell>
    )
  }

  if (phase === 'end') {
    const pg = playerGoalsRef.current
    const ag = aiGoalsRef.current
    const result = pg > ag ? '¡Ganaste!' : pg === ag ? 'Empate' : '¡Perdiste!'
    const resultColor = pg > ag ? '#22c55e' : pg === ag ? '#ffd700' : '#ef4444'
    return (
      <GameShell title="Penaltis" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
        <div className="text-center space-y-6">
          <h2 className="text-3xl font-bold" style={{ color: resultColor }}>{result}</h2>
          <p className="text-xl">
            <span className="text-[#ffd700]">{pg}</span>
            <span className="text-[#555] mx-3">—</span>
            <span className="text-[#888]">{ag}</span>
          </p>
          <p className="text-[#888] text-sm">{playerSaves} paradas realizadas</p>
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
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
      </GameShell>
    )
  }

  const isShooting = phase === 'shooting'
  const label = isShooting ? 'TÚ DISPARAS — elige dirección' : 'EL RIVAL DISPARA — ¿hacia dónde te lanzas?'

  return (
    <GameShell title="Penaltis" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-[#555] mb-1">
          <span>TÚ</span>
          <span>RIVAL</span>
        </div>
        <ScoreBar round={round} playerGoals={playerGoals} aiGoals={aiGoals} />

        <p className="text-center text-sm font-bold text-[#ffd700]" aria-live="polite">
          {label}
        </p>

        <GoalVisual shot={shotDir} keeper={keeperDir} label="PORTERÍA" />

        {lastMsg && (
          <p className="text-center text-sm py-2 text-white" role="status">{lastMsg}</p>
        )}

        {!busy && (
          <div className="flex gap-3 justify-center mt-4" role="group" aria-label={label}>
            {DIRS.map(dir => (
              <Button
                key={dir}
                size="lg"
                variant="secondary"
                onClick={() => isShooting ? shoot(dir) : defend(dir)}
                className="flex-1 flex flex-col items-center gap-1"
                aria-label={`${isShooting ? 'Disparar' : 'Lanzarse'} a la ${DIR_NAME[dir]}`}
              >
                <span className="text-2xl">{DIR_ARROW[dir]}</span>
                <span className="text-xs capitalize">{DIR_NAME[dir]}</span>
              </Button>
            ))}
          </div>
        )}

        <p className="text-xs text-[#555] text-center mt-3">
          ← izquierda &nbsp;|&nbsp; ↓ / espacio — centro &nbsp;|&nbsp; → derecha
        </p>
      </div>
    </GameShell>
  )
}
