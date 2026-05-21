'use client'

import { useState, useEffect, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
type Suit = 'Picas' | 'Corazones' | 'Diamantes' | 'Tréboles'
interface Card { rank: Rank; suit: Suit; faceUp: boolean }

const SUITS: Suit[] = ['Picas', 'Corazones', 'Diamantes', 'Tréboles']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUIT_SYM: Record<Suit, string> = { Picas: '♠', Corazones: '♥', Diamantes: '♦', Tréboles: '♣' }
const RED_SUITS = new Set<Suit>(['Corazones', 'Diamantes'])
const RANK_VAL: Record<Rank, number> = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 }
const RANK_NAME: Record<Rank, string> = { A:'As','2':'Dos','3':'Tres','4':'Cuatro','5':'Cinco','6':'Seis','7':'Siete','8':'Ocho','9':'Nueve','10':'Diez',J:'Jota',Q:'Reina',K:'Rey' }
const FOUND_SUIT: Suit[] = ['Picas', 'Corazones', 'Diamantes', 'Tréboles']

type PileId = 'stock' | 'waste' | 'f0' | 'f1' | 'f2' | 'f3' | 'c0' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6'
const ALL_PILES: PileId[] = ['stock','waste','f0','f1','f2','f3','c0','c1','c2','c3','c4','c5','c6']
const FOUND_IDS: PileId[] = ['f0','f1','f2','f3']

interface GameState {
  stock: Card[]
  waste: Card[]
  foundations: [Card[], Card[], Card[], Card[]]
  tableau: [Card[], Card[], Card[], Card[], Card[], Card[], Card[]]
  score: number
  won: boolean
}

interface Selection { pile: PileId; cardIndex: number }

const INSTRUCTIONS = 'Solitario Klondike. Objetivo: llevar todas las cartas a las cuatro fundaciones, una por palo, de As a Rey. Flechas izquierda y derecha para moverte entre pilas. 1 a 7 para ir directamente a una columna. S para el mazo, W para el descarte, F para ciclar por las fundaciones. Enter o Espacio para seleccionar una pila o colocar la carta seleccionada. Escape cancela la selección. A mueve automáticamente la carta al palo correspondiente. D roba una carta del mazo. R describe la pila actual. N nueva partida. I repite instrucciones. Puntuación: 15 puntos por carta a fundación, 5 puntos por girar carta oculta, 5 puntos por robo a columna.'

