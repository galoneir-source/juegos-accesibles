'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── tipos ──────────────────────────────────────────────────────────────────

type Suit = 'Espadas' | 'Bastos' | 'Copas' | 'Oros'
type Rank = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '10' | '11' | '12'
interface Card { rank: Rank; suit: Suit; id: string }

type Phase =
  | 'idle'
  | 'player_turn'        // jugador actúa: puede jugar carta, cantar envido o truco
  | 'ai_plays'           // IA jugando (auto con delay)
  | 'envido_response'    // jugador responde envido de la IA
  | 'truco_response'     // jugador responde truco de la IA
  | 'hand_over'
  | 'game_over'

type TrickResult = 'player' | 'ai' | 'tie'

// ── constantes ──────────────────────────────────────────────────────────────

const SUITS: Suit[] = ['Espadas', 'Bastos', 'Copas', 'Oros']
const RANKS: Rank[] = ['1', '2', '3', '4', '5', '6', '7', '10', '11', '12']
const SUIT_ABBR: Record<Suit, string> = { Espadas: 'Esp', Bastos: 'Bas', Copas: 'Cop', Oros: 'Oro' }
const RANK_NAME: Record<Rank, string> = {
  '1': 'As', '2': 'Dos', '3': 'Tres', '4': 'Cuatro', '5': 'Cinco',
  '6': 'Seis', '7': 'Siete', '10': 'Sota', '11': 'Caballo', '12': 'Rey',
}

const ENVIDO_NAMES = ['', 'Envido', 'Real Envido', 'Falta Envido']
const TRUCO_NAMES = ['', 'Truco', 'Retruco', 'Vale Cuatro']

// puntos si se acepta / puntos para el que cantó si se rechaza
const ENVIDO_WIN_PTS = [0, 2, 3, 5]
const ENVIDO_REJECT_PTS = [0, 1, 2, 3]
const TRUCO_WIN_PTS = [1, 2, 3, 4]   // índice 0 = sin truco cantado = 1 pt base
const TRUCO_REJECT_PTS = [0, 1, 2, 3]

const WIN_SCORE = 15

const INSTRUCTIONS = `Truco argentino 1 contra 1. Primero en llegar a ${WIN_SCORE} puntos gana. Mazo español de 40 cartas, sin ochos ni nueves. Cada mano: 3 cartas y 3 bazas. Quien gane 2 bazas gana la mano y suma puntos de truco.
Jerarquía de cartas, de mayor a menor: As de Espadas, As de Bastos, Siete de Espadas, Siete de Oros, Treses, Doses, Ases de Copas y Oros, Reyes, Caballos, Sotas, Sietes de Copas y Bastos, Seises, Cincos, Cuatros.
Envido (antes de jugar tu primera carta): pulsa E para cantar Envido (2 pts si ganas la comparación), otra E para Real Envido (3 pts), otra E para Falta Envido (5 pts). Si la IA canta: S para aceptar, N para rechazar.
Truco (antes de jugar una carta): pulsa T para cantar Truco (2 pts para el ganador de la mano), otra T para Retruco (3 pts), otra T para Vale Cuatro (4 pts). Si la IA canta: S para aceptar, N para rechazar, T para subir.
Juega tus cartas con las teclas 1, 2 o 3. Pulsa I para escuchar el estado actual.`

// ── baraja ──────────────────────────────────────────────────────────────────

function createDeck(): Card[] {
  return SUITS.flatMap(s => RANKS.map(r => ({ rank: r, suit: s, id: `${r}-${s}` })))
}

function shuffle(d: Card[]): Card[] {
  const a = [...d]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function cardLabel(c: Card) { return `${RANK_NAME[c.rank]} de ${c.suit}` }

// ── jerarquía truco ──────────────────────────────────────────────────────────

function trucoRank(c: Card): number {
  if (c.rank === '1' && c.suit === 'Espadas') return 13
  if (c.rank === '1' && c.suit === 'Bastos') return 12
  if (c.rank === '7' && c.suit === 'Espadas') return 11
  if (c.rank === '7' && c.suit === 'Oros') return 10
  if (c.rank === '3') return 9
  if (c.rank === '2') return 8
  if (c.rank === '1') return 7  // Copas o Oros
  if (c.rank === '12') return 6
  if (c.rank === '11') return 5
  if (c.rank === '10') return 4
  if (c.rank === '7') return 3  // Copas o Bastos
  if (c.rank === '6') return 2
  if (c.rank === '5') return 1
  return 0  // '4'
}

// ── envido ──────────────────────────────────────────────────────────────────

function envidoVal(r: Rank): number {
  return ['10', '11', '12'].includes(r) ? 0 : parseInt(r)
}

function calcEnvido(hand: Card[]): number {
  let best = 0
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++)
      if (hand[i].suit === hand[j].suit)
        best = Math.max(best, envidoVal(hand[i].rank) + envidoVal(hand[j].rank) + 20)
  if (!best) best = Math.max(...hand.map(c => envidoVal(c.rank)))
  return best
}

