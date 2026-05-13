'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ─── Types ────────────────────────────────────────────────────────────────────

type CellState = 'empty' | 'ship' | 'hit' | 'miss' | 'sunk'
type Phase = 'idle' | 'placement' | 'playing' | 'won' | 'lost'

interface ShipDef { name: string; size: number }
interface Ship extends ShipDef { row: number; col: number; horizontal: boolean; hits: number }
interface Board { cells: CellState[][]; ships: Ship[] }

// ─── Constants ────────────────────────────────────────────────────────────────

const COLS = 10
const ROWS = 10
const LETTERS = 'ABCDEFGHIJ'
const PX = 28

const FLEET: ShipDef[] = [
  { name: 'Portaaviones', size: 5 },
  { name: 'Acorazado', size: 4 },
  { name: 'Crucero', size: 3 },
  { name: 'Submarino', size: 3 },
  { name: 'Destructor', size: 2 },
]

const INSTRUCTIONS =
  'Batalla Naval de Audio. Tablero de 10 por 10. Columnas A a J, filas 1 a 10. ' +
  'Fase de colocación: flechas para mover el cursor. R para rotar el barco. Enter para colocar. A para colocación automática. ' +
  'Fase de ataque: flechas para mover el cursor en el tablero enemigo. Enter para disparar. ' +
  'Impacto: sonido de explosión. Fallo: chapoteo. ' +
  'R para releer la celda actual y estado de la flota. H para repetir instrucciones.'

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function emptyBoard(): Board {
  return { cells: Array.from({ length: ROWS }, () => new Array<CellState>(COLS).fill('empty')), ships: [] }
}

function coord(row: number, col: number) { return `${LETTERS[col]}-${row + 1}` }

function shipCells(s: { row: number; col: number; size: number; horizontal: boolean }): Array<[number, number]> {
  return Array.from({ length: s.size }, (_, i) =>
    (s.horizontal ? [s.row, s.col + i] : [s.row + i, s.col]) as [number, number]
  )
}

function canPlace(board: Board, row: number, col: number, size: number, horiz: boolean): boolean {
  return shipCells({ row, col, size, horizontal: horiz }).every(([r, c]) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board.cells[r][c] !== 'empty') return false
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board.cells[nr][nc] === 'ship') return false
      }
    return true
  })
}

function doPlace(board: Board, def: ShipDef, row: number, col: number, horiz: boolean): Board {
  const cells = board.cells.map(r => [...r] as CellState[])
  shipCells({ row, col, size: def.size, horizontal: horiz }).forEach(([r, c]) => { cells[r][c] = 'ship' })
  return { cells, ships: [...board.ships, { ...def, row, col, horizontal: horiz, hits: 0 }] }
}

function autoPlace(): Board {
  let b = emptyBoard()
  for (const def of FLEET) {
    let ok = false, tries = 0
    while (!ok && tries++ < 2000) {
      const h = Math.random() > 0.5
      const r = Math.floor(Math.random() * ROWS)
      const c = Math.floor(Math.random() * COLS)
      if (canPlace(b, r, c, def.size, h)) { b = doPlace(b, def, r, c, h); ok = true }
    }
  }
  return b
}

function doShoot(board: Board, row: number, col: number): { board: Board; hit: boolean; sunk: Ship | null; already: boolean } {
  const cell = board.cells[row][col]
  if (cell === 'hit' || cell === 'miss' || cell === 'sunk') return { board, hit: false, sunk: null, already: true }
  const isHit = cell === 'ship'
  const cells = board.cells.map(r => [...r] as CellState[])
  cells[row][col] = isHit ? 'hit' : 'miss'
  const ships = board.ships.map(s => ({ ...s }))
  let sunk: Ship | null = null
  if (isHit) {
    const idx = ships.findIndex(s => shipCells(s).some(([r, c]) => r === row && c === col))
    if (idx >= 0) {
      ships[idx].hits++
      if (ships[idx].hits >= ships[idx].size) {
        sunk = ships[idx]
        shipCells(sunk).forEach(([r, c]) => { cells[r][c] = 'sunk' })
      }
    }
  }
  return { board: { cells, ships }, hit: isHit, sunk, already: false }
}

function allSunk(board: Board) { return board.ships.every(s => s.hits >= s.size) }

