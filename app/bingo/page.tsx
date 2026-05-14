'use client'

import { useState, useEffect, useRef } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── Constants ─────────────────────────────────────────────────────────────────

const COLS    = ['B', 'I', 'N', 'G', 'O'] as const
const RANGES: [number, number][] = [[1,15],[16,30],[31,45],[46,60],[61,75]]

const INSTRUCTIONS =
  'Bingo. Se cantan bolas del 1 al 75. Los números que aparezcan en tu cartón se marcan automáticamente. ' +
  'Pulsa Espacio o Enter para pedir el siguiente número. ' +
  'Ganas al completar una línea (fila, columna o diagonal). ' +
  'Sigue jugando para completar el cartón entero y obtener el Bingo.'

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function letter(n: number): string {
  if (n <= 15) return 'B'
  if (n <= 30) return 'I'
  if (n <= 45) return 'N'
  if (n <= 60) return 'G'
  return 'O'
}

function generateCard(): number[][] {
  const card: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0))
  for (let c = 0; c < 5; c++) {
    const [min, max] = RANGES[c]
    const nums = shuffle(Array.from({ length: max - min + 1 }, (_, i) => i + min)).slice(0, 5)
    for (let r = 0; r < 5; r++) card[r][c] = nums[r]
  }
  card[2][2] = 0  // center FREE
  return card
}

function initMarked(): boolean[][] {
  const m = Array.from({ length: 5 }, () => Array(5).fill(false) as boolean[])
  m[2][2] = true  // FREE always marked
  return m
}

type WinState = 'none' | 'line' | 'bingo'

function checkWin(marked: boolean[][]): WinState {
  if (marked.every(row => row.every(Boolean))) return 'bingo'
  for (let r = 0; r < 5; r++) if (marked[r].every(Boolean)) return 'line'
  for (let c = 0; c < 5; c++) if (marked.every(row => row[c])) return 'line'
  if ([0,1,2,3,4].every(i => marked[i][i]))     return 'line'
  if ([0,1,2,3,4].every(i => marked[i][4 - i])) return 'line'
  return 'none'
}

// ── Component ─────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'playing' | 'bingo'