function color(s: Suit) { return RED_SUITS.has(s) ? 'rojo' : 'negro' }
function cardLabel(c: Card) {
  return c.faceUp ? `${RANK_NAME[c.rank]} de ${c.suit}` : 'carta boca abajo'
}
function canToFoundation(card: Card, found: Card[], suit: Suit): boolean {
  if (card.suit !== suit) return false
  if (found.length === 0) return card.rank === 'A'
  const top = found[found.length - 1]
  return RANK_VAL[card.rank] === RANK_VAL[top.rank] + 1
}
function canToTableau(card: Card, col: Card[]): boolean {
  if (col.length === 0) return card.rank === 'K'
  const top = col[col.length - 1]
  return top.faceUp && color(card.suit) !== color(top.suit) && RANK_VAL[card.rank] === RANK_VAL[top.rank] - 1
}
function shuffle<T>(a: T[]): T[] {
  const arr = [...a]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
function newGame(): GameState {
  const deck = shuffle(SUITS.flatMap(s => RANKS.map(r => ({ rank: r, suit: s, faceUp: false }))))
  const tableau: Card[][] = []
  let idx = 0
  for (let col = 0; col < 7; col++) {
    const column: Card[] = []
    for (let row = 0; row <= col; row++) column.push({ ...deck[idx++], faceUp: row === col })
    tableau.push(column)
  }
  return {
    stock: deck.slice(idx),
    waste: [],
    foundations: [[], [], [], []],
    tableau: tableau as GameState['tableau'],
    score: 0,
    won: false,
  }
}
function getPile(s: GameState, p: PileId): Card[] {
  if (p === 'stock') return s.stock
  if (p === 'waste') return s.waste
  if (p.startsWith('f')) return s.foundations[parseInt(p[1])]
  return s.tableau[parseInt(p[1])]
}
function selectableIndex(col: Card[]): number {
  if (col.length === 0) return 0
  let start = col.length - 1
  for (let i = col.length - 2; i >= 0; i--) {
    const curr = col[i], next = col[i + 1]
    if (!curr.faceUp || !next.faceUp) break
    if (color(curr.suit) === color(next.suit)) break
    if (RANK_VAL[curr.rank] !== RANK_VAL[next.rank] + 1) break
    start = i
  }
  return start
}
function getSelCards(s: GameState, sel: Selection): Card[] {
  const pile = getPile(s, sel.pile)
  if (sel.pile === 'stock') return []
  if (sel.pile === 'waste' || sel.pile.startsWith('f')) return pile.length > 0 ? [pile[pile.length - 1]] : []
  return pile.slice(sel.cardIndex)
}
function applyMove(state: GameState, sel: Selection, target: PileId): { state: GameState; flipped: boolean; pts: number } | null {
  if (sel.pile === target) return null
  const cards = getSelCards(state, sel)
  if (cards.length === 0) return null

  function removeFrom(): { s: GameState; flipped: boolean } {
    const f = state.foundations.map(a => [...a]) as GameState['foundations']
    const t = state.tableau.map(a => [...a]) as GameState['tableau']
    const s = { ...state, foundations: f, tableau: t }
    if (sel.pile === 'waste') { s.waste = s.waste.slice(0, -1); return { s, flipped: false } }
    if (sel.pile.startsWith('f')) {
      const fi = parseInt(sel.pile[1])
      s.foundations[fi] = s.foundations[fi].slice(0, -1)
      return { s, flipped: false }
    }
    const ci = parseInt(sel.pile[1])
    s.tableau[ci] = s.tableau[ci].slice(0, sel.cardIndex)
    let flipped = false
    if (s.tableau[ci].length > 0 && !s.tableau[ci][s.tableau[ci].length - 1].faceUp) {
      s.tableau[ci] = [...s.tableau[ci]]
      s.tableau[ci][s.tableau[ci].length - 1] = { ...s.tableau[ci][s.tableau[ci].length - 1], faceUp: true }
      flipped = true
    }
    return { s, flipped }
  }

  if (target.startsWith('f')) {
    if (cards.length !== 1) return null
    const fi = parseInt(target[1])
    if (!canToFoundation(cards[0], state.foundations[fi], FOUND_SUIT[fi])) return null
    const { s, flipped } = removeFrom()
    s.foundations[fi] = [...s.foundations[fi], cards[0]]
    const pts = 15 + (flipped ? 5 : 0)
    s.score += pts
    s.won = s.foundations.every(f => f.length === 13)
    return { state: s, flipped, pts }
  }

  const ci = parseInt(target[1])
  if (!canToTableau(cards[0], state.tableau[ci])) return null
  const { s, flipped } = removeFrom()
  s.tableau[ci] = [...s.tableau[ci], ...cards]
  const pts = (sel.pile === 'waste' ? 5 : 0) + (flipped ? 5 : 0)
  s.score += pts
  return { state: s, flipped, pts }
}
function describePile(state: GameState, pile: PileId): string {
  if (pile === 'stock') {
    if (state.stock.length === 0) return 'Mazo vacío. Pulsa Enter para reciclar el descarte.'
    return `Mazo: ${state.stock.length} carta${state.stock.length !== 1 ? 's' : ''}.`
  }
  if (pile === 'waste') {
    if (state.waste.length === 0) return 'Descarte: vacío.'
    const top = state.waste[state.waste.length - 1]
    return `Descarte: ${cardLabel(top)}. ${state.waste.length - 1} debajo.`
  }
  if (pile.startsWith('f')) {
    const fi = parseInt(pile[1])
    const suit = FOUND_SUIT[fi]
    const found = state.foundations[fi]
    if (found.length === 0) return `Fundación ${suit}: vacía.`
    return `Fundación ${suit}: ${RANK_NAME[found[found.length-1].rank]} (${found.length} de 13).`
  }
  const ci = parseInt(pile[1])
  const col = state.tableau[ci]
  if (col.length === 0) return `Columna ${ci+1}: vacía, solo caben Reyes.`
  const top = col[col.length - 1]
  const faceDown = col.filter(c => !c.faceUp).length
  const faceUp = col.length - faceDown
  return `Columna ${ci+1}: ${cardLabel(top)}${faceUp > 1 ? `, más ${faceUp-1} visible${faceUp-1!==1?'s':''}` : ''}${faceDown > 0 ? `, ${faceDown} oculta${faceDown!==1?'s':''}` : ''}.`
}

function CardVis({ card, mini }: { card: Card; mini?: boolean }) {
  const sz = mini ? 'w-8 h-12 text-xs' : 'w-12 h-16 text-sm'
  if (!card.faceUp) return (
    <div aria-hidden="true" className={`${sz} rounded border border-[#444] bg-[#1e1e2e] flex items-center justify-center text-[#555]`}>░</div>
  )
  const red = RED_SUITS.has(card.suit)
  return (
    <div aria-hidden="true" className={`${sz} rounded border bg-[#1a1a1a] flex flex-col items-center justify-center gap-0.5 font-mono ${red ? 'border-[#ef4444] text-[#ef4444]' : 'border-[#d4d4d4] text-[#d4d4d4]'}`}>
      <span className="font-bold leading-none">{card.rank}</span>
      <span className="leading-none">{SUIT_SYM[card.suit]}</span>
    </div>
  )
}

export default function SolitarioPage() {
  const [state, setState] = useState<GameState | null>(null)
  const [focus, setFocus] = useState<PileId>('stock')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  function startGame() {
    setState(newGame())
    setFocus('stock')
    setSelection(null)
    setSaved(false)
    setSaveError('')
    audio.start()
    announcePolite('Nueva partida de Solitario. Siete columnas repartidas. Usa las flechas para moverte entre pilas. I para instrucciones.')
  }

  const readFocus = useCallback(() => {
    if (!state) return
    let desc = describePile(state, focus)
    if (selection) {
      const cards = getSelCards(state, selection)
      const d = cards.length === 1 ? cardLabel(cards[0]) : `${cards.length} cartas: ${cardLabel(cards[0])} hasta ${cardLabel(cards[cards.length-1])}`
      desc += ` Seleccionado: ${d}.`
    }
    announcePolite(desc)
  }, [state, focus, selection])

  const interactWith = useCallback((pileId: PileId) => {
    if (!state) return
    setFocus(pileId)

    // Stock: draw or recycle
    if (pileId === 'stock') {
      if (state.stock.length === 0) {
        if (state.waste.length === 0) { audio.incorrect(); announceAssertive('El mazo y el descarte están vacíos.'); return }
        const newStock = [...state.waste].reverse().map(c => ({ ...c, faceUp: false }))
        audio.deal()
        setState({ ...state, stock: newStock, waste: [] })
        announcePolite(`Mazo reciclado: ${newStock.length} cartas.`)
        return
      }
      const card = { ...state.stock[state.stock.length - 1], faceUp: true }
      audio.deal()
      setState({ ...state, stock: state.stock.slice(0, -1), waste: [...state.waste, card] })
      setFocus('waste')
      announcePolite(`Robas: ${cardLabel(card)}.`)
      return
    }

    // Try to place selection
    if (selection) {
      if (selection.pile === pileId) { setSelection(null); announcePolite('Selección cancelada.'); return }
      const result = applyMove(state, selection, pileId)
      if (!result) {
        audio.incorrect()
        announceAssertive(`Movimiento no válido. ${describePile(state, pileId)}`)
        return
      }
      const cards = getSelCards(state, selection)
      const cardDesc = cards.length === 1 ? cardLabel(cards[0]) : `${cards.length} cartas`
      if (result.flipped) audio.solitarioFlip()
      else audio.deal()
      if (pileId.startsWith('f')) audio.solitarioFoundation()
      setState(result.state)
      setSelection(null)
      let msg = `${cardDesc} a ${describePile(result.state, pileId)}`
      if (result.pts > 0) msg += ` +${result.pts} puntos.`
      if (result.flipped) msg += ' Se gira una carta.'
      if (result.state.won) {
        audio.correct()
        announceAssertive(`¡Enhorabuena! Has ganado el Solitario. Puntuación: ${result.state.score}. Pulsa N para nueva partida.`)
      } else {
        announcePolite(msg)
      }
      return
    }

    // Select pile
    const pile = getPile(state, pileId)
    if (pile.length === 0) { audio.incorrect(); announceAssertive(describePile(state, pileId)); return }

    let cardIndex = pile.length - 1
    if (pileId.startsWith('c')) {
      cardIndex = selectableIndex(pile)
      if (!pile[cardIndex]?.faceUp) { audio.incorrect(); announceAssertive('No hay cartas visibles que mover en esta columna.'); return }
    }

    const sel: Selection = { pile: pileId, cardIndex }
    const cards = getSelCards(state, sel)
    if (cards.length === 0) { audio.incorrect(); announceAssertive(describePile(state, pileId)); return }

    audio.click()
    setSelection(sel)
    const d = cards.length === 1 ? cardLabel(cards[0]) : `${cards.length} cartas: ${cardLabel(cards[0])} hasta ${cardLabel(cards[cards.length-1])}`
    announcePolite(`Seleccionado: ${d}. Navega a otra pila y pulsa Enter para colocar.`)
  }, [state, selection])

  const autoFoundation = useCallback(() => {
    if (!state) return
    const srcPile = selection ? selection.pile : focus
    const pile = getPile(state, srcPile)
    if (pile.length === 0) { audio.incorrect(); return }
    const cardIdx = selection ? selection.cardIndex : (srcPile.startsWith('c') ? selectableIndex(pile) : pile.length - 1)
    const sel = selection ?? { pile: srcPile, cardIndex: cardIdx }
    const cards = getSelCards(state, sel)
    if (cards.length !== 1) { audio.incorrect(); announceAssertive('Solo puedes mover una carta a la fundación de este modo.'); return }
    const fi = FOUND_SUIT.indexOf(cards[0].suit)
    const result = applyMove(state, sel, `f${fi}` as PileId)
    if (!result) { audio.incorrect(); announceAssertive(`Aún no puedes mover ${cardLabel(cards[0])} a la fundación.`); return }
    if (result.flipped) audio.solitarioFlip()
    audio.solitarioFoundation()
    setState(result.state)
    setSelection(null)
    announcePolite(`${cardLabel(cards[0])} a la fundación de ${FOUND_SUIT[fi]}. +${result.pts} puntos.`)
    if (result.state.won) {
      audio.correct()
      announceAssertive(`¡Enhorabuena! Has ganado. Puntuación: ${result.state.score}`)
    }
  }, [state, focus, selection])

  useEffect(() => {
    if (!state) return
    const s = state
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      const k = e.key
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault()
        const idx = ALL_PILES.indexOf(focus)
        const next = k === 'ArrowLeft'
          ? (idx - 1 + ALL_PILES.length) % ALL_PILES.length
          : (idx + 1) % ALL_PILES.length
        const p = ALL_PILES[next]
        setFocus(p)
        announcePolite(describePile(s, p) + (selection ? ' (tienes carta seleccionada)' : ''))
        return
      }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); interactWith(focus); return }
      if (k === 'Escape') { setSelection(null); announcePolite('Selección cancelada.'); return }
      if (k === 'a' || k === 'A') { autoFoundation(); return }
      if (k === 'd' || k === 'D') { interactWith('stock'); return }
      if (k === 'i' || k === 'I') { announcePolite(INSTRUCTIONS); return }
      if (k === 'r' || k === 'R') { readFocus(); return }
      if (k === 'n' || k === 'N') { startGame(); return }
      if (k === 's' || k === 'S') { setFocus('stock'); announcePolite(describePile(s, 'stock')); return }
      if (k === 'w' || k === 'W') { setFocus('waste'); announcePolite(describePile(s, 'waste')); return }
      if (k === 'f' || k === 'F') {
        const curr = FOUND_IDS.indexOf(focus)
        const next = FOUND_IDS[(curr + 1) % FOUND_IDS.length]
        setFocus(next)
        announcePolite(describePile(s, next))
        return
      }
      if (k >= '1' && k <= '7') {
        const p = `c${parseInt(k)-1}` as PileId
        setFocus(p)
        announcePolite(describePile(s, p) + (selection ? ' (tienes carta seleccionada)' : ''))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, focus, selection, interactWith, autoFoundation, readFocus]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!state) return
    const result = await saveScore('solitario', state.score)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  const pileClass = (id: PileId) => {
    const isFocus = focus === id
    const isSel = selection?.pile === id
    return `rounded border p-2 transition-colors text-left ${
      isSel ? 'border-[#22c55e] bg-[#0f2a1a]' :
      isFocus ? 'border-[#ffd700] bg-[#1a1500]' :
      'border-[#333] bg-[#111] hover:border-[#555]'
    }`
  }

  if (!state) return (
    <GameShell title="Solitario" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
      <div className="text-center space-y-6">
        <h2 className="text-xl text-[#ffd700]">Solitario Klondike</h2>
        <p className="text-[#888] text-sm leading-relaxed max-w-md mx-auto">{INSTRUCTIONS}</p>
        <Button size="lg" onClick={startGame}>Comenzar partida</Button>
      </div>
    </GameShell>
  )

  return (
    <GameShell title="Solitario" instructions={INSTRUCTIONS} score={state.score} disableKeyShortcuts>
      <div className="space-y-3">

        {/* Top row: stock, waste, foundations */}
        <div className="flex gap-2 flex-wrap items-start">
          <button className={pileClass('stock')} onClick={() => interactWith('stock')} aria-label={describePile(state, 'stock')}>
            <p className="text-xs text-[#888] mb-1">Mazo</p>
            {state.stock.length > 0
              ? <div aria-hidden="true" className="w-12 h-16 rounded border border-[#444] bg-[#1e1e2e] flex items-center justify-center text-[#888] text-sm font-mono">{state.stock.length}</div>
              : <div aria-hidden="true" className="w-12 h-16 rounded border border-dashed border-[#444] flex items-center justify-center text-[#444] text-xl">↺</div>
            }
          </button>

          <button className={pileClass('waste')} onClick={() => interactWith('waste')} aria-label={describePile(state, 'waste')}>
            <p className="text-xs text-[#888] mb-1">Descarte</p>
            {state.waste.length > 0
              ? <CardVis card={state.waste[state.waste.length - 1]} />
              : <div aria-hidden="true" className="w-12 h-16 rounded border border-dashed border-[#333]" />
            }
          </button>

          <div className="flex-1 min-w-4" />

          {([0,1,2,3] as const).map(fi => {
            const id = `f${fi}` as PileId
            const found = state.foundations[fi]
            const suit = FOUND_SUIT[fi]
            return (
              <button key={id} className={pileClass(id)} onClick={() => interactWith(id)} aria-label={describePile(state, id)}>
                <p className="text-xs text-[#888] mb-1">{SUIT_SYM[suit]}</p>
                {found.length > 0
                  ? <CardVis card={found[found.length - 1]} />
                  : <div aria-hidden="true" className={`w-12 h-16 rounded border border-dashed border-[#333] flex items-center justify-center text-2xl ${RED_SUITS.has(suit) ? 'text-[#7f2222]' : 'text-[#444]'}`}>{SUIT_SYM[suit]}</div>
                }
              </button>
            )
          })}
        </div>

        {/* Tableau */}
        <div className="flex gap-1 items-start overflow-x-auto pb-2">
          {([0,1,2,3,4,5,6] as const).map(ci => {
            const id = `c${ci}` as PileId
            const col = state.tableau[ci]
            const selStart = selection?.pile === id ? selection.cardIndex : -1
            return (
              <button
                key={id}
                className={`${pileClass(id)} flex-1 min-w-[2.5rem] flex flex-col min-h-[10rem]`}
                onClick={() => interactWith(id)}
                aria-label={describePile(state, id)}
              >
                <p className="text-xs text-[#888] mb-1 text-center">{ci+1}</p>
                {col.length === 0
                  ? <div aria-hidden="true" className="mx-auto w-8 h-12 rounded border border-dashed border-[#333] flex items-center justify-center text-[#444] text-xs">K</div>
                  : <div className="flex flex-col" style={{ gap: 0 }}>
                      {col.map((card, i) => (
                        <div
                          key={i}
                          aria-hidden="true"
                          className={i > 0 ? '-mt-8' : ''}
                          style={{ zIndex: i, position: 'relative' }}
                        >
                          <div className={i >= selStart && selStart >= 0 ? 'ring-1 ring-[#22c55e] rounded' : ''}>
                            <CardVis card={card} mini />
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </button>
            )
          })}
        </div>

        {state.won && (
          <div role="status" className="text-xl font-bold text-[#22c55e] text-center py-4">
            ¡Enhorabuena! Has ganado.
            <span className="block text-base text-[#ffd700] mt-1">Puntuación: {state.score}</span>
          </div>
        )}

        <div className="flex gap-3 flex-wrap items-center">
          {state.won && !saved && (
            <>
              <Button onClick={handleSave}>Guardar puntuación</Button>
              {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
            </>
          )}
          {saved && <p role="status" className="text-[#22c55e] text-sm">Guardado.</p>}
          <Button variant="secondary" onClick={startGame}>N — Nueva partida</Button>
        </div>

        {selection && (
          <p role="status" className="text-xs text-[#22c55e]">
            Seleccionado: {(() => { const c = getSelCards(state, selection); return c.length === 1 ? cardLabel(c[0]) : `${c.length} cartas` })()}
            {' '}— navega y pulsa Enter para colocar, Escape para cancelar.
          </p>
        )}

        <p className="text-xs text-[#555]">← →: mover foco · 1-7: columna · S: mazo · W: descarte · F: fundaciones · Enter: seleccionar/colocar · A: auto-fundación · D: robar · Esc: cancelar · R: describir</p>
      </div>
    </GameShell>
  )
}
