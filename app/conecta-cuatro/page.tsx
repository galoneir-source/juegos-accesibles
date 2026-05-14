'use client'

import { useState, useEffect, useRef } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

const ROWS = 6
const COLS = 7
const AI_DEPTH = 6

type Cell  = 0 | 1 | 2   // 0=vacío, 1=jugador(amarillo), 2=IA(rojo)
type Board = Cell[][]
type Phase = 'idle' | 'playing' | 'won' | 'lost' | 'draw'

const INSTRUCTIONS =
  'Conecta 4. Coloca fichas amarillas para conectar 4 en línea: horizontal, vertical o diagonal. ' +
  'Usa ← → o A/D para elegir columna, Enter o Espacio para soltar la ficha. ' +
  'La IA juega con fichas rojas. Gana quien conecte 4 primero.'

// ── Board helpers ─────────────────────────────────────────────────────────────

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0) as Cell[])
}

function drop(board: Board, col: number, player: Cell): Board | null {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) {
      const b = board.map(row => [...row] as Cell[])
      b[r][col] = player
      return b
    }
  }
  return null
}

function findWin(board: Board, player: Cell): [number, number][] | null {
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]]
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== player) continue
      for (const [dr, dc] of dirs) {
        const cells: [number, number][] = []
        for (let k = 0; k < 4; k++) {
          const nr = r + dr * k, nc = c + dc * k
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break
          cells.push([nr, nc])
        }
        if (cells.length === 4) return cells
      }
    }
  }
  return null
}

function isFull(board: Board): boolean {
  return board[0].every(c => c !== 0)
}

function validCols(board: Board): number[] {
  // Center-first order helps alpha-beta prune faster
  return [3, 2, 4, 1, 5, 0, 6].filter(c => board[0][c] === 0)
}

// ── AI: minimax + alpha-beta ──────────────────────────────────────────────────

function scoreWindow(w: Cell[], p: Cell): number {
  const opp = p === 1 ? 2 : 1
  const pc = w.filter(c => c === p).length
  const oc = w.filter(c => c === opp).length
  const ec = w.filter(c => c === 0).length
  if (pc === 4) return 100
  if (pc === 3 && ec === 1) return 5
  if (pc === 2 && ec === 2) return 2
  if (oc === 3 && ec === 1) return -4
  return 0
}

function heuristic(board: Board, ai: Cell): number {
  let s = board.map(r => r[3]).filter(c => c === ai).length * 3
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c <= COLS - 4; c++)
      s += scoreWindow(board[r].slice(c, c + 4) as Cell[], ai)
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r <= ROWS - 4; r++)
      s += scoreWindow([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]], ai)
  for (let r = 3; r < ROWS; r++)
    for (let c = 0; c <= COLS - 4; c++)
      s += scoreWindow([board[r][c], board[r - 1][c + 1], board[r - 2][c + 2], board[r - 3][c + 3]], ai)
  for (let r = 0; r <= ROWS - 4; r++)
    for (let c = 0; c <= COLS - 4; c++)
      s += scoreWindow([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]], ai)
  return s
}

function minimax(board: Board, depth: number, alpha: number, beta: number, maximizing: boolean, ai: Cell): number {
  const human = ai === 2 ? 1 : 2 as Cell
  const vc = validCols(board)
  if (findWin(board, ai))    return  1_000_000 + depth
  if (findWin(board, human)) return -1_000_000 - depth
  if (!vc.length || depth === 0) return heuristic(board, ai)
  if (maximizing) {
    let v = -Infinity
    for (const c of vc) {
      v = Math.max(v, minimax(drop(board, c, ai)!, depth - 1, alpha, beta, false, ai))
      alpha = Math.max(alpha, v)
      if (alpha >= beta) break
    }
    return v
  } else {
    let v = Infinity
    for (const c of vc) {
      v = Math.min(v, minimax(drop(board, c, human)!, depth - 1, alpha, beta, true, ai))
      beta = Math.min(beta, v)
      if (alpha >= beta) break
    }
    return v
  }
}