export default function BingoPage() {
  const phaseRef     = useRef<Phase>('idle')
  const cardRef      = useRef<number[][]>([])
  const markedRef    = useRef<boolean[][]>(initMarked())
  const ballsRef     = useRef<number[]>([])
  const callCountRef = useRef(0)
  const scoreRef     = useRef(0)
  const lineWonRef   = useRef(false)

  const [phase,     setPhaseState] = useState<Phase>('idle')
  const [card,      setCard]       = useState<number[][]>([])
  const [marked,    setMarked]     = useState<boolean[][]>(initMarked())
  const [lastBall,  setLastBall]   = useState<number | null>(null)
  const [recent,    setRecent]     = useState<number[]>([])
  const [callCount, setCallCount]  = useState(0)
  const [score,     setScore]      = useState(0)
  const [lineWon,   setLineWon]    = useState(false)
  const [saved,     setSaved]      = useState(false)
  const [saveError, setSaveError]  = useState('')

  function goPhase(p: Phase) { phaseRef.current = p; setPhaseState(p) }

  function startGame() {
    const c = generateCard()
    const m = initMarked()
    const balls = shuffle(Array.from({ length: 75 }, (_, i) => i + 1))
    cardRef.current      = c
    markedRef.current    = m
    ballsRef.current     = balls
    callCountRef.current = 0
    scoreRef.current     = 0
    lineWonRef.current   = false
    setCard(c.map(r => [...r]))
    setMarked(m.map(r => [...r]))
    setLastBall(null)
    setRecent([])
    setCallCount(0)
    setScore(0)
    setLineWon(false)
    setSaved(false)
    setSaveError('')
    goPhase('playing')
    audio.start()
    announcePolite('Cartón generado. Pulsa Espacio o Enter para pedir el primer número.')
  }

  function callNext() {
    if (phaseRef.current !== 'playing' || ballsRef.current.length === 0) return
    const ball = ballsRef.current.shift()!
    callCountRef.current++
    setLastBall(ball)
    setCallCount(callCountRef.current)
    setRecent(prev => [ball, ...prev].slice(0, 10))

    // Auto-mark on card
    const card = cardRef.current
    const newMarked = markedRef.current.map(r => [...r] as boolean[])
    let onCard = false
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++)
        if (card[r][c] === ball) { newMarked[r][c] = true; onCard = true }
    markedRef.current = newMarked
    setMarked(newMarked.map(r => [...r]))

    const l = letter(ball)
    if (onCard) {
      audio.correct()
      announcePolite(`${l} ${ball}. ¡En tu cartón!`)
    } else {
      audio.click()
      announcePolite(`${l} ${ball}.`)
    }

    // Win check
    const win = checkWin(newMarked)
    if (win === 'bingo') {
      const pts = Math.max(200, 2000 - callCountRef.current * 20)
      scoreRef.current = pts
      setScore(pts)
      goPhase('bingo')
      audio.start()
      setTimeout(() => audio.start(), 380)
      announceAssertive(`¡BINGO! Cartón completo en ${callCountRef.current} números. Puntuación: ${pts}.`)
    } else if (win === 'line' && !lineWonRef.current) {
      lineWonRef.current = true
      setLineWon(true)
      audio.start()
      announceAssertive('¡Línea! Sigue jugando para completar el Bingo.')
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current === 'playing') {
        e.preventDefault(); callNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleSaveScore() {
    const result = await saveScore('bingo', score)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── Cell style ────────────────────────────────────────────────────────────────

  function cellClass(r: number, c: number, num: number): string {
    const base = 'w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center font-mono font-bold text-sm transition-colors duration-200 select-none'
    const isFree = r === 2 && c === 2
    const isLast = num === lastBall
    const isMarked = marked[r]?.[c]
    if (isFree)    return `${base} bg-[#ffd700] text-black`
    if (isLast)    return `${base} bg-yellow-400 text-black ring-2 ring-white`
    if (isMarked)  return `${base} bg-green-700 text-white`
    return `${base} bg-[#0d1b2a] text-[#778] border border-[#1e3048]`
  }

  // ── Idle ──────────────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Bingo" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Bingo</h2>
          <p className="text-[#888] text-sm max-w-sm mx-auto">
            Se genera un cartón de 5×5. Los números que aparezcan en tu cartón
            se marcan solos. Pulsa Espacio para pedir cada bola.
            Completa una línea para ganar; sigue jugando para el Bingo completo.
          </p>
          <Button size="lg" onClick={startGame}>Generar cartón</Button>
        </div>
      </GameShell>
    )
  }

  // ── Playing / Bingo ───────────────────────────────────────────────────────────

  const markedCount = marked.flat().filter(Boolean).length

  return (
    <GameShell
      title="Bingo"
      instructions={INSTRUCTIONS}
      score={score}
      onReread={() => {
        const col = callCountRef.current
        const mc  = markedRef.current.flat().filter(Boolean).length
        const last = lastBall ? `Último número: ${letter(lastBall)} ${lastBall}.` : 'Sin números cantados.'
        announcePolite(
          `${last} ${col} números cantados. ${mc - 1} números marcados en tu cartón (sin contar el FREE).` +
          (lineWonRef.current ? ' Ya tienes línea.' : '')
        )
      }}
    >
      <div className="flex flex-col items-center gap-4">

        {/* Last ball display */}
        <div className="text-center min-h-[5rem] flex flex-col items-center justify-center">
          {lastBall ? (
            <>
              <p className="text-[#555] text-xs tracking-widest">ÚLTIMO NÚMERO</p>
              <p
                className="text-5xl font-bold font-mono text-[#ffd700] leading-none mt-1"
                aria-live="assertive"
              >
                {letter(lastBall)}-{lastBall}
              </p>
              <p className="text-[#555] text-xs mt-1">{callCount} / 75 cantados</p>
            </>
          ) : (
            <p className="text-[#555] text-sm">Pulsa Espacio para el primer número</p>
          )}
        </div>

        {/* Card */}
        <div>
          {/* Column headers */}
          <div className="flex gap-1 mb-1.5" aria-hidden="true">
            {COLS.map(l => (
              <div key={l} className="w-12 sm:w-14 flex items-center justify-center text-[#ffd700] font-bold text-lg">
                {l}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div
            role="grid"
            aria-label={`Cartón de Bingo. ${markedCount - 1} números marcados.`}
            className="flex flex-col gap-1"
          >
            {card.map((row, r) => (
              <div key={r} role="row" className="flex gap-1">
                {row.map((num, c) => (
                  <div
                    key={c}
                    role="gridcell"
                    aria-label={
                      r === 2 && c === 2
                        ? 'FREE, marcado'
                        : `${num}${marked[r]?.[c] ? ', marcado' : ''}`
                    }
                    className={cellClass(r, c, num)}
                  >
                    {r === 2 && c === 2 ? <span className="text-xs font-bold">FREE</span> : num}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Line banner */}
        {lineWon && phase === 'playing' && (
          <p className="text-[#22c55e] font-bold text-sm" role="status">
            ¡Línea completada! Sigue para el Bingo completo.
          </p>
        )}

        {/* Recent numbers */}
        {recent.length > 0 && (
          <div className="text-center" aria-hidden="true">
            <p className="text-[#444] text-xs mb-1">Últimas bolas</p>
            <div className="flex gap-1.5 flex-wrap justify-center max-w-xs">
              {recent.map((n, i) => (
                <span
                  key={i}
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${i === 0 ? 'bg-[#ffd700] text-black font-bold' : 'bg-[#1a2a3a] text-[#666]'}`}
                >
                  {letter(n)}{n}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {phase === 'playing' && (
          <>
            <Button
              size="lg"
              onClick={callNext}
              disabled={callCount >= 75}
            >
              {callCount >= 75 ? 'Sin más bolas' : 'Siguiente número'}
            </Button>
            <p className="text-xs text-[#555]">Espacio o Enter para el siguiente número</p>
          </>
        )}

        {phase === 'bingo' && (
          <div className="text-center space-y-4">
            <p className="text-[#ffd700] text-3xl font-bold" role="status">¡BINGO!</p>
            <p className="text-[#888] text-sm">Cartón completo en {callCount} números</p>
            <p className="text-3xl font-mono font-bold">{score} puntos</p>
            {!saved ? (
              <>
                <Button onClick={handleSaveScore}>Guardar puntuación</Button>
                {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
              </>
            ) : (
              <p role="status" className="text-[#22c55e]">Guardado.</p>
            )}
            <Button variant="secondary" onClick={startGame}>Nuevo cartón</Button>
          </div>
        )}

      </div>
    </GameShell>
  )
}