// ── ganador de mano ──────────────────────────────────────────────────────────

function handWinner(tricks: TrickResult[], playerIsMano: boolean): 'player' | 'ai' {
  const pw = tricks.filter(t => t === 'player').length
  const aw = tricks.filter(t => t === 'ai').length
  if (pw > aw) return 'player'
  if (aw > pw) return 'ai'
  const first = tricks.find(t => t !== 'tie')
  if (first) return first
  return playerIsMano ? 'player' : 'ai'
}

// ── IA ────────────────────────────────────────────────────────────────────────

function aiPickCard(hand: Card[], tricks: TrickResult[]): number {
  const aW = tricks.filter(t => t === 'ai').length
  if (aW >= 2) {
    // ya perdiendo la mano, conservar buenas cartas
    return hand.reduce((b, c, i) => trucoRank(c) < trucoRank(hand[b]) ? i : b, 0)
  }
  // jugar la más fuerte
  return hand.reduce((b, c, i) => trucoRank(c) > trucoRank(hand[b]) ? i : b, 0)
}

function aiRespondEnvido(aiHand: Card[], level: number): 'accept' | 'raise' | 'reject' {
  const s = calcEnvido(aiHand)
  if (s >= 30 && level < 3) return 'raise'
  if (s >= 24) return 'accept'
  return 'reject'
}

function aiRespondTruco(aiHand: Card[], level: number): 'accept' | 'raise' | 'reject' {
  const m = Math.max(...aiHand.map(trucoRank))
  if (m >= 11 && level < 3) return 'raise'
  if (m >= 7) return 'accept'
  return 'reject'
}

// ── visual de carta ───────────────────────────────────────────────────────────

function CardVisual({ card, hidden }: { card?: Card | null; hidden?: boolean }) {
  if (hidden || !card) {
    return (
      <div aria-hidden="true" className="w-10 h-14 rounded border border-[#444] bg-[#1e1e2e] flex items-center justify-center text-[#555] select-none">?</div>
    )
  }
  const red = card.suit === 'Oros' || card.suit === 'Copas'
  return (
    <div aria-hidden="true" className={`w-10 h-14 rounded border-2 bg-[#1a1a1a] flex flex-col items-center justify-center gap-0.5 font-mono text-xs select-none ${red ? 'border-[#ef4444] text-[#ef4444]' : 'border-[#d4d4d4] text-[#d4d4d4]'}`}>
      <span className="font-bold">{card.rank}</span>
      <span className="text-[9px]">{SUIT_ABBR[card.suit]}</span>
    </div>
  )
}

// ── componente principal ──────────────────────────────────────────────────────

