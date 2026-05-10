'use client'

import { useState, useEffect, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

type Suit = 'Picas' | 'Corazones' | 'Diamantes' | 'Tréboles'
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
interface Card { rank: Rank; suit: Suit }
type Phase = 'idle' | 'playing' | 'finished'
type Outcome = 'blackjack' | 'win' | 'double_win' | 'push' | 'bust' | 'lose'

const SUITS: Suit[] = ['Picas', 'Corazones', 'Diamantes', 'Tréboles']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUIT_SYMBOL: Record<Suit, string> = { Picas: '♠', Corazones: '♥', Diamantes: '♦', Tréboles: '♣' }
const RED_SUITS = new Set<Suit>(['Corazones', 'Diamantes'])

const INSTRUCTIONS = 'Blackjack. Objetivo: conseguir 21 puntos o acercarte más que el dealer sin pasarte. Tecla P: pedir carta. Tecla S: plantarse. Tecla D: doblar, recibes una carta más y la puntuación se duplica si ganas. Tecla N: nueva partida. As vale 1 u 11. J, Q y K valen 10. El dealer pide cartas hasta tener 17 o más. Tecla I para repetir instrucciones. Tecla R para releer tu mano.'

const OUTCOME_TEXT: Record<Outcome, string> = {
  blackjack: '¡Blackjack! 21 en dos cartas.',
  win: '¡Ganaste!',
  double_win: '¡Ganaste con doble apuesta!',
  push: 'Empate.',
  bust: 'Te pasaste de 21.',
  lose: 'El dealer gana.',
}

const OUTCOME_PTS: Record<Outcome, number> = {
  blackjack: 150,
  win: 100,
  double_win: 200,
  push: 25,
  bust: 0,
  lose: 0,
}

function createDeck(): Card[] {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit })))
}

