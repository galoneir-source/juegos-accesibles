'use client'

import { useState, useEffect, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

const WORDS = [
  'CAMPO', 'CARTA', 'BARCO', 'PERRO', 'LIBRO', 'NEGRO', 'SUELO', 'VERDE',
  'CIELO', 'FUEGO', 'MONTE', 'FRUTA', 'COCHE', 'NUEVO', 'VIEJO', 'DULCE',
  'SALUD', 'SABOR', 'TARDE', 'NOCHE', 'LUGAR', 'FINCA', 'GRANO', 'TRIGO',
  'PLATO', 'LLANO', 'PECHO', 'BRAZO', 'CORTO', 'LARGO', 'AMIGO', 'PADRE',
  'MADRE', 'FONDO', 'ORDEN', 'PLAYA', 'COSTA', 'CERRO', 'TIGRE', 'PLAZA',
  'FAROL', 'CARRO', 'BANCO', 'VAPOR', 'FLACO', 'GORDO', 'TROZO', 'GRUPO',
  'QUESO', 'FRESA', 'GUSTO', 'CANTO', 'BAILE', 'DANZA', 'GRUTA', 'SAUCE',
  'BUENO', 'SILLA', 'CINCO', 'JUEGO', 'CUERO', 'BOLSO', 'CLARO', 'SABIO',
  'PARED', 'SUAVE', 'BRUMA', 'FLOTA', 'FRENO', 'GLOBO', 'ANCLA', 'TURNO',
  'CLAVE', 'NOBLE', 'GRIPE', 'CALVO', 'PISTA', 'LIMON', 'MELON', 'SALON',
  'ARBOL', 'BELLO', 'MILLA', 'CREMA', 'HUMOR', 'LOGRO', 'BROMA', 'TRUCO',
  'MARZO', 'ENERO', 'NIEVE', 'PLUMA', 'BUCLE', 'RUIDO', 'DICHO', 'BUQUE',
  'CINTA', 'VERSO', 'RITMO', 'SALTO', 'PALCO', 'OPACO', 'PULPO', 'BOMBA',
  'RUMBO', 'TEMOR', 'LABOR', 'VALOR', 'MOTOR', 'COLOR', 'DOLOR', 'LIRIO',
  'POLLO', 'GALLO', 'POEMA', 'TECHO', 'PATIO', 'RADIO', 'SUSTO', 'TORSO',
  'BOLSA', 'BURRO', 'CERDO', 'MAREO', 'CESTO', 'DIQUE', 'FORRO', 'GENIO',
  'HIELO', 'INDIO', 'JABON', 'GUISO', 'LAPSO', 'MUSLO', 'NIVEL', 'OVEJA',
  'PAUSA', 'QUEJA', 'RASGO', 'SIGLO', 'TALLO', 'UMBRA', 'VUELO', 'YERMO',
]
  .filter(w => w.length === 5 && /^[A-Z]+$/.test(w))

const MAX_GUESSES = 6
const WORD_LENGTH = 5

type LetterState = 'correct' | 'present' | 'absent' | 'empty'

interface GuessResult {
  letter: string
  state: LetterState
}

function evaluateGuess(secret: string, guess: string): GuessResult[] {
  const result: GuessResult[] = guess.split('').map(letter => ({ letter, state: 'absent' as LetterState }))
  const secretUsed = Array(WORD_LENGTH).fill(false)
  const guessUsed  = Array(WORD_LENGTH).fill(false)

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === secret[i]) {
      result[i].state = 'correct'
      secretUsed[i] = true
      guessUsed[i]  = true
    }
  }

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessUsed[i]) continue
    for (let j = 0; j < WORD_LENGTH; j++) {
      if (secretUsed[j]) continue
      if (guess[i] === secret[j]) {
        result[i].state = 'present'
        secretUsed[j] = true
        break
      }
    }
  }

  return result
}

function scoreForAttempt(attempt: number): number {
  return Math.max(100, 700 - attempt * 100)
}

const STATE_CELL: Record<LetterState, string> = {
  correct: 'bg-[#22c55e] border-[#22c55e] text-black',
  present: 'bg-[#f59e0b] border-[#f59e0b] text-black',
  absent:  'bg-[#2a2a2a] border-[#2a2a2a] text-[#777]',
  empty:   'bg-transparent border-[#444] text-[#f0f0f0]',
}