export default function TrucoPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [playerHand, setPlayerHand] = useState<Card[]>([])
  const [aiHand, setAiHand] = useState<Card[]>([])
  const [lastAiCard, setLastAiCard] = useState<Card | null>(null)
  const [tricks, setTricks] = useState<TrickResult[]>([])
  const [playerIsMano, setPlayerIsMano] = useState(true)

  // envido
  const [envidoLevel, setEnvidoLevel] = useState(0)       // 0=sin cantar, 1,2,3
  const [envidoCalledBy, setEnvidoCalledBy] = useState<'player' | 'ai' | null>(null)
  const [envidoDone, setEnvidoDone] = useState(false)
  const [envidoAvail, setEnvidoAvail] = useState(true)    // false tras primera carta jugada

  // truco
  const [trucoLevel, setTrucoLevel] = useState(0)         // 0=sin cantar, 1,2,3
  const [trucoCalledBy, setTrucoCalledBy] = useState<'player' | 'ai' | null>(null)
  const [trucoAccepted, setTrucoAccepted] = useState(false)

  // puntuación
  const [playerScore, setPlayerScore] = useState(0)
  const [aiScore, setAiScore] = useState(0)
  const [handResult, setHandResult] = useState('')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const stateRef = useRef({
    phase, playerHand, aiHand, lastAiCard, tricks, playerIsMano,
    envidoLevel, envidoCalledBy, envidoDone, envidoAvail,
    trucoLevel, trucoCalledBy, trucoAccepted,
    playerScore, aiScore,
  })
  useEffect(() => {
    stateRef.current = {
      phase, playerHand, aiHand, lastAiCard, tricks, playerIsMano,
      envidoLevel, envidoCalledBy, envidoDone, envidoAvail,
      trucoLevel, trucoCalledBy, trucoAccepted,
      playerScore, aiScore,
    }
  })

  // ── iniciar mano ─────────────────────────────────────────────────────────

  function startHand(pScore: number, aScore: number, pIsMano: boolean) {
    const deck = shuffle(createDeck())
    const ph = deck.slice(0, 3)
    const ah = deck.slice(3, 6)

    setPlayerHand(ph)
    setAiHand(ah)
    setLastAiCard(null)
    setTricks([])
    setPlayerIsMano(pIsMano)
    setEnvidoLevel(0)
    setEnvidoCalledBy(null)
    setEnvidoDone(false)
    setEnvidoAvail(true)
    setTrucoLevel(0)
    setTrucoCalledBy(null)
    setTrucoAccepted(false)
    setHandResult('')
    setSaved(false)
    setSaveError('')

    audio.deal()

    // ¿la IA quiere cantar envido antes que el jugador actúe?
    if (calcEnvido(ah) >= 28) {
      setTimeout(() => {
        setEnvidoLevel(1)
        setEnvidoCalledBy('ai')
        setPhase('envido_response')
        announceAssertive(
          `Nueva mano. Tu mano: ${ph.map(cardLabel).join(', ')}. ` +
          `La IA canta ¡Envido! S para aceptar (2 pts), N para no quiero (la IA gana 1 pt), E para subir a Real Envido.`
        )
      }, 600)
    } else {
      setPhase('player_turn')
      announcePolite(
        `Nueva mano. ${pIsMano ? 'Eres mano.' : 'La IA es mano.'} ` +
        `Tu mano: ${ph.map(cardLabel).join(', ')}. ` +
        `E=Envido, T=Truco. Juega con 1, 2 o 3.`
      )
    }
  }

  // ── iniciar turno (con checks de IA para truco) ───────────────────────────

  function beginPlayerTurn(ph: Card[], ah: Card[], trix: TrickResult[], tLvl: number, tAcc: boolean) {
    // La IA puede cantar truco al inicio de un turno (si hay bazas ya jugadas)
    const aiWantsTruco = trix.length > 0 && tLvl === 0 && Math.max(...ah.map(trucoRank)) >= 9
    if (aiWantsTruco) {
      setTrucoLevel(1)
      setTrucoCalledBy('ai')
      setPhase('truco_response')
      announceAssertive(
        `La IA canta ¡Truco! S para aceptar (2 pts), N para no quiero (la IA gana 1 pt), T para Retruco.`
      )
      return
    }
    setPhase('player_turn')
    const pw = trix.filter(t => t === 'player').length
    const aw = trix.filter(t => t === 'ai').length
    if (trix.length > 0) {
      announcePolite(
        `Bazas: tú ${pw}, IA ${aw}. Tu mano: ${ph.map((c, i) => `${i + 1}: ${cardLabel(c)}`).join(', ')}. ` +
        `${tAcc ? `Truco en juego (${TRUCO_WIN_PTS[tLvl]} pts). ` : ''}T=Truco. Juega con 1, 2 o 3.`
      )
    }
  }

  // ── jugar carta ──────────────────────────────────────────────────────────

  function playCard(idx: number) {
    const { phase: ph, playerHand: hand, aiHand: ah, tricks: tr, envidoAvail: ea,
      trucoLevel: tl, trucoAccepted: ta } = stateRef.current
    if (ph !== 'player_turn' || idx >= hand.length) return

    const card = hand[idx]
    const newHand = hand.filter((_, i) => i !== idx)
    setPlayerHand(newHand)
    if (ea) setEnvidoAvail(false)

    audio.click()
    announcePolite(`Juegas ${cardLabel(card)}.`)
    setPhase('ai_plays')

    setTimeout(() => {
      runAiTurn(card, newHand, ah, tr, tl, ta)
    }, 700)
  }

  function runAiTurn(
    playerCard: Card, pHand: Card[], ah: Card[], tr: TrickResult[],
    tl: number, ta: boolean
  ) {
    const idx = aiPickCard(ah, tr)
    const aiCard = ah[idx]
    const newAiHand = ah.filter((_, i) => i !== idx)

    setAiHand(newAiHand)
    setLastAiCard(aiCard)

    const pr = trucoRank(playerCard)
    const ar = trucoRank(aiCard)
    const result: TrickResult = pr > ar ? 'player' : ar > pr ? 'ai' : 'tie'

    audio.deal()
    const rMsg = result === 'player' ? 'Ganas la baza.' : result === 'ai' ? 'La IA gana la baza.' : 'Parda (empate).'
    announcePolite(`La IA juega ${cardLabel(aiCard)}. ${rMsg}`)

    setTimeout(() => {
      finalizeTrick(result, pHand, newAiHand, tr, tl, ta)
    }, 500)
  }

  function finalizeTrick(
    result: TrickResult, pHand: Card[], ah: Card[], prevTricks: TrickResult[],
    tl: number, ta: boolean
  ) {
    const newTricks = [...prevTricks, result]
    setTricks(newTricks)

    const pw = newTricks.filter(t => t === 'player').length
    const aw = newTricks.filter(t => t === 'ai').length
    const handDone = newTricks.length === 3 || pw >= 2 || aw >= 2

    if (handDone) {
      const { playerIsMano: pim, playerScore: ps, aiScore: as, envidoDone: ed } = stateRef.current
      const winner = handWinner(newTricks, pim)
      const trucoPts = ta ? TRUCO_WIN_PTS[tl] : TRUCO_WIN_PTS[0]

      const newPs = winner === 'player' ? ps + trucoPts : ps
      const newAs = winner === 'ai' ? as + trucoPts : as
      setPlayerScore(newPs)
      setAiScore(newAs)
      setHandResult(winner === 'player' ? `+${trucoPts} pts` : `IA +${trucoPts} pts`)

      if (newPs >= WIN_SCORE || newAs >= WIN_SCORE) {
        const gw = newPs >= WIN_SCORE ? 'player' : 'ai'
        audio[gw === 'player' ? 'correct' : 'gameOver']()
        announceAssertive(
          gw === 'player'
            ? `¡Ganaste la partida con ${newPs} puntos!`
            : `La IA gana la partida con ${newAs} puntos. Tú tienes ${newPs}.`
        )
        setPhase('game_over')
      } else {
        audio[winner === 'player' ? 'correct' : 'gameOver']()
        announceAssertive(
          `Fin de mano. ${winner === 'player' ? `¡Ganaste! +${trucoPts} pts.` : `La IA gana la mano. +${trucoPts} pts para la IA.`} ` +
          `Marcador: tú ${newPs}, IA ${newAs}. N para nueva mano.`
        )
        setPhase('hand_over')
      }
    } else {
      setLastAiCard(null)
      beginPlayerTurn(pHand, ah, newTricks, tl, ta)
    }
  }

  // ── cantar envido (jugador) ───────────────────────────────────────────────

  function playerCallEnvido() {
    const { phase: ph, envidoAvail: ea, envidoDone: ed, envidoLevel: el,
      envidoCalledBy: ecb, aiHand: ah, playerHand: phand, playerScore: ps, aiScore: as } = stateRef.current
    if (ph !== 'player_turn' || !ea || ed) return

    const nextLvl = el + 1
    if (nextLvl > 3) return

    setEnvidoLevel(nextLvl)
    setEnvidoCalledBy('player')
    setEnvidoAvail(false)

    // la IA responde
    const aiResp = aiRespondEnvido(ah, nextLvl)
    if (aiResp === 'raise' && nextLvl < 3) {
      const newLvl = nextLvl + 1
      setEnvidoLevel(newLvl)
      setEnvidoCalledBy('ai')
      setPhase('envido_response')
      announceAssertive(
        `Cantas ${ENVIDO_NAMES[nextLvl]}. La IA sube a ${ENVIDO_NAMES[newLvl]}! ` +
        `S para aceptar (${ENVIDO_WIN_PTS[newLvl]} pts), N para no quiero (la IA gana ${ENVIDO_REJECT_PTS[newLvl]} pt/s), E para Falta Envido.`
      )
    } else if (aiResp === 'accept') {
      const playerEnvido = calcEnvido(phand)
      const aiEnvido = calcEnvido(ah)
      const envWinner = playerEnvido >= aiEnvido ? 'player' : 'ai'
      const pts = ENVIDO_WIN_PTS[nextLvl]
      setEnvidoDone(true)
      setEnvidoAvail(false)

      if (envWinner === 'player') {
        setPlayerScore(s => s + pts)
        announcePolite(`Cantas ${ENVIDO_NAMES[nextLvl]}. La IA acepta. Tu envido: ${playerEnvido}, IA: ${aiEnvido}. ¡Ganas el envido! +${pts} pts.`)
      } else {
        setAiScore(s => s + pts)
        announcePolite(`Cantas ${ENVIDO_NAMES[nextLvl]}. La IA acepta. Tu envido: ${playerEnvido}, IA: ${aiEnvido}. La IA gana el envido. +${pts} pts para la IA.`)
      }
      // check win
      const newPs = envWinner === 'player' ? ps + pts : ps
      const newAs = envWinner === 'ai' ? as + pts : as
      if (newPs >= WIN_SCORE || newAs >= WIN_SCORE) {
        endGameFromEnvido(newPs, newAs)
        return
      }
      setPhase('player_turn')
    } else {
      // rechaza: jugador gana los puntos de rechazo
      const pts = ENVIDO_REJECT_PTS[nextLvl]
      setPlayerScore(s => s + pts)
      setEnvidoDone(true)
      announcePolite(`Cantas ${ENVIDO_NAMES[nextLvl]}. La IA dice no quiero. Ganas ${pts} pt/s de envido.`)
      const newPs = ps + pts
      if (newPs >= WIN_SCORE) { endGameFromEnvido(newPs, as); return }
      setPhase('player_turn')
    }
  }

  // ── responder envido de la IA ─────────────────────────────────────────────

  function respondEnvido(action: 'accept' | 'reject' | 'raise') {
    const { envidoLevel: el, envidoCalledBy: ecb, playerHand: ph, aiHand: ah,
      playerScore: ps, aiScore: as } = stateRef.current

    if (action === 'raise') {
      if (el >= 3) { announceAssertive('Ya está en Falta Envido, no puedes subir más.'); return }
      const newLvl = el + 1
      setEnvidoLevel(newLvl)
      setEnvidoCalledBy('player')
      // IA responde a la subida
      const aiResp = aiRespondEnvido(ah, newLvl)
      if (aiResp === 'accept' || newLvl === 3) {
        const pe = calcEnvido(ph)
        const ae = calcEnvido(ah)
        const winner = pe >= ae ? 'player' : 'ai'
        const pts = ENVIDO_WIN_PTS[newLvl]
        setEnvidoDone(true)
        setEnvidoAvail(false)
        resolveEnvidoWinner(winner, pts, pe, ae, ENVIDO_NAMES[newLvl], ps, as)
      } else {
        const pts = ENVIDO_REJECT_PTS[newLvl]
        setPlayerScore(s => s + pts)
        setEnvidoDone(true)
        announcePolite(`Subes a ${ENVIDO_NAMES[newLvl]}. La IA dice no quiero. Ganas ${pts} pt/s.`)
        const newPs = ps + pts
        if (newPs >= WIN_SCORE) { endGameFromEnvido(newPs, as); return }
        setPhase('player_turn')
      }
      return
    }

    if (action === 'accept') {
      const pe = calcEnvido(ph)
      const ae = calcEnvido(ah)
      const winner = pe >= ae ? 'player' : 'ai'
      const pts = ENVIDO_WIN_PTS[el]
      setEnvidoDone(true)
      setEnvidoAvail(false)
      resolveEnvidoWinner(winner, pts, pe, ae, ENVIDO_NAMES[el], ps, as)
      return
    }

    // rechaza: la IA (que cantó) gana los puntos de rechazo
    const pts = ENVIDO_REJECT_PTS[el]
    setAiScore(s => s + pts)
    setEnvidoDone(true)
    announcePolite(`Dices no quiero. La IA gana ${pts} pt/s de envido.`)
    const newAs = as + pts
    if (newAs >= WIN_SCORE) { endGameFromEnvido(ps, newAs); return }
    setPhase('player_turn')
  }

  function resolveEnvidoWinner(
    winner: 'player' | 'ai', pts: number, pe: number, ae: number,
    levelName: string, ps: number, as: number
  ) {
    if (winner === 'player') {
      setPlayerScore(s => s + pts)
      announcePolite(`${levelName} aceptado. Tu envido: ${pe}, IA: ${ae}. ¡Ganas el envido! +${pts} pts.`)
      const newPs = ps + pts
      if (newPs >= WIN_SCORE) { endGameFromEnvido(newPs, as); return }
    } else {
      setAiScore(s => s + pts)
      announcePolite(`${levelName} aceptado. Tu envido: ${pe}, IA: ${ae}. La IA gana el envido. +${pts} pts para la IA.`)
      const newAs = as + pts
      if (newAs >= WIN_SCORE) { endGameFromEnvido(ps, newAs); return }
    }
    setPhase('player_turn')
  }

  function endGameFromEnvido(ps: number, as: number) {
    const gw = ps >= WIN_SCORE ? 'player' : 'ai'
    audio[gw === 'player' ? 'correct' : 'gameOver']()
    announceAssertive(
      gw === 'player'
        ? `¡Ganaste la partida con ${ps} puntos gracias al envido!`
        : `La IA gana la partida con ${as} puntos gracias al envido.`
    )
    setPlayerScore(ps)
    setAiScore(as)
    setPhase('game_over')
  }

  // ── cantar truco (jugador) ────────────────────────────────────────────────

  function playerCallTruco() {
    const { phase: ph, trucoLevel: tl, trucoAccepted: ta, aiHand: ah,
      playerScore: ps, aiScore: as, tricks: tr, playerHand: phand } = stateRef.current
    if (ph !== 'player_turn') return
    if (tl >= 3) { announceAssertive('Ya estás en Vale Cuatro, no puedes subir más.'); return }
    if (ta && tl >= 3) return

    const nextLvl = tl + 1
    setTrucoLevel(nextLvl)
    setTrucoCalledBy('player')

    const aiResp = aiRespondTruco(ah, nextLvl)
    if (aiResp === 'raise' && nextLvl < 3) {
      const newLvl = nextLvl + 1
      setTrucoLevel(newLvl)
      setTrucoCalledBy('ai')
      setPhase('truco_response')
      announceAssertive(
        `Cantas ${TRUCO_NAMES[nextLvl]}. La IA sube a ${TRUCO_NAMES[newLvl]}! ` +
        `S para aceptar (${TRUCO_WIN_PTS[newLvl]} pts al ganador), N para no quiero (la IA gana ${TRUCO_REJECT_PTS[newLvl]} pt/s), T para Vale Cuatro.`
      )
    } else if (aiResp === 'accept') {
      setTrucoAccepted(true)
      announcePolite(
        `Cantas ${TRUCO_NAMES[nextLvl]}. La IA acepta. ${TRUCO_WIN_PTS[nextLvl]} puntos para el ganador de la mano. Juega con 1, 2 o 3.`
      )
      setPhase('player_turn')
    } else {
      // rechaza: jugador gana pts de rechazo
      const pts = TRUCO_REJECT_PTS[nextLvl]
      setPlayerScore(s => s + pts)
      announceAssertive(`Cantas ${TRUCO_NAMES[nextLvl]}. La IA dice no quiero. Ganas ${pts} pt/s. Fin de mano.`)
      const newPs = ps + pts
      if (newPs >= WIN_SCORE) {
        setPlayerScore(newPs)
        audio.correct()
        announceAssertive(`¡Ganaste la partida con ${newPs} puntos!`)
        setPhase('game_over')
      } else {
        setPlayerScore(newPs)
        setHandResult(`+${pts} pts (rechazo)`)
        audio.correct()
        setPhase('hand_over')
      }
    }
  }

  // ── responder truco de la IA ──────────────────────────────────────────────

  function respondTruco(action: 'accept' | 'reject' | 'raise') {
    const { trucoLevel: tl, aiHand: ah, playerHand: ph, playerScore: ps,
      aiScore: as, tricks: tr, trucoAccepted: ta, playerIsMano: pim } = stateRef.current

    if (action === 'raise') {
      if (tl >= 3) { announceAssertive('Ya está en Vale Cuatro.'); return }
      const newLvl = tl + 1
      setTrucoLevel(newLvl)
      setTrucoCalledBy('player')
      const aiResp = aiRespondTruco(ah, newLvl)
      if (aiResp === 'accept') {
        setTrucoAccepted(true)
        announcePolite(`Subes a ${TRUCO_NAMES[newLvl]}. La IA acepta. ${TRUCO_WIN_PTS[newLvl]} pts al ganador. Juega con 1, 2 o 3.`)
        setPhase('player_turn')
      } else {
        const pts = TRUCO_REJECT_PTS[newLvl]
        setPlayerScore(s => s + pts)
        announceAssertive(`Subes a ${TRUCO_NAMES[newLvl]}. La IA dice no quiero. Ganas ${pts} pts. Fin de mano.`)
        const newPs = ps + pts
        if (newPs >= WIN_SCORE) {
          setPlayerScore(newPs); audio.correct()
          announceAssertive(`¡Ganaste la partida!`); setPhase('game_over')
        } else {
          setPlayerScore(newPs); setHandResult(`+${pts} pts (rechazo)`)
          audio.correct(); setPhase('hand_over')
        }
      }
      return
    }

    if (action === 'accept') {
      setTrucoAccepted(true)
      announcePolite(`Aceptas ${TRUCO_NAMES[tl]}. ${TRUCO_WIN_PTS[tl]} pts al ganador de la mano. Juega con 1, 2 o 3.`)
      setPhase('player_turn')
      return
    }

    // rechaza: la IA (que cantó) gana pts de rechazo
    const pts = TRUCO_REJECT_PTS[tl]
    setAiScore(s => s + pts)
    announceAssertive(`Dices no quiero. La IA gana ${pts} pt/s. Fin de mano.`)
    const newAs = as + pts
    if (newAs >= WIN_SCORE) {
      setAiScore(newAs); audio.gameOver()
      announceAssertive(`La IA gana la partida con ${newAs} puntos.`); setPhase('game_over')
    } else {
      setAiScore(newAs); setHandResult(`IA +${pts} pts (rechazo)`)
      audio.gameOver(); setPhase('hand_over')
    }
  }

  // ── leer estado ───────────────────────────────────────────────────────────

  const readStatus = useCallback(() => {
    const { phase: ph, playerHand: phand, tricks: tr, envidoLevel: el,
      trucoLevel: tl, trucoAccepted: ta, playerScore: ps, aiScore: as, envidoAvail: ea } = stateRef.current
    if (ph === 'idle') { announcePolite('Pulsa Comenzar para jugar Truco.'); return }
    const pw = tr.filter(t => t === 'player').length
    const aw = tr.filter(t => t === 'ai').length
    announcePolite(
      `Marcador: tú ${ps}, IA ${as}. Bazas: tú ${pw}, IA ${aw}. ` +
      `Tu mano: ${phand.map((c, i) => `${i + 1}: ${cardLabel(c)}`).join(', ')}. ` +
      (ta ? `Truco aceptado (${TRUCO_WIN_PTS[tl]} pts en juego). ` : '') +
      (el > 0 ? `Envido cantado: ${ENVIDO_NAMES[el]}. ` : '') +
      (ea ? 'Puedes cantar envido (E). ' : '') +
      (ph === 'player_turn' ? 'Tu turno: 1/2/3 para jugar.' : ph === 'envido_response' ? 'Respondiendo envido: S/N/E.' : ph === 'truco_response' ? 'Respondiendo truco: S/N/T.' : '')
    )
  }, [])

  // ── teclado ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'idle') return
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      const key = e.key.toLowerCase()
      const { phase: ph, playerHand: phand, envidoAvail: ea, envidoDone: ed,
        envidoLevel: el, trucoLevel: tl, trucoAccepted: ta } = stateRef.current

      switch (key) {
        case 'i': readStatus(); break
        case 'n':
          if (ph === 'hand_over' || ph === 'game_over') {
            const { playerScore: ps, aiScore: as, playerIsMano: pim } = stateRef.current
            if (ph === 'game_over') {
              setPlayerScore(0); setAiScore(0)
              startHand(0, 0, true)
            } else {
              startHand(ps, as, !pim)
            }
          }
          break
        case 'e':
          if (ph === 'player_turn' && ea && !ed) playerCallEnvido()
          else if (ph === 'envido_response') respondEnvido('raise')
          break
        case 't':
          if (ph === 'player_turn') playerCallTruco()
          else if (ph === 'truco_response') respondTruco('raise')
          break
        case 's':
          if (ph === 'envido_response') respondEnvido('accept')
          else if (ph === 'truco_response') respondTruco('accept')
          break
        default: {
          if (ph !== 'player_turn') break
          const n = parseInt(key)
          if (!isNaN(n) && n >= 1 && n <= phand.length) playCard(n - 1)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [phase, readStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── guardar puntuación ────────────────────────────────────────────────────

  async function handleSave() {
    const result = await saveScore('truco', playerScore)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── render: inicio ────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Truco" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Truco Argentino</h2>
          <p className="text-[#888] text-sm leading-relaxed max-w-lg mx-auto">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={() => startHand(0, 0, true)}>Comenzar partida</Button>
        </div>
      </GameShell>
    )
  }

  // ── render: juego ─────────────────────────────────────────────────────────

  const pw = tricks.filter(t => t === 'player').length
  const aw = tricks.filter(t => t === 'ai').length
  const isPlaying = phase === 'player_turn'

  const phaseLabel: Record<Phase, string> = {
    idle: '', player_turn: 'Tu turno', ai_plays: 'IA jugando…',
    envido_response: 'Responde al envido', truco_response: 'Responde al truco',
    hand_over: 'Mano terminada', game_over: 'Partida terminada',
  }

  return (
    <GameShell title="Truco" instructions={INSTRUCTIONS} score={playerScore} disableKeyShortcuts>
      <div className="space-y-5">

        {/* Marcador */}
        <section aria-label={`Marcador: tú ${playerScore} puntos, IA ${aiScore} puntos`}>
          <div className="flex gap-6 text-sm">
            <span>Tú: <strong className="text-[#ffd700]">{playerScore}</strong> / {WIN_SCORE}</span>
            <span>IA: <strong className="text-[#888]">{aiScore}</strong> / {WIN_SCORE}</span>
            <span>Bazas: <strong>{pw}</strong> - <strong>{aw}</strong></span>
            <span className="text-[#555] text-xs">{phaseLabel[phase]}</span>
          </div>
          {(trucoAccepted || trucoLevel > 0) && (
            <p className="text-xs text-[#ffd700] mt-1">
              {TRUCO_NAMES[trucoLevel]}{trucoAccepted ? ` aceptado — ${TRUCO_WIN_PTS[trucoLevel]} pts en juego` : ' (pendiente respuesta)'}
            </p>
          )}
        </section>

        {/* Mano de la IA */}
        <section aria-label={`Mano de la IA: ${aiHand.length} cartas ocultas`}>
          <p className="text-[#888] text-xs mb-2">IA — {aiHand.length} carta{aiHand.length !== 1 ? 's' : ''}</p>
          <div className="flex gap-1">
            {aiHand.map((_, i) => <CardVisual key={i} hidden />)}
          </div>
          {lastAiCard && (
            <p className="text-[#888] text-xs mt-1" aria-live="polite">Última carta: {cardLabel(lastAiCard)}</p>
          )}
        </section>

        {/* Bazas jugadas */}
        {tricks.length > 0 && (
          <section aria-label={`Resultado de bazas: ${tricks.map((t, i) => `baza ${i + 1}: ${t === 'player' ? 'tuya' : t === 'ai' ? 'de la IA' : 'empate'}`).join(', ')}`}>
            <p className="text-[#888] text-xs mb-1">Bazas jugadas</p>
            <div className="flex gap-2">
              {tricks.map((t, i) => (
                <div key={i} className={`px-2 py-1 rounded text-xs font-bold ${t === 'player' ? 'bg-[#22c55e]/20 text-[#22c55e]' : t === 'ai' ? 'bg-[#ef4444]/20 text-[#ef4444]' : 'bg-[#555]/20 text-[#888]'}`}>
                  {t === 'player' ? '✓' : t === 'ai' ? '✗' : '~'}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tu mano */}
        <section aria-label={`Tu mano: ${playerHand.map(cardLabel).join(', ')}`}>
          <p className="text-[#888] text-xs mb-2">Tu mano</p>
          <div className="flex gap-2">
            {playerHand.map((card, i) => (
              <button
                key={card.id}
                onClick={() => isPlaying ? playCard(i) : undefined}
                disabled={!isPlaying}
                aria-label={`${i + 1}: ${cardLabel(card)}${isPlaying ? ' — pulsa para jugar' : ''}`}
                className="focus:outline-none focus:ring-2 focus:ring-[#ffd700] rounded disabled:cursor-default"
              >
                <CardVisual card={card} />
              </button>
            ))}
          </div>
          {envidoAvail && !envidoDone && (
            <p className="text-xs text-[#888] mt-2">Envido disponible (E)</p>
          )}
        </section>

        {/* Resultado de la mano */}
        {(phase === 'hand_over' || phase === 'game_over') && handResult && (
          <div role="status" className={`text-lg font-bold ${handResult.startsWith('+') ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
            {handResult}
          </div>
        )}

        {/* Acciones: turno jugador */}
        {isPlaying && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Acciones de juego">
            {playerHand.map((card, i) => (
              <Button key={card.id} onClick={() => playCard(i)} aria-label={`Jugar ${cardLabel(card)} (tecla ${i + 1})`}>
                {i + 1} — {RANK_NAME[card.rank]} {SUIT_ABBR[card.suit]}
              </Button>
            ))}
            {envidoAvail && !envidoDone && (
              <Button variant="secondary" onClick={playerCallEnvido} aria-label={`Cantar ${ENVIDO_NAMES[Math.min(envidoLevel + 1, 3)]} (tecla E)`}>
                E — {ENVIDO_NAMES[Math.min(envidoLevel + 1, 3)]}
              </Button>
            )}
            <Button variant="secondary" onClick={playerCallTruco} aria-label={`Cantar ${TRUCO_NAMES[Math.min(trucoLevel + 1, 3)]} (tecla T)`} disabled={trucoLevel >= 3}>
              T — {TRUCO_NAMES[Math.min(trucoLevel + 1, 3)]}
            </Button>
          </div>
        )}

        {/* Responder envido */}
        {phase === 'envido_response' && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Respuesta al envido">
            <Button onClick={() => respondEnvido('accept')} aria-label="Aceptar envido (tecla S)">S — Quiero</Button>
            <Button variant="secondary" onClick={() => respondEnvido('reject')} aria-label="Rechazar envido (tecla N)">N — No quiero</Button>
            {envidoLevel < 3 && (
              <Button variant="secondary" onClick={() => respondEnvido('raise')} aria-label={`Subir a ${ENVIDO_NAMES[envidoLevel + 1]} (tecla E)`}>
                E — {ENVIDO_NAMES[envidoLevel + 1]}
              </Button>
            )}
          </div>
        )}

        {/* Responder truco */}
        {phase === 'truco_response' && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Respuesta al truco">
            <Button onClick={() => respondTruco('accept')} aria-label="Aceptar truco (tecla S)">S — Quiero</Button>
            <Button variant="secondary" onClick={() => respondTruco('reject')} aria-label="Rechazar truco (tecla N)">N — No quiero</Button>
            {trucoLevel < 3 && (
              <Button variant="secondary" onClick={() => respondTruco('raise')} aria-label={`Subir a ${TRUCO_NAMES[trucoLevel + 1]} (tecla T)`}>
                T — {TRUCO_NAMES[trucoLevel + 1]}
              </Button>
            )}
          </div>
        )}

        {/* Fin de mano / partida */}
        {(phase === 'hand_over' || phase === 'game_over') && (
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              onClick={() => {
                if (phase === 'game_over') { setPlayerScore(0); setAiScore(0); startHand(0, 0, true) }
                else startHand(playerScore, aiScore, !playerIsMano)
              }}
              aria-label={phase === 'game_over' ? 'Nueva partida (tecla N)' : 'Nueva mano (tecla N)'}
            >
              N — {phase === 'game_over' ? 'Nueva partida' : 'Nueva mano'}
            </Button>
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
          I: estado · E: Envido · T: Truco · S: aceptar · N: rechazar/nueva mano · 1/2/3: jugar carta
        </p>
      </div>
    </GameShell>
  )
}
