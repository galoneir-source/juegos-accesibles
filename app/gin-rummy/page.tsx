'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── tipos ──────────────────────────────────────────────────────────────────

type Suit = 'Picas' | 'Corazones' | 'Diamantes' | 'Tréboles'
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

interface Card { rank: Rank; suit: Suit; id: string }

type Phase = 'idle' | 'playing' | 'finished'

// ── constantes ──────────────────────────────────────────────────────────────

const SUITS: Suit[] = ['Picas', 'Corazones', 'Diamantes', 'Tréboles']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUIT_SYMBOL: Record<Suit, string> = { Picas: '♠', Corazones: '♥', Diamantes: '♦', Tréboles: '♣' }
const RED_SUITS = new Set<Suit>(['Corazones', 'Diamantes'])
const RANK_NAMES: Record<Rank, string> = {
  A: 'As', '2': 'Dos', '3': 'Tres', '4': 'Cuatro', '5': 'Cinco',
  '6': 'Seis', '7': 'Siete', '8': 'Ocho', '9': 'Nueve', '10': 'Diez',
  J: 'Jota', Q: 'Reina', K: 'Rey',
}

const RANK_VALUE: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 10, Q: 10, K: 10,
}

const RANK_ORDER: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
}

const INSTRUCTIONS = `Gin Rummy. Objetivo: forma combinaciones con tus 10 cartas y llama cuando tu puntaje de cartas sueltas sea bajo.
Combinaciones válidas: trío o cuarteto del mismo rango (ej: tres Reinas), o escalera de 3 o más cartas del mismo palo en orden (ej: 4-5-6 de Picas).
Cada turno: roba una carta del mazo (tecla M) o del descarte (tecla D), luego descarta una carta de tu mano (teclas 1-0 para seleccionar y R para descartar).
Cuando tengas 10 o menos puntos en cartas no combinadas, puedes llamar con tecla L (Llamada). Con 0 puntos puedes Gin con tecla G (bonificación extra).
Tecla H para ver tu mano completa. Tecla I para repetir instrucciones. Tecla N para nueva partida.`

// ── utilidades de baraja ────────────────────────────────────────────────────

function createDeck(): Card[] {
  return SUITS.flatMap(suit =>
    RANKS.map(rank => ({ rank, suit, id: `${rank}-${suit}` }))
  )
}

function shuffle(deck: Card[]): Card[] {
  const d = [...deck]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

function cardLabel(card: Card): string {
  return `${RANK_NAMES[card.rank]} de ${card.suit}`
}

function cardValue(card: Card): number {
  return RANK_VALUE[card.rank]
}

// ── lógica de combinaciones ─────────────────────────────────────────────────

function isSet(cards: Card[]): boolean {
  if (cards.length < 3) return false
  const rank = cards[0].rank
  const suits = new Set(cards.map(c => c.suit))
  return cards.every(c => c.rank === rank) && suits.size === cards.length
}

function isRun(cards: Card[]): boolean {
  if (cards.length < 3) return false
  const suit = cards[0].suit
  if (!cards.every(c => c.suit === suit)) return false
  const sorted = [...cards].sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank])
  for (let i = 1; i < sorted.length; i++) {
    if (RANK_ORDER[sorted[i].rank] !== RANK_ORDER[sorted[i - 1].rank] + 1) return false
  }
  return true
}

function isMeld(cards: Card[]): boolean {
  return isSet(cards) || isRun(cards)
}

