'use client'

import { useState, useEffect, useRef } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

const SOUND_NAMES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do alto']
const INITIAL_LENGTH = 3
const MAX_LENGTH = 8

const INSTRUCTIONS = 'Memory de Sonidos. Escucharás una secuencia de tonos. Luego debes repetirla en el mismo orden usando los botones numerados del 1 al 8, o presionando esas teclas en el teclado. Cada ronda añade un tono más. Tecla H repite instrucciones.'

type Phase = 'idle' | 'playing' | 'waiting' | 'input' | 'win' | 'lose'

export default function MemorySonidosPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [sequence, setSequence] = useState<number[]>([])
  const [inputSeq, setInputSeq] = useState<number[]>([])
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(INITIAL_LENGTH)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [activeBtn, setActiveBtn] = useState<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function generateSequence(len: number) {
    return Array.from({ length: len }, () => Math.floor(Math.random() * 8))
  }

  async function playSequence(seq: number[]) {
    setPhase('playing')
    announcePolite('Escucha la secuencia.')
    for (let i = 0; i < seq.length; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 800 : 700))
      setActiveBtn(seq[i])
      audio.memoryTone(seq[i])
      announcePolite(`${SOUND_NAMES[seq[i]]}.`)
      await new Promise(r => setTimeout(r, 500))
      setActiveBtn(null)
    }
    await new Promise(r => setTimeout(r, 600))
    setPhase('input')
    announcePolite('Ahora repite la secuencia. Usa los botones 1 al 8 o las teclas 1 al 8.')
  }

  function startGame() {
    const seq = generateSequence(INITIAL_LENGTH)
    setSequence(seq)
    setInputSeq([])
    setLevel(INITIAL_LENGTH)
    setScore(0)
    setSaved(false)
    setSaveError('')
    playSequence(seq)
  }

  function pressSound(idx: number) {
    if (phase !== 'input') return
    audio.memoryTone(idx)
    setActiveBtn(idx)
    timeoutRef.current = setTimeout(() => setActiveBtn(null), 300)

    const next = [...inputSeq, idx]
    setInputSeq(next)

    if (next[next.length - 1] !== sequence[next.length - 1]) {
      audio.gameOver()
      setPhase('lose')
      announceAssertive(`Incorrecto. La secuencia era: ${sequence.map(i => SOUND_NAMES[i]).join(', ')}.`)
      return
    }

    if (next.length === sequence.length) {
      const pts = level * 10
      setScore(s => s + pts)
      audio.correct()
      if (level >= MAX_LENGTH) {
        setPhase('win')
        announceAssertive(`¡Completaste todos los niveles! +${pts} puntos.`)
      } else {
        const newLevel = level + 1
        setLevel(newLevel)
        const newSeq = [...sequence, Math.floor(Math.random() * 8)]
        setSequence(newSeq)
        setInputSeq([])
        announcePolite(`¡Correcto! +${pts} puntos. Nivel ${newLevel}. Escucha la nueva secuencia.`)
        setTimeout(() => playSequence(newSeq), 1500)
      }
    }
  }

  useEffect(() => {
    if (phase !== 'input') return
    function handleKey(e: KeyboardEvent) {
      const n = parseInt(e.key) - 1
      if (n >= 0 && n <= 7) pressSound(n)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [phase, inputSeq, sequence]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])

  async function handleSave() {
    const result = await saveScore('memory', score)
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
      <GameShell title="Memory de Sonidos" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Memory de Sonidos</h2>
          <p className="text-[#888]">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame}>Comenzar</Button>
        </div>
      </GameShell>
    )
  }

  const isEnd = phase === 'win' || phase === 'lose'

  if (isEnd) {
    return (
      <GameShell title="Memory de Sonidos" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'win' ? '#22c55e' : '#ef4444' }}>
            {phase === 'win' ? '¡Ganaste!' : '¡Fin del juego!'}
          </h2>
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
          <p className="text-[#888]">Llegaste al nivel {level}</p>
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
    <GameShell title="Memory de Sonidos" instructions={INSTRUCTIONS} score={score}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-sm text-[#888]">Nivel {level} — secuencia de {level} tonos</p>
          <p aria-live="polite" className="text-sm font-medium">
            {phase === 'playing' ? '🔊 Escuchando…' : phase === 'input' ? '⌨️ Tu turno' : ''}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3" role="group" aria-label="Tonos musicales">
          {SOUND_NAMES.map((name, i) => (
            <Button
              key={i}
              variant="secondary"
              size="lg"
              disabled={phase !== 'input'}
              onClick={() => pressSound(i)}
              aria-label={`Tono ${i + 1}: ${name}`}
              className={`flex flex-col items-center gap-1 h-20 ${activeBtn === i ? '!bg-[#ffd700] !text-black !border-[#ffd700]' : ''}`}
            >
              <span className="text-2xl font-bold text-[#ffd700]">{i + 1}</span>
              <span className="text-xs">{name}</span>
            </Button>
          ))}
        </div>

        {phase === 'input' && (
          <div>
            <p className="text-sm text-[#888] mb-1">Progreso: {inputSeq.length} / {sequence.length}</p>
            <div className="flex gap-2 flex-wrap">
              {inputSeq.map((s, i) => (
                <span key={i} className="px-2 py-1 bg-[#ffd700] text-black text-sm rounded font-bold">{SOUND_NAMES[s]}</span>
              ))}
            </div>
          </div>
        )}

        {phase === 'waiting' && (
          <p className="text-center text-[#888] animate-pulse">Preparando siguiente ronda…</p>
        )}
      </div>
    </GameShell>
  )
}
