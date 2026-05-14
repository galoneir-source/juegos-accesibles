'use client'

import { useState, useEffect, useRef } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── Categories ────────────────────────────────────────────────────────────────

interface Cat { id: string; label: string; section: 'upper' | 'lower'; hint: string }

const CATS: Cat[] = [
  { id: 'unos',    label: 'Unos',           section: 'upper', hint: 'Suma de todos los 1' },
  { id: 'doses',   label: 'Doses',          section: 'upper', hint: 'Suma de todos los 2' },
  { id: 'treses',  label: 'Treses',         section: 'upper', hint: 'Suma de todos los 3' },
  { id: 'cuatros', label: 'Cuatros',        section: 'upper', hint: 'Suma de todos los 4' },
  { id: 'cincos',  label: 'Cincos',         section: 'upper', hint: 'Suma de todos los 5' },
  { id: 'seises',  label: 'Seises',         section: 'upper', hint: 'Suma de todos los 6' },
  { id: 'trio',    label: 'Trío',           section: 'lower', hint: '×3 iguales → suma total' },
  { id: 'esc-c',   label: 'Escalera Corta', section: 'lower', hint: '4 consecutivos → 30 pts' },
  { id: 'esc-l',   label: 'Escalera Larga', section: 'lower', hint: '5 consecutivos → 40 pts' },
  { id: 'full',    label: 'Full',           section: 'lower', hint: '3+2 iguales → 25 pts' },
  { id: 'poker',   label: 'Póker',          section: 'lower', hint: '×4 iguales → suma total' },
  { id: 'generala',label: 'Generala',       section: 'lower', hint: '×5 iguales → 50 (100 si primer tiro)' },
  { id: 'chance',  label: 'Chance',         section: 'lower', hint: 'Suma de todos los dados' },
]

const N_TURNS = 13
const UPPER_IDS = ['unos','doses','treses','cuatros','cincos','seises']
const UPPER_BONUS_MIN = 63
const UPPER_BONUS = 35

// ── Scoring ───────────────────────────────────────────────────────────────────

function counts(dice: number[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const d of dice) m.set(d, (m.get(d) ?? 0) + 1)
  return m
}

function sumAll(dice: number[]) { return dice.reduce((a, b) => a + b, 0) }

function calcScore(id: string, dice: number[], firstRoll: boolean): number {
  const c = counts(dice)
  const vals = [...c.values()]
  const s = sumAll(dice)
  switch (id) {
    case 'unos':    return (c.get(1) ?? 0) * 1
    case 'doses':   return (c.get(2) ?? 0) * 2
    case 'treses':  return (c.get(3) ?? 0) * 3
    case 'cuatros': return (c.get(4) ?? 0) * 4
    case 'cincos':  return (c.get(5) ?? 0) * 5
    case 'seises':  return (c.get(6) ?? 0) * 6
    case 'trio':    return vals.some(v => v >= 3) ? s : 0
    case 'esc-c': {
      const u = [...new Set(dice)].sort((a, b) => a - b)
      let max = 1, run = 1
      for (let i = 1; i < u.length; i++) {
        if (u[i] === u[i - 1] + 1) max = Math.max(max, ++run)
        else run = 1
      }
      return max >= 4 ? 30 : 0
    }
    case 'esc-l': {
      const u = [...new Set(dice)].sort((a, b) => a - b)
      return u.length === 5 && u[4] - u[0] === 4 ? 40 : 0
    }
    case 'full':    return vals.includes(3) && vals.includes(2) ? 25 : 0
    case 'poker':   return vals.some(v => v >= 4) ? s : 0
    case 'generala':return vals.some(v => v >= 5) ? (firstRoll ? 100 : 50) : 0
    case 'chance':  return s
    default: return 0
  }
}

function upperBonus(sc: Record<string, number | null>): number {
  return UPPER_IDS.reduce((a, id) => a + (sc[id] ?? 0), 0) >= UPPER_BONUS_MIN ? UPPER_BONUS : 0
}

