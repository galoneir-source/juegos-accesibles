'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── tipos ──────────────────────────────────────────────────────────────────

type Suit = 'Picas' | 'Corazones' | 'Diamantes' | 'Tréboles'
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
interface Card { rank: Rank; suit: Suit; id: string }

type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
type Phase = 'idle' | 'betting' | 'finished'
type Action = 'fold' | 'check' | 'call' | 'raise'

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
const RANK_ORDER: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
}

const SMALL_BLIND = 25
const BIG_BLIND = 50
const STARTING_CHIPS = 1000
const RAISE_STEP = 50

const INSTRUCTIONS = `Póker Texas Hold'em. Tienes ${STARTING_CHIPS} fichas. Cada mano: pagas la ciega (${SMALL_BLIND} o ${BIG_BLIND} fichas) y recibes 2 cartas. Se reparten 5 cartas comunitarias en tres rondas: Flop (3 cartas), Turn (1) y River (1). Gana quien forme la mejor mano de 5 cartas entre las 7 disponibles.
Manos de mayor a menor: Escalera de Color, Póker (4 iguales), Full (trío+pareja), Color (5 mismo palo), Escalera (5 consecutivas), Trío, Doble pareja, Pareja, Carta alta.
Acciones: F=retirarse, C=igualar o pasar, R=subir. Usa + y - para ajustar la subida. Tecla I para estado actual. Tecla N para nueva mano.`

// ── utilidades ──────────────────────────────────────────────────────────────

function cardLabel(c: Card) { return `${RANK_NAMES[c.rank]} de ${c.suit}` }

function createDeck(): Card[] {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit, id: `${rank}-${suit}` })))
}

function shuffle(deck: Card[]): Card[] {
  const d = [...deck]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

// ── evaluación de manos ─────────────────────────────────────────────────────

interface HandResult { rank: number; name: string; tiebreakers: number[] }

function evaluateHand(cards: Card[]): HandResult {
  // genera todas las combinaciones de 5 de 7 cartas
  const combos = getCombos5(cards)
  let best: HandResult = { rank: 0, name: '', tiebreakers: [] }
  for (const combo of combos) {
    const result = evaluate5(combo)
    if (
      result.rank > best.rank ||
      (result.rank === best.rank && compareTiebreakers(result.tiebreakers, best.tiebreakers) > 0)
    ) {
      best = result
    }
  }
  return best
}

function getCombos5(cards: Card[]): Card[][] {
  const result: Card[][] = []
  const n = cards.length
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++)
            result.push([cards[a], cards[b], cards[c], cards[d], cards[e]])
  return result
}

