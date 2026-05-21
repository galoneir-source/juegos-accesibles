'use client'

import { useEffect, useRef, useState } from 'react'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ─── Types & constants ────────────────────────────────────────────────────────

type Sym = 'cereza' | 'limón' | 'naranja' | 'campana' | 'siete'
type Phase = 'start' | 'idle' | 'spinning' | 'gameover'

const SYMS: Sym[] = ['cereza', 'limón', 'naranja', 'campana', 'siete']
const WEIGHTS = [5, 4, 3, 2, 1] // frecuencia relativa por rodillo (total = 15)

const LABEL: Record<Sym, string> = {
  cereza: 'Cereza', limón: 'Limón', naranja: 'Naranja', campana: 'Campana', siete: 'Siete',
}
const COLOR: Record<Sym, string> = {
  cereza: '#ff5555', limón: '#ffee44', naranja: '#ff8833', campana: '#ffd700', siete: '#cc44ff',
}
// Premio por tres iguales. Dos cerezas = 10 (caso especial).
const WIN3: Record<Sym, number> = {
  cereza: 25, limón: 40, naranja: 60, campana: 100, siete: 250,
}

const BET = 5
const START_CREDITS = 100
const W = 480, H = 280

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickSym(): Sym {
  const total = WEIGHTS.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < SYMS.length; i++) {
    r -= WEIGHTS[i]
    if (r <= 0) return SYMS[i]
  }
  return SYMS[SYMS.length - 1]
}

function evalWin(r: [Sym, Sym, Sym]): { amount: number; desc: string } {
  if (r[0] === r[1] && r[1] === r[2]) {
    const a = WIN3[r[0]]
    return { amount: a, desc: `¡Tres ${LABEL[r[0]]}! +${a} créditos.` }
  }
  const nc = r.filter(s => s === 'cereza').length
  if (nc >= 2) return { amount: 10, desc: 'Dos cerezas. +10 créditos.' }
  return { amount: 0, desc: 'Sin premio.' }
}

// ─── Canvas draw ──────────────────────────────────────────────────────────────

const REEL_X = [30, 180, 330]
const REEL_Y = 50
const RW = 120, RH = 160