function aiPick(board: Board, pending: Array<[number, number]>): { rc: [number, number]; newPending: Array<[number, number]> } {
  const valid = pending.filter(([r, c]) => { const cell = board.cells[r][c]; return cell === 'empty' || cell === 'ship' })
  if (valid.length > 0) return { rc: valid[0], newPending: valid.slice(1) }
  const avail: Array<[number, number]> = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const cell = board.cells[r][c]
      if (cell === 'empty' || cell === 'ship') avail.push([r, c])
    }
  if (avail.length === 0) return { rc: [0, 0], newPending: [] }
  return { rc: avail[Math.floor(Math.random() * avail.length)], newPending: [] }
}

function adjacent(row: number, col: number, board: Board): Array<[number, number]> {
  return ([[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>)
    .map(([dr, dc]) => [row + dr, col + dc] as [number, number])
    .filter(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS && (board.cells[r][c] === 'empty' || board.cells[r][c] === 'ship'))
}

// ─── Canvas rendering ─────────────────────────────────────────────────────────

const CELL_COLOR: Record<CellState, string> = {
  empty: '#0d0d0d', ship: '#1a4a8c', hit: '#991b1b', miss: '#1a1a1a', sunk: '#450a0a',
}

function drawGrid(
  canvas: HTMLCanvasElement,
  board: Board,
  cursor: [number, number] | null,
  hideShips: boolean,
  preview?: Set<string>,
) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, COLS * PX, ROWS * PX)

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const raw = board.cells[r][c]
      const cell: CellState = hideShips && raw === 'ship' ? 'empty' : raw
      ctx.fillStyle = preview?.has(`${r},${c}`) ? '#133413' : CELL_COLOR[cell]
      ctx.fillRect(c * PX + 1, r * PX + 1, PX - 2, PX - 2)

      if (cell === 'miss') {
        ctx.fillStyle = '#444'
        ctx.beginPath()
        ctx.arc(c * PX + PX / 2, r * PX + PX / 2, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      if (raw === 'hit' || raw === 'sunk') {
        ctx.fillStyle = raw === 'sunk' ? '#f87171' : '#fca5a5'
        ctx.font = `bold ${Math.floor(PX * 0.52)}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('×', c * PX + PX / 2, r * PX + PX / 2 + 1)
      }
    }
  }

  ctx.strokeStyle = '#222'
  ctx.lineWidth = 1
  for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * PX); ctx.lineTo(COLS * PX, r * PX); ctx.stroke() }
  for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * PX, 0); ctx.lineTo(c * PX, ROWS * PX); ctx.stroke() }

  if (cursor) {
    ctx.strokeStyle = '#ffd700'
    ctx.lineWidth = 2.5
    ctx.strokeRect(cursor[1] * PX + 1.5, cursor[0] * PX + 1.5, PX - 3, PX - 3)
  }
}

// ─── State ref ────────────────────────────────────────────────────────────────

interface GState {
  phase: Phase
  playerBoard: Board
  enemyBoard: Board
  cursor: [number, number]
  shipIdx: number
  horizontal: boolean
  aiPending: Array<[number, number]>
  score: number
  playerTurn: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BatallaNavalPage() {
  const [phase, setPhase]             = useState<Phase>('idle')
  const [playerBoard, setPlayerBoard] = useState<Board>(emptyBoard())
  const [enemyBoard, setEnemyBoard]   = useState<Board>(emptyBoard())
  const [cursor, setCursor]           = useState<[number, number]>([0, 0])
  const [shipIdx, setShipIdx]         = useState(0)
  const [horizontal, setHorizontal]   = useState(true)
  const [aiPending, setAiPending]     = useState<Array<[number, number]>>([])
  const [score, setScore]             = useState(0)
  const [saved, setSaved]             = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [playerTurn, setPlayerTurn]   = useState(true)

  const pCanvas = useRef<HTMLCanvasElement>(null)
  const eCanvas = useRef<HTMLCanvasElement>(null)
  const gs = useRef<GState>({
    phase: 'idle', playerBoard: emptyBoard(), enemyBoard: emptyBoard(),
    cursor: [0, 0], shipIdx: 0, horizontal: true, aiPending: [], score: 0, playerTurn: true,
  })

  useEffect(() => {
    gs.current = { phase, playerBoard, enemyBoard, cursor, shipIdx, horizontal, aiPending, score, playerTurn }
  }, [phase, playerBoard, enemyBoard, cursor, shipIdx, horizontal, aiPending, score, playerTurn])

  // Canvas redraws — player board
  useEffect(() => {
    if (!pCanvas.current) return
    let preview: Set<string> | undefined
    if (phase === 'placement' && shipIdx < FLEET.length) {
      const def = FLEET[shipIdx]
      const [r, c] = cursor
      if (canPlace(playerBoard, r, c, def.size, horizontal)) {
        preview = new Set(shipCells({ row: r, col: c, size: def.size, horizontal }).map(([r, c]) => `${r},${c}`))
      }
    }
    drawGrid(pCanvas.current, playerBoard, phase === 'placement' ? cursor : null, false, preview)
  }, [playerBoard, cursor, phase, shipIdx, horizontal])

  // Canvas redraws — enemy board
  useEffect(() => {
    if (!eCanvas.current || phase === 'idle' || phase === 'placement') return
    drawGrid(eCanvas.current, enemyBoard, phase === 'playing' ? cursor : null, true)
  }, [enemyBoard, cursor, phase])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function startPlacement() {
    setPhase('placement')
    setPlayerBoard(emptyBoard())
    setEnemyBoard(emptyBoard())
    setCursor([0, 0])
    setShipIdx(0)
    setHorizontal(true)
    setScore(0)
    setSaved(false)
    setSaveError('')
    setAiPending([])
    setPlayerTurn(true)
    announcePolite(
      `Coloca tus barcos. Barco 1 de ${FLEET.length}: ${FLEET[0].name}, ${FLEET[0].size} celdas. ` +
      'Orientación: horizontal. Cursor en A-1.'
    )
  }

  // ── AI turn ───────────────────────────────────────────────────────────────

  function doAiTurn() {
    const { playerBoard: pb, aiPending: ap } = gs.current
    const { rc: [tr, tc], newPending } = aiPick(pb, ap)
    const { board: newPb, hit, sunk } = doShoot(pb, tr, tc)
    setPlayerBoard(newPb)

    const adjPending = hit && !sunk ? [...newPending, ...adjacent(tr, tc, newPb)] : newPending
    setAiPending(adjPending)

    let msg: string
    if (sunk) {
      audio.navalEnemyHit()
      msg = `¡El enemigo ha hundido tu ${sunk.name} en ${coord(tr, tc)}!`
    } else if (hit) {
      audio.navalEnemyHit()
      msg = `¡El enemigo ha impactado en ${coord(tr, tc)}!`
    } else {
      audio.navalEnemyMiss()
      msg = `El enemigo ha fallado en ${coord(tr, tc)}.`
    }

    if (allSunk(newPb)) {
      setPhase('lost')
      audio.gameOver()
      announceAssertive(msg + ' ¡El enemigo ha hundido toda tu flota! Has perdido.')
    } else {
      announceAssertive(msg + ' Es tu turno.')
      setPlayerTurn(true)
    }
  }

  // ── Player fires ──────────────────────────────────────────────────────────

  function playerFire(row: number, col: number) {
    const { enemyBoard: eb, score: sc, playerTurn: pt } = gs.current
    if (!pt) return

    const { board: newEb, hit, sunk, already } = doShoot(eb, row, col)
    if (already) {
      announcePolite(`${coord(row, col)}: ya disparaste aquí.`)
      return
    }

    setEnemyBoard(newEb)
    setPlayerTurn(false)

    let added = 0
    let msg: string
    if (sunk) {
      audio.navalSink()
      added = 75 * sunk.size + 200
      msg = `¡Hundiste el ${sunk.name}!`
    } else if (hit) {
      audio.navalHit()
      added = 75
      msg = `¡Impacto en ${coord(row, col)}!`
    } else {
      audio.navalMiss()
      msg = `Fallo en ${coord(row, col)}.`
    }

    const newScore = sc + added
    setScore(newScore)

    if (allSunk(newEb)) {
      setPhase('won')
      audio.start()
      announceAssertive(`${msg} ¡Has hundido toda la flota enemiga! Puntuación: ${newScore}.`)
    } else {
      announceAssertive(`${msg} Turno del enemigo.`)
      setTimeout(doAiTurn, 900)
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  const handleKey = useCallback((e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const { phase: ph, cursor: [r, c], shipIdx: si, horizontal: h, playerBoard: pb, playerTurn: pt } = gs.current

    if (e.key === 'h' || e.key === 'H') { announcePolite(INSTRUCTIONS); return }

    if (ph === 'placement') {
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); placeCursor(Math.max(0, r - 1), c, pb, si, h); break
        case 'ArrowDown':  e.preventDefault(); placeCursor(Math.min(ROWS - 1, r + 1), c, pb, si, h); break
        case 'ArrowLeft':  e.preventDefault(); placeCursor(r, Math.max(0, c - 1), pb, si, h); break
        case 'ArrowRight': e.preventDefault(); placeCursor(r, Math.min(COLS - 1, c + 1), pb, si, h); break
        case 'r': case 'R': {
          e.preventDefault()
          const newH = !h
          setHorizontal(newH)
          if (si < FLEET.length) {
            const def = FLEET[si]
            const ok = canPlace(pb, r, c, def.size, newH)
            announcePolite(`${newH ? 'Horizontal' : 'Vertical'}. ${ok ? 'Puede colocar.' : 'Posición inválida.'}`)
          }
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (si >= FLEET.length) break
          const def = FLEET[si]
          if (canPlace(pb, r, c, def.size, h)) {
            const newPb = doPlace(pb, def, r, c, h)
            setPlayerBoard(newPb)
            audio.navalPlace()
            const next = si + 1
            setShipIdx(next)
            if (next >= FLEET.length) {
              const eb = autoPlace()
              setEnemyBoard(eb)
              setPhase('playing')
              setPlayerTurn(true)
              setCursor([0, 0])
              audio.start()
              announceAssertive('¡Flota desplegada! Comienza el combate. Es tu turno. Cursor en A-1.')
            } else {
              announcePolite(`${def.name} colocado. Siguiente: ${FLEET[next].name}, ${FLEET[next].size} celdas.`)
            }
          } else {
            audio.wall()
            announceAssertive('Posición inválida. Elige otra celda.')
          }
          break
        }
        case 'a': case 'A': {
          e.preventDefault()
          const newPb = autoPlace()
          const eb = autoPlace()
          setPlayerBoard(newPb)
          setEnemyBoard(eb)
          setShipIdx(FLEET.length)
          setPhase('playing')
          setPlayerTurn(true)
          setCursor([0, 0])
          audio.start()
          announceAssertive('Colocación automática. ¡Comienza el combate! Es tu turno. Cursor en A-1.')
          break
        }
      }
    } else if (ph === 'playing') {
      const { enemyBoard: eb } = gs.current
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); playCursor(Math.max(0, r - 1), c, eb); break
        case 'ArrowDown':  e.preventDefault(); playCursor(Math.min(ROWS - 1, r + 1), c, eb); break
        case 'ArrowLeft':  e.preventDefault(); playCursor(r, Math.max(0, c - 1), eb); break
        case 'ArrowRight': e.preventDefault(); playCursor(r, Math.min(COLS - 1, c + 1), eb); break
        case 'r': case 'R': {
          e.preventDefault()
          const { playerBoard: pb2 } = gs.current
          const cellState = eb.cells[r][c]
          const statuses: Record<CellState, string> = {
            empty: 'sin disparar', ship: 'sin disparar', hit: 'impacto', miss: 'fallo', sunk: 'hundido',
          }
          const eSunk = eb.ships.filter(s => s.hits >= s.size).length
          const pSunk = pb2.ships.filter(s => s.hits >= s.size).length
          announcePolite(
            `${coord(r, c)}: ${statuses[cellState]}. ` +
            `Enemigo: ${eSunk} de ${FLEET.length} barcos hundidos. ` +
            `Tu flota: ${pSunk} de ${FLEET.length} barcos hundidos.`
          )
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (pt) playerFire(r, c)
          else announcePolite('Espera. Es el turno del enemigo.')
          break
        }
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cursor helpers called from handleKey — all state via gs.current or setters

  function placeCursor(nr: number, nc: number, pb: Board, si: number, h: boolean) {
    setCursor([nr, nc])
    const pan = (nc / (COLS - 1)) * 2 - 1
    audio.compass(pan, 350 + nr * 32, 0.12)
    if (si < FLEET.length) {
      const def = FLEET[si]
      const ok = canPlace(pb, nr, nc, def.size, h)
      announcePolite(`${coord(nr, nc)} — ${ok ? 'puede colocar' : 'inválido'}`)
    } else {
      announcePolite(coord(nr, nc))
    }
  }

  function playCursor(nr: number, nc: number, eb: Board) {
    setCursor([nr, nc])
    const pan = (nc / (COLS - 1)) * 2 - 1
    audio.compass(pan, 350 + nr * 32, 0.12)
    const cell = eb.cells[nr][nc]
    const statuses: Record<CellState, string> = {
      empty: 'sin disparar', ship: 'sin disparar', hit: 'impacto', miss: 'fallo', sunk: 'hundido',
    }
    announcePolite(`${coord(nr, nc)}: ${statuses[cell]}`)
  }

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // ── Score save ────────────────────────────────────────────────────────────

  async function handleSave() {
    const result = await saveScore('batalla-naval', score)
    if (result?.error) {
      setSaveError(result.error)
      announceAssertive(result.error)
    } else {
      setSaved(true)
      announcePolite('Puntuación guardada.')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const CW = COLS * PX
  const CH = ROWS * PX

  if (phase === 'idle') {
    return (
      <GameShell title="Batalla Naval" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Batalla Naval de Audio</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startPlacement} className="w-full">
            Iniciar partida
          </Button>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Batalla Naval" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
        <div className="text-center space-y-6">
          <h2 className="text-2xl font-bold" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Victoria!' : '¡Derrota!'}
          </h2>
          {phase === 'won' && (
            <>
              <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
              {!saved ? (
                <>
                  <Button onClick={handleSave}>Guardar puntuación</Button>
                  {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
                </>
              ) : (
                <p role="status" className="text-[#22c55e]">Guardado.</p>
              )}
            </>
          )}
          {phase === 'lost' && (
            <p className="text-[#888]">El enemigo ha hundido toda tu flota.</p>
          )}
          <Button onClick={startPlacement}>Jugar de nuevo</Button>
        </div>
      </GameShell>
    )
  }

  if (phase === 'placement') {
    const currentShip = FLEET[shipIdx]
    return (
      <GameShell title="Batalla Naval" instructions={INSTRUCTIONS} score={0} disableKeyShortcuts>
        <div className="space-y-4">
          <div className="text-sm text-[#888]">
            Barco {shipIdx + 1} de {FLEET.length}:{' '}
            <strong className="text-white">{currentShip.name}</strong> ({currentShip.size} celdas){' '}
            —{' '}
            <strong className="text-[#ffd700]">{horizontal ? 'Horizontal' : 'Vertical'}</strong>
          </div>

          <canvas
            ref={pCanvas}
            width={CW}
            height={CH}
            aria-hidden="true"
            className="border border-[#333] rounded block"
          />

          <p className="text-xs text-[#555]">
            Flechas: mover &nbsp;|&nbsp; R: rotar &nbsp;|&nbsp; Enter: colocar &nbsp;|&nbsp; A: auto-colocar todo
          </p>

          <ul className="space-y-1 text-sm" aria-label="Estado de la flota">
            {FLEET.map((def, i) => (
              <li key={def.name} className={i < shipIdx ? 'text-[#22c55e]' : i === shipIdx ? 'text-[#ffd700]' : 'text-[#555]'}>
                {i < shipIdx ? '✓' : i === shipIdx ? '▶' : '○'}{' '}
                {def.name} ({def.size} celdas)
              </li>
            ))}
          </ul>
        </div>
      </GameShell>
    )
  }

  // Playing phase
  const eSunk = enemyBoard.ships.filter(s => s.hits >= s.size).length
  const pSunk = playerBoard.ships.filter(s => s.hits >= s.size).length

  return (
    <GameShell title="Batalla Naval" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span>
            {playerTurn
              ? <strong className="text-[#ffd700]">Tu turno</strong>
              : <span className="text-[#888]">Turno del enemigo…</span>}
          </span>
          <span className="text-[#888]">
            Enemigo: <strong className="text-white">{eSunk}/{FLEET.length}</strong> hundidos
            &nbsp;|&nbsp;
            Tú: <strong className="text-white">{pSunk}/{FLEET.length}</strong> hundidos
          </span>
        </div>

        <div className="flex gap-4 flex-wrap">
          <div>
            <p className="text-xs text-[#555] mb-1" aria-hidden="true">Tu flota</p>
            <canvas ref={pCanvas} width={CW} height={CH} aria-hidden="true" className="border border-[#333] rounded block" />
          </div>
          <div>
            <p className="text-xs text-[#555] mb-1" aria-hidden="true">Océano enemigo</p>
            <canvas ref={eCanvas} width={CW} height={CH} aria-hidden="true" className="border border-[#333] rounded block" />
          </div>
        </div>

        <p className="text-xs text-[#555]">
          Flechas: mover cursor &nbsp;|&nbsp; Enter: disparar &nbsp;|&nbsp; R: leer estado &nbsp;|&nbsp; H: instrucciones
        </p>
      </div>
    </GameShell>
  )
}
