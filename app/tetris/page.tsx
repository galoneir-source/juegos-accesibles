'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ── Canvas ────────────────────────────────────────────────────────────────────
const COLS = 10
const ROWS = 20
const CELL = 26
const BOARD_W = COLS * CELL    // 260
const BOARD_H = ROWS * CELL    // 520
const SIDEBAR = 150
const W = BOARD_W + SIDEBAR    // 410
const H = BOARD_H              // 520

// ── Tetrominoes ───────────────────────────────────────────────────────────────
type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

const SHAPES: Record<TetrominoType, number[][]> = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
}

const COLORS: Record<TetrominoType, string> = {
  I: '#00bcd4',
  O: '#ffd700',
  T: '#9c27b0',
  S: '#4caf50',
  Z: '#ef4444',
  J: '#2196f3',
  L: '#ff9800',
}

// Color index order matches PIECES array (1-based for board cells)
const PIECES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

const PIECE_NAMES: Record<TetrominoType, string> = {
  I: 'I barra larga',
  O: 'O cuadrado',
  T: 'T',
  S: 'S',
  Z: 'Z',
  J: 'J',
  L: 'L',
}

const LINE_SCORES = [0, 100, 300, 500, 800]

function dropInterval(level: number): number {
  return Math.max(80, 800 - (level - 1) * 70)
}

type Phase = 'idle' | 'playing' | 'paused' | 'lost'

const INSTRUCTIONS =
  'Tetris. Las piezas caen desde arriba. ' +
  'Flechas izquierda y derecha para mover. Flecha arriba o X para rotar. ' +
  'Flecha abajo para bajar más rápido. Espacio para caída instantánea. ' +
  'Completa líneas horizontales para eliminarlas y sumar puntos. ' +
  'Cada 10 líneas subes de nivel y las piezas caen más rápido. ' +
  'P: pausar. R: leer estado completo. H: repetir instrucciones.'

// ── Pure game logic (outside component) ───────────────────────────────────────

interface Piece {
  type: TetrominoType
  matrix: number[][]
  x: number
  y: number
}

function rotateCW(matrix: number[][]): number[][] {
  const N = matrix.length
  return Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => matrix[N - 1 - j][i])
  )
}

function fits(matrix: number[][], px: number, py: number, board: number[][]): boolean {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue
      const nx = px + c
      const ny = py + r
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false
      if (ny >= 0 && board[ny][nx]) return false
    }
  }
  return true
}

function lockPiece(piece: Piece, board: number[][]): number[][] {
  const b = board.map(r => [...r])
  const idx = PIECES.indexOf(piece.type) + 1
  for (let r = 0; r < piece.matrix.length; r++) {
    for (let c = 0; c < piece.matrix[r].length; c++) {
      if (!piece.matrix[r][c]) continue
      const ny = piece.y + r
      const nx = piece.x + c
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) b[ny][nx] = idx
    }
  }
  return b
}

function clearLines(board: number[][]): { board: number[][]; cleared: number } {
  const kept = board.filter(row => row.some(c => c === 0))
  const cleared = ROWS - kept.length
  const empty = Array.from({ length: cleared }, () => Array(COLS).fill(0))
  return { board: [...empty, ...kept], cleared }
}

function tryRotate(piece: Piece, board: number[][]): Piece | null {
  const rotated = rotateCW(piece.matrix)
  for (const kick of [0, -1, 1, -2, 2]) {
    if (fits(rotated, piece.x + kick, piece.y, board))
      return { ...piece, matrix: rotated, x: piece.x + kick }
  }
  return null
}

function ghostY(piece: Piece, board: number[][]): number {
  let y = piece.y
  while (fits(piece.matrix, piece.x, y + 1, board)) y++
  return y
}

function randomType(): TetrominoType {
  return PIECES[Math.floor(Math.random() * PIECES.length)]
}

function spawnPiece(type: TetrominoType): Piece {
  const matrix = SHAPES[type].map(r => [...r])
  return { type, matrix, x: Math.floor((COLS - matrix[0].length) / 2), y: 0 }
}