function compareTiebreakers(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function evaluate5(cards: Card[]): HandResult {
  const ranks = cards.map(c => RANK_ORDER[c.rank]).sort((a, b) => b - a)
  const suits = cards.map(c => c.suit)
  const isFlush = suits.every(s => s === suits[0])
  const isStraight = checkStraight(ranks)
  const counts = rankCounts(ranks)
  const countVals = Object.values(counts).sort((a, b) => b - a)

  if (isFlush && isStraight) {
    const high = ranks[0] === 14 && ranks[1] === 13 ? 14 : ranks[0]
    return { rank: 8, name: high === 14 ? 'Escalera Real de Color' : 'Escalera de Color', tiebreakers: [high] }
  }
  if (countVals[0] === 4) {
    const four = rankByCount(counts, 4)
    const kicker = rankByCount(counts, 1)
    return { rank: 7, name: 'Póker', tiebreakers: [four, kicker] }
  }
  if (countVals[0] === 3 && countVals[1] === 2) {
    return { rank: 6, name: 'Full', tiebreakers: [rankByCount(counts, 3), rankByCount(counts, 2)] }
  }
  if (isFlush) {
    return { rank: 5, name: 'Color', tiebreakers: ranks }
  }
  if (isStraight) {
    const high = ranks[0] === 14 && ranks[1] === 5 ? 5 : ranks[0]
    return { rank: 4, name: 'Escalera', tiebreakers: [high] }
  }
  if (countVals[0] === 3) {
    const trio = rankByCount(counts, 3)
    const kickers = ranks.filter(r => r !== trio).sort((a, b) => b - a)
    return { rank: 3, name: 'Trío', tiebreakers: [trio, ...kickers] }
  }
  if (countVals[0] === 2 && countVals[1] === 2) {
    const pairs = Object.entries(counts).filter(([, v]) => v === 2).map(([k]) => Number(k)).sort((a, b) => b - a)
    const kicker = ranks.find(r => r !== pairs[0] && r !== pairs[1])!
    return { rank: 2, name: 'Doble pareja', tiebreakers: [...pairs, kicker] }
  }
  if (countVals[0] === 2) {
    const pair = rankByCount(counts, 2)
    const kickers = ranks.filter(r => r !== pair).sort((a, b) => b - a)
    return { rank: 1, name: 'Pareja', tiebreakers: [pair, ...kickers] }
  }
  return { rank: 0, name: 'Carta alta', tiebreakers: ranks }
}

function checkStraight(sortedRanks: number[]): boolean {
  // As bajo: A-2-3-4-5
  const low = [14, 5, 4, 3, 2]
  if (sortedRanks.every((r, i) => r === low[i])) return true
  for (let i = 1; i < sortedRanks.length; i++) {
    if (sortedRanks[i - 1] - sortedRanks[i] !== 1) return false
  }
  return true
}

function rankCounts(ranks: number[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const r of ranks) counts[r] = (counts[r] ?? 0) + 1
  return counts
}

function rankByCount(counts: Record<number, number>, target: number): number {
  return Number(Object.entries(counts).filter(([, v]) => v === target).map(([k]) => Number(k)).sort((a, b) => b - a)[0])
}

// ── IA simple ───────────────────────────────────────────────────────────────

function aiDecide(
  aiHand: Card[], community: Card[], pot: number,
  toCall: number, street: Street
): { action: Action; raiseAmount: number } {
  const allCards = [...aiHand, ...community]
  const handRank = allCards.length >= 5 ? evaluateHand(allCards).rank : estimatePreflop(aiHand)

  // agresividad según fuerza de mano
  if (handRank >= 5) {
    // mano muy fuerte: subir
    return { action: 'raise', raiseAmount: Math.min(pot, RAISE_STEP * 4) }
  }
  if (handRank >= 3) {
    // mano buena: igualar o subir moderado
    if (toCall === 0) return { action: 'raise', raiseAmount: RAISE_STEP * 2 }
    if (toCall <= pot * 0.4) return { action: 'call', raiseAmount: 0 }
    return { action: 'fold', raiseAmount: 0 }
  }
  if (handRank >= 1) {
    // pareja: igualar si barato
    if (toCall === 0) return { action: 'check', raiseAmount: 0 }
    if (toCall <= BIG_BLIND * 2) return { action: 'call', raiseAmount: 0 }
    return { action: 'fold', raiseAmount: 0 }
  }
  // carta alta: pasar o retirarse
  if (toCall === 0) return { action: 'check', raiseAmount: 0 }
  if (toCall <= BIG_BLIND && street === 'preflop') return { action: 'call', raiseAmount: 0 }
  return { action: 'fold', raiseAmount: 0 }
}

function estimatePreflop(hand: Card[]): number {
  const [a, b] = hand
  if (a.rank === b.rank) return 2 // pareja en mano
  const rA = RANK_ORDER[a.rank], rB = RANK_ORDER[b.rank]
  if (rA >= 13 || rB >= 13) return 1 // carta alta
  if (Math.abs(rA - rB) <= 2 && a.suit === b.suit) return 1
  return 0
}

// ── componente visual de carta ───────────────────────────────────────────────

function CardVisual({ card, hidden }: { card?: Card; hidden?: boolean }) {
  if (hidden || !card) {
    return (
      <div aria-hidden="true" className="w-12 h-16 rounded border border-[#444] bg-[#1e1e2e] flex items-center justify-center text-[#555] text-xl select-none">?</div>
    )
  }
  const isRed = RED_SUITS.has(card.suit)
  return (
    <div aria-hidden="true" className={`w-12 h-16 rounded border-2 bg-[#1a1a1a] flex flex-col items-center justify-center gap-0.5 font-mono select-none ${isRed ? 'border-[#ef4444] text-[#ef4444]' : 'border-[#d4d4d4] text-[#d4d4d4]'}`}>
      <span className="text-xs font-bold leading-none">{card.rank}</span>
      <span className="text-sm leading-none">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  )
}

// ── componente principal ────────────────────────────────────────────────────

export default function PokerPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [street, setStreet] = useState<Street>('preflop')
  const [deck, setDeck] = useState<Card[]>([])
  const [playerHand, setPlayerHand] = useState<Card[]>([])
  const [aiHand, setAiHand] = useState<Card[]>([])
  const [community, setCommunity] = useState<Card[]>([])
  const [pot, setPot] = useState(0)
  const [playerChips, setPlayerChips] = useState(STARTING_CHIPS)
  const [aiChips, setAiChips] = useState(STARTING_CHIPS)
  const [playerBet, setPlayerBet] = useState(0)
  const [aiBet, setAiBet] = useState(0)
  const [raiseAmount, setRaiseAmount] = useState(RAISE_STEP)
  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [lastResult, setLastResult] = useState('')
  const [showAiCards, setShowAiCards] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [score, setScore] = useState(0)
  const [handNum, setHandNum] = useState(0)
  // quién es dealer (alterna cada mano)
  const [playerIsDealer, setPlayerIsDealer] = useState(true)

  const stateRef = useRef({
    phase, street, deck, playerHand, aiHand, community,
    pot, playerChips, aiChips, playerBet, aiBet, raiseAmount,
    isPlayerTurn, playerIsDealer, handNum,
  })
  useEffect(() => {
    stateRef.current = {
      phase, street, deck, playerHand, aiHand, community,
      pot, playerChips, aiChips, playerBet, aiBet, raiseAmount,
      isPlayerTurn, playerIsDealer, handNum,
    }
  })

  // ── iniciar mano ─────────────────────────────────────────────────────────

  const startHand = useCallback((pChips: number, aChips: number, pIsDealer: boolean, hNum: number) => {
    if (pChips <= 0 || aChips <= 0) return

    const freshDeck = shuffle(createDeck())
    const pHand = freshDeck.slice(0, 2)
    const aHand = freshDeck.slice(2, 4)
    const remaining = freshDeck.slice(4)

    // ciegas: dealer paga small blind, otro paga big blind
    const sbAmount = Math.min(SMALL_BLIND, pIsDealer ? pChips : aChips)
    const bbAmount = Math.min(BIG_BLIND, pIsDealer ? aChips : pChips)

    const pBlind = pIsDealer ? sbAmount : bbAmount
    const aBlind = pIsDealer ? bbAmount : sbAmount

    const newPChips = pChips - pBlind
    const newAChips = aChips - aBlind
    const newPot = pBlind + aBlind

    setDeck(remaining)
    setPlayerHand(pHand)
    setAiHand(aHand)
    setCommunity([])
    setPot(newPot)
    setPlayerChips(newPChips)
    setAiChips(newAChips)
    setPlayerBet(pBlind)
    setAiBet(aBlind)
    setRaiseAmount(RAISE_STEP)
    setStreet('preflop')
    setPhase('betting')
    setIsPlayerTurn(true)
    setShowAiCards(false)
    setSaved(false)
    setSaveError('')
    setLastResult('')

    audio.deal()
    const pRole = pIsDealer ? 'ciega pequeña' : 'ciega grande'
    announcePolite(
      `Mano ${hNum + 1}. Tus fichas: ${newPChips}. IA: ${newAChips}. Bote: ${newPot}. ` +
      `Tú pagas ${pRole} (${pBlind}). ` +
      `Tus cartas: ${pHand.map(cardLabel).join(' y ')}. ` +
      `Preflop — turno tuyo. F=retirarte, C=igualar${pBlind < bbAmount ? ` (${bbAmount - pBlind} fichas)` : ' o pasar'}, R=subir.`
    )
  }, [])

  function newGame() {
    const h = handNum + 1
    setHandNum(h)
    const newDealer = !playerIsDealer
    setPlayerIsDealer(newDealer)
    startHand(playerChips, aiChips, newDealer, h)
  }

  function firstGame() {
    setHandNum(0)
    setPlayerChips(STARTING_CHIPS)
    setAiChips(STARTING_CHIPS)
    setScore(0)
    setPlayerIsDealer(true)
    startHand(STARTING_CHIPS, STARTING_CHIPS, true, 0)
  }

  // ── lógica de betting ────────────────────────────────────────────────────

  function toCallAmount(pBet: number, aBet: number, forPlayer: boolean): number {
    return forPlayer ? Math.max(0, aBet - pBet) : Math.max(0, pBet - aBet)
  }

  function playerAct(action: Action) {
    const {
      phase: ph, street: st, isPlayerTurn: ipt, playerChips: pc, aiChips: ac,
      pot: p, playerBet: pb, aiBet: ab, deck: d, community: com,
      aiHand: ah, playerHand: plh, raiseAmount: ra, playerIsDealer: pid, handNum: hn,
    } = stateRef.current
    if (ph !== 'betting' || !ipt) return

    const needed = toCallAmount(pb, ab, true)

    if (action === 'fold') {
      const aiWins = Math.min(p, ac + ab)
      audio.gameOver()
      announceAssertive(`Te retiras. La IA gana el bote de ${p} fichas.`)
      endHand(false, p, pc, ac, ph, hn)
      return
    }

    let newPc = pc
    let newPb = pb
    let newPot = p

    if (action === 'check') {
      if (needed > 0) { announceAssertive('No puedes pasar, debes igualar o retirarte.'); return }
      audio.click()
      announcePolite('Pasas.')
    } else if (action === 'call') {
      const amount = Math.min(needed, pc)
      newPc -= amount
      newPb += amount
      newPot += amount
      audio.click()
      announcePolite(needed === 0 ? 'Igualas (sin coste).' : `Igualas ${amount} fichas. Bote: ${newPot}.`)
    } else if (action === 'raise') {
      const callFirst = Math.min(needed, pc)
      const raisePart = Math.min(ra, pc - callFirst)
      if (raisePart <= 0) { announceAssertive('No tienes fichas suficientes para subir.'); return }
      const total = callFirst + raisePart
      newPc -= total
      newPb += total
      newPot += total
      audio.correct()
      announcePolite(`Subes ${total} fichas. Bote: ${newPot}.`)
    }

    setPlayerChips(newPc)
    setPlayerBet(newPb)
    setPot(newPot)
    setIsPlayerTurn(false)

    // turno de la IA tras breve pausa
    setTimeout(() => {
      aiAct(plh, ah, com, d, st, newPot, newPc, ac, newPb, ab, pid, hn)
    }, 700)
  }

  function aiAct(
    plh: Card[], ah: Card[], com: Card[], d: Card[], st: Street,
    pot: number, pc: number, ac: number, pb: number, ab: number,
    pid: boolean, hn: number
  ) {
    const needed = toCallAmount(ab, pb, false)
    const { action, raiseAmount: ra } = aiDecide(ah, com, pot, needed, st)

    let newAc = ac
    let newAb = ab
    let newPot = pot

    if (action === 'fold') {
      audio.gameOver()
      announceAssertive(`La IA se retira. Ganas el bote de ${pot} fichas.`)
      endHand(true, pot, pc, ac, 'betting', hn)
      return
    }

    if (action === 'check' || (action === 'call' && needed === 0)) {
      announcePolite('La IA pasa.')
    } else if (action === 'call') {
      const amount = Math.min(needed, ac)
      newAc -= amount
      newAb += amount
      newPot += amount
      announcePolite(`La IA iguala ${amount}. Bote: ${newPot}.`)
    } else if (action === 'raise') {
      const callFirst = Math.min(needed, ac)
      const raisePart = Math.min(ra, ac - callFirst)
      const total = callFirst + raisePart
      newAc -= total
      newAb += total
      newPot += total
      announcePolite(`La IA sube ${total}. Bote: ${newPot}. Tu turno: F, C o R.`)
    }

    setAiChips(newAc)
    setAiBet(newAb)
    setPot(newPot)

    // avanzar calle si ambos igualaron
    const equalBets = newAb === pb || (action !== 'raise' && toCallAmount(pb, newAb, true) === 0)

    if (action === 'raise') {
      // jugador debe responder de nuevo
      setIsPlayerTurn(true)
      return
    }

    // avanzar calle
    setTimeout(() => advanceStreet(plh, ah, com, d, st, newPot, pc, newAc, pb, newAb, pid, hn), 500)
  }

  function advanceStreet(
    plh: Card[], ah: Card[], com: Card[], d: Card[], st: Street,
    pot: number, pc: number, ac: number, pb: number, ab: number,
    pid: boolean, hn: number
  ) {
    const nextStreets: Partial<Record<Street, Street>> = {
      preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown',
    }
    const next = nextStreets[st]
    if (!next) return

    if (next === 'showdown') {
      doShowdown(plh, ah, com, pot, pc, ac, hn)
      return
    }

    let newCom = [...com]
    let newDeck = [...d]
    let label = ''

    if (next === 'flop') {
      newCom = [newDeck[0], newDeck[1], newDeck[2]]
      newDeck = newDeck.slice(3)
      label = `Flop: ${newCom.map(cardLabel).join(', ')}.`
    } else if (next === 'turn') {
      newCom = [...com, newDeck[0]]
      newDeck = newDeck.slice(1)
      label = `Turn: ${cardLabel(newDeck[0] ?? newCom[3])}.`
      label = `Turn: ${cardLabel(newCom[3])}.`
    } else if (next === 'river') {
      newCom = [...com, newDeck[0]]
      newDeck = newDeck.slice(1)
      label = `River: ${cardLabel(newCom[4])}.`
    }

    const { name: handName } = evaluateHand([...plh, ...newCom])

    audio.deal()
    announcePolite(`${label} Tu mejor mano: ${handName}. Bote: ${pot}. Turno tuyo: F, C o R.`)

    setCommunity(newCom)
    setDeck(newDeck)
    setStreet(next)
    setPlayerBet(0)
    setAiBet(0)
    setIsPlayerTurn(true)
  }

  function doShowdown(
    plh: Card[], ah: Card[], com: Card[], pot: number,
    pc: number, ac: number, hn: number
  ) {
    const pResult = evaluateHand([...plh, ...com])
    const aResult = evaluateHand([...ah, ...com])
    const cmp = pResult.rank - aResult.rank ||
      compareTiebreakers(pResult.tiebreakers, aResult.tiebreakers)

    setShowAiCards(true)
    setStreet('showdown')

    if (cmp > 0) {
      announceAssertive(
        `Showdown. Tú: ${pResult.name} (${plh.map(cardLabel).join(', ')}). IA: ${aResult.name} (${ah.map(cardLabel).join(', ')}). ¡Ganas el bote de ${pot}!`
      )
      endHand(true, pot, pc, ac, 'betting', hn)
    } else if (cmp < 0) {
      announceAssertive(
        `Showdown. Tú: ${pResult.name}. IA: ${aResult.name}. La IA gana el bote de ${pot}.`
      )
      endHand(false, pot, pc, ac, 'betting', hn)
    } else {
      announceAssertive(`Showdown. Empate: ${pResult.name}. El bote se divide.`)
      endHand(null, pot, pc, ac, 'betting', hn)
    }
  }

  function endHand(playerWins: boolean | null, pot: number, pc: number, ac: number, _ph: string, hn: number) {
    let newPc = pc
    let newAc = ac
    let earned = 0

    if (playerWins === true) {
      newPc += pot
      earned = pot
      setScore(s => s + earned)
      audio.correct()
    } else if (playerWins === false) {
      newAc += pot
      audio.gameOver()
    } else {
      const half = Math.floor(pot / 2)
      newPc += half
      newAc += pot - half
    }

    setPlayerChips(newPc)
    setAiChips(newAc)
    setLastResult(
      playerWins === true ? `+${earned} fichas` :
      playerWins === false ? `-${pot} fichas` : 'Bote dividido'
    )
    setPhase('finished')
  }

  // ── teclado ──────────────────────────────────────────────────────────────

  const readStatus = useCallback(() => {
    const { phase: ph, street: st, playerHand: plh, community: com,
      pot: p, playerChips: pc, isPlayerTurn: ipt, playerBet: pb, aiBet: ab } = stateRef.current
    if (ph !== 'betting') return
    const needed = toCallAmount(pb, ab, true)
    const { name } = plh.length >= 2 && com.length >= 3
      ? evaluateHand([...plh, ...com])
      : { name: 'sin comunidad aún' }
    announcePolite(
      `${st.toUpperCase()}. Fichas: ${pc}. Bote: ${p}. Tus cartas: ${plh.map(cardLabel).join(', ')}. ` +
      `Comunidad: ${com.length > 0 ? com.map(cardLabel).join(', ') : 'ninguna'}. ` +
      `Mejor mano: ${name}. ` +
      (ipt ? `Tu turno. ${needed > 0 ? `Igualar: ${needed} fichas.` : 'Puedes pasar.'}` : 'Turno de la IA.')
    )
  }, [])

  useEffect(() => {
    if (phase === 'idle') return
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      const key = e.key.toLowerCase()
      const { isPlayerTurn: ipt, phase: ph, playerChips: pc, raiseAmount: ra } = stateRef.current

      switch (key) {
        case 'i': readStatus(); break
        case 'n':
          if (ph === 'finished') newGame()
          break
        case 'f': if (ipt && ph === 'betting') playerAct('fold'); break
        case 'c':
          if (ipt && ph === 'betting') {
            const { playerBet: pb, aiBet: ab } = stateRef.current
            playerAct(toCallAmount(pb, ab, true) === 0 ? 'check' : 'call')
          }
          break
        case 'r': if (ipt && ph === 'betting') playerAct('raise'); break
        case '+':
        case '=':
          setRaiseAmount(prev => {
            const next = prev + RAISE_STEP
            announcePolite(`Subida: ${next} fichas.`)
            return next
          })
          break
        case '-':
          setRaiseAmount(prev => {
            const next = Math.max(RAISE_STEP, prev - RAISE_STEP)
            announcePolite(`Subida: ${next} fichas.`)
            return next
          })
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [phase, readStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── guardar puntuación ───────────────────────────────────────────────────

  async function handleSave() {
    const result = await saveScore('poker', score)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── render: inicio ───────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Póker Texas Hold'em" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Póker Texas Hold'em</h2>
          <p className="text-[#888] text-sm leading-relaxed max-w-lg mx-auto">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={firstGame}>Comenzar partida</Button>
        </div>
      </GameShell>
    )
  }

  // ── render: juego ────────────────────────────────────────────────────────

  const isPlaying = phase === 'betting'
  const needed = toCallAmount(playerBet, aiBet, true)
  const { name: currentHandName } = playerHand.length >= 2 && community.length >= 3
    ? evaluateHand([...playerHand, ...community])
    : { name: '' }

  const streetLabel: Record<Street, string> = {
    preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown',
  }

  return (
    <GameShell title="Póker Texas Hold'em" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-5">

        {/* Fichas y bote */}
        <section aria-label={`Fichas: tú ${playerChips}, IA ${aiChips}. Bote: ${pot}`}>
          <div className="flex gap-6 text-sm">
            <span>Tú: <strong className="text-[#ffd700]">{playerChips}</strong> fichas</span>
            <span>IA: <strong className="text-[#888]">{aiChips}</strong> fichas</span>
            <span>Bote: <strong className="text-white">{pot}</strong></span>
            <span className="text-[#555]">{streetLabel[street]}</span>
          </div>
        </section>

        {/* Mano de la IA */}
        <section aria-label={showAiCards ? `Mano de la IA: ${aiHand.map(cardLabel).join(' y ')}` : 'Mano de la IA: oculta'}>
          <p className="text-[#888] text-xs mb-2">IA</p>
          <div className="flex gap-2">
            {aiHand.map((c, i) => <CardVisual key={i} card={c} hidden={!showAiCards} />)}
          </div>
          {showAiCards && (
            <p className="text-xs text-[#888] mt-1">
              {aiHand.map(c => `${c.rank}${SUIT_SYMBOL[c.suit]}`).join(' ')}
              {' — '}{community.length >= 3 ? evaluateHand([...aiHand, ...community]).name : ''}
            </p>
          )}
        </section>

        {/* Cartas comunitarias */}
        <section aria-label={`Cartas comunitarias: ${community.length > 0 ? community.map(cardLabel).join(', ') : 'ninguna aún'}`}>
          <p className="text-[#888] text-xs mb-2">Comunitarias</p>
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map(i => (
              <CardVisual key={i} card={community[i]} hidden={!community[i]} />
            ))}
          </div>
        </section>

        {/* Mano del jugador */}
        <section aria-label={`Tu mano: ${playerHand.map(cardLabel).join(' y ')}${currentHandName ? `. Mejor mano: ${currentHandName}` : ''}`}>
          <p className="text-[#888] text-xs mb-2">Tu mano{currentHandName ? ` — ${currentHandName}` : ''}</p>
          <div className="flex gap-2">
            {playerHand.map((c, i) => <CardVisual key={i} card={c} />)}
          </div>
        </section>

        {/* Resultado */}
        {phase === 'finished' && lastResult && (
          <div role="status" className={`text-lg font-bold ${lastResult.startsWith('+') ? 'text-[#22c55e]' : lastResult.startsWith('-') ? 'text-[#ef4444]' : 'text-[#888]'}`}>
            {lastResult}
          </div>
        )}

        {/* Acciones en juego */}
        {isPlaying && isPlayerTurn && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tus acciones">
            <Button variant="secondary" onClick={() => playerAct('fold')} aria-label="Retirarse (tecla F)">F — Retirarme</Button>
            <Button onClick={() => playerAct(needed === 0 ? 'check' : 'call')} aria-label={needed === 0 ? 'Pasar (tecla C)' : `Igualar ${needed} fichas (tecla C)`}>
              C — {needed === 0 ? 'Pasar' : `Igualar ${needed}`}
            </Button>
            <Button onClick={() => playerAct('raise')} aria-label={`Subir ${raiseAmount} fichas (tecla R)`}>
              R — Subir {raiseAmount}
            </Button>
            <div className="flex items-center gap-1 ml-2" aria-label={`Ajuste de subida: ${raiseAmount} fichas`}>
              <Button variant="ghost" size="sm" onClick={() => setRaiseAmount(r => Math.max(RAISE_STEP, r - RAISE_STEP))} aria-label="Reducir subida (tecla -)">−</Button>
              <span className="text-xs text-[#888] w-12 text-center">{raiseAmount}</span>
              <Button variant="ghost" size="sm" onClick={() => setRaiseAmount(r => r + RAISE_STEP)} aria-label="Aumentar subida (tecla +)">+</Button>
            </div>
          </div>
        )}

        {isPlaying && !isPlayerTurn && (
          <p className="text-[#888] text-sm" aria-live="polite">Turno de la IA…</p>
        )}

        {/* Fin de mano */}
        {phase === 'finished' && (
          <div className="flex flex-wrap gap-3 items-center">
            {playerChips > 0 && aiChips > 0 ? (
              <Button onClick={newGame} aria-label="Nueva mano (tecla N)">N — Nueva mano</Button>
            ) : (
              <Button onClick={firstGame}>Nueva partida</Button>
            )}
            {!saved ? (
              <>
                <Button variant="secondary" onClick={handleSave}>Guardar puntuación</Button>
                {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
              </>
            ) : (
              <p role="status" className="text-[#22c55e] text-sm">Guardado.</p>
            )}
          </div>
        )}

        <p className="text-xs text-[#555]">
          I: estado · F: retirarme · C: igualar/pasar · R: subir · +/−: ajustar subida · N: nueva mano
        </p>
      </div>
    </GameShell>
  )
}