function drawCanvas(
  canvas: HTMLCanvasElement,
  syms: [Sym, Sym, Sym],
  held: [boolean, boolean, boolean],
  winAmount: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, W, H)

  // Pay line
  ctx.fillStyle = winAmount > 0 ? '#ffd70044' : '#1a1a1a'
  ctx.fillRect(0, REEL_Y + RH / 2 - 22, W, 44)
  ctx.strokeStyle = winAmount > 0 ? '#ffd700' : '#333'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, REEL_Y + RH / 2 - 22)
  ctx.lineTo(W, REEL_Y + RH / 2 - 22)
  ctx.moveTo(0, REEL_Y + RH / 2 + 22)
  ctx.lineTo(W, REEL_Y + RH / 2 + 22)
  ctx.stroke()

  for (let i = 0; i < 3; i++) {
    const x = REEL_X[i]
    const sym = syms[i]
    const isHeld = held[i]

    // Reel background
    ctx.fillStyle = '#181818'
    ctx.fillRect(x, REEL_Y, RW, RH)

    // Border
    ctx.strokeStyle = isHeld ? '#ffd700' : '#2a2a2a'
    ctx.lineWidth = isHeld ? 3 : 1
    ctx.strokeRect(x + 0.5, REEL_Y + 0.5, RW - 1, RH - 1)

    // Symbol text
    ctx.fillStyle = COLOR[sym]
    ctx.font = 'bold 28px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(LABEL[sym].toUpperCase(), x + RW / 2, REEL_Y + RH / 2)

    // Reel number
    ctx.fillStyle = '#444'
    ctx.font = '11px sans-serif'
    ctx.fillText(`[${i + 1}]`, x + RW / 2, REEL_Y + 14)

    // Hold label
    if (isHeld) {
      ctx.fillStyle = '#ffd700'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('HOLD', x + RW / 2, REEL_Y + RH - 12)
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Tragaperras() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const assertRef = useRef<HTMLDivElement>(null)
  const politeRef = useRef<HTMLDivElement>(null)

  const [phase, setPhase] = useState<Phase>('start')
  const phaseRef = useRef<Phase>('start')
  const [credits, setCredits] = useState(START_CREDITS)
  const creditsRef = useRef(START_CREDITS)
  const [displaySyms, setDisplaySyms] = useState<[Sym, Sym, Sym]>(['cereza', 'cereza', 'cereza'])
  const displaySymsRef = useRef<[Sym, Sym, Sym]>(['cereza', 'cereza', 'cereza'])
  const [held, setHeld] = useState<[boolean, boolean, boolean]>([false, false, false])
  const heldRef = useRef<[boolean, boolean, boolean]>([false, false, false])
  const [lastResult, setLastResult] = useState('')
  const [lastWinAmt, setLastWinAmt] = useState(0)
  const lastWinAmtRef = useRef(0)
  const spinGen = useRef(0)

  function setPhaseSync(p: Phase) { phaseRef.current = p; setPhase(p) }
  function setCreditsSync(n: number) { creditsRef.current = n; setCredits(n) }
  function setDisplaySync(s: [Sym, Sym, Sym]) { displaySymsRef.current = [...s] as [Sym, Sym, Sym]; setDisplaySyms(s) }
  function setHeldSync(h: [boolean, boolean, boolean]) { heldRef.current = [...h] as [boolean, boolean, boolean]; setHeld(h) }

  function assertive(msg: string) {
    if (!assertRef.current) return
    assertRef.current.textContent = ''
    requestAnimationFrame(() => { if (assertRef.current) assertRef.current.textContent = msg })
  }
  function polite(msg: string) {
    if (!politeRef.current) return
    politeRef.current.textContent = ''
    requestAnimationFrame(() => { if (politeRef.current) politeRef.current.textContent = msg })
  }

  function redraw(syms: [Sym, Sym, Sym], h: [boolean, boolean, boolean], winAmt: number) {
    const canvas = canvasRef.current
    if (canvas) drawCanvas(canvas, syms, h, winAmt)
  }

  function doSpin() {
    if (phaseRef.current !== 'idle') return
    if (creditsRef.current < BET) {
      assertive('Créditos insuficientes para girar.')
      return
    }

    setCreditsSync(creditsRef.current - BET)
    setPhaseSync('spinning')
    setLastWinAmt(0)
    lastWinAmtRef.current = 0

    const h = [...heldRef.current] as [boolean, boolean, boolean]
    const cur = displaySymsRef.current

    // Determine final symbols
    const results: [Sym, Sym, Sym] = [
      h[0] ? cur[0] : pickSym(),
      h[1] ? cur[1] : pickSym(),
      h[2] ? cur[2] : pickSym(),
    ]

    setHeldSync([false, false, false])
    audio.slotSpin()

    const gen = ++spinGen.current
    let frame = 0

    const timer = setInterval(() => {
      if (spinGen.current !== gen) { clearInterval(timer); return }
      frame++

      const cur2 = displaySymsRef.current
      const next: [Sym, Sym, Sym] = [cur2[0], cur2[1], cur2[2]]

      // Randomize spinning reels
      if (!h[0] && frame < 8)  next[0] = SYMS[Math.floor(Math.random() * SYMS.length)]
      if (!h[1] && frame < 10) next[1] = SYMS[Math.floor(Math.random() * SYMS.length)]
      if (!h[2] && frame < 12) next[2] = SYMS[Math.floor(Math.random() * SYMS.length)]

      // Lock stopped reels to final value
      if (!h[0] && frame >= 8)  next[0] = results[0]
      if (!h[1] && frame >= 10) next[1] = results[1]
      if (!h[2] && frame >= 12) next[2] = results[2]

      setDisplaySync(next)
      redraw(next, [false, false, false], 0)

      if (frame === 8  && !h[0]) { audio.slotStop(-0.7); polite(`Rodillo 1: ${LABEL[results[0]]}`) }
      if (frame === 10 && !h[1]) { audio.slotStop(0);    polite(`Rodillo 2: ${LABEL[results[1]]}`) }

      if (frame === 12) {
        clearInterval(timer)
        if (!h[2]) { audio.slotStop(0.7); polite(`Rodillo 3: ${LABEL[results[2]]}`) }
        setTimeout(() => resolveWin(results), h[2] ? 50 : 250)
      }
    }, 100)
  }

  function resolveWin(results: [Sym, Sym, Sym]) {
    const { amount, desc } = evalWin(results)
    const newCredits = creditsRef.current + amount
    setCreditsSync(newCredits)
    setLastResult(desc)
    setLastWinAmt(amount)
    lastWinAmtRef.current = amount
    redraw(results, [false, false, false], amount)

    if (amount >= 100)      audio.slotWinBig()
    else if (amount >= 25)  audio.slotWinMedium()
    else if (amount > 0)    audio.slotWinSmall()
    else                    audio.slotLose()

    assertive(`${desc} Créditos: ${newCredits}.`)

    if (newCredits <= 0) {
      setTimeout(() => {
        audio.slotGameOver()
        assertive('Sin créditos. Fin de la partida.')
        saveScore('tragaperras', 0)
        setPhaseSync('gameover')
      }, 900)
    } else {
      setPhaseSync('idle')
    }
  }

  function toggleHold(i: 0 | 1 | 2) {
    if (phaseRef.current !== 'idle') return
    const h = [...heldRef.current] as [boolean, boolean, boolean]
    h[i] = !h[i]
    setHeldSync(h)
    redraw(displaySymsRef.current, h, lastWinAmtRef.current)
    audio.slotHold()
    assertive(`Rodillo ${i + 1} ${h[i] ? 'retenido' : 'liberado'}.`)
  }

  function doQuit() {
    if (phaseRef.current !== 'idle') return
    saveScore('tragaperras', creditsRef.current)
    assertive(`Partida terminada. Puntuación: ${creditsRef.current} créditos.`)
    setPhaseSync('gameover')
  }

  function startGame() {
    setCreditsSync(START_CREDITS)
    setHeldSync([false, false, false])
    setDisplaySync(['cereza', 'cereza', 'cereza'])
    setLastResult('')
    setLastWinAmt(0)
    lastWinAmtRef.current = 0
    setPhaseSync('idle')
    setTimeout(() => {
      redraw(['cereza', 'cereza', 'cereza'], [false, false, false], 0)
      canvasRef.current?.focus()
      polite(`Tragaperras. ${START_CREDITS} créditos. Espacio para girar. Teclas 1, 2, 3 para retener rodillos. Q para salir.`)
    }, 50)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ph = phaseRef.current
      if (ph === 'start' || ph === 'gameover') {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame() }
        return
      }
      if (ph === 'spinning') return

      switch (e.key) {
        case ' ': e.preventDefault(); doSpin(); break
        case '1': toggleHold(0); break
        case '2': toggleHold(1); break
        case '3': toggleHold(2); break
        case 'q': case 'Q': doQuit(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const showGame = phase === 'idle' || phase === 'spinning'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4 gap-6">
      <div ref={assertRef} role="status" aria-live="assertive" aria-atomic="true" className="sr-only" />
      <div ref={politeRef} role="status" aria-live="polite"    aria-atomic="true" className="sr-only" />

      <h1 className="text-2xl font-bold text-[#ffd700]">Tragaperras</h1>

      {phase === 'start' && (
        <div className="text-center space-y-4 max-w-md">
          <p className="text-[#aaa]">
            Haz girar los 3 rodillos y consigue tres símbolos iguales en la línea central. Apuesta: {BET} créditos por tirada.
          </p>
          <p className="text-[#666] text-sm leading-relaxed">
            Espacio: girar · 1 / 2 / 3: retener rodillo antes de girar · Q: salir y guardar puntuación
          </p>
          <div className="border border-[#333] rounded p-3 text-sm text-[#888] space-y-1">
            <p className="text-[#aaa] font-bold mb-2">Tabla de premios</p>
            <p>Dos cerezas: 10 cr. &nbsp;·&nbsp; Tres cerezas: 25 cr.</p>
            <p>Tres limones: 40 cr. &nbsp;·&nbsp; Tres naranjas: 60 cr.</p>
            <p>Tres campanas: 100 cr. &nbsp;·&nbsp; Tres sietes: 250 cr.</p>
          </div>
          <button
            className="px-6 py-3 bg-[#ffd700] text-black font-bold rounded hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffd700] focus:ring-offset-2 focus:ring-offset-black"
            onClick={startGame}
            autoFocus
          >
            Empezar (Enter)
          </button>
        </div>
      )}

      {showGame && (
        <div className="flex flex-col items-center gap-4">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            aria-hidden="true"
            tabIndex={-1}
            className="border border-[#333] rounded"
            style={{ maxWidth: '100%' }}
          />

          <div className="flex gap-8 text-center min-w-[300px]">
            <div>
              <p className="text-[#888] text-xs uppercase tracking-wider">Créditos</p>
              <p className="text-3xl font-bold text-[#ffd700]">{credits}</p>
            </div>
            <div>
              <p className="text-[#888] text-xs uppercase tracking-wider">Apuesta</p>
              <p className="text-3xl font-bold">{BET}</p>
            </div>
            <div>
              <p className="text-[#888] text-xs uppercase tracking-wider">Último</p>
              <p className={`text-sm mt-1 ${lastWinAmt > 0 ? 'text-[#4CAF50]' : 'text-[#666]'}`}>
                {lastResult || '—'}
              </p>
            </div>
          </div>

          <p className="text-[#555] text-xs">
            Espacio: girar · 1/2/3: retener rodillo · Q: salir
          </p>
        </div>
      )}

      {phase === 'gameover' && (
        <div className="text-center space-y-4">
          <p className="text-xl text-[#ffd700]">Partida terminada</p>
          <p className="text-3xl font-bold">{credits} créditos</p>
          <p className="text-[#888] text-sm">(puntuación guardada)</p>
          <button
            className="px-6 py-3 bg-[#ffd700] text-black font-bold rounded hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffd700] focus:ring-offset-2 focus:ring-offset-black"
            onClick={startGame}
            autoFocus
          >
            Jugar de nuevo (Enter)
          </button>
        </div>
      )}
    </div>
  )
}
