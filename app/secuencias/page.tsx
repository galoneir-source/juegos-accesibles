'use client'

import { useState, useRef, useEffect } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

type Difficulty  = 'facil' | 'medio' | 'dificil'
type Side        = 'left' | 'right'
type Phase       = 'idle' | 'preview' | 'playing' | 'won' | 'lost'
type CellReveal  = 'unknown' | 'safe' | 'dead'

interface RowState { left: CellReveal; right: CellReveal }

const STEPS:      Record<Difficulty, number> = { facil: 5,   medio: 8,   dificil: 12 }
const DIFF_LABEL: Record<Difficulty, string> = { facil: 'Fácil', medio: 'Medio', dificil: 'Difícil' }
const DIFF_BONUS: Record<Difficulty, number> = { facil: 100, medio: 200, dificil: 400 }

const INSTRUCTIONS =
  'Secuencias. Antes de saltar escucha los sonidos de cada fila: ' +
  'tono agudo = plataforma segura, tono grave = plataforma peligrosa. ' +
  'Memoriza la secuencia y usa ← → o A/D para saltar. ' +
  'Fácil: 5 saltos · Medio: 8 saltos · Difícil: 12 saltos.'

function playTone(hz: number, dur = 0.35) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start()
    osc.stop(ctx.currentTime + dur + 0.05)
    osc.onended = () => ctx.close()
  } catch {}
}

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export default function SecuenciasPage() {
  const seqRef   = useRef<Side[]>([])
  const stepRef  = useRef(0)
  const scoreRef = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const diffRef  = useRef<Difficulty>('facil')

  const [phase,      setPhaseState] = useState<Phase>('idle')
  const [step,       setStep]       = useState(0)
  const [score,      setScore]      = useState(0)
  const [difficulty, setDifficulty] = useState<Difficulty>('facil')
  const [rows,       setRows]       = useState<RowState[]>([])
  const [previewRow, setPreviewRow] = useState(-1)
  const [saved,      setSaved]      = useState(false)
  const [saveError,  setSaveError]  = useState('')

  const boardRef      = useRef<HTMLDivElement>(null)
  const currentRowRef = useRef<HTMLDivElement>(null)

  function goPhase(p: Phase)      { phaseRef.current = p; setPhaseState(p) }
  function syncScore(v: number)   { scoreRef.current = v; setScore(v) }

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [step])

  // ── Start / preview ──────────────────────────────────────────────────────────

  async function startGame(diff: Difficulty) {
    const n   = STEPS[diff]
    const seq: Side[] = Array.from({ length: n }, () => Math.random() < 0.5 ? 'left' : 'right')
    const blank: RowState = { left: 'unknown', right: 'unknown' }

    seqRef.current   = seq
    stepRef.current  = 0
    scoreRef.current = 0
    diffRef.current  = diff

    setDifficulty(diff)
    setStep(0)
    setScore(0)
    setSaved(false)
    setSaveError('')
    setRows(Array.from({ length: n }, () => ({ ...blank })))
    goPhase('preview')

    audio.start()
    announcePolite(`${DIFF_LABEL[diff]}: ${n} filas. Tono agudo = seguro. Tono grave = peligroso.`)
    await wait(1200)

    for (let i = 0; i < n; i++) {
      setPreviewRow(i)
      const safeLeft = seq[i] === 'left'

      // Visual flash while tone plays
      setRows(prev => {
        const next = [...prev]
        next[i] = { left: safeLeft ? 'safe' : 'dead', right: safeLeft ? 'dead' : 'safe' }
        return next
      })
      announcePolite(`Fila ${i + 1}: izquierda ${safeLeft ? 'segura' : 'peligrosa'}.`)
      playTone(safeLeft ? 880 : 220)
      await wait(550)
      playTone(safeLeft ? 220 : 880)
      await wait(750)

      // Reset to unknown before moving on
      setRows(prev => {
        const next = [...prev]
        next[i] = { ...blank }
        return next
      })
      await wait(120)
    }

    setPreviewRow(-1)
    await wait(450)
    goPhase('playing')
    announceAssertive('¡Empieza! Usa las flechas izquierda y derecha para elegir la plataforma segura.')
    setTimeout(() => boardRef.current?.focus(), 100)
  }

  // ── Jump ─────────────────────────────────────────────────────────────────────

  function handleJump(side: Side) {
    if (phaseRef.current !== 'playing') return
    const s    = stepRef.current
    const safe = seqRef.current[s]
    const ok   = side === safe

    if (ok) {
      setRows(prev => {
        const next = [...prev]
        next[s] = {
          left:  side === 'left'  ? 'safe' : 'unknown',
          right: side === 'right' ? 'safe' : 'unknown',
        }
        return next
      })
      audio.correct()
      const ns       = scoreRef.current + 10
      const nextStep = s + 1
      syncScore(ns)
      stepRef.current = nextStep
      setStep(nextStep)
      if (nextStep >= seqRef.current.length) {
        const bonus = DIFF_BONUS[diffRef.current]
        syncScore(ns + bonus)
        goPhase('won')
        audio.start()
        announceAssertive(`¡Has cruzado el puente! Puntuación: ${ns + bonus}.`)
      } else {
        announcePolite(`Correcto. Fila ${nextStep + 1} de ${seqRef.current.length}.`)
      }
    } else {
      setRows(prev => {
        const next = [...prev]
        next[s] = {
          left:  safe === 'left'  ? 'safe' : 'dead',
          right: safe === 'right' ? 'safe' : 'dead',
        }
        return next
      })
      goPhase('lost')
      audio.gameOver()
      announceAssertive(
        `¡La plataforma se rompe! La segura era la ${safe === 'left' ? 'izquierda' : 'derecha'}. Has caído.`
      )
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phaseRef.current !== 'playing') return
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') { e.preventDefault(); handleJump('left') }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); handleJump('right') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleSaveScore() {
    const result = await saveScore('secuencias', score)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── Cell helpers ─────────────────────────────────────────────────────────────

  function cellClass(reveal: CellReveal, isCurrent: boolean): string {
    const b = 'w-20 h-12 sm:w-24 sm:h-14 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all duration-200 select-none'
    if (reveal === 'safe') return `${b} bg-green-900 border-green-400 text-green-200`
    if (reveal === 'dead') return `${b} bg-red-950  border-red-500  text-red-300`
    if (isCurrent)         return `${b} bg-blue-900/70 border-yellow-400 text-yellow-200 shadow-[0_0_14px_2px_rgba(250,204,21,0.25)] cursor-pointer hover:bg-blue-800`
    return `${b} bg-[#07101f] border-[#152840] text-[#274060]`
  }

  function cellIcon(reveal: CellReveal, side: Side): string {
    if (reveal === 'safe') return '✓'
    if (reveal === 'dead') return '✗'
    return side === 'left' ? '←' : '→'
  }

  // ── Screens ───────────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Secuencias" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-8">
          <div>
            <h2 className="text-xl text-[#ffd700] mb-2">Secuencias</h2>
            <p className="text-[#888] text-sm max-w-xs mx-auto">
              Escucha los tonos de cada plataforma de cristal: agudo = seguro, grave = peligroso.
              Memoriza la secuencia y cruza el puente sin caer.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            {(['facil', 'medio', 'dificil'] as Difficulty[]).map(d => (
              <Button key={d} size="lg" variant="secondary" onClick={() => startGame(d)}>
                {DIFF_LABEL[d]} — {STEPS[d]} saltos
              </Button>
            ))}
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    const n = STEPS[difficulty]
    return (
      <GameShell title="Secuencias" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Puente cruzado!' : '¡Has caído!'}
          </h2>
          <p className="text-[#888] text-sm">
            {phase === 'won'
              ? `Completado en nivel ${DIFF_LABEL[difficulty]}.`
              : `Llegaste hasta la fila ${step + 1} de ${n}.`}
          </p>
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
          {!saved ? (
            <>
              <Button onClick={handleSaveScore}>Guardar puntuación</Button>
              {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
            </>
          ) : (
            <p role="status" className="text-[#22c55e]">Guardado.</p>
          )}
          <Button variant="secondary" onClick={() => goPhase('idle')}>Jugar de nuevo</Button>
        </div>
      </GameShell>
    )
  }

  // preview | playing
  const n = STEPS[difficulty]
  return (
    <GameShell
      title="Secuencias"
      instructions={INSTRUCTIONS}
      score={score}
      onReread={() => {
        if (phaseRef.current === 'playing')
          announcePolite(`Fila ${stepRef.current + 1} de ${seqRef.current.length}. Usa las flechas izquierda y derecha.`)
      }}
    >
      <div className="flex flex-col items-center gap-4">

        {/* Status */}
        <div className="h-6 text-center" aria-live="polite">
          {phase === 'preview' && (
            <p className="text-[#ffd700] text-sm animate-pulse">
              {previewRow >= 0 ? `Escuchando fila ${previewRow + 1} de ${n}…` : 'Preparando…'}
            </p>
          )}
          {phase === 'playing' && (
            <p className="text-[#aaa] text-sm">
              Fila <span className="text-[#ffd700] font-bold">{step + 1}</span> / {n} — {DIFF_LABEL[difficulty]}
            </p>
          )}
        </div>

        {/* Board */}
        <div
          ref={boardRef}
          tabIndex={0}
          role="application"
          aria-label="Puente de plataformas de cristal"
          className="max-h-[52vh] overflow-y-auto focus:outline-none"
        >
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const isCurrent = phase === 'playing' && i === step
              const isPreview = phase === 'preview' && i === previewRow
              return (
                <div
                  key={i}
                  ref={isCurrent ? currentRowRef : undefined}
                  className={`flex gap-3 items-center transition-transform duration-150 ${isPreview ? 'scale-105' : ''}`}
                >
                  <span className="text-[#333] text-xs w-4 shrink-0 text-right select-none">{i + 1}</span>
                  <button
                    className={cellClass(row.left, isCurrent)}
                    onClick={() => isCurrent && handleJump('left')}
                    disabled={!isCurrent}
                    tabIndex={isCurrent ? 0 : -1}
                    aria-label={`Fila ${i + 1} izquierda${row.left !== 'unknown' ? ': ' + (row.left === 'safe' ? 'segura' : 'peligrosa') : ''}`}
                  >
                    {cellIcon(row.left, 'left')}
                  </button>
                  <button
                    className={cellClass(row.right, isCurrent)}
                    onClick={() => isCurrent && handleJump('right')}
                    disabled={!isCurrent}
                    tabIndex={isCurrent ? 0 : -1}
                    aria-label={`Fila ${i + 1} derecha${row.right !== 'unknown' ? ': ' + (row.right === 'safe' ? 'segura' : 'peligrosa') : ''}`}
                  >
                    {cellIcon(row.right, 'right')}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Jump buttons */}
        {phase === 'playing' && (
          <div className="flex gap-4 mt-1">
            <Button size="lg" variant="secondary" onClick={() => handleJump('left')}>
              ← Izquierda
            </Button>
            <Button size="lg" variant="secondary" onClick={() => handleJump('right')}>
              Derecha →
            </Button>
          </div>
        )}

        {phase === 'playing' && (
          <p className="text-xs text-[#555]">← → o A/D para saltar</p>
        )}
      </div>
    </GameShell>
  )
}
