'use client'

import { useState, useEffect, useRef } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

const FALLBACK_WORDS = [
  { word: 'ELEFANTE',   hint: 'Animal grande con trompa' },
  { word: 'MARIPOSA',   hint: 'Insecto con alas coloridas' },
  { word: 'TELESCOPIO', hint: 'Instrumento para observar las estrellas' },
  { word: 'CHOCOLATE',  hint: 'Dulce hecho de cacao' },
  { word: 'DINOSAURIO', hint: 'Animal prehistórico extinto' },
  { word: 'GEOGRAFIA',  hint: 'Ciencia que estudia la Tierra' },
  { word: 'AMBULANCIA', hint: 'Vehículo de emergencias médicas' },
  { word: 'BIBLIOTECA', hint: 'Lugar donde se guardan y prestan libros' },
]

async function fetchWord(): Promise<{ word: string; hint: string }> {
  try {
    const res = await fetch('/api/hangman-word')
    if (res.ok) {
      const data = await res.json()
      if (data?.word && data?.hint) return data
    }
  } catch { /* fall through */ }
  return FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)]
}

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

function calcScore(timeLeft: number, hintUsed: boolean): number {
  return Math.max(0, BASE_SCORE + Math.round((timeLeft / TIME_PER_WORD) * SPEED_BONUS) - (hintUsed ? HINT_COST : 0))
}

const TIME_PER_WORD = 20
const TOTAL_ROUNDS  = 10
const HINT_COST     = 40
const BASE_SCORE    = 100
const SPEED_BONUS   = 100

type Phase = 'idle' | 'playing' | 'finished'

const INSTRUCTIONS =
  'Anagramas. Se muestra una palabra con las letras desordenadas. ' +
  'Escribe la palabra original y pulsa Enter. Puedes intentarlo varias veces. ' +
  `Tienes ${TIME_PER_WORD} segundos por palabra y ${TOTAL_ROUNDS} palabras en total. ` +
  `El botón Pista muestra la definición de la palabra, pero resta ${HINT_COST} puntos. ` +
  'Tecla H repite instrucciones. Tecla R relee la palabra actual.'

