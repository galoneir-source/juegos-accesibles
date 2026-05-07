'use client'

import { useState, useEffect, useRef } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

type Difficulty = 'easy' | 'medium' | 'hard'
type Op = '+' | '-' | '×' | '÷'

interface DiffConfig {
  timePerQ: number
  ops: Op[]
  maxNum: number
  label: string
  desc: string
}

const CONFIGS: Record<Difficulty, DiffConfig> = {
  easy:   { timePerQ: 12, ops: ['+', '-'],            maxNum: 10, label: 'Fácil',    desc: 'Suma y resta hasta 10 · 12 s por operación'          },
  medium: { timePerQ: 9,  ops: ['+', '-', '×'],        maxNum: 20, label: 'Medio',   desc: 'Suma, resta y multiplicación · 9 s por operación'    },
  hard:   { timePerQ: 6,  ops: ['+', '-', '×', '÷'],   maxNum: 12, label: 'Difícil', desc: 'Todas las operaciones · 6 s por operación'           },
}

const MAX_LIVES = 3
const TOTAL_QUESTIONS = 15

interface Question {
  answer: number
  display: string
  spoken: string
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateQuestion(cfg: DiffConfig): Question {
  const op = cfg.ops[Math.floor(Math.random() * cfg.ops.length)]
  let a: number, b: number, answer: number

  switch (op) {
    case '+': a = rand(1, cfg.maxNum); b = rand(1, cfg.maxNum); answer = a + b; break
    case '-': b = rand(1, cfg.maxNum - 1); a = rand(b + 1, cfg.maxNum); answer = a - b; break
    case '×': a = rand(2, 10); b = rand(2, 10); answer = a * b; break
    default:  answer = rand(2, 10); b = rand(2, 10); a = answer * b; break
  }

  const sym:    Record<Op, string> = { '+': '+', '-': '−', '×': '×', '÷': '÷' }
  const spoken: Record<Op, string> = { '+': 'más', '-': 'menos', '×': 'por', '÷': 'entre' }

  return {
    answer,
    display: `${a} ${sym[op]} ${b}`,
    spoken:  `¿Cuánto es ${a} ${spoken[op]} ${b}?`,
  }
}

function calcPoints(timeLeft: number, totalTime: number): number {
  return 100 + Math.round((timeLeft / totalTime) * 100)
}

const INSTRUCTIONS =
  `Matemáticas Rápidas. Se muestra una operación aritmética. ` +
  `Escribe el resultado numérico y presiona Enter antes de que se agote el tiempo. ` +
  `Tienes ${MAX_LIVES} vidas y ${TOTAL_QUESTIONS} operaciones en total. ` +
  `Pierdes una vida por cada error o tiempo agotado. ` +
  `Tecla H repite instrucciones. Tecla R relee el estado actual.`

type Phase = 'idle' | 'playing' | 'finished'

export default function MatesRapidasPage() {
  const [phase, setPhase]           = useState<Phase>('idle')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [question, setQuestion]     = useState<Question | null>(null)
  const [qNum, setQNum]             = useState(1)
  const [input, setInput]           = useState('')
  const [lives, setLives]           = useState(MAX_LIVES)
  const [score, setScore]           = useState(0)
  const [timeLeft, setTimeLeft]     = useState(0)
  const [saved, setSaved]           = useState(false)
  const [saveError, setSaveError]   = useState('')

  const inputRef  = useRef<HTMLInputElement>(null)
  const answered  = useRef(false)
  const diffRef   = useRef<Difficulty>('easy')
  diffRef.current = difficulty

  // Timer tick via chained timeouts
  useEffect(() => {
    if (phase !== 'playing' || answered.current || timeLeft <= 0) return
    const id = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, timeLeft])

  // Announce urgency at 3 s
  useEffect(() => {
    if (phase === 'playing' && timeLeft === 3 && !answered.current) {
      announcePolite('3 segundos')
      audio.tick()
    }
  }, [phase, timeLeft])

  // Timeout handler
  useEffect(() => {
    if (phase !== 'playing' || timeLeft !== 0 || answered.current) return
    answered.current = true

    const newLives = lives - 1
    const newQNum  = qNum + 1
    setLives(newLives)
    setQNum(newQNum)
    audio.incorrect()
    announceAssertive(
      `Tiempo agotado. La respuesta era ${question?.answer}. ` +
      (newLives > 0
        ? `Te quedan ${newLives} ${newLives === 1 ? 'vida' : 'vidas'}.`
        : 'Sin vidas.')
    )

    const cfg = CONFIGS[diffRef.current]
    setTimeout(() => advanceGame(cfg, newLives, score, newQNum), 1500)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft])

  function advanceGame(cfg: DiffConfig, newLives: number, currentScore: number, newQNum: number) {
    if (newLives <= 0 || newQNum > TOTAL_QUESTIONS) {
      setPhase('finished')
      audio.gameOver()
      announceAssertive(
        `Juego terminado. ` +
        `${newLives <= 0 ? 'Sin vidas.' : `Completaste ${TOTAL_QUESTIONS} operaciones.`} ` +
        `Puntuación final: ${currentScore} puntos.`
      )
      return
    }
    const q = generateQuestion(cfg)
    setQuestion(q)
    setInput('')
    setTimeLeft(cfg.timePerQ)
    answered.current = false
    setTimeout(() => { announceAssertive(q.spoken); inputRef.current?.focus() }, 50)
  }

  function startGame() {
    const diff = diffRef.current
    const cfg  = CONFIGS[diff]
    const q    = generateQuestion(cfg)

    setLives(MAX_LIVES)
    setScore(0)
    setQNum(1)
    setSaved(false)
    setSaveError('')
    setQuestion(q)
    setInput('')
    setTimeLeft(cfg.timePerQ)
    answered.current = false
    setPhase('playing')
    audio.start()

    setTimeout(() => { announceAssertive(q.spoken); inputRef.current?.focus() }, 400)
  }

  function handleSubmit() {
    if (answered.current || !question || phase !== 'playing') return

    const parsed = parseInt(input.trim(), 10)
    if (isNaN(parsed)) {
      announceAssertive('Escribe un número entero.')
      return
    }

    answered.current = true
    const cfg = CONFIGS[diffRef.current]

    if (parsed === question.answer) {
      const pts      = calcPoints(timeLeft, cfg.timePerQ)
      const newScore = score + pts
      const newQNum  = qNum + 1
      setScore(newScore)
      setQNum(newQNum)
      audio.correct()
      announceAssertive(`Correcto. +${pts} puntos.`)
      setTimeout(() => advanceGame(cfg, lives, newScore, newQNum), 1000)
    } else {
      const newLives = lives - 1
      const newQNum  = qNum + 1
      setLives(newLives)
      setQNum(newQNum)
      audio.incorrect()
      announceAssertive(
        `Incorrecto. La respuesta era ${question.answer}. ` +
        (newLives > 0
          ? `Te quedan ${newLives} ${newLives === 1 ? 'vida' : 'vidas'}.`
          : 'Sin vidas.')
      )
      setTimeout(() => advanceGame(cfg, newLives, score, newQNum), 1500)
    }
  }

  function readState() {
    if (phase !== 'playing' || !question) return
    announcePolite(
      `${question.spoken} Tiempo: ${timeLeft} segundos. ` +
      `Vidas: ${lives}. Puntuación: ${score}. Operación ${qNum} de ${TOTAL_QUESTIONS}.`
    )
  }

  async function handleSave() {
    const result = await saveScore('mates-rapidas', score)
    if (result?.error) {
      setSaveError(result.error)
      announceAssertive(result.error)
    } else {
      setSaved(true)
      announcePolite('Puntuación guardada.')
    }
  }

  // ── IDLE ────────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <GameShell title="Matemáticas Rápidas" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-8 max-w-md mx-auto">
          <h2 className="text-xl text-[#ffd700]">Matemáticas Rápidas</h2>
          <p className="text-[#888]">
            Responde operaciones aritméticas antes de que se agote el tiempo.
            Tienes {MAX_LIVES} vidas y {TOTAL_QUESTIONS} operaciones.
          </p>

          <fieldset className="text-left space-y-3">
            <legend className="text-sm text-[#888] mb-3 block">Elige la dificultad:</legend>
            {(Object.entries(CONFIGS) as [Difficulty, DiffConfig][]).map(([key, cfg]) => (
              <label
                key={key}
                className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  difficulty === key
                    ? 'border-[#ffd700] bg-[#1a1600]'
                    : 'border-[#333] bg-[#111] hover:border-[#555]'
                }`}
              >
                <input
                  type="radio"
                  name="difficulty"
                  value={key}
                  checked={difficulty === key}
                  onChange={() => setDifficulty(key)}
                  className="mt-1"
                />
                <div>
                  <span className="font-bold text-[#ffd700]">{cfg.label}</span>
                  <span className="text-[#888] text-sm block mt-0.5">{cfg.desc}</span>
                </div>
              </label>
            ))}
          </fieldset>

          <Button size="lg" onClick={startGame}>
            Comenzar
          </Button>
        </div>
      </GameShell>
    )
  }

  // ── FINISHED ─────────────────────────────────────────────────────────────────
  if (phase === 'finished') {
    return (
      <GameShell title="Matemáticas Rápidas" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl text-[#ffd700]">Juego terminado</h2>
          <p className="text-3xl font-mono font-bold" aria-live="polite">
            Puntuación: {score}
          </p>
          <p className="text-[#888]">
            Completaste {Math.min(qNum - 1, TOTAL_QUESTIONS)} de {TOTAL_QUESTIONS} operaciones.
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

  // ── PLAYING ──────────────────────────────────────────────────────────────────
  const timerColor =
    timeLeft <= 3 ? '#ef4444' :
    timeLeft <= 6 ? '#fbbf24' :
    '#22c55e'

  return (
    <GameShell
      title="Matemáticas Rápidas"
      instructions={INSTRUCTIONS}
      score={score}
      onReread={readState}
    >
      <div className="space-y-6 max-w-sm mx-auto">
        <div className="flex justify-between items-center text-sm">
          <span className="text-[#888]" aria-label={`Operación ${qNum} de ${TOTAL_QUESTIONS}`}>
            {qNum} / {TOTAL_QUESTIONS}
          </span>
          <span
            className="font-mono text-2xl font-bold tabular-nums"
            style={{ color: timerColor }}
            aria-label={`Tiempo: ${timeLeft} segundos`}
            aria-live="off"
          >
            {timeLeft}s
          </span>
          <span className="text-xl tracking-wide" aria-label={`Vidas: ${lives} de ${MAX_LIVES}`}>
            {'♥'.repeat(lives)}{'♡'.repeat(MAX_LIVES - lives)}
          </span>
        </div>

        {question && (
          <div
            className="text-center py-10 px-6 rounded-xl border border-[#333] bg-[#0a0a0a]"
            aria-label={question.spoken}
          >
            <p className="text-5xl font-mono font-bold text-[#f0f0f0]" aria-hidden="true">
              {question.display}
            </p>
            <p className="text-2xl text-[#555] mt-3" aria-hidden="true">= ?</p>
          </div>
        )}

        <div>
          <label htmlFor="answer-input" className="block text-sm text-[#888] mb-1">
            Tu respuesta:
          </label>
          <div className="flex gap-3">
            <input
              id="answer-input"
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={input}
              onChange={e => setInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
              className="flex-1 bg-[#111] border border-[#444] rounded-md px-4 py-3 text-2xl font-mono text-[#ffd700] focus:outline-none focus:ring-3 focus:ring-[#ffd700] focus:ring-offset-2 focus:ring-offset-black"
              aria-label="Escribe tu respuesta numérica"
              autoComplete="off"
              disabled={answered.current}
            />
            <Button
              onClick={handleSubmit}
              disabled={answered.current}
              aria-label="Confirmar respuesta"
            >
              OK
            </Button>
          </div>
        </div>
      </div>
    </GameShell>
  )
}
