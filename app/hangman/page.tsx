'use client'

import { useState, useEffect, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

const FALLBACK_WORDS = [
  { word: 'ELEFANTE', hint: 'Animal grande con trompa' },
  { word: 'COMPUTADORA', hint: 'Máquina electrónica para procesar información' },
  { word: 'MARIPOSA', hint: 'Insecto con alas coloridas' },
  { word: 'TELESCOPIO', hint: 'Instrumento para observar las estrellas' },
  { word: 'BIBLIOTECA', hint: 'Lugar donde se guardan y prestan libros' },
  { word: 'CHOCOLATE', hint: 'Dulce hecho de cacao' },
  { word: 'DINOSAURIO', hint: 'Animal prehistórico extinto' },
  { word: 'GEOGRAFÍA', hint: 'Ciencia que estudia la Tierra' },
  { word: 'AMBULANCIA', hint: 'Vehículo de emergencias médicas' },
  { word: 'MURCIÉLAGO', hint: 'Mamífero volador nocturno' },
]

const MAX_ERRORS = 6
const INSTRUCTIONS = 'Ahorcado. Adivina la palabra letra a letra. Presiona una letra del teclado para intentarla. Usa el botón "Pedir pista" para obtener una pista (resta 5 puntos). Tienes 6 intentos. Tecla H repite instrucciones.'

export default function HangmanPage() {
  const [wordData, setWordData] = useState(FALLBACK_WORDS[0])
  const [guessed, setGuessed] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState(0)
  const [started, setStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [finished, setFinished] = useState(false)
  const [won, setWon] = useState(false)
  const [score, setScore] = useState(0)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [hintUsed, setHintUsed] = useState(false)

  const displayed = wordData.word.split('').map(l => (guessed.has(l) ? l : '_'))
  const remaining = MAX_ERRORS - errors
  const isWon = displayed.every(l => l !== '_')
  const isLost = errors >= MAX_ERRORS

  const readState = useCallback(() => {
    const progress = displayed.join(' ')
    const used = Array.from(guessed).join(', ') || 'ninguna'
    announcePolite(`Palabra: ${progress}. Letras usadas: ${used}. Intentos restantes: ${remaining}.`)
  }, [displayed, guessed, remaining])

  useEffect(() => {
    if (!started || finished) return
    if (isWon) {
      const pts = Math.max(0, 100 + remaining * 10 - (hintUsed ? 5 : 0))
      setScore(s => s + pts)
      setWon(true)
      setFinished(true)
      audio.correct()
      announceAssertive(`¡Ganaste! La palabra era ${wordData.word}. +${pts} puntos.`)
    } else if (isLost) {
      setFinished(true)
      audio.gameOver()
      announceAssertive(`Perdiste. La palabra era ${wordData.word}.`)
    }
  }, [isWon, isLost, started, finished, remaining, wordData.word, hintUsed])

  useEffect(() => {
    if (!started || finished) return
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      const letter = e.key.toUpperCase()
      if (/^[A-ZÁÉÍÓÚÜÑ]$/.test(letter) && !guessed.has(letter)) {
        tryLetter(letter)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [started, finished, guessed, wordData, errors]) // eslint-disable-line react-hooks/exhaustive-deps

  function tryLetter(letter: string) {
    const next = new Set(guessed)
    next.add(letter)
    setGuessed(next)
    if (wordData.word.includes(letter)) {
      audio.correct()
      const count = wordData.word.split('').filter(l => l === letter).length
      announceAssertive(`¡Correcto! La letra ${letter} aparece ${count} ${count === 1 ? 'vez' : 'veces'}.`)
    } else {
      audio.incorrect()
      setErrors(e => e + 1)
      announceAssertive(`Incorrecto. La letra ${letter} no está en la palabra. Intentos restantes: ${MAX_ERRORS - errors - 1}.`)
    }
  }

  async function startGame() {
    setLoading(true)
    announcePolite('Cargando palabra…')
    let pick = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)]
    try {
      const res = await fetch('/api/hangman-word')
      if (res.ok) {
        const data = await res.json()
        if (data?.word && data?.hint) pick = data
      }
    } catch { /* use fallback */ }
    setWordData(pick)
    setGuessed(new Set())
    setErrors(0)
    setFinished(false)
    setWon(false)
    setSaved(false)
    setSaveError('')
    setHintUsed(false)
    setLoading(false)
    setStarted(true)
    audio.start()
    announcePolite(`Juego iniciado. La palabra tiene ${pick.word.length} letras.`)
  }

  function useHint() {
    setHintUsed(true)
    announceAssertive(`Pista: ${wordData.hint}`)
  }

  async function handleSave() {
    const result = await saveScore('hangman', score)
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
      <GameShell title="Ahorcado" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Ahorcado</h2>
          <p className="text-[#888]">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame} disabled={loading} aria-busy={loading}>
            {loading ? 'Cargando palabra…' : 'Comenzar juego'}
          </Button>
        </div>
      </GameShell>
    )
  }

  if (finished) {
    return (
      <GameShell title="Ahorcado" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: won ? '#22c55e' : '#ef4444' }}>
            {won ? '¡Ganaste!' : 'Perdiste'}
          </h2>
          <p className="text-xl">La palabra era: <strong className="text-[#ffd700]">{wordData.word}</strong></p>
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
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

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜÑ'.split('')

  return (
    <GameShell title="Ahorcado" instructions={INSTRUCTIONS} score={score} onReread={readState}>
      <div className="space-y-6">
        <p className="text-sm text-[#888]">Intentos restantes: <strong className="text-[#f0f0f0]">{remaining}</strong></p>

        <div
          className="font-mono text-3xl tracking-widest text-center py-4 border border-[#333] rounded"
          aria-label={`Palabra: ${displayed.join(' ')}`}
        >
          {displayed.map((l, i) => (
            <span key={i} className={l === '_' ? 'text-[#444]' : 'text-[#ffd700]'}>{l}</span>
          ))}
        </div>

        <div>
          <p className="text-sm text-[#888] mb-2">Letras intentadas:</p>
          <p className="font-mono tracking-wider" aria-live="polite">
            {Array.from(guessed).map(l => (
              <span key={l} className={wordData.word.includes(l) ? 'text-[#22c55e] mr-1' : 'text-[#ef4444] mr-1'}>{l}</span>
            ))}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={useHint}
            disabled={hintUsed}
            aria-label={hintUsed ? 'Pista ya utilizada' : 'Pedir pista (resta 5 puntos)'}
          >
            {hintUsed ? 'Pista usada' : 'Pedir pista (−5 pts)'}
          </Button>
          {hintUsed && (
            <p className="text-sm text-[#ffd700]" aria-live="polite">
              Pista: {wordData.hint}
            </p>
          )}
        </div>

        <div role="group" aria-label="Teclado de letras" className="flex flex-wrap gap-2">
          {LETTERS.map(l => (
            <Button
              key={l}
              variant="secondary"
              size="sm"
              disabled={guessed.has(l)}
              onClick={() => tryLetter(l)}
              aria-label={`Letra ${l}`}
              aria-pressed={guessed.has(l)}
              className={guessed.has(l) ? (wordData.word.includes(l) ? '!border-[#22c55e] !text-[#22c55e]' : '!border-[#ef4444] !text-[#ef4444] opacity-40') : ''}
            >
              {l}
            </Button>
          ))}
        </div>

        <p className="text-sm text-[#555]">
          Presiona la tecla de la letra en tu teclado, o haz click en el botón.
        </p>
      </div>
    </GameShell>
  )
}
