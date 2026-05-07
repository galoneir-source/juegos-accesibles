'use client'

import { useState, useEffect, useRef } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

const WORDS = [
  // 5 letters
  'CAMPO', 'CARTA', 'PERRO', 'LIBRO', 'NEGRO', 'VERDE', 'CIELO', 'FUEGO',
  'MONTE', 'FRUTA', 'COCHE', 'DULCE', 'SABOR', 'TARDE', 'NOCHE', 'LUGAR',
  'PLAYA', 'COSTA', 'TIGRE', 'PLAZA', 'BANCO', 'QUESO', 'FRESA', 'CANTO',
  'SAUCE', 'SILLA', 'JUEGO', 'CLARO', 'PARED', 'SUAVE', 'GLOBO', 'CLAVE',
  'PISTA', 'LIMON', 'MELON', 'SALON', 'ARBOL', 'HUMOR', 'BROMA', 'NIEVE',
  // 6 letters
  'CIUDAD', 'MARTES', 'FLORES', 'PUERTA', 'CAMINO', 'PIEDRA', 'BOSQUE',
  'SANGRE', 'CUERPO', 'VIENTO', 'TIERRA', 'CABEZA', 'COLINA', 'CENTRO',
  'FUERZA', 'PALOMA', 'PUEBLO', 'TOMATE', 'VERANO', 'MARINA',
]

const TIME_PER_WORD = 20
const TOTAL_ROUNDS = 10
const HINT_COST = 30
const BASE_SCORE = 100
const SPEED_BONUS = 100

function scramble(word: string): string {
  const arr = word.split('')
  let result = word
  let attempts = 0
  while (result === word && attempts < 30) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    result = arr.join('')
    attempts++
  }
  return result
}

function pickWords(count: number): string[] {
  return [...WORDS].sort(() => Math.random() - 0.5).slice(0, count)
}

function calcScore(timeLeft: number, hintsUsed: number): number {
  return Math.max(0, BASE_SCORE + Math.round((timeLeft / TIME_PER_WORD) * SPEED_BONUS) - hintsUsed * HINT_COST)
}

type Phase = 'idle' | 'playing' | 'finished'

const INSTRUCTIONS =
  'Anagramas. Se muestra una palabra con las letras desordenadas. ' +
  'Escribe la palabra original y pulsa Enter para confirmar. ' +
  'Puedes intentarlo varias veces dentro del tiempo. ' +
  `Tienes ${TIME_PER_WORD} segundos por palabra y ${TOTAL_ROUNDS} palabras en total. ` +
  `El botón Pista revela una letra en su posición correcta, pero resta ${HINT_COST} puntos. ` +
  'Tecla H repite instrucciones. Tecla R relee la palabra actual.'