function aiMove(board: Board): number {
  const vc = validCols(board)
  let best = -Infinity
  let chosen = vc[0]
  for (const c of vc) {
    const s = minimax(drop(board, c, 2)!, AI_DEPTH - 1, -Infinity, Infinity, false, 2)
    if (s > best) { best = s; chosen = c }
  }
  return chosen
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConectaCuatroPage() {
  const boardRef    = useRef<Board>(emptyBoard())
  const phaseRef    = useRef<Phase>('idle')
  const colRef      = useRef(3)
  const movesRef    = useRef(0)
  const scoreRef    = useRef(0)
  const thinkingRef = useRef(false)

  const [phase,     setPhaseState] = useState<Phase>('idle')
  const [board,     setBoard]      = useState<Board>(emptyBoard())
  const [col,       setCol]        = useState(3)
  const [score,     setScore]      = useState(0)
  const [winCells,  setWinCells]   = useState<[number, number][]>([])
  const [thinking,  setThinking]   = useState(false)
  const [saved,     setSaved]      = useState(false)
  const [saveError, setSaveError]  = useState('')

  function goPhase(p: Phase) { phaseRef.current = p; setPhaseState(p) }

  function moveCol(c: number) {
    colRef.current = c
    setCol(c)
    audio.compass((c / (COLS - 1)) * 2 - 1, 330 + c * 70)
    announcePolite(`Columna ${c + 1}`)
  }

  function startGame() {
    const b = emptyBoard()
    boardRef.current    = b
    colRef.current      = 3
    movesRef.current    = 0
    scoreRef.current    = 0
    thinkingRef.current = false
    setBoard(b)
    setCol(3)
    setScore(0)
    setWinCells([])
    setSaved(false)
    setSaveError('')
    setThinking(false)
    goPhase('playing')
    audio.start()
    announcePolite('¡Empieza! Columna 4 seleccionada. Flechas para mover, Enter para soltar la ficha.')
  }

  function handleDrop() {
    if (phaseRef.current !== 'playing' || thinkingRef.current) return
    const c = colRef.current
    const b = boardRef.current
    if (b[0][c] !== 0) {
      audio.incorrect()
      announceAssertive('Columna llena. Elige otra.')
      return
    }

    // Player drop
    const b1 = drop(b, c, 1)!
    boardRef.current = b1
    movesRef.current++
    setBoard([...b1])
    audio.correct()

    const pw = findWin(b1, 1)
    if (pw) {
      setWinCells(pw)
      const pts = Math.max(50, 300 - movesRef.current * 8)
      scoreRef.current = pts
      setScore(pts)
      goPhase('won')
      audio.start()
      announceAssertive(`¡Has conectado 4! Puntuación: ${pts}.`)
      return
    }
    if (isFull(b1)) {
      goPhase('draw')
      audio.tresDraw()
      announceAssertive('Tablero lleno. ¡Empate!')
      return
    }

    // AI turn (async to allow render)
    thinkingRef.current = true
    setThinking(true)
    setTimeout(() => {
      const aiCol = aiMove(boardRef.current)
      const b2 = drop(boardRef.current, aiCol, 2)!
      boardRef.current = b2
      movesRef.current++
      thinkingRef.current = false
      setBoard([...b2])
      setThinking(false)

      const aw = findWin(b2, 2)
      if (aw) {
        setWinCells(aw)
        scoreRef.current = 0
        setScore(0)
        goPhase('lost')
        audio.gameOver()
        announceAssertive(`La IA conectó 4 en columna ${aiCol + 1}. Has perdido.`)
        return
      }
      if (isFull(b2)) {
        goPhase('draw')
        audio.tresDraw()
        announceAssertive('Empate.')
        return
      }
      audio.click()
      announcePolite(`IA jugó en columna ${aiCol + 1}. Tu turno, columna ${colRef.current + 1}.`)
    }, 30)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phaseRef.current !== 'playing' || thinkingRef.current) return
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') {
        e.preventDefault(); moveCol(Math.max(0, colRef.current - 1))
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault(); moveCol(Math.min(COLS - 1, colRef.current + 1))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); handleDrop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleSaveScore() {
    const result = await saveScore('conecta4', score)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  // ── Cell style ────────────────────────────────────────────────────────────────

  function cellStyle(r: number, c: number): string {
    const v = board[r][c]
    const win = winCells.some(([wr, wc]) => wr === r && wc === c)
    const base = 'w-9 h-9 sm:w-11 sm:h-11 rounded-full transition-colors duration-150'
    if (win && v === 1) return `${base} bg-yellow-300 shadow-[0_0_12px_3px_rgba(253,224,71,0.6)]`
    if (win && v === 2) return `${base} bg-red-400   shadow-[0_0_12px_3px_rgba(248,113,113,0.6)]`
    if (v === 1)        return `${base} bg-yellow-500`
    if (v === 2)        return `${base} bg-red-600`
    return `${base} bg-[#071426]`
  }

  // ── Idle screen ───────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <GameShell title="Conecta 4" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Conecta 4</h2>
          <p className="text-[#888] text-sm max-w-xs mx-auto">
            Tú juegas con fichas amarillas. La IA juega con rojas.
            Conecta 4 en línea antes que ella: horizontal, vertical o diagonal.
          </p>
          <Button size="lg" onClick={startGame}>Nueva partida</Button>
        </div>
      </GameShell>
    )
  }

  // ── End screen ────────────────────────────────────────────────────────────────

  if (phase === 'won' || phase === 'lost' || phase === 'draw') {
    const color = phase === 'won' ? '#22c55e' : phase === 'lost' ? '#ef4444' : '#ffd700'
    const label = phase === 'won' ? '¡Has ganado!' : phase === 'lost' ? 'Has perdido' : '¡Empate!'
    return (
      <GameShell title="Conecta 4" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-5">
          <h2 className="text-2xl font-bold" style={{ color }}>{label}</h2>
          <div
            className="inline-block bg-[#1a3a6a] p-3 rounded-xl"
            aria-label="Tablero final"
            aria-hidden="true"
          >
            {board.map((row, r) => (
              <div key={r} className="flex gap-1.5 mb-1.5">
                {row.map((_, c) => (
                  <div key={c} className={cellStyle(r, c)} />
                ))}
              </div>
            ))}
          </div>
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
          {phase === 'won' && !saved && (
            <>
              <Button onClick={handleSaveScore}>Guardar puntuación</Button>
              {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
            </>
          )}
          {saved && <p role="status" className="text-[#22c55e]">Guardado.</p>}
          <Button variant="secondary" onClick={startGame}>Jugar de nuevo</Button>
        </div>
      </GameShell>
    )
  }

  // ── Playing screen ────────────────────────────────────────────────────────────

  return (
    <GameShell
      title="Conecta 4"
      instructions={INSTRUCTIONS}
      score={score}
      onReread={() => announcePolite(`Columna ${col + 1} de ${COLS}. ${thinking ? 'La IA está pensando.' : 'Tu turno.'}`)}
    >
      <div className="flex flex-col items-center gap-3">

        {/* Column indicators */}
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: COLS }, (_, c) => (
            <div
              key={c}
              className={`w-9 sm:w-11 flex items-center justify-center text-sm font-bold transition-colors rounded-sm select-none ${
                c === col ? 'text-yellow-400' : 'text-[#223]'
              }`}
            >
              {c === col ? '▼' : '·'}
            </div>
          ))}
        </div>

        {/* Board */}
        <div
          role="grid"
          aria-label={`Tablero Conecta 4, ${ROWS} filas por ${COLS} columnas`}
          className="bg-[#1a3a6a] p-3 rounded-xl"
        >
          {board.map((row, r) => (
            <div key={r} role="row" className="flex gap-1.5 mb-1.5">
              {row.map((_, c) => (
                <div
                  key={c}
                  role="gridcell"
                  aria-label={`F${r + 1}C${c + 1}: ${board[r][c] === 0 ? 'vacío' : board[r][c] === 1 ? 'tuya' : 'IA'}`}
                  className={cellStyle(r, c)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Column buttons — click to select & drop */}
        <div className="flex gap-1.5" role="group" aria-label="Seleccionar columna y soltar ficha">
          {Array.from({ length: COLS }, (_, c) => (
            <button
              key={c}
              className={`w-9 sm:w-11 h-8 text-xs rounded font-bold transition-colors ${
                c === col
                  ? 'bg-yellow-500 text-black'
                  : 'bg-[#162030] text-[#556] hover:bg-[#1e3048]'
              }`}
              onClick={() => { moveCol(c); setTimeout(handleDrop, 0) }}
              disabled={thinking}
              aria-label={`Columna ${c + 1}${board[0][c] !== 0 ? ' (llena)' : ''}`}
            >
              {c + 1}
            </button>
          ))}
        </div>

        {/* Status */}
        <div className="h-5 text-center" aria-live="polite">
          {thinking && (
            <p className="text-[#aaa] text-sm animate-pulse">La IA está pensando…</p>
          )}
        </div>

        {/* Nav buttons */}
        <div className="flex gap-3">
          <Button
            size="lg"
            variant="secondary"
            onClick={() => moveCol(Math.max(0, col - 1))}
            disabled={thinking}
          >
            ← Izq
          </Button>
          <Button
            size="lg"
            onClick={handleDrop}
            disabled={thinking}
          >
            ▼ Soltar
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => moveCol(Math.min(COLS - 1, col + 1))}
            disabled={thinking}
          >
            Der →
          </Button>
        </div>

        <p className="text-xs text-[#555]">← → o A/D para mover · Enter o Espacio para soltar</p>
      </div>
    </GameShell>
  )
}