// Calcula los puntos de cartas sueltas (deadwood) usando backtracking
function calcDeadwood(hand: Card[]): { deadwood: number; melds: Card[][] } {
  let bestDeadwood = hand.reduce((s, c) => s + cardValue(c), 0)
  let bestMelds: Card[][] = []

  function tryMelds(remaining: Card[], used: boolean[], current: Card[][]): void {
    const dw = remaining
      .filter((_, i) => !used[i])
      .reduce((s, c) => s + cardValue(c), 0)

    if (dw < bestDeadwood) {
      bestDeadwood = dw
      bestMelds = current.map(m => [...m])
    }

    for (let size = 3; size <= remaining.length; size++) {
      const indices = Array.from({ length: size }, (_, k) => k)
      // intentar todas las combinaciones de `size` cartas no usadas
      const availIdx = remaining.map((_, i) => i).filter(i => !used[i])
      const combos = getCombinations(availIdx, size)
      for (const combo of combos) {
        const subset = combo.map(i => remaining[i])
        if (isMeld(subset)) {
          const newUsed = [...used]
          combo.forEach(i => { newUsed[i] = true })
          tryMelds(remaining, newUsed, [...current, subset])
        }
      }
    }
  }

  tryMelds(hand, new Array(hand.length).fill(false), [])
  return { deadwood: bestDeadwood, melds: bestMelds }
}

function getCombinations(arr: number[], size: number): number[][] {
  if (size === 0) return [[]]
  if (arr.length < size) return []
  const [first, ...rest] = arr
  const withFirst = getCombinations(rest, size - 1).map(c => [first, ...c])
  const withoutFirst = getCombinations(rest, size)
  return [...withFirst, ...withoutFirst]
}

// ── IA simple ───────────────────────────────────────────────────────────────

function aiChooseDiscard(hand: Card[]): number {
  // Descarta la carta con mayor valor que menos contribuye a melds potenciales
  let worstIdx = 0
  let worstScore = -1

  hand.forEach((card, idx) => {
    // Puntúa cuánto potencial de meld tiene esta carta
    let potential = 0
    hand.forEach((other, otherIdx) => {
      if (otherIdx === idx) return
      if (card.rank === other.rank) potential += 2
      if (card.suit === other.suit && Math.abs(RANK_ORDER[card.rank] - RANK_ORDER[other.rank]) <= 2) potential += 1
    })
    const score = cardValue(card) - potential * 2
    if (score > worstScore) {
      worstScore = score
      worstIdx = idx
    }
  })

  return worstIdx
}

function aiWantsDiscard(hand: Card[], topDiscard: Card): boolean {
  // La IA roba del descarte si esa carta mejora sus combinaciones potenciales
  const currentDw = calcDeadwood(hand).deadwood
  const hypothetical = [...hand, topDiscard]
  const discardIdx = aiChooseDiscard(hypothetical)
  const newHand = hypothetical.filter((_, i) => i !== discardIdx)
  const newDw = calcDeadwood(newHand).deadwood
  return newDw < currentDw - 2
}

// ── componente visual de carta ───────────────────────────────────────────────

function CardVisual({ card, selected, hidden }: { card: Card; selected?: boolean; hidden?: boolean }) {
  if (hidden) {
    return (
      <div
        aria-hidden="true"
        className="w-12 h-16 rounded border border-[#444] bg-[#1e1e2e] flex items-center justify-center text-[#555] text-xl select-none"
      >
        ?
      </div>
    )
  }
  const isRed = RED_SUITS.has(card.suit)
  return (
    <div
      aria-hidden="true"
      className={`w-12 h-16 rounded border-2 bg-[#1a1a1a] flex flex-col items-center justify-center gap-0.5 font-mono select-none transition-colors ${
        selected
          ? 'border-[#ffd700] bg-[#2a2a0a]'
          : isRed
          ? 'border-[#ef4444] text-[#ef4444]'
          : 'border-[#d4d4d4] text-[#d4d4d4]'
      } ${selected ? (isRed ? 'text-[#ef4444]' : 'text-[#d4d4d4]') : ''}`}
    >
      <span className="text-xs font-bold leading-none">{card.rank}</span>
      <span className="text-sm leading-none">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  )
}

// ── componente principal ────────────────────────────────────────────────────