function emptyBoard(): number[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TetrisPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [level, setLevel] = useState(1)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const phaseRef = useRef<Phase>('idle')
  const scoreRef = useRef(0)
  const linesRef = useRef(0)
  const levelRef = useRef(1)

  const boardRef    = useRef<number[][]>(emptyBoard())
  const currentRef  = useRef<Piece | null>(null)
  const nextRef     = useRef<TetrominoType>('T')
  const lastDropRef = useRef(0)
  const rafRef      = useRef(0)
  const canvasRef   = useRef<HTMLCanvasElement>(null)

  const syncPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  // Spawn next piece; returns false if board is blocked (game over)
  function spawnNext(): boolean {
    const type  = nextRef.current
    nextRef.current = randomType()
    const piece = spawnPiece(type)
    if (!fits(piece.matrix, piece.x, piece.y, boardRef.current)) return false
    currentRef.current = piece
    announcePolite(`Pieza ${PIECE_NAMES[type]}. Siguiente: ${PIECE_NAMES[nextRef.current]}.`)
    return true
  }

  const tick = useCallback(() => {
    if (phaseRef.current !== 'playing') return

    const now      = performance.now()
    const interval = dropInterval(levelRef.current)

    if (now - lastDropRef.current >= interval) {
      lastDropRef.current = now
      const piece = currentRef.current
      if (!piece) { rafRef.current = requestAnimationFrame(tick); return }

      if (fits(piece.matrix, piece.x, piece.y + 1, boardRef.current)) {
        currentRef.current = { ...piece, y: piece.y + 1 }
      } else {
        // Lock piece
        boardRef.current = lockPiece(piece, boardRef.current)
        const { board: newBoard, cleared } = clearLines(boardRef.current)
        boardRef.current = newBoard

        if (cleared > 0) {
          const pts = LINE_SCORES[cleared] * levelRef.current
          scoreRef.current += pts
          linesRef.current += cleared
          setScore(scoreRef.current)
          setLines(linesRef.current)
          audio.tetrisClear(cleared)
          announceAssertive(
            cleared === 4
              ? `¡Tetris! 4 líneas. +${pts} puntos. Total: ${scoreRef.current}.`
              : `${cleared} ${cleared === 1 ? 'línea' : 'líneas'}. +${pts} puntos.`
          )
          const newLevel = Math.floor(linesRef.current / 10) + 1
          if (newLevel > levelRef.current) {
            levelRef.current = newLevel
            setLevel(newLevel)
            audio.correct()
            announceAssertive(`¡Nivel ${newLevel}!`)
          }
        } else {
          audio.tetrisPlace()
        }

        if (!spawnNext()) {
          syncPhase('lost')
          audio.gameOver()
          announceAssertive(
            `Game over. Puntuación: ${scoreRef.current}. Líneas: ${linesRef.current}. Nivel: ${levelRef.current}.`
          )
          return
        }
      }
    }

    // ── Draw ──────────────────────────────────────────────────────────────────
    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(tick); return }
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    // Board background
    ctx.fillStyle = '#080808'
    ctx.fillRect(0, 0, BOARD_W, BOARD_H)

    // Grid
    ctx.strokeStyle = '#151515'
    ctx.lineWidth = 0.5
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(BOARD_W, r * CELL); ctx.stroke()
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, BOARD_H); ctx.stroke()
    }

    // Locked cells
    const colorList = ['', ...PIECES.map(p => COLORS[p])]
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = boardRef.current[r]?.[c]
        if (!v) continue
        drawCell(ctx, c * CELL, r * CELL, colorList[v])
      }
    }

    const piece = currentRef.current
    if (piece) {
      // Ghost
      const gy = ghostY(piece, boardRef.current)
      ctx.globalAlpha = 0.2
      ctx.fillStyle = COLORS[piece.type]
      for (let r = 0; r < piece.matrix.length; r++) {
        for (let c = 0; c < piece.matrix[r].length; c++) {
          if (!piece.matrix[r][c]) continue
          ctx.fillRect((piece.x + c) * CELL + 1, (gy + r) * CELL + 1, CELL - 2, CELL - 2)
        }
      }
      ctx.globalAlpha = 1

      // Active piece
      for (let r = 0; r < piece.matrix.length; r++) {
        for (let c = 0; c < piece.matrix[r].length; c++) {
          if (!piece.matrix[r][c]) continue
          drawCell(ctx, (piece.x + c) * CELL, (piece.y + r) * CELL, COLORS[piece.type])
        }
      }
    }

    // Sidebar
    const sx = BOARD_W + 12
    ctx.fillStyle = '#444'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    ctx.fillText('SIGUIENTE', sx, 18)
    const nm = SHAPES[nextRef.current]
    ctx.fillStyle = COLORS[nextRef.current]
    for (let r = 0; r < nm.length; r++) {
      for (let c = 0; c < nm[r].length; c++) {
        if (!nm[r][c]) continue
        ctx.fillRect(sx + 8 + c * 22, 26 + r * 22, 20, 20)
      }
    }

    ctx.fillStyle = '#444'
    ctx.fillText('PUNTOS', sx, 130)
    ctx.fillStyle = '#ffd700'
    ctx.font = 'bold 14px monospace'
    ctx.fillText(`${scoreRef.current}`, sx, 148)

    ctx.fillStyle = '#444'
    ctx.font = '10px monospace'
    ctx.fillText('LÍNEAS', sx, 174)
    ctx.fillStyle = '#f0f0f0'
    ctx.font = 'bold 14px monospace'
    ctx.fillText(`${linesRef.current}`, sx, 192)

    ctx.fillStyle = '#444'
    ctx.font = '10px monospace'
    ctx.fillText('NIVEL', sx, 218)
    ctx.fillStyle = '#22c55e'
    ctx.font = 'bold 14px monospace'
    ctx.fillText(`${levelRef.current}`, sx, 236)

    rafRef.current = requestAnimationFrame(tick)
  }, [syncPhase])

  function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.fillStyle = color
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(x + 1, y + 1, CELL - 2, 3)
    ctx.fillRect(x + 1, y + 1, 3, CELL - 2)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(x + 1, y + CELL - 4, CELL - 2, 3)
    ctx.fillRect(x + CELL - 4, y + 1, 3, CELL - 2)
  }

  function startGame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    boardRef.current  = emptyBoard()
    scoreRef.current  = 0
    linesRef.current  = 0
    levelRef.current  = 1
    nextRef.current   = randomType()
    currentRef.current = null
    lastDropRef.current = performance.now()

    setScore(0); setLines(0); setLevel(1)
    setSaved(false); setSaveError('')
    syncPhase('playing')
    audio.start()

    spawnNext()
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // Playing controls
  useEffect(() => {
    if (phase !== 'playing') return

    function onKey(e: KeyboardEvent) {
      const piece = currentRef.current
      const board = boardRef.current

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          if (piece && fits(piece.matrix, piece.x - 1, piece.y, board)) {
            currentRef.current = { ...piece, x: piece.x - 1 }
            audio.tetrisMove()
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (piece && fits(piece.matrix, piece.x + 1, piece.y, board)) {
            currentRef.current = { ...piece, x: piece.x + 1 }
            audio.tetrisMove()
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          if (piece && fits(piece.matrix, piece.x, piece.y + 1, board)) {
            currentRef.current = { ...piece, y: piece.y + 1 }
            lastDropRef.current = performance.now()
          }
          break
        case 'ArrowUp':
        case 'x': case 'X': {
          e.preventDefault()
          if (!piece) break
          const rotated = tryRotate(piece, board)
          if (rotated) { currentRef.current = rotated; audio.tetrisRotate() }
          break
        }
        case ' ': {
          e.preventDefault()
          if (!piece) break
          const gy = ghostY(piece, board)
          currentRef.current = { ...piece, y: gy }
          lastDropRef.current = 0  // trigger lock on next tick
          audio.tetrisDrop()
          break
        }
        case 'p': case 'P':
          e.preventDefault()
          cancelAnimationFrame(rafRef.current)
          syncPhase('paused')
          announcePolite('Pausado. Pulsa P para continuar.')
          break
        case 'r': case 'R': {
          const p = currentRef.current
          announcePolite(
            `Puntos: ${scoreRef.current}. Líneas: ${linesRef.current}. Nivel: ${levelRef.current}. ` +
            (p ? `Pieza: ${PIECE_NAMES[p.type]}, columna ${p.x + 1}. ` : '') +
            `Siguiente: ${PIECE_NAMES[nextRef.current]}.`
          )
          break
        }
        case 'h': case 'H':
          announcePolite(INSTRUCTIONS)
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, syncPhase])

  // Paused controls
  useEffect(() => {
    if (phase !== 'paused') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'p' || e.key === 'P') {
        lastDropRef.current = performance.now()
        syncPhase('playing')
        announcePolite('Reanudado.')
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, syncPhase, tick])

  async function handleSave() {
    const result = await saveScore('tetris', scoreRef.current)
    if (result?.error) {
      setSaveError(result.error); announceAssertive(result.error)
    } else {
      setSaved(true); announcePolite('Puntuación guardada.')
    }
  }

  // ── Idle ──────────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <GameShell title="Tetris" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700]">Tetris</h2>
          <p className="text-[#888] text-sm leading-relaxed">{INSTRUCTIONS}</p>
          <Button size="lg" onClick={startGame} className="w-full">Jugar</Button>
        </div>
      </GameShell>
    )
  }

  // ── Lost ──────────────────────────────────────────────────────────────────────
  if (phase === 'lost') {
    return (
      <GameShell title="Tetris" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl font-bold text-[#ef4444]">Game Over</h2>
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
          <p className="text-[#888]">Líneas: {lines} &nbsp;|&nbsp; Nivel: {level}</p>
          {!saved ? (
            <>
              <Button onClick={handleSave}>Guardar puntuación</Button>
              {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
            </>
          ) : (
            <p role="status" className="text-[#22c55e]">Guardado.</p>
          )}
          <Button onClick={startGame}>Jugar de nuevo</Button>
        </div>
      </GameShell>
    )
  }

  // ── Playing / Paused ─────────────────────────────────────────────────────────
  return (
    <GameShell title="Tetris" instructions={INSTRUCTIONS} score={score} disableKeyShortcuts>
      <div className="space-y-3">
        {phase === 'paused' && (
          <p role="status" className="text-center text-[#ffd700] font-bold tracking-widest">
            — PAUSADO — Pulsa P para continuar
          </p>
        )}
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-hidden="true"
          className="block mx-auto border border-[#333] rounded bg-black"
          style={{ maxWidth: '100%' }}
        />
        <p className="text-xs text-[#555] text-center">
          ← → mover &nbsp;|&nbsp; ↑ / X rotar &nbsp;|&nbsp; ↓ bajar &nbsp;|&nbsp; Espacio caída &nbsp;|&nbsp; P pausa &nbsp;|&nbsp; R estado
        </p>
      </div>
    </GameShell>
  )
}
