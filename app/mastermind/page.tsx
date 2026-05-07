'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

const MAX_ATTEMPTS = 10
const CODE_LENGTH = 4

const INSTRUCTIONS =
  `Mastermind de Números. El juego elige un número secreto de ${CODE_LENGTH} dígitos distintos. ` +
  `Escribe tu intento y presiona Enter o el botón Intentar. ` +
  `Recibirás: Toros (dígito correcto en posición correcta) y Vacas (dígito correcto en posición incorrecta). ` +
  `Tienes ${MAX_ATTEMPTS} intentos para adivinar el número. ` +
  `Tecla H repite instrucciones. Tecla R relee el estado actual.`

function generateSecret(): string {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[digits[i], digits[j]] = [digits[j], digits[i]]
  }
  return digits.slice(0, CODE_LENGTH).join('')
}

function evaluate(secret: string, guess: string): { bulls: number; cows: number } {
  let bulls = 0
  let cows = 0
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guess[i] === secret[i]) {
      bulls++
    } else if (secret.includes(guess[i])) {
      cows++
    }
  }
  return { bulls, cows }
}

function scoreForAttempts(attempt: number): number {
  return Math.max(100, 1000 - (attempt - 1) * 100)
}

interface Attempt {
  guess: string
  bulls: number
  cows: number
}