export default function AnagramasPage() {
  const [phase, setPhase]                 = useState<Phase>('idle')
  const [wordData, setWordData]           = useState<{ word: string; hint: string } | null>(null)
  const [scrambledWord, setScrambledWord] = useState('')
  const [round, setRound]                 = useState(0)
  const [input, setInput]                 = useState('')
  const [timeLeft, setTimeLeft]           = useState(TIME_PER_WORD)
  const [score, setScore]                 = useState(0)
  const [hintUsed, setHintUsed]           = useState(false)
  const [roundDone, setRoundDone]         = useState(false)
  const [loading, setLoading]             = useState(false)
  const [saved, setSaved]                 = useState(false)
  const [saveError, setSaveError]         = useState('')

  const inputRef     = useRef<HTMLInputElement>(null)
  const roundDoneRef = useRef(false)

  // Timer: one tick per second while playing and not paused
  useEffect(() => {
    if (phase !== 'playing' || roundDone || loading || timeLeft <= 0) return
    const id = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, roundDone, loading, timeLeft])

  // Urgency cue at 5 s
  useEffect(() => {
    if (phase === 'playing' && timeLeft === 5 && !roundDone && !loading) {
      announcePolite('5 segundos')
      audio.tick()
    }
  }, [phase, timeLeft, roundDone, loading])

  // Timeout handler
  useEffect(() => {
    if (phase !== 'playing' || timeLeft !== 0 || roundDoneRef.current) return
    roundDoneRef.current = true
    setRoundDone(true)
    audio.incorrect()
    const secret = wordData?.word ?? '?'
    announceAssertive(`Tiempo agotado. La respuesta era ${secret}.`)
    setTimeout(() => advanceRound(round, score), 2000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft])

  async function advanceRound(currentRound: number, currentScore: number) {
    const next = currentRound + 1
    if (next >= TOTAL_ROUNDS) {
      setPhase('finished')
      audio.gameOver()
      announceAssertive(`Juego terminado. Puntuación final: ${currentScore} puntos.`)
      return
    }
    setLoading(true)
    announcePolite('Cargando siguiente palabra…')
    const data = await fetchWord()
    const sc = scramble(data.word)
    setWordData(data)
    setScrambledWord(sc)
    setRound(next)
    setInput('')
    setTimeLeft(TIME_PER_WORD)
    setHintUsed(false)
    roundDoneRef.current = false
    setRoundDone(false)
    setLoading(false)
    setTimeout(() => {
      announceAssertive(`Palabra ${next + 1} de ${TOTAL_ROUNDS}: ${sc}`)
      inputRef.current?.focus()
    }, 50)
  }

  async function startGame() {
    setLoading(true)
    announcePolite('Cargando palabra…')
    const data = await fetchWord()
    const sc = scramble(data.word)
    setWordData(data)
    setScrambledWord(sc)
    setRound(0)
    setInput('')
    setTimeLeft(TIME_PER_WORD)
    setScore(0)
    setHintUsed(false)
    roundDoneRef.current = false
    setRoundDone(false)
    setSaved(false)
    setSaveError('')
    setLoading(false)
    setPhase('playing')
    audio.start()
    setTimeout(() => {
      announceAssertive(`Juego iniciado. Palabra 1 de ${TOTAL_ROUNDS}: ${sc}`)
      inputRef.current?.focus()
    }, 400)
  }

  function handleSubmit() {
    if (roundDoneRef.current || phase !== 'playing' || loading || !wordData) return
    const answer = input.trim().toUpperCase()
    if (!answer) return
    const secret = wordData.word
    if (answer === secret) {
      const pts = calcScore(timeLeft, hintUsed)
      const newScore = score + pts
      roundDoneRef.current = true
      setScore(newScore)
      setRoundDone(true)
      audio.correct()
      announceAssertive(`¡Correcto! +${pts} puntos.`)
      setTimeout(() => advanceRound(round, newScore), 1500)
    } else {
      audio.incorrect()
      announceAssertive('Incorrecto. Sigue intentando.')
      setInput('')
    }
  }

  function revealHint() {
    if (!wordData || hintUsed || roundDoneRef.current || phase !== 'playing') return
    setHintUsed(true)
    announceAssertive(`Pista: ${wordData.hint}. Penalización: ${HINT_COST} puntos.`)
  }

  function readCurrent() {
    if (phase !== 'playing' || !wordData) return
    const hintDesc = hintUsed ? `. Pista: ${wordData.hint}` : ''
    announcePolite(`Palabra ${round + 1}: ${scrambledWord}${hintDesc}. Tiempo: ${timeLeft} segundos.`)
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
          <Button size="lg" onClick={startGame} disabled={loading} aria-busy={loading}>
            {loading ? 'Cargando…' : 'Comenzar juego'}
          </Button>
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
          <Button variant="secondary" onClick={startGame} disabled={loading} aria-busy={loading}>
            {loading ? 'Cargando…' : 'Jugar de nuevo'}
          </Button>
        </div>
      </GameShell>
    )
  }

  // ── PLAYING ───────────────────────────────────────────────────────────────────
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
            style={{ color: loading ? '#555' : timerColor }}
            aria-label={`Tiempo: ${timeLeft} segundos`}
            aria-live="off"
          >
            {loading ? '…' : `${timeLeft}s`}
          </span>
        </div>

        {/* Scrambled word or loading */}
        <div
          className="text-center py-8 px-6 rounded-xl border border-[#333] bg-[#0a0a0a] min-h-[120px] flex flex-col items-center justify-center"
          aria-label={loading ? 'Cargando siguiente palabra' : `Palabra desordenada: ${scrambledWord}`}
        >
          {loading ? (
            <p className="text-[#555] text-sm" aria-live="polite">Cargando palabra…</p>
          ) : (
            <>
              <p className="text-4xl font-mono font-bold tracking-widest text-[#f0f0f0]" aria-hidden="true">
                {scrambledWord}
              </p>
              <p className="text-xs text-[#555] mt-3" aria-hidden="true">
                {wordData?.word.length} letras
              </p>
            </>
          )}
        </div>

        {/* Hint (shown after used) */}
        {hintUsed && wordData && (
          <p className="text-sm text-[#ffd700] text-center px-2" aria-live="polite">
            Pista: {wordData.hint}
          </p>
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
              onChange={e => setInput(e.target.value.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, '').toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
              className="flex-1 bg-[#111] border border-[#444] rounded-md px-4 py-3 text-2xl font-mono text-[#ffd700] uppercase focus:outline-none focus:ring-3 focus:ring-[#ffd700] focus:ring-offset-2 focus:ring-offset-black"
              aria-label="Escribe la palabra original"
              autoComplete="off"
              autoCapitalize="characters"
              disabled={roundDone || loading}
            />
            <Button onClick={handleSubmit} disabled={roundDone || loading} aria-label="Confirmar respuesta">
              OK
            </Button>
          </div>
        </div>

        {/* Hint button */}
        {!hintUsed && !roundDone && !loading && (
          <Button variant="secondary" onClick={revealHint} className="w-full">
            Pista: definición (−{HINT_COST} pts)
          </Button>
        )}
      </div>
    </GameShell>
  )
}