function calcTotal(sc: Record<string, number | null>): number {
  return Object.values(sc).reduce<number>((a, v) => a + (v ?? 0), 0) + upperBonus(sc)
}

function emptyScorecard(): Record<string, number | null> {
  return Object.fromEntries(CATS.map(c => [c.id, null]))
}

const INSTRUCTIONS =
  'Generala (Yahtzee). 13 turnos, 5 dados, hasta 3 tiradas por turno. ' +
  'Pulsa R o Espacio para tirar. Teclas 1-5 para guardar o liberar un dado. ' +
  'Flechas ↑↓ para navegar categorías, Enter para anotar. ' +
  'Sección superior: bonus de 35 pts si sumas 63 o más. ' +
  'Generala (×5 iguales): 50 pts, o 100 si es el primer tiro del turno.'

// ── Component ─────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'playing' | 'done'

export default function GeneralaPage() {
  const phaseRef     = useRef<Phase>('idle')
  const diceRef      = useRef([1, 1, 1, 1, 1])
  const heldRef      = useRef([false, false, false, false, false])
  const rollsRef     = useRef(3)   // tiradas restantes este turno
  const rolledRef    = useRef(false)
  const turnRef      = useRef(1)
  const scRef        = useRef(emptyScorecard())
  const cursorRef    = useRef(0)

  const [phase,      setPhaseState] = useState<Phase>('idle')
  const [dice,       setDice]       = useState([1, 1, 1, 1, 1])
  const [held,       setHeld]       = useState([false, false, false, false, false])
  const [rollsLeft,  setRollsLeft]  = useState(3)
  const [hasRolled,  setHasRolled]  = useState(false)
  const [turn,       setTurn]       = useState(1)
  const [scorecard,  setScorecard]  = useState(emptyScorecard())
  const [cursor,     setCursor]     = useState(0)
  const [total,      setTotal]      = useState(0)
  const [saved,      setSaved]      = useState(false)
  const [saveError,  setSaveError]  = useState('')

  function goPhase(p: Phase) { phaseRef.current = p; setPhaseState(p) }

  function startGame() {
    const sc = emptyScorecard()
    diceRef.current   = [1, 1, 1, 1, 1]
    heldRef.current   = [false, false, false, false, false]
    rollsRef.current  = 3
    rolledRef.current = false
    turnRef.current   = 1
    scRef.current     = sc
    cursorRef.current = 0
    setDice([1, 1, 1, 1, 1])
    setHeld([false, false, false, false, false])
    setRollsLeft(3)
    setHasRolled(false)
    setTurn(1)
    setScorecard(sc)
    setCursor(0)
    setTotal(0)
    setSaved(false)
    setSaveError('')
    goPhase('playing')
    audio.start()
    announcePolite('Generala. Turno 1 de 13. Pulsa R o Espacio para tirar los dados.')
  }

  function rollDice() {
    if (phaseRef.current !== 'playing' || rollsRef.current === 0) return
    const next = diceRef.current.map((d, i) =>
      heldRef.current[i] ? d : Math.floor(Math.random() * 6) + 1
    )
    diceRef.current   = next
    rollsRef.current--
    rolledRef.current = true
    setDice([...next])
    setRollsLeft(rollsRef.current)
    setHasRolled(true)

    // play tones for rolled dice with slight delay per die
    next.forEach((d, i) => {
      if (!heldRef.current[i]) setTimeout(() => audio.memoryTone(d - 1), i * 140)
    })

    const remaining = rollsRef.current
    announcePolite(
      `Dados: ${next.join(', ')}. ` +
      (remaining > 0
        ? `${remaining} tirada${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`
        : 'Sin tiradas. Elige categoría con ↑↓ y Enter.')
    )
  }

  function toggleHold(i: number) {
    if (!rolledRef.current) return
    const next = [...heldRef.current]
    next[i] = !next[i]
    heldRef.current = next
    setHeld([...next])
    audio.click()
    announcePolite(`Dado ${i + 1} (valor ${diceRef.current[i]}): ${next[i] ? 'guardado' : 'liberado'}.`)
  }

  function scoreCategory(id: string) {
    if (!rolledRef.current) {
      announceAssertive('Debes tirar los dados antes de anotar.')
      return
    }
    if (scRef.current[id] !== null) {
      announceAssertive('Categoría ya usada. Elige otra.')
      return
    }
    const firstRoll = rollsRef.current === 2  // used exactly 1 roll
    const pts = calcScore(id, diceRef.current, firstRoll)
    const newSc = { ...scRef.current, [id]: pts }
    scRef.current = newSc
    const newTotal = calcTotal(newSc)

    if (pts > 0) audio.correct(); else audio.incorrect()
    const label = CATS.find(c => c.id === id)!.label
    announcePolite(`${label}: ${pts} puntos anotados. Total acumulado: ${newTotal}.`)

    const nextTurn = turnRef.current + 1
    if (nextTurn > N_TURNS) {
      setScorecard(newSc)
      setTotal(newTotal)
      goPhase('done')
      audio.start()
      announceAssertive(`Partida terminada. Puntuación final: ${newTotal} puntos.`)
      return
    }

    // Next turn reset
    turnRef.current   = nextTurn
    diceRef.current   = [1, 1, 1, 1, 1]
    heldRef.current   = [false, false, false, false, false]
    rollsRef.current  = 3
    rolledRef.current = false
    setScorecard(newSc)
    setTotal(newTotal)
    setTurn(nextTurn)
    setDice([1, 1, 1, 1, 1])
    setHeld([false, false, false, false, false])
    setRollsLeft(3)
    setHasRolled(false)
    announcePolite(`Turno ${nextTurn} de ${N_TURNS}. Pulsa R o Espacio para tirar.`)
  }

  function moveCursor(delta: number) {
    const next = (cursorRef.current + delta + CATS.length) % CATS.length
    cursorRef.current = next
    setCursor(next)
    const cat = CATS[next]
    const sc = scRef.current
    const firstRoll = rollsRef.current === 2
    let suffix = ''
    if (sc[cat.id] !== null) {
      suffix = ` (anotada: ${sc[cat.id]} pts)`
    } else if (rolledRef.current) {
      const pot = calcScore(cat.id, diceRef.current, firstRoll)
      suffix = ` — ${pot} pts potenciales`
    }
    announcePolite(`${cat.label}${suffix}. ${cat.hint}.`)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phaseRef.current !== 'playing') return
      if (e.key === 'r' || e.key === 'R' || e.key === ' ') {
        e.preventDefault(); rollDice(); return
      }
      const n = parseInt(e.key)
      if (n >= 1 && n <= 5) { e.preventDefault(); toggleHold(n - 1); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); moveCursor(-1); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1);  return }
      if (e.key === 'Enter')     { e.preventDefault(); scoreCategory(CATS[cursorRef.current].id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleSaveScore() {
    const result = await saveScore('generala', total)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  const firstRoll  = rollsLeft === 2
  const upperSum   = UPPER_IDS.reduce((a, id) => a + (scorecard[id] ?? 0), 0)
  const bonusEarned = upperSum >= UPPER_BONUS_MIN
  const bonusPts   = bonusEarned ? UPPER_BONUS : 0

  function catRowClass(i: number, cat: Cat): string {
    const base = 'flex items-center justify-between px-3 py-1.5 rounded text-sm cursor-pointer transition-colors'
    if (i === cursor && phase === 'playing') return `${base} bg-[#ffd700]/15 ring-1 ring-[#ffd700]/60`
    if (scorecard[cat.id] !== null) return `${base} opacity-50`
    return `${base} hover:bg-[#1a2a3a]`
  }

  // ── Idle ──────────────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Generala" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Generala</h2>
          <p className="text-[#888] text-sm max-w-sm mx-auto">
            13 turnos · 5 dados · hasta 3 tiradas por turno.
            Rellena todas las categorías para maximizar tu puntuación.
          </p>
          <ul className="text-left text-[#666] text-xs max-w-xs mx-auto space-y-0.5">
            <li>R / Espacio → tirar dados</li>
            <li>1-5 → guardar / liberar un dado</li>
            <li>↑↓ → navegar categorías</li>
            <li>Enter → anotar en la categoría</li>
          </ul>
          <Button size="lg" onClick={startGame}>Empezar</Button>
        </div>
      </GameShell>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <GameShell title="Generala" instructions={INSTRUCTIONS} score={total}>
        <div className="text-center space-y-4">
          <h2 className="text-2xl text-[#ffd700]">Partida terminada</h2>
          <p className="text-3xl font-mono font-bold" aria-live="polite">
            {total} puntos
          </p>

          {/* Final scorecard */}
          <div className="text-left max-w-xs mx-auto space-y-3 text-sm">
            <div>
              <p className="text-[#ffd700] text-xs font-bold mb-1">Sección superior</p>
              {CATS.filter(c => c.section === 'upper').map(c => (
                <div key={c.id} className="flex justify-between text-[#aaa] py-0.5">
                  <span>{c.label}</span>
                  <span className="font-mono">{scorecard[c.id] ?? '—'}</span>
                </div>
              ))}
              <div className="flex justify-between text-[#888] py-0.5 border-t border-[#333] mt-1">
                <span>Bonus superior {bonusEarned ? '✓' : `(${upperSum}/${UPPER_BONUS_MIN})`}</span>
                <span className="font-mono">{bonusPts}</span>
              </div>
            </div>
            <div>
              <p className="text-[#ffd700] text-xs font-bold mb-1">Sección inferior</p>
              {CATS.filter(c => c.section === 'lower').map(c => (
                <div key={c.id} className="flex justify-between text-[#aaa] py-0.5">
                  <span>{c.label}</span>
                  <span className="font-mono">{scorecard[c.id] ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {!saved ? (
            <>
              <Button onClick={handleSaveScore}>Guardar puntuación</Button>
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

  // ── Playing ───────────────────────────────────────────────────────────────────

  return (
    <GameShell
      title="Generala"
      instructions={INSTRUCTIONS}
      score={total}
      onReread={() =>
        announcePolite(
          `Turno ${turn} de ${N_TURNS}. ${rollsLeft} tirada${rollsLeft !== 1 ? 's' : ''} restante${rollsLeft !== 1 ? 's' : ''}. ` +
          `Dados: ${dice.join(', ')}.`
        )
      }
    >
      <div className="flex flex-col lg:flex-row gap-5">

        {/* Left: dice + controls */}
        <div className="flex flex-col items-center gap-4 lg:w-52 shrink-0">

          {/* Turn/rolls status */}
          <div className="text-center">
            <p className="text-[#ffd700] font-bold text-sm">Turno {turn}/{N_TURNS}</p>
            <p className="text-[#888] text-xs">
              {rollsLeft} tirada{rollsLeft !== 1 ? 's' : ''} restante{rollsLeft !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Dice */}
          <div
            role="group"
            aria-label="Dados (teclas 1-5 para guardar)"
            className="flex gap-2 flex-wrap justify-center"
          >
            {dice.map((d, i) => (
              <button
                key={i}
                onClick={() => toggleHold(i)}
                disabled={!hasRolled}
                aria-label={`Dado ${i + 1}: ${d}${held[i] ? ', guardado' : ''}`}
                aria-pressed={held[i]}
                className={`
                  w-14 h-14 rounded-xl text-2xl font-bold font-mono
                  border-2 transition-all duration-150 select-none
                  ${held[i]
                    ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300 shadow-[0_0_10px_2px_rgba(250,204,21,0.3)]'
                    : hasRolled
                      ? 'bg-[#0d1b2a] border-[#334] text-[#ddd] hover:border-[#556] cursor-pointer'
                      : 'bg-[#080f18] border-[#222] text-[#444] cursor-default'
                  }
                `}
              >
                {hasRolled ? d : '·'}
              </button>
            ))}
          </div>

          {/* Key hints */}
          {hasRolled && (
            <p className="text-[#444] text-xs text-center">
              {held.map((h, i) => h ? `[${i + 1}✓]` : `[${i + 1}]`).join(' ')}
            </p>
          )}

          {/* Roll button */}
          <Button
            size="lg"
            onClick={rollDice}
            disabled={rollsLeft === 0}
          >
            {hasRolled ? `Tirar de nuevo (${rollsLeft})` : 'Tirar dados'}
          </Button>

          {hasRolled && (
            <p className="text-[#444] text-xs text-center">
              ↑↓ categoría · Enter anotar
            </p>
          )}
        </div>

        {/* Right: scorecard */}
        <div className="flex-1 min-w-0">
          <div className="space-y-4 text-sm">

            {/* Upper section */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[#ffd700] text-xs font-bold tracking-wide">SECCIÓN SUPERIOR</p>
                <p className="text-[#666] text-xs" aria-live="polite">
                  {upperSum}/{UPPER_BONUS_MIN}
                  {bonusEarned
                    ? <span className="text-[#22c55e] ml-1">+{UPPER_BONUS}</span>
                    : <span className="text-[#666] ml-1">({UPPER_BONUS_MIN - upperSum} para bonus)</span>
                  }
                </p>
              </div>
              {CATS.filter(c => c.section === 'upper').map((cat, _) => {
                const gi = CATS.indexOf(cat)
                const scored = scorecard[cat.id]
                const potential = hasRolled && scored === null
                  ? calcScore(cat.id, dice, firstRoll) : null
                return (
                  <div
                    key={cat.id}
                    className={catRowClass(gi, cat)}
                    onClick={() => scoreCategory(cat.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${cat.label}: ${scored !== null ? scored + ' pts (anotada)' : potential !== null ? potential + ' pts potenciales' : 'disponible'}`}
                    onKeyDown={e => e.key === 'Enter' && scoreCategory(cat.id)}
                  >
                    <span className={scored !== null ? 'text-[#666]' : 'text-[#ccc]'}>{cat.label}</span>
                    <span className="font-mono ml-2 shrink-0">
                      {scored !== null
                        ? <span className="text-[#888]">{scored}</span>
                        : potential !== null
                          ? <span className="text-[#22c55e]">{potential}</span>
                          : <span className="text-[#333]">—</span>
                      }
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Lower section */}
            <div>
              <p className="text-[#ffd700] text-xs font-bold tracking-wide mb-1">SECCIÓN INFERIOR</p>
              {CATS.filter(c => c.section === 'lower').map((cat) => {
                const gi = CATS.indexOf(cat)
                const scored = scorecard[cat.id]
                const potential = hasRolled && scored === null
                  ? calcScore(cat.id, dice, firstRoll) : null
                return (
                  <div
                    key={cat.id}
                    className={catRowClass(gi, cat)}
                    onClick={() => scoreCategory(cat.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${cat.label}: ${scored !== null ? scored + ' pts (anotada)' : potential !== null ? potential + ' pts potenciales' : 'disponible'}. ${cat.hint}.`}
                    onKeyDown={e => e.key === 'Enter' && scoreCategory(cat.id)}
                  >
                    <span className={scored !== null ? 'text-[#666]' : 'text-[#ccc]'}>{cat.label}</span>
                    <span className="font-mono ml-2 shrink-0">
                      {scored !== null
                        ? <span className="text-[#888]">{scored}</span>
                        : potential !== null
                          ? <span className={potential > 0 ? 'text-[#22c55e]' : 'text-[#555]'}>{potential}</span>
                          : <span className="text-[#333]">—</span>
                      }
                    </span>
                  </div>
                )
              })}
            </div>

          </div>
        </div>
      </div>
    </GameShell>
  )
}