export default function AnagramasPage() {
  const [phase, setPhase]         = useState<Phase>('idle')
  const [words, setWords]         = useState<string[]>([])
  const [scrambled, setScrambled] = useState<string[]>([])
  const [round, setRound]         = useState(0)
  const [input, setInput]         = useState('')
  const [timeLeft, setTimeLeft]   = useState(TIME_PER_WORD)
  const [score, setScore]         = useState(0)
  const [hints, setHints]         = useState<boolean[]>([])
  const [hintsUsed, setHintsUsed] = useState(0)
  const [roundDone, setRoundDone] = useState(false)
  const [saved, setSaved]         = useState(false)
  const [saveError, setSaveError] = useState('')

  const inputRef    = useRef<HTMLInputElement>(null)
  const roundDoneRef = useRef(false)

  // Timer: one tick per second
  useEffect(() => {
    if (phase !== 'playing' || roundDone || timeLeft <= 0) return
    const id = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, roundDone, timeLeft])

  // Urgency cue at 5 s
  useEffect(() => {
    if (phase === 'playing' && timeLeft === 5 && !roundDone) {
      announcePolite('5 segundos')
      audio.tick()
    }
  }, [phase, timeLeft, roundDone])

  // Timeout handler
  useEffect(() => {
    if (phase !== 'playing' || timeLeft !== 0 || roundDoneRef.current) return
    roundDoneRef.current = true
    setRoundDone(true)
    audio.incorrect()
    const secret = words[round]
    announceAssertive(`Tiempo agotado. La respuesta era ${secret}.`)
    setTimeout(() => advanceRound(round, score, words, scrambled), 2000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft])

  function advanceRound(
    currentRound: number,
    currentScore: number,
    wordsArr: string[],
    scrambledArr: string[],
  ) {
    const next = currentRound + 1
    if (next >= TOTAL_ROUNDS) {
      setPhase('finished')
      audio.gameOver()
      announceAssertive(`Juego terminado. Puntuación final: ${currentScore} puntos.`)
      return
    }
    setRound(next)
    setInput('')
    setTimeLeft(TIME_PER_WORD)
    setHints(new Array(wordsArr[next].length).fill(false))
    setHintsUsed(0)
    roundDoneRef.current = false
    setRoundDone(false)
    setTimeout(() => {
      announceAssertive(`Palabra ${next + 1} de ${TOTAL_ROUNDS}: ${scrambledArr[next]}`)
      inputRef.current?.focus()
    }, 50)
  }

  function startGame() {
    const picked = pickWords(TOTAL_ROUNDS)
    const sc = picked.map(scramble)
    setWords(picked)
    setScrambled(sc)
    setRound(0)
    setInput('')
    setTimeLeft(TIME_PER_WORD)
    setScore(0)
    setHints(new Array(picked[0].length).fill(false))
    setHintsUsed(0)
    roundDoneRef.current = false
    setRoundDone(false)
    setSaved(false)
    setSaveError('')
    setPhase('playing')
    audio.start()
    setTimeout(() => {
      announceAssertive(`Juego iniciado. Palabra 1 de ${TOTAL_ROUNDS}: ${sc[0]}`)
      inputRef.current?.focus()
    }, 400)
  }

  function handleSubmit() {
    if (roundDoneRef.current || phase !== 'playing') return
    const answer = input.trim().toUpperCase()
    if (!answer) return
    const secret = words[round]
    if (answer === secret) {
      const pts = calcScore(timeLeft, hintsUsed)
      const newScore = score + pts
      roundDoneRef.current = true
      setScore(newScore)
      setRoundDone(true)
      audio.correct()
      announceAssertive(`¡Correcto! +${pts} puntos.`)
      setTimeout(() => advanceRound(round, newScore, words, scrambled), 1500)
    } else {
      audio.incorrect()
      announceAssertive('Incorrecto. Sigue intentando.')
      setInput('')
    }
  }

  function useHint() {
    if (roundDoneRef.current || phase !== 'playing') return
    const secret = words[round]
    const unrevealed = hints.map((h, i) => i).filter(i => !hints[i])
    if (unrevealed.length === 0) return
    const pos = unrevealed[Math.floor(Math.random() * unrevealed.length)]
    const newHints = [...hints]
    newHints[pos] = true
    setHints(newHints)
    setHintsUsed(h => h + 1)
    announcePolite(
      `Pista: la letra en posición ${pos + 1} es ${secret[pos]}. Penalización: ${HINT_COST} puntos.`
    )
  }

  function readCurrent() {
    if (phase !== 'playing') return
    const secret = words[round]
    const hintDesc = hints.some(Boolean)
      ? '. Letras reveladas: ' +
        hints.map((h, i) => (h ? `posición ${i + 1}: ${secret[i]}` : '')).filter(Boolean).join(', ')
      : ''
    announcePolite(`Palabra ${round + 1}: ${scrambled[round]}${hintDesc}. Tiempo: ${timeLeft} segundos.`)
  }

  async function handleSave() {
    const result = await saveScore('anagramas', score)
    if (result?.error) {
      setSaveError(result.error)
      announceAssertive(result.error)
    } else {
      setSaved(true)
      announcePolite('Puntuación guardada.')
    }
  }

  // ── IDLE ──────────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <GameShell title="Anagramas" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6 max-w-md mx-auto">
          <h2 className="text-xl text-[#ffd700]">Anagramas</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame}>Comenzar juego</Button>
        </div>
      </GameShell>
    )
  }

  // ── FINISHED ──────────────────────────────────────────────────────────────────
  if (phase === 'finished') {
    return (
      <GameShell title="Anagramas" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl text-[#ffd700]">Juego terminado</h2>
          <p className="text-3xl font-mono font-bold" aria-live="polite">
            Puntuación: {score}
          </p>
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

  // ── PLAYING ───────────────────────────────────────────────────────────────────
  const secret = words[round]
  const allHinted = hints.length > 0 && hints.every(Boolean)
  const timerColor =
    timeLeft <= 5  ? '#ef4444' :
    timeLeft <= 10 ? '#fbbf24' :
    '#22c55e'

  return (
    <GameShell title="Anagramas" instructions={INSTRUCTIONS} score={score} onReread={readCurrent}>
      <div className="space-y-6 max-w-sm mx-auto">

        {/* Progress + timer */}
        <div className="flex justify-between items-center text-sm">
          <span className="text-[#888]" aria-label={`Palabra ${round + 1} de ${TOTAL_ROUNDS}`}>
            {round + 1} / {TOTAL_ROUNDS}
          </span>
          <span
            className="font-mono text-2xl font-bold tabular-nums"
            style={{ color: timerColor }}
            aria-label={`Tiempo: ${timeLeft} segundos`}
            aria-live="off"
          >
            {timeLeft}s
          </span>
        </div>

        {/* Scrambled word */}
        <div
          className="text-center py-8 px-6 rounded-xl border border-[#333] bg-[#0a0a0a]"
          aria-label={`Palabra desordenada: ${scrambled[round]}`}
        >
          <p className="text-4xl font-mono font-bold tracking-widest text-[#f0f0f0]" aria-hidden="true">
            {scrambled[round]}
          </p>
          <p className="text-xs text-[#555] mt-3" aria-hidden="true">
            {secret.length} letras
          </p>
        </div>

        {/* Hint display: blank slots with revealed letters */}
        {hints.some(Boolean) && (
          <div
            className="flex justify-center gap-1"
            aria-label={
              `Pistas reveladas: ${secret.split('').map((l, i) => hints[i] ? l : '_').join(' ')}`
            }
          >
            {secret.split('').map((letter, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`
                  inline-flex items-center justify-center w-9 h-10 border-b-2
                  text-lg font-mono font-bold
                  ${hints[i]
                    ? 'border-[#ffd700] text-[#ffd700]'
                    : 'border-[#333] text-transparent'}
                `}
              >
                {hints[i] ? letter : '_'}
              </span>
            ))}
          </div>
        )}

        {/* Input */}
        <div>
          <label htmlFor="anagram-input" className="block text-sm text-[#888] mb-1">
            Tu respuesta:
          </label>
          <div className="flex gap-3">
            <input
              id="anagram-input"
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
              className="flex-1 bg-[#111] border border-[#444] rounded-md px-4 py-3 text-2xl font-mono text-[#ffd700] uppercase focus:outline-none focus:ring-3 focus:ring-[#ffd700] focus:ring-offset-2 focus:ring-offset-black"
              aria-label="Escribe la palabra original"
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={secret?.length ?? 6}
              disabled={roundDone}
            />
            <Button onClick={handleSubmit} disabled={roundDone} aria-label="Confirmar respuesta">
              OK
            </Button>
          </div>
        </div>

        {/* Hint button */}
        {!allHinted && !roundDone && (
          <Button variant="secondary" onClick={useHint} className="w-full">
            Pista (−{HINT_COST} pts)
          </Button>
        )}
      </div>
    </GameShell>
  )
}