const STATE_KEY: Record<string, string> = {
  correct: 'bg-[#22c55e] text-black border-[#22c55e]',
  present: 'bg-[#f59e0b] text-black border-[#f59e0b]',
  absent:  'bg-[#2a2a2a] text-[#666] border-[#2a2a2a]',
}

const KEY_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
]

const STATE_LABEL: Record<LetterState, string> = {
  correct: 'correcta',
  present: 'presente',
  absent:  'ausente',
  empty:   '',
}

const INSTRUCTIONS =
  'Wordle en español. Adivina la palabra de 5 letras en 6 intentos. ' +
  'Después de cada intento: verde = letra en posición correcta, ' +
  'amarillo = letra en la palabra pero en otra posición, ' +
  'gris = letra que no está en la palabra. ' +
  'Usa el teclado físico o los botones en pantalla. ' +
  'Tecla H repite instrucciones. Tecla R relee el último resultado.'

export default function WordlePage() {
  const [secret,      setSecret]      = useState('')
  const [guesses,     setGuesses]     = useState<GuessResult[][]>([])
  const [current,     setCurrent]     = useState('')
  const [phase,       setPhase]       = useState<'idle' | 'playing' | 'won' | 'lost'>('idle')
  const [score,       setScore]       = useState(0)
  const [saved,       setSaved]       = useState(false)
  const [saveError,   setSaveError]   = useState('')
  const [keyStates,   setKeyStates]   = useState<Record<string, LetterState>>({})
  const [shaking,     setShaking]     = useState(false)
  const [lastResult,  setLastResult]  = useState('')

  const readState = useCallback(() => {
    if (phase !== 'playing') return
    if (!lastResult) {
      announcePolite(`Sin intentos aún. Escribe una palabra de ${WORD_LENGTH} letras.`)
    } else {
      announcePolite(lastResult)
    }
  }, [phase, lastResult])

  const submitGuess = useCallback(() => {
    if (current.length < WORD_LENGTH) {
      setShaking(true)
      setTimeout(() => setShaking(false), 420)
      announceAssertive(`La palabra debe tener ${WORD_LENGTH} letras.`)
      return
    }

    const result    = evaluateGuess(secret, current)
    const newGuesses = [...guesses, result]
    setGuesses(newGuesses)
    setCurrent('')

    const newKeys = { ...keyStates }
    result.forEach(({ letter, state }) => {
      const prev = newKeys[letter]
      if (prev === 'correct') return
      if (prev === 'present' && state === 'absent') return
      newKeys[letter] = state
    })
    setKeyStates(newKeys)

    const resultDesc = result.map(r => `${r.letter}, ${STATE_LABEL[r.state]}`).join('; ')
    const msg = `Intento ${newGuesses.length}: ${resultDesc}.`
    setLastResult(msg)

    const won = result.every(r => r.state === 'correct')
    if (won) {
      const pts = scoreForAttempt(newGuesses.length)
      setScore(pts)
      setPhase('won')
      audio.correct()
      announceAssertive(
        `¡Ganaste! La palabra era ${secret}. +${pts} puntos en ${newGuesses.length} ${newGuesses.length === 1 ? 'intento' : 'intentos'}.`
      )
    } else if (newGuesses.length >= MAX_GUESSES) {
      setPhase('lost')
      audio.gameOver()
      announceAssertive(`Sin más intentos. La palabra era ${secret}.`)
    } else {
      const hasCorrect = result.some(r => r.state === 'correct')
      hasCorrect ? audio.correct() : audio.incorrect()
      const rem = MAX_GUESSES - newGuesses.length
      announceAssertive(`${msg} ${rem} ${rem === 1 ? 'intento restante' : 'intentos restantes'}.`)
    }
  }, [current, guesses, secret, keyStates])

  function pressKey(key: string) {
    if (phase !== 'playing') return
    if (key === '⌫' || key === 'Backspace') {
      setCurrent(c => c.slice(0, -1))
      return
    }
    if (key === 'ENTER' || key === 'Enter') {
      submitGuess()
      return
    }
    if (/^[A-Z]$/.test(key)) {
      setCurrent(c => c.length < WORD_LENGTH ? c + key : c)
    }
  }

  useEffect(() => {
    if (phase !== 'playing') return
    function handleKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const k = e.key
      if (k === 'Backspace') { setCurrent(c => c.slice(0, -1)); return }
      if (k === 'Enter')     { submitGuess(); return }
      const up = k.toUpperCase()
      if (/^[A-Z]$/.test(up)) setCurrent(c => c.length < WORD_LENGTH ? c + up : c)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [phase, submitGuess])

  function startGame() {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)]
    setSecret(word)
    setGuesses([])
    setCurrent('')
    setPhase('playing')
    setScore(0)
    setSaved(false)
    setSaveError('')
    setKeyStates({})
    setLastResult('')
    audio.start()
    announcePolite(`Juego iniciado. Adivina la palabra de ${WORD_LENGTH} letras. Tienes ${MAX_GUESSES} intentos.`)
  }

  async function handleSave() {
    const result = await saveScore('wordle', score)
    if (result?.error) {
      setSaveError(result.error)
      announceAssertive(result.error)
    } else {
      setSaved(true)
      announcePolite('Puntuación guardada.')
    }
  }

  if (phase === 'idle') {
    return (
      <GameShell title="Wordle" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Wordle en Español</h2>
          <p className="text-[#888] max-w-md mx-auto text-sm">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame}>Comenzar juego</Button>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Wordle" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Ganaste!' : 'Sin más intentos'}
          </h2>
          <p className="text-lg">
            La palabra era:{' '}
            <strong className="text-[#ffd700] font-mono tracking-widest">{secret}</strong>
          </p>
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

  return (
    <GameShell title="Wordle" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="flex flex-col items-center gap-4">

        {/* Grid */}
        <div role="grid" aria-label="Cuadrícula de Wordle" className="space-y-1.5">
          {Array.from({ length: MAX_GUESSES }, (_, row) => {
            const guess     = guesses[row]
            const isCurrent = row === guesses.length
            const letters   = isCurrent
              ? current.padEnd(WORD_LENGTH).split('')
              : guess
                ? guess.map(g => g.letter)
                : Array(WORD_LENGTH).fill(' ')

            const rowLabel = guess
              ? `Intento ${row + 1}: ${guess.map(g => `${g.letter} ${STATE_LABEL[g.state]}`).join(', ')}`
              : isCurrent
              ? `Escribiendo: ${current || 'vacío'}`
              : 'Vacío'

            return (
              <div
                key={row}
                role="row"
                aria-label={rowLabel}
                className={`flex gap-1.5 ${isCurrent && shaking ? 'shake' : ''}`}
              >
                {letters.map((letter, col) => {
                  const state  = guess ? guess[col].state : 'empty'
                  const filled = isCurrent && letter.trim()
                  return (
                    <div
                      key={col}
                      role="gridcell"
                      aria-label={letter.trim() ? letter : 'vacío'}
                      className={`
                        w-12 h-12 flex items-center justify-center text-xl font-bold border-2 rounded select-none transition-colors
                        ${guess
                          ? STATE_CELL[state]
                          : filled
                          ? 'bg-transparent border-[#aaa] text-[#f0f0f0]'
                          : STATE_CELL.empty}
                      `}
                    >
                      {letter.trim()}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Live typing status for screen readers */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {`Escribiendo: ${current || 'vacío'}`}
        </p>

        {/* On-screen keyboard */}
        <div role="group" aria-label="Teclado en pantalla" className="space-y-1.5 w-full max-w-xs">
          {KEY_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1">
              {row.map(key => {
                const ks       = keyStates[key]
                const isAction = key === 'ENTER' || key === '⌫'
                const label    = key === '⌫' ? 'Borrar'
                              : key === 'ENTER' ? 'Confirmar intento'
                              : `Letra ${key}${ks ? `, ${STATE_LABEL[ks as LetterState]}` : ''}`
                return (
                  <button
                    key={key}
                    onClick={() => pressKey(key)}
                    aria-label={label}
                    className={`
                      h-10 rounded font-bold text-sm select-none transition-colors cursor-pointer
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd700]
                      ${isAction ? 'px-2 text-xs min-w-[3rem]' : 'w-8'}
                      ${ks
                        ? STATE_KEY[ks]
                        : 'bg-[#555] text-[#f0f0f0] border border-[#666] hover:bg-[#666]'}
                    `}
                  >
                    {key}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <p className="text-xs text-[#555]">Teclado físico o botones en pantalla</p>
      </div>
    </GameShell>
  )
}