function shuffle(deck: Card[]): Card[] {
  const d = [...deck]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

function rankValue(rank: Rank): number {
  if (['J', 'Q', 'K'].includes(rank)) return 10
  if (rank === 'A') return 11
  return parseInt(rank)
}

function handValue(cards: Card[]): number {
  let total = cards.reduce((sum, c) => sum + rankValue(c.rank), 0)
  let aces = cards.filter(c => c.rank === 'A').length
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return total
}

function cardLabel(card: Card): string {
  const names: Record<string, string> = { A: 'As', J: 'Jota', Q: 'Reina', K: 'Rey' }
  return `${names[card.rank] ?? card.rank} de ${card.suit}`
}

function runDealerTurn(hand: Card[], deck: Card[]): [Card[], Card[]] {
  const h = [...hand], d = [...deck]
  while (handValue(h) < 17) h.push(d.shift()!)
  return [h, d]
}

function resolveOutcome(pVal: number, dVal: number, isDoubled: boolean, isBlackjack: boolean): Outcome {
  if (isBlackjack) return 'blackjack'
  if (pVal > 21) return 'bust'
  if (dVal > 21 || pVal > dVal) return isDoubled ? 'double_win' : 'win'
  if (pVal === dVal) return 'push'
  return 'lose'
}

function CardVisual({ card, hidden }: { card: Card; hidden?: boolean }) {
  if (hidden) {
    return (
      <div
        aria-hidden="true"
        className="w-14 h-20 rounded border border-[#444] bg-[#1e1e2e] flex items-center justify-center text-[#555] text-2xl select-none"
      >
        ?
      </div>
    )
  }
  const isRed = RED_SUITS.has(card.suit)
  return (
    <div
      aria-hidden="true"
      className={`w-14 h-20 rounded border bg-[#1a1a1a] flex flex-col items-center justify-center gap-1 font-mono select-none ${isRed ? 'border-[#ef4444] text-[#ef4444]' : 'border-[#d4d4d4] text-[#d4d4d4]'}`}
    >
      <span className="text-base font-bold leading-none">{card.rank}</span>
      <span className="text-lg leading-none">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  )
}

export default function BlackjackPage() {
  const [deck, setDeck] = useState<Card[]>([])
  const [playerHand, setPlayerHand] = useState<Card[]>([])
  const [dealerHand, setDealerHand] = useState<Card[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [doubled, setDoubled] = useState(false)
  const [score, setScore] = useState(0)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const playerValue = handValue(playerHand)
  const dealerValue = handValue(dealerHand)

  const readState = useCallback(() => {
    if (phase === 'playing') {
      announcePolite(`Tu mano: ${playerHand.map(cardLabel).join(', ')}. Valor: ${playerValue}. Dealer muestra: ${cardLabel(dealerHand[0])}.`)
    } else if (phase === 'finished' && outcome) {
      announcePolite(`Resultado: ${OUTCOME_TEXT[outcome]}. Tu mano: ${playerHand.map(cardLabel).join(', ')} (${playerValue}). Dealer: ${dealerHand.map(cardLabel).join(', ')} (${dealerValue}).`)
    }
  }, [phase, playerHand, dealerHand, playerValue, dealerValue, outcome])

  function startGame() {
    const freshDeck = shuffle(createDeck())
    const pCards = freshDeck.slice(0, 2)
    const dCards = freshDeck.slice(2, 4)
    const remaining = freshDeck.slice(4)

    setDeck(remaining)
    setPlayerHand(pCards)
    setDealerHand(dCards)
    setOutcome(null)
    setDoubled(false)
    setSaved(false)
    setSaveError('')

    const pVal = handValue(pCards)

    if (pVal === 21) {
      const pts = OUTCOME_PTS['blackjack']
      setPhase('finished')
      setOutcome('blackjack')
      setScore(s => s + pts)
      audio.correct()
      announceAssertive(`¡Blackjack! Tu mano: ${pCards.map(cardLabel).join(' y ')}. +${pts} puntos.`)
      return
    }

    setPhase('playing')
    audio.start()
    announcePolite(`Nueva partida. Tu mano: ${pCards.map(cardLabel).join(' y ')}. Valor: ${pVal}. El dealer muestra: ${cardLabel(dCards[0])}. Tecla P: pedir carta. Tecla S: plantarte. Tecla D: doblar.`)
  }

  function handleHit() {
    if (phase !== 'playing') return
    const card = deck[0]
    const newDeck = deck.slice(1)
    const newHand = [...playerHand, card]

    audio.deal()
    setDeck(newDeck)
    setPlayerHand(newHand)

    const val = handValue(newHand)

    if (val > 21) {
      setPhase('finished')
      setOutcome('bust')
      audio.gameOver()
      announceAssertive(`Recibes: ${cardLabel(card)}. Valor: ${val}. ¡Bust! Te pasaste de 21. Presiona N para jugar de nuevo.`)
    } else if (val === 21) {
      announceAssertive(`Recibes: ${cardLabel(card)}. ¡21! Plantado automáticamente.`)
      finishWithStand(newHand, newDeck, doubled)
    } else {
      announceAssertive(`Recibes: ${cardLabel(card)}. Valor total: ${val}. Tecla P: otra carta. Tecla S: plantarte.`)
    }
  }

  function handleStand() {
    if (phase !== 'playing') return
    finishWithStand(playerHand, deck, doubled)
  }

  function handleDouble() {
    if (phase !== 'playing' || playerHand.length !== 2) return
    const card = deck[0]
    const newDeck = deck.slice(1)
    const newHand = [...playerHand, card]

    audio.deal()
    const val = handValue(newHand)

    if (val > 21) {
      setDeck(newDeck)
      setPlayerHand(newHand)
      setDoubled(true)
      setPhase('finished')
      setOutcome('bust')
      audio.gameOver()
      announceAssertive(`Doblas. Recibes: ${cardLabel(card)}. Valor: ${val}. ¡Bust! Presiona N para jugar de nuevo.`)
    } else {
      announceAssertive(`Doblas. Recibes: ${cardLabel(card)}. Valor: ${val}. Turno del dealer.`)
      finishWithStand(newHand, newDeck, true)
    }
  }

  function finishWithStand(pHand: Card[], currentDeck: Card[], isDoubled: boolean) {
    const [finalDealer, finalDeck] = runDealerTurn(dealerHand, currentDeck)
    const pVal = handValue(pHand)
    const dVal = handValue(finalDealer)
    const out = resolveOutcome(pVal, dVal, isDoubled, false)
    const pts = OUTCOME_PTS[out]

    setDeck(finalDeck)
    setPlayerHand(pHand)
    setDealerHand(finalDealer)
    setDoubled(isDoubled)
    setPhase('finished')
    setOutcome(out)
    if (pts > 0) setScore(s => s + pts)

    if (out === 'win' || out === 'double_win') {
      audio.correct()
    } else if (out === 'lose') {
      audio.gameOver()
    } else {
      audio.click()
    }

    const dealerStr = finalDealer.map(cardLabel).join(', ')
    const ptsTxt = pts > 0 ? ` +${pts} puntos.` : ''
    announceAssertive(`${OUTCOME_TEXT[out]} Tu mano: ${pVal}. Dealer: ${dealerStr} (${dVal}).${ptsTxt} Presiona N para jugar de nuevo.`)
  }

  useEffect(() => {
    if (phase === 'idle') return

    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key.toLowerCase()) {
        case 'i': announcePolite(INSTRUCTIONS); break
        case 'r': readState(); break
        case 'p': if (phase === 'playing') handleHit(); break
        case 's': if (phase === 'playing') handleStand(); break
        case 'd': if (phase === 'playing' && playerHand.length === 2) handleDouble(); break
        case 'n': startGame(); break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [phase, playerHand, deck, dealerHand, doubled, readState]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    const result = await saveScore('blackjack', score)
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
      <GameShell title="Blackjack" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Blackjack</h2>
          <p className="text-[#888] text-sm leading-relaxed max-w-md mx-auto">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame}>Comenzar partida</Button>
        </div>
      </GameShell>
    )
  }

  const isPlaying = phase === 'playing'
  const isFinished = phase === 'finished'
  const canDouble = isPlaying && playerHand.length === 2
  const outcomeColor = !outcome ? '' : ['win', 'double_win', 'blackjack'].includes(outcome) ? 'text-[#22c55e]' : outcome === 'push' ? 'text-[#888]' : 'text-[#ef4444]'

  return (
    <GameShell title="Blackjack" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-8">

        {/* Dealer */}
        <section
          aria-label={
            isFinished
              ? `Mano del dealer: ${dealerHand.map(cardLabel).join(', ')}. Valor: ${dealerValue}`
              : `Dealer muestra: ${dealerHand[0] ? cardLabel(dealerHand[0]) : ''}, carta oculta`
          }
        >
          <p className="text-[#888] text-sm mb-2">
            Dealer{isFinished ? <> — <strong className="text-[#ffd700]">{dealerValue}</strong></> : null}
          </p>
          <div className="flex gap-2 flex-wrap">
            {dealerHand.map((card, i) => (
              <CardVisual key={i} card={card} hidden={isPlaying && i === 1} />
            ))}
          </div>
        </section>

        {/* Player */}
        <section aria-label={`Tu mano: ${playerHand.map(cardLabel).join(', ')}. Valor: ${playerValue}`}>
          <p className="text-[#888] text-sm mb-2">
            Tu mano — <strong className="text-[#ffd700]">{playerValue}</strong>
            {doubled && <span className="text-[#ffd700] text-xs ml-2">(apuesta doble)</span>}
          </p>
          <div className="flex gap-2 flex-wrap">
            {playerHand.map((card, i) => (
              <CardVisual key={i} card={card} />
            ))}
          </div>
        </section>

        {/* Result */}
        {isFinished && outcome && (
          <div role="status" className={`text-xl font-bold ${outcomeColor}`}>
            {OUTCOME_TEXT[outcome]}
            {OUTCOME_PTS[outcome] > 0 && (
              <span className="block text-base text-[#ffd700] mt-1">+{OUTCOME_PTS[outcome]} puntos</span>
            )}
          </div>
        )}

        {/* Actions */}
        {isPlaying && (
          <div className="flex flex-wrap gap-3" role="group" aria-label="Acciones disponibles">
            <Button onClick={handleHit} aria-label="Pedir carta (tecla P)">
              P — Pedir carta
            </Button>
            <Button variant="secondary" onClick={handleStand} aria-label="Plantarse (tecla S)">
              S — Plantarse
            </Button>
            {canDouble && (
              <Button variant="secondary" onClick={handleDouble} aria-label="Doblar apuesta (tecla D)">
                D — Doblar
              </Button>
            )}
          </div>
        )}

        {isFinished && (
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

        <p className="text-xs text-[#555]">Tecla I: instrucciones · Tecla R: releer mano · Tecla N: nueva partida</p>
      </div>
    </GameShell>
  )
}