export default function MastermindPage() {
  const [secret, setSecret] = useState('')
  const [input, setInput] = useState('')
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [won, setWon] = useState(false)
  const [score, setScore] = useState(0)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const readState = useCallback(() => {
    if (!started || finished) return
    const last = attempts[attempts.length - 1]
    const lastMsg = last
      ? `Último intento: ${last.guess.split('').join(' ')}, ${last.bulls} toros, ${last.cows} vacas.`
      : 'Sin intentos aún.'
    announcePolite(
      `Intento ${attempts.length} de ${MAX_ATTEMPTS}. ${lastMsg} Escribe tu próximo intento.`
    )
  }, [started, finished, attempts])

  useEffect(() => {
    if (started && !finished) {
      inputRef.current?.focus()
    }
  }, [started, finished])

  function startGame() {
    const s = generateSecret()
    setSecret(s)
    setAttempts([])
    setInput('')
    setError('')
    setFinished(false)
    setWon(false)
    setSaved(false)
    setSaveError('')
    setStarted(true)
    audio.start()
    announcePolite(
      `Juego iniciado. He elegido un número de ${CODE_LENGTH} dígitos distintos. Tienes ${MAX_ATTEMPTS} intentos.`
    )
  }

  function handleSubmit() {
    const guess = input.trim()

    if (!/^\d{4}$/.test(guess)) {
      setError('Ingresa exactamente 4 dígitos numéricos.')
      announceAssertive('Error: ingresa exactamente 4 dígitos numéricos.')
      return
    }
    if (new Set(guess).size !== CODE_LENGTH) {
      setError('Los 4 dígitos deben ser distintos entre sí.')
      announceAssertive('Error: los 4 dígitos deben ser distintos entre sí.')
      return
    }
    if (attempts.some(a => a.guess === guess)) {
      setError('Ya intentaste ese número. Prueba uno diferente.')
      announceAssertive('Ya intentaste ese número. Prueba uno diferente.')
      return
    }

    setError('')
    const { bulls, cows } = evaluate(secret, guess)
    const newAttempts = [...attempts, { guess, bulls, cows }]
    setAttempts(newAttempts)
    setInput('')

    const attemptNumber = newAttempts.length

    if (bulls === CODE_LENGTH) {
      const pts = scoreForAttempts(attemptNumber)
      setScore(s => s + pts)
      setWon(true)
      setFinished(true)
      audio.correct()
      announceAssertive(
        `¡Correcto! Adivinaste el número ${secret.split('').join(' ')} en ${attemptNumber} ${attemptNumber === 1 ? 'intento' : 'intentos'}. +${pts} puntos.`
      )
    } else if (attemptNumber >= MAX_ATTEMPTS) {
      setFinished(true)
      audio.gameOver()
      announceAssertive(
        `Sin más intentos. El número secreto era ${secret.split('').join(' ')}.`
      )
    } else {
      const bullWord = bulls === 1 ? 'toro' : 'toros'
      const cowWord = cows === 1 ? 'vaca' : 'vacas'
      const remaining = MAX_ATTEMPTS - attemptNumber
      if (bulls > 0) {
        audio.correct()
      } else {
        audio.incorrect()
      }
      announceAssertive(
        `Intento ${attemptNumber}: ${guess.split('').join(' ')}. ${bulls} ${bullWord}, ${cows} ${cowWord}. ` +
        `${remaining} ${remaining === 1 ? 'intento restante' : 'intentos restantes'}.`
      )
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  async function handleSave() {
    const result = await saveScore('mastermind', score)
    if (result?.error) {
      setSaveError(result.error)
      announceAssertive(result.error)
    } else {
      setSaved(true)
      announcePolite('Puntuación guardada.')
    }
  }

  if (!started) {
    return (
      <GameShell title="Mastermind de Números" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Mastermind de Números</h2>
          <p className="text-[#888] max-w-md mx-auto">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame}>
            Comenzar juego
          </Button>
        </div>
      </GameShell>
    )
  }

  if (finished) {
    return (
      <GameShell title="Mastermind de Números" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: won ? '#22c55e' : '#ef4444' }}>
            {won ? '¡Adivinaste!' : 'Sin más intentos'}
          </h2>
          <p className="text-lg">
            El número secreto era:{' '}
            <strong className="text-[#ffd700] font-mono tracking-widest">{secret}</strong>
          </p>
          <p className="text-3xl font-mono font-bold" aria-live="polite">
            Puntuación: {score}
          </p>

          {attempts.length > 0 && (
            <div className="text-left max-w-xs mx-auto">
              <p className="text-sm text-[#888] mb-2">Historial de intentos:</p>
              <ol className="space-y-1">
                {attempts.map((a, i) => (
                  <li key={i} className="font-mono text-sm flex gap-4">
                    <span className="text-[#555] w-4">{i + 1}.</span>
                    <span className="text-[#f0f0f0] tracking-widest">{a.guess}</span>
                    <span className="text-[#ffd700]">{a.bulls}T</span>
                    <span className="text-[#888]">{a.cows}V</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {!saved ? (
            <>
              <Button onClick={handleSave}>Guardar puntuación</Button>
              {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
            </>
          ) : (
            <p role="status" className="text-[#22c55e]">Guardado.</p>
          )}
          <Button variant="secondary" onClick={startGame}>
            Jugar de nuevo
          </Button>
        </div>
      </GameShell>
    )
  }

  return (
    <GameShell title="Mastermind de Números" instructions={INSTRUCTIONS} score={score} onReread={readState}>
      <div className="space-y-6 max-w-sm">
        <p className="text-sm text-[#888]">
          Intento <strong className="text-[#f0f0f0]">{attempts.length + 1}</strong> de{' '}
          <strong className="text-[#f0f0f0]">{MAX_ATTEMPTS}</strong>
        </p>

        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <label htmlFor="guess-input" className="block text-sm text-[#888] mb-1">
              Tu intento (4 dígitos distintos):
            </label>
            <input
              id="guess-input"
              ref={inputRef}
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={input}
              onChange={e => {
                setError('')
                setInput(e.target.value.replace(/\D/g, '').slice(0, 4))
              }}
              onKeyDown={handleKeyDown}
              className="w-full bg-[#111] border border-[#444] rounded-md px-4 py-2.5 text-xl font-mono tracking-widest text-[#ffd700] focus:outline-none focus:ring-3 focus:ring-[#ffd700] focus:ring-offset-2 focus:ring-offset-black"
              aria-describedby={error ? 'input-error' : 'input-hint'}
              aria-invalid={!!error}
              autoComplete="off"
            />
            {error ? (
              <p id="input-error" role="alert" className="text-[#ef4444] text-sm mt-1">
                {error}
              </p>
            ) : (
              <p id="input-hint" className="text-[#555] text-xs mt-1">
                Presiona Enter o el botón para intentar
              </p>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            className="mt-6"
            aria-label="Enviar intento"
          >
            Intentar
          </Button>
        </div>

        {attempts.length > 0 && (
          <section aria-label="Historial de intentos">
            <h2 className="text-sm text-[#888] mb-2">
              Intentos anteriores ({attempts.length}):
            </h2>
            <ol className="space-y-2">
              {attempts.map((a, i) => (
                <li
                  key={i}
                  className="flex gap-4 items-center font-mono text-base border border-[#222] rounded px-3 py-2 bg-[#0a0a0a]"
                  aria-label={`Intento ${i + 1}: ${a.guess.split('').join(' ')}, ${a.bulls} toros, ${a.cows} vacas`}
                >
                  <span className="text-[#555] text-sm w-5">{i + 1}.</span>
                  <span className="tracking-widest text-[#f0f0f0]">{a.guess}</span>
                  <span
                    className="text-[#ffd700] font-bold"
                    title={`${a.bulls} toros (posición correcta)`}
                  >
                    {a.bulls}T
                  </span>
                  <span
                    className="text-[#888]"
                    title={`${a.cows} vacas (dígito correcto, posición incorrecta)`}
                  >
                    {a.cows}V
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-[#555] mt-2">T = Toro (posición correcta) · V = Vaca (posición incorrecta)</p>
          </section>
        )}
      </div>
    </GameShell>
  )
}