export default function GinRummyPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [deck, setDeck] = useState<Card[]>([])
  const [discardPile, setDiscardPile] = useState<Card[]>([])
  const [playerHand, setPlayerHand] = useState<Card[]>([])
  const [aiHand, setAiHand] = useState<Card[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [drawnCard, setDrawnCard] = useState<Card | null>(null) // carta robada aún en mano +1
  const [score, setScore] = useState(0)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [lastResult, setLastResult] = useState<string>('')
  const [roundResult, setRoundResult] = useState<'win' | 'lose' | 'push' | null>(null)

  // turno: 'draw' = hay que robar, 'discard' = hay que descartar (tenemos 11 cartas)
  const [turnStep, setTurnStep] = useState<'draw' | 'discard'>('draw')

  const stateRef = useRef({ deck, discardPile, playerHand, aiHand, selectedIdx, drawnCard, turnStep, phase })
  useEffect(() => {
    stateRef.current = { deck, discardPile, playerHand, aiHand, selectedIdx, drawnCard, turnStep, phase }
  })

  // ── inicio de partida ───────────────────────────────────────────────────

  function startGame() {
    const freshDeck = shuffle(createDeck())
    const pHand = freshDeck.slice(0, 10)
    const aHand = freshDeck.slice(10, 20)
    const topDiscard = freshDeck[20]
    const remaining = freshDeck.slice(21)

    setDeck(remaining)
    setDiscardPile([topDiscard])
    setPlayerHand(pHand)
    setAiHand(aHand)
    setSelectedIdx(null)
    setDrawnCard(null)
    setTurnStep('draw')
    setPhase('playing')
    setSaved(false)
    setSaveError('')
    setLastResult('')
    setRoundResult(null)

    const { deadwood } = calcDeadwood(pHand)
    audio.start()
    announcePolite(
      `Nueva partida de Gin Rummy. Tu mano: ${pHand.map(cardLabel).join(', ')}. Puntos sueltos: ${deadwood}. ` +
      `Descarte visible: ${cardLabel(topDiscard)}. ` +
      `Tecla M para robar del mazo o tecla D para robar del descarte.`
    )
  }

  // ── robar del mazo ──────────────────────────────────────────────────────

  function drawFromDeck() {
    const { deck: d, discardPile: dp, playerHand: ph, turnStep: ts, phase: p } = stateRef.current
    if (p !== 'playing' || ts !== 'draw') return
    if (d.length === 0) {
      announceAssertive('El mazo está vacío. La ronda termina en empate.')
      finishRound(null)
      return
    }
    const card = d[0]
    const newDeck = d.slice(1)
    const newHand = [...ph, card]

    setDeck(newDeck)
    setPlayerHand(newHand)
    setDrawnCard(card)
    setTurnStep('discard')
    setSelectedIdx(newHand.length - 1) // preselecciona la carta recién robada

    const { deadwood } = calcDeadwood(newHand)
    audio.deal()
    announceAssertive(
      `Robas del mazo: ${cardLabel(card)}. Tu mano (${newHand.length} cartas): ${newHand.map(cardLabel).join(', ')}. ` +
      `Puntos sueltos: ${deadwood}. Selecciona una carta (1-0) y pulsa R para descartar.`
    )
  }

  // ── robar del descarte ──────────────────────────────────────────────────

  function drawFromDiscard() {
    const { discardPile: dp, playerHand: ph, turnStep: ts, phase: p } = stateRef.current
    if (p !== 'playing' || ts !== 'draw') return
    if (dp.length === 0) {
      announceAssertive('El montón de descarte está vacío.')
      return
    }
    const card = dp[dp.length - 1]
    const newDiscard = dp.slice(0, -1)
    const newHand = [...ph, card]

    setDiscardPile(newDiscard)
    setPlayerHand(newHand)
    setDrawnCard(card)
    setTurnStep('discard')
    setSelectedIdx(newHand.length - 1)

    const { deadwood } = calcDeadwood(newHand)
    audio.deal()
    announceAssertive(
      `Robas del descarte: ${cardLabel(card)}. Tu mano (${newHand.length} cartas): ${newHand.map(cardLabel).join(', ')}. ` +
      `Puntos sueltos: ${deadwood}. Selecciona una carta (1-0) y pulsa R para descartar.`
    )
  }

  // ── descartar carta seleccionada ────────────────────────────────────────

  function discardSelected() {
    const { playerHand: ph, selectedIdx: si, discardPile: dp, deck: d, aiHand: ah, turnStep: ts, phase: p } = stateRef.current
    if (p !== 'playing' || ts !== 'discard' || si === null) {
      announceAssertive('Primero selecciona una carta con las teclas 1-0.')
      return
    }
    const card = ph[si]
    const newHand = ph.filter((_, i) => i !== si)
    const newDiscard = [...dp, card]

    setPlayerHand(newHand)
    setDiscardPile(newDiscard)
    setSelectedIdx(null)
    setDrawnCard(null)
    setTurnStep('draw')

    const { deadwood } = calcDeadwood(newHand)
    audio.click()
    announceAssertive(`Descartas: ${cardLabel(card)}. Puntos sueltos: ${deadwood}.`)

    // turno de la IA
    setTimeout(() => aiTurn(newHand, newDiscard, d, ah), 600)
  }

  // ── turno de la IA ──────────────────────────────────────────────────────

  function aiTurn(pHand: Card[], dp: Card[], d: Card[], ah: Card[]) {
    const topDiscard = dp[dp.length - 1]
    let newAiHand = [...ah]
    let newDeck = [...d]
    let newDiscard = [...dp]

    // roba
    if (topDiscard && aiWantsDiscard(ah, topDiscard)) {
      newAiHand = [...ah, topDiscard]
      newDiscard = dp.slice(0, -1)
    } else {
      if (newDeck.length === 0) {
        announceAssertive('El mazo está vacío. La ronda termina en empate.')
        setAiHand(newAiHand)
        setDeck(newDeck)
        setDiscardPile(newDiscard)
        finishRound(null)
        return
      }
      newAiHand = [...ah, newDeck[0]]
      newDeck = newDeck.slice(1)
    }

    // descarta
    const discardIdx = aiChooseDiscard(newAiHand)
    const aiDiscard = newAiHand[discardIdx]
    newAiHand = newAiHand.filter((_, i) => i !== discardIdx)
    newDiscard = [...newDiscard, aiDiscard]

    setAiHand(newAiHand)
    setDeck(newDeck)
    setDiscardPile(newDiscard)

    const { deadwood: aiDw } = calcDeadwood(newAiHand)

    // ¿la IA llama?
    if (aiDw === 0) {
      // Gin de la IA
      const { deadwood: playerDw } = calcDeadwood(pHand)
      announceAssertive(`¡La IA hace Gin! Sus puntos sueltos: 0. Los tuyos: ${playerDw}. La IA gana esta ronda.`)
      setTurnStep('draw')
      finishRound('ai-gin')
    } else if (aiDw <= 10) {
      const { deadwood: playerDw } = calcDeadwood(pHand)
      if (aiDw < playerDw) {
        announceAssertive(`¡La IA llama! Sus puntos sueltos: ${aiDw}. Los tuyos: ${playerDw}. La IA gana esta ronda.`)
        setTurnStep('draw')
        finishRound('ai-call')
      } else {
        // la IA tiene pocos puntos pero no gana, no llama
        const { deadwood: pDw } = calcDeadwood(pHand)
        const discardName = cardLabel(newDiscard[newDiscard.length - 1])
        announcePolite(`La IA descarta ${discardName}. Toca robar: tecla M (mazo) o D (descarte). Tus puntos sueltos: ${pDw}.`)
      }
    } else {
      const { deadwood: pDw } = calcDeadwood(pHand)
      const discardName = cardLabel(newDiscard[newDiscard.length - 1])
      announcePolite(`La IA descarta ${discardName}. Toca robar: tecla M (mazo) o D (descarte). Tus puntos sueltos: ${pDw}.`)
    }
  }

  // ── llamada del jugador ─────────────────────────────────────────────────

  function playerCall(isGin: boolean) {
    const { playerHand: ph, aiHand: ah, turnStep: ts, phase: p } = stateRef.current
    if (p !== 'playing' || ts !== 'draw') {
      announceAssertive('Primero debes robar una carta y luego descartar antes de llamar.')
      return
    }

    const { deadwood: pDw } = calcDeadwood(ph)

    if (isGin && pDw !== 0) {
      announceAssertive(`No puedes hacer Gin. Tienes ${pDw} puntos sueltos; necesitas 0.`)
      return
    }
    if (!isGin && pDw > 10) {
      announceAssertive(`No puedes llamar todavía. Tienes ${pDw} puntos sueltos; necesitas 10 o menos.`)
      return
    }

    const { deadwood: aiDw } = calcDeadwood(ah)
    const aiCanUndercut = !isGin && aiDw <= pDw

    if (aiCanUndercut) {
      announceAssertive(
        `Llamas con ${pDw} puntos. La IA tiene ${aiDw} puntos. ¡La IA hace undercut! La IA gana esta ronda.`
      )
      finishRound('undercut')
    } else if (isGin) {
      const bonus = 25
      const pts = aiDw + bonus
      announceAssertive(
        `¡GIN! Tus puntos: 0. IA: ${aiDw}. Ganás ${pts} puntos (${aiDw} del deadwood + ${bonus} de bonus de Gin).`
      )
      finishRound('gin', pts)
    } else {
      const pts = aiDw - pDw
      announceAssertive(
        `¡Llamas! Tus puntos: ${pDw}. IA: ${aiDw}. Ganás ${pts} puntos.`
      )
      finishRound('call', pts)
    }
  }

  // ── resolver ronda ──────────────────────────────────────────────────────

  function finishRound(
    result: 'gin' | 'call' | 'undercut' | 'ai-gin' | 'ai-call' | null,
    pts?: number
  ) {
    let earned = 0
    let outcome: 'win' | 'lose' | 'push' = 'push'
    let msg = ''

    if (result === 'gin') {
      earned = pts ?? 0
      outcome = 'win'
      msg = `¡Gin! +${earned} puntos.`
      audio.correct()
    } else if (result === 'call') {
      earned = pts ?? 0
      outcome = 'win'
      msg = `¡Llamada ganada! +${earned} puntos.`
      audio.correct()
    } else if (result === 'undercut' || result === 'ai-gin' || result === 'ai-call') {
      earned = 0
      outcome = 'lose'
      msg = result === 'undercut' ? 'Undercut de la IA. Sin puntos.' : 'La IA ganó esta ronda. Sin puntos.'
      audio.gameOver()
    } else {
      earned = 0
      outcome = 'push'
      msg = 'Mazo agotado. Sin puntos.'
      audio.click()
    }

    if (earned > 0) setScore(s => s + earned)
    setLastResult(msg)
    setRoundResult(outcome)
    setPhase('finished')
  }

  // ── leer mano ───────────────────────────────────────────────────────────

  const readHand = useCallback(() => {
    const { playerHand: ph, turnStep: ts } = stateRef.current
    const { deadwood, melds } = calcDeadwood(ph)
    const meldStr = melds.length > 0
      ? `Combinaciones: ${melds.map(m => m.map(cardLabel).join('+'))?.join(' | ')}.`
      : 'Sin combinaciones aún.'
    announcePolite(
      `Tu mano: ${ph.map((c, i) => `${i + 1 <= 9 ? i + 1 : 0}: ${cardLabel(c)}`).join(', ')}. ` +
      `Puntos sueltos: ${deadwood}. ${meldStr} ` +
      (ts === 'draw' ? 'Roba: M (mazo) o D (descarte).' : 'Selecciona carta (1-0) y R para descartar.')
    )
  }, [])

  // ── teclado ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'idle') return

    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      const key = e.key.toLowerCase()
      const { turnStep: ts, playerHand: ph, selectedIdx: si, discardPile: dp } = stateRef.current

      switch (key) {
        case 'i':
          announcePolite(INSTRUCTIONS)
          break
        case 'h':
          readHand()
          break
        case 'n':
          startGame()
          break
        case 'm':
          drawFromDeck()
          break
        case 'd':
          if (ts === 'draw') drawFromDiscard()
          break
        case 'r':
          if (ts === 'discard') discardSelected()
          break
        case 'l':
          playerCall(false)
          break
        case 'g':
          playerCall(true)
          break
        default: {
          // teclas 1-9 y 0 para seleccionar cartas
          if (ts !== 'discard') break
          const n = key === '0' ? 10 : parseInt(key)
          if (!isNaN(n) && n >= 1 && n <= ph.length) {
            const idx = n - 1
            setSelectedIdx(prev => {
              const next = prev === idx ? null : idx
              if (next !== null) {
                announcePolite(`Seleccionas: ${cardLabel(ph[next])}. Pulsa R para descartar.`)
              }
              return next
            })
          }
        }
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [phase, readHand]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── guardar puntuación ──────────────────────────────────────────────────

  async function handleSave() {
    const result = await saveScore('gin-rummy', score)
    if (result?.error) {
      setSaveError(result.error)
      announceAssertive(result.error)
    } else {
      setSaved(true)
      announcePolite('Puntuación guardada.')
    }
  }

  // ── render: pantalla de inicio ──────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Gin Rummy" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Gin Rummy</h2>
          <p className="text-[#888] text-sm leading-relaxed max-w-lg mx-auto">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame}>Comenzar partida</Button>
        </div>
      </GameShell>
    )
  }

  // ── render: juego ───────────────────────────────────────────────────────

  const isPlaying = phase === 'playing'
  const topDiscard = discardPile[discardPile.length - 1]
  const { deadwood: playerDw, melds: playerMelds } = calcDeadwood(playerHand)
  const canCall = isPlaying && turnStep === 'draw' && playerDw <= 10
  const canGin = isPlaying && turnStep === 'draw' && playerDw === 0

  const resultColor =
    roundResult === 'win' ? 'text-[#22c55e]' :
    roundResult === 'lose' ? 'text-[#ef4444]' :
    'text-[#888]'

  return (
    <GameShell title="Gin Rummy" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-6">

        {/* IA */}
        <section aria-label={`Mano de la IA: ${aiHand.length} cartas ocultas`}>
          <p className="text-[#888] text-xs mb-2">IA — {aiHand.length} cartas</p>
          <div className="flex gap-1 flex-wrap">
            {aiHand.map((_, i) => (
              <CardVisual key={i} card={aiHand[i]} hidden />
            ))}
          </div>
        </section>

        {/* Mazo y descarte */}
        <section aria-label={`Mazo: ${deck.length} cartas. Descarte: ${topDiscard ? cardLabel(topDiscard) : 'vacío'}`}>
          <p className="text-[#888] text-xs mb-2">
            Mazo: {deck.length} cartas · Descarte:{' '}
            {topDiscard ? (
              <span className={RED_SUITS.has(topDiscard.suit) ? 'text-[#ef4444]' : 'text-white'}>
                {RANK_NAMES[topDiscard.rank]} {SUIT_SYMBOL[topDiscard.suit]}
              </span>
            ) : 'vacío'}
          </p>
          <div className="flex gap-3 items-center">
            <button
              onClick={drawFromDeck}
              disabled={!isPlaying || turnStep !== 'draw'}
              aria-label={`Robar del mazo (${deck.length} cartas) — tecla M`}
              className="w-12 h-16 rounded border-2 border-[#555] bg-[#1e1e2e] flex items-center justify-center text-[#555] text-xs hover:border-[#ffd700] disabled:opacity-40 transition-colors"
            >
              M
            </button>
            {topDiscard ? (
              <button
                onClick={drawFromDiscard}
                disabled={!isPlaying || turnStep !== 'draw'}
                aria-label={`Robar del descarte: ${cardLabel(topDiscard)} — tecla D`}
              >
                <CardVisual card={topDiscard} />
              </button>
            ) : (
              <div aria-hidden="true" className="w-12 h-16 rounded border border-dashed border-[#333]" />
            )}
          </div>
        </section>

        {/* Tu mano */}
        <section
          aria-label={
            `Tu mano (${playerHand.length} cartas): ${playerHand.map(cardLabel).join(', ')}. ` +
            `Puntos sueltos: ${playerDw}`
          }
        >
          <p className="text-[#888] text-xs mb-2">
            Tu mano — puntos sueltos: <strong className="text-[#ffd700]">{playerDw}</strong>
            {turnStep === 'discard' && <span className="text-[#ffd700] text-xs ml-2"> · Selecciona y R para descartar</span>}
          </p>
          <div className="flex gap-1 flex-wrap">
            {playerHand.map((card, i) => (
              <button
                key={card.id}
                onClick={() => {
                  if (turnStep !== 'discard') return
                  setSelectedIdx(prev => {
                    const next = prev === i ? null : i
                    if (next !== null) announcePolite(`Seleccionas: ${cardLabel(card)}. Pulsa R para descartar.`)
                    return next
                  })
                }}
                aria-label={`${i + 1 <= 9 ? i + 1 : 0}: ${cardLabel(card)}${selectedIdx === i ? ' (seleccionada)' : ''}`}
                aria-pressed={selectedIdx === i}
                disabled={!isPlaying}
                className="focus:outline-none focus:ring-2 focus:ring-[#ffd700] rounded disabled:cursor-default"
              >
                <CardVisual card={card} selected={selectedIdx === i} />
              </button>
            ))}
          </div>
          {playerMelds.length > 0 && (
            <p className="text-[#22c55e] text-xs mt-2" aria-live="polite">
              Combinaciones: {playerMelds.map(m => m.map(c => `${c.rank}${SUIT_SYMBOL[c.suit]}`).join('+')).join(' | ')}
            </p>
          )}
        </section>

        {/* Resultado de la ronda */}
        {phase === 'finished' && lastResult && (
          <div role="status" className={`text-lg font-bold ${resultColor}`}>
            {lastResult}
          </div>
        )}

        {/* Acciones */}
        {isPlaying && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Acciones disponibles">
            {turnStep === 'draw' ? (
              <>
                <Button onClick={drawFromDeck} aria-label="Robar del mazo (tecla M)">M — Mazo</Button>
                <Button variant="secondary" onClick={drawFromDiscard} disabled={!topDiscard} aria-label="Robar del descarte (tecla D)">
                  D — Descarte
                </Button>
                {canCall && !canGin && (
                  <Button variant="secondary" onClick={() => playerCall(false)} aria-label="Llamar (tecla L)">
                    L — Llamar ({playerDw} pts)
                  </Button>
                )}
                {canGin && (
                  <Button onClick={() => playerCall(true)} aria-label="Gin (tecla G)">
                    G — GIN
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  onClick={discardSelected}
                  disabled={selectedIdx === null}
                  aria-label="Descartar carta seleccionada (tecla R)"
                >
                  R — Descartar{selectedIdx !== null ? `: ${RANK_NAMES[playerHand[selectedIdx].rank]}` : ''}
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={readHand} aria-label="Leer mano completa (tecla H)">H — Leer mano</Button>
          </div>
        )}

        {phase === 'finished' && (
          <div className="flex flex-wrap gap-3 items-center">
            {!saved ? (
              <>
                <Button onClick={handleSave}>Guardar puntuación</Button>
                {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
              </>
            ) : (
              <p role="status" className="text-[#22c55e] text-sm">Guardado.</p>
            )}
            <Button variant="secondary" onClick={startGame}>N — Nueva partida</Button>
          </div>
        )}

        <p className="text-xs text-[#555]">
          I: instrucciones · H: leer mano · M: robar mazo · D: robar descarte · 1-0: seleccionar carta · R: descartar · L: llamar · G: Gin · N: nueva partida
        </p>
      </div>
    </GameShell>
  )
}
