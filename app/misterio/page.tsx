'use client'

import { useState, useRef, useEffect } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'
import {
  type SuspectId, type LocationId, type ClueId,
  type GeneratedGame, type GeneratedObject,
  SUSPECT_NAMES, SUSPECT_LOCATIONS, LOCATION_NAMES, KEY_EVIDENCE,
  generateGame,
} from './generator'

type Phase = 'idle' | 'playing' | 'won' | 'lost'
type HistEntry = { type: 'scene' | 'cmd' | 'ok' | 'bad' | 'clue' | 'dialog'; text: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

const LOCATION_ALIASES: Record<string, LocationId> = {
  entrada: 'entrada', hall: 'entrada', recibidor: 'entrada',
  biblioteca: 'biblioteca', library: 'biblioteca', crimen: 'biblioteca',
  salon: 'salon', salón: 'salon',
  cocina: 'cocina', kitchen: 'cocina',
  jardin: 'jardin', jardín: 'jardin', garden: 'jardin',
  despacho: 'despacho', oficina: 'despacho', office: 'despacho',
  habitacion: 'habitacion', habitación: 'habitacion', cuarto: 'habitacion', isabela: 'habitacion',
}

const SUSPECT_ALIASES: Record<string, SuspectId> = {
  victor: 'victor', víctor: 'victor', mayordomo: 'victor', crane: 'victor',
  isabela: 'isabela', sobrina: 'isabela',
  vidal: 'vidal', doctor: 'vidal', dr: 'vidal', médico: 'vidal', medico: 'vidal', marcos: 'vidal',
  clara: 'clara', cocinera: 'clara', mendez: 'clara',
  thomas: 'thomas', jardinero: 'thomas', reed: 'thomas',
}

function matchLocation(term: string): LocationId | null {
  return LOCATION_ALIASES[normalize(term)] ?? null
}

function matchSuspect(term: string): SuspectId | null {
  return SUSPECT_ALIASES[normalize(term)] ?? null
}

function matchObject(term: string, objects: Record<string, GeneratedObject>): string | null {
  const n = normalize(term)
  for (const key of Object.keys(objects)) {
    if (normalize(key).includes(n) || n.includes(normalize(key))) return key
    if (normalize(objects[key].name).includes(n)) return key
  }
  return null
}

const INSTRUCTIONS =
  'Detective: El Caso Blackwood. Lord Blackwood ha muerto envenenado. Cada partida tiene un culpable diferente. ' +
  'Comandos: ir a [lugar] para moverte. Lugares: entrada, biblioteca, salón, cocina, jardín, despacho, habitación. ' +
  'Examinar para ver objetos. Examinar [objeto] para inspeccionar uno. ' +
  'Hablar con [sospechoso] para interrogar. Sospechosos: Víctor, Isabela, Vidal, Clara, Thomas. ' +
  'Pistas para ver tu expediente. Sospechosos para ver quién está dónde. ' +
  'Acusar a [sospechoso] cuando tengas suficiente evidencia. Mirar para releer el lugar actual.'

// ─── Component ────────────────────────────────────────────────────────────────

export default function MisterioPage() {
  const gameRef        = useRef<GeneratedGame | null>(null)
  const locationRef    = useRef<LocationId>('entrada')
  const cluesRef       = useRef<Set<ClueId>>(new Set())
  const scoreRef       = useRef(0)
  const phaseRef       = useRef<Phase>('idle')
  const visitedRef     = useRef<Set<LocationId>>(new Set())
  const suspIdxRef     = useRef<Record<SuspectId, number>>({ victor: 0, isabela: 0, vidal: 0, clara: 0, thomas: 0 })
  const cmdHistRef     = useRef<string[]>([])

  const [phase,     setPhaseState] = useState<Phase>('idle')
  const [location,  setLocation]   = useState<LocationId>('entrada')
  const [clues,     setClues]      = useState<ClueId[]>([])
  const [score,     setScore]      = useState(0)
  const [history,   setHistory]    = useState<HistEntry[]>([])
  const [input,     setInput]      = useState('')
  const [histIdx,   setHistIdx]    = useState(-1)
  const [saved,     setSaved]      = useState(false)
  const [saveError, setSaveError]  = useState('')

  const inputRef  = useRef<HTMLInputElement>(null)
  const historyEl = useRef<HTMLDivElement>(null)

  function goPhase(p: Phase) { phaseRef.current = p; setPhaseState(p) }
  function syncScore(v: number) { scoreRef.current = v; setScore(v) }
  function syncLocation(l: LocationId) { locationRef.current = l; setLocation(l) }

  function addClue(id: ClueId): boolean {
    if (cluesRef.current.has(id)) return false
    cluesRef.current.add(id)
    setClues([...cluesRef.current])
    return true
  }

  function addHist(type: HistEntry['type'], text: string) {
    setHistory(h => [...h, { type, text }])
  }

  useEffect(() => {
    if (historyEl.current) historyEl.current.scrollTop = historyEl.current.scrollHeight
  }, [history])

  // ── Scene description ───────────────────────────────────────────────────────

  function describeLocation(id: LocationId) {
    const game = gameRef.current!
    const loc = game.locations[id]
    const exits = loc.exits.map(e => game.locations[e].name).join(', ')
    const suspects = loc.suspects.map(s => SUSPECT_NAMES[s]).join(', ')
    const suspectsNote = suspects ? ` Aquí está: ${suspects}.` : ''
    const msg = `${loc.name}. ${loc.desc}${suspectsNote} Salidas: ${exits}.`
    addHist('scene', msg)
    announcePolite(msg)
  }

  // ── Command processor ───────────────────────────────────────────────────────

  function processCommand(raw: string) {
    if (phaseRef.current !== 'playing' || !gameRef.current) return
    const game = gameRef.current
    const cmd = normalize(raw)
    addHist('cmd', `> ${raw}`)
    cmdHistRef.current.unshift(raw)
    setHistIdx(-1)

    // mirar
    if (/^(mirar?|look?|l)$/.test(cmd)) {
      describeLocation(locationRef.current); return
    }

    // pistas
    if (/^(pistas?|clues?|expediente|evidencia)$/.test(cmd)) {
      const found = [...cluesRef.current]
      if (found.length === 0) {
        const msg = 'Tu expediente está vacío. Examina la escena e interroga a los sospechosos.'
        addHist('ok', msg); announcePolite(msg); return
      }
      const lines = found.map(c => `• ${game.clues[c].name}: ${game.clues[c].desc}`).join('\n')
      addHist('ok', `Pistas encontradas (${found.length}):\n${lines}`)
      announcePolite(`${found.length} pistas en tu expediente.`)
      return
    }

    // sospechosos
    if (/^(sospechosos?|suspects?|quienes?)$/.test(cmd)) {
      const lines = (Object.keys(SUSPECT_NAMES) as SuspectId[]).map(s =>
        `• ${SUSPECT_NAMES[s]}: ${LOCATION_NAMES[SUSPECT_LOCATIONS[s]]}`
      ).join('\n')
      addHist('ok', `Sospechosos y su ubicación:\n${lines}`)
      announcePolite('Lista de sospechosos en pantalla.')
      return
    }

    // ir a [lugar]
    const goMatch = cmd.match(/^(?:ir(?:\s+a)?|go|mover(?:se)?(?:\s+a)?)\s+(.+)$/)
    if (goMatch) {
      const loc = matchLocation(goMatch[1].trim())
      if (!loc) {
        addHist('bad', `Lugar desconocido. Lugares: ${Object.values(LOCATION_NAMES).join(', ')}.`)
        audio.incorrect(); return
      }
      if (loc === locationRef.current) {
        addHist('bad', `Ya estás en ${LOCATION_NAMES[loc]}.`); return
      }
      if (!game.locations[locationRef.current].exits.includes(loc)) {
        addHist('bad', `No puedes ir a ${LOCATION_NAMES[loc]} directamente desde aquí.`)
        audio.incorrect(); return
      }
      if (!visitedRef.current.has(loc)) { visitedRef.current.add(loc); syncScore(scoreRef.current + 5) }
      syncLocation(loc)
      describeLocation(loc)
      return
    }

    // examinar [objeto]?
    const examMatch = cmd.match(/^(?:examinar?|inspect?|mirar?\s+(?:el?\s+|la\s+)?|ver\s+(?:el?\s+|la\s+)?)(.+)$/)
    const isExamCmd = /^(examinar?|inspeccionar|ver)$/.test(cmd)
    if (examMatch || isExamCmd) {
      const loc = game.locations[locationRef.current]
      const term = examMatch ? examMatch[1].trim() : ''

      if (!term) {
        const objList = Object.values(loc.objects).map(o => o.name).join(', ')
        if (!objList) { addHist('ok', 'No hay nada que examinar aquí.'); return }
        addHist('ok', `Objetos en esta sala: ${objList}.`)
        announcePolite(`Objetos: ${objList}.`)
        return
      }

      const key = matchObject(term, loc.objects)
      if (!key) {
        addHist('bad', `No ves "${term}" aquí. Objetos disponibles: ${Object.values(loc.objects).map(o => o.name).join(', ')}.`)
        audio.incorrect(); return
      }
      const obj = loc.objects[key]
      addHist('ok', `${obj.name}: ${obj.desc}`)
      announcePolite(obj.desc)
      if (obj.clue && addClue(obj.clue)) {
        const clue = game.clues[obj.clue]
        syncScore(scoreRef.current + 15)
        addHist('clue', `¡Nueva pista! ${clue.name}: ${clue.desc}`)
        audio.correct()
        announceAssertive(`Pista encontrada: ${clue.name}.`)
      }
      return
    }

    // hablar con [sospechoso]
    const hablarMatch = cmd.match(/^(?:hablar?(?:\s+con)?|interrogar?(?:\s+a)?|preguntar?(?:\s+a)?)\s+(.+)$/)
    if (hablarMatch) {
      const sid = matchSuspect(hablarMatch[1].trim())
      if (!sid) {
        addHist('bad', 'Sospechoso no reconocido. Sospechosos: Víctor, Isabela, Vidal, Clara, Thomas.')
        audio.incorrect(); return
      }
      if (!game.locations[locationRef.current].suspects.includes(sid)) {
        addHist('bad', `${SUSPECT_NAMES[sid]} no está aquí. Puedes encontrarle en ${LOCATION_NAMES[SUSPECT_LOCATIONS[sid]]}.`)
        audio.incorrect(); return
      }
      const idx = suspIdxRef.current[sid]
      const stmt = game.statements[sid][idx]
      addHist('dialog', `${SUSPECT_NAMES[sid]}: "${stmt.text}"`)
      announcePolite(`${SUSPECT_NAMES[sid]}: ${stmt.text}`)
      audio.click()
      if (stmt.clue && addClue(stmt.clue)) {
        const clue = game.clues[stmt.clue]
        syncScore(scoreRef.current + 15)
        addHist('clue', `¡Nueva pista! ${clue.name}: ${clue.desc}`)
        audio.correct()
        announceAssertive(`Pista: ${clue.name}.`)
      } else {
        syncScore(scoreRef.current + 3)
      }
      suspIdxRef.current[sid] = (idx + 1) % game.statements[sid].length
      return
    }

    // acusar a [sospechoso]
    const acusarMatch = cmd.match(/^(?:acusar?(?:\s+a)?|arresta[r]?(?:\s+a)?|culpable(?:\s+es)?)\s+(.+)$/)
    if (acusarMatch) {
      const sid = matchSuspect(acusarMatch[1].trim())
      if (!sid) {
        addHist('bad', 'Sospechoso no reconocido. Sospechosos: Víctor, Isabela, Vidal, Clara, Thomas.')
        audio.incorrect(); return
      }
      handleAccusation(sid); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir a [lugar], examinar [objeto], hablar con [sospechoso], pistas, acusar a [sospechoso].')
    audio.incorrect()
  }

  // ── Accusation ──────────────────────────────────────────────────────────────

  function handleAccusation(sid: SuspectId) {
    const game = gameRef.current!
    if (sid !== game.culprit) {
      addHist('bad',
        `Has acusado a ${SUSPECT_NAMES[sid]}, que es inocente. El caso se desmorona y el verdadero ` +
        `culpable escapa. Caso sin resolver.`
      )
      audio.gameOver()
      announceAssertive('Acusación incorrecta. Has acusado a un inocente.')
      goPhase('lost')
      return
    }

    const keyFound = KEY_EVIDENCE.filter(c => cluesRef.current.has(c)).length
    const bonus = keyFound >= 7 ? 300 : keyFound >= 5 ? 200 : keyFound >= 3 ? 100 : 50
    syncScore(scoreRef.current + bonus)

    let verdict: string
    if (keyFound >= 7) {
      verdict = '¡Caso resuelto brillantemente! La cadena de evidencias es abrumadora. El acusado confiesa ante el juez.'
    } else if (keyFound >= 5) {
      verdict = 'Caso resuelto. La evidencia apunta sin duda al culpable. Bajo interrogatorio, confiesa.'
    } else if (keyFound >= 3) {
      verdict = 'Acusación correcta, aunque la evidencia era escasa. El jurado la estima suficiente para condenar.'
    } else {
      verdict = 'Acusación correcta, pero la falta de evidencia casi habría dejado al culpable en libertad.'
    }

    addHist('ok', `Has acusado a ${SUSPECT_NAMES[sid]}. ${verdict}`)
    audio.start()
    announceAssertive(`Caso resuelto. Puntuación final: ${scoreRef.current}.`)
    goPhase('won')
  }

  // ── Game lifecycle ──────────────────────────────────────────────────────────

  function startGame() {
    const game = generateGame()
    gameRef.current       = game
    locationRef.current   = 'entrada'
    cluesRef.current      = new Set()
    scoreRef.current      = 0
    phaseRef.current      = 'playing'
    visitedRef.current    = new Set(['entrada'])
    suspIdxRef.current    = { victor: 0, isabela: 0, vidal: 0, clara: 0, thomas: 0 }
    cmdHistRef.current    = []

    setLocation('entrada')
    setClues([])
    setScore(0)
    setSaved(false)
    setSaveError('')
    setHistIdx(-1)
    setInput('')

    const intro =
      'Ha llegado a la mansión Blackwood. Lord Edmund Blackwood, 67 años, ha sido encontrado ' +
      'muerto en su biblioteca esta noche. Causa probable: envenenamiento en bebida. ' +
      'Hay cinco sospechosos: Víctor Crane (mayordomo), Isabela Blackwood (sobrina), ' +
      'Dr. Marcos Vidal (médico), Clara Mendez (cocinera) y Thomas Reed (jardinero despedido). ' +
      game.locations['entrada'].desc + ' Salidas: ' +
      game.locations['entrada'].exits.map(e => game.locations[e].name).join(', ') + '.'

    setHistory([{ type: 'scene', text: intro }])
    goPhase('playing')
    announcePolite(intro)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleSaveScore() {
    const result = await saveScore('misterio', score)
    if (result?.error) { setSaveError(result.error); announceAssertive(result.error) }
    else { setSaved(true); announcePolite('Puntuación guardada.') }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    processCommand(input.trim())
    setInput('')
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(histIdx + 1, cmdHistRef.current.length - 1)
      setHistIdx(next); setInput(cmdHistRef.current[next] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(histIdx - 1, -1)
      setHistIdx(next); setInput(next === -1 ? '' : cmdHistRef.current[next] ?? '')
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const histColors: Record<HistEntry['type'], string> = {
    scene:  'text-[#f0f0f0]',
    cmd:    'text-[#ffd700]',
    ok:     'text-[#22c55e]',
    bad:    'text-[#ef4444]',
    clue:   'text-[#a78bfa]',
    dialog: 'text-[#38bdf8]',
  }

  if (phase === 'idle') {
    return (
      <GameShell title="Detective: El Caso Blackwood" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Detective: El Caso Blackwood</h2>
          <p className="text-[#888] text-sm max-w-md mx-auto">
            Lord Edmund Blackwood ha sido hallado muerto envenenado. Cinco sospechosos.
            El culpable cambia en cada partida.
          </p>
          <p className="text-[#555] text-xs">
            Explora las estancias, interroga a los sospechosos, recoge pistas y acusa al culpable.
          </p>
          <Button size="lg" onClick={startGame}>Iniciar investigación</Button>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    const game = gameRef.current!
    const keyFound = KEY_EVIDENCE.filter(c => clues.includes(c)).length
    return (
      <GameShell title="Detective: El Caso Blackwood" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Caso resuelto!' : 'Caso sin resolver'}
          </h2>
          <p className="text-[#888] text-sm max-w-md mx-auto">
            {phase === 'won' ? game.resolution : `El culpable era ${SUSPECT_NAMES[game.culprit]}. ${game.resolution}`}
          </p>
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación: {score}</p>
          <p className="text-[#555] text-xs">
            Pistas clave encontradas: {keyFound} / {KEY_EVIDENCE.length}
          </p>
          {!saved ? (
            <>
              <Button onClick={handleSaveScore}>Guardar puntuación</Button>
              {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
            </>
          ) : (
            <p role="status" className="text-[#22c55e]">Guardado.</p>
          )}
          <Button variant="secondary" onClick={() => goPhase('idle')}>Nueva investigación</Button>
        </div>
      </GameShell>
    )
  }

  // Playing state
  const game = gameRef.current!
  const currentLoc = game.locations[location]

  return (
    <GameShell
      title="Detective: El Caso Blackwood"
      instructions={INSTRUCTIONS}
      score={score}
      onReread={() => describeLocation(locationRef.current)}
    >
      <div className="flex flex-col h-[62vh]">

        {/* Status bar */}
        <div className="flex items-center justify-between mb-3 text-sm flex-wrap gap-2">
          <span className="text-[#ffd700] font-medium">{currentLoc.name}</span>
          <span className="text-[#a78bfa] text-xs" aria-live="polite">
            {clues.length} pista{clues.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* History terminal */}
        <div
          ref={historyEl}
          className="flex-1 overflow-y-auto border border-[#333] rounded p-4 mb-3 space-y-1.5 font-mono text-sm"
          aria-live="polite"
          aria-label="Registro de la investigación"
          tabIndex={0}
        >
          {history.map((h, i) => (
            <p key={i} className={`${histColors[h.type]} whitespace-pre-wrap`}>{h.text}</p>
          ))}
        </div>

        {/* Quick action buttons */}
        {currentLoc.suspects.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap" role="group" aria-label="Interrogar">
            {currentLoc.suspects.map(s => (
              <Button
                key={s}
                size="sm"
                variant="secondary"
                onClick={() => { processCommand(`hablar con ${SUSPECT_NAMES[s].split(' ')[0]}`); setInput('') }}
              >
                Hablar con {SUSPECT_NAMES[s].split(' ')[0]}
              </Button>
            ))}
          </div>
        )}

        {Object.keys(currentLoc.objects).length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap" role="group" aria-label="Examinar objetos">
            {Object.entries(currentLoc.objects).map(([key, obj]) => (
              <Button
                key={key}
                size="sm"
                variant="secondary"
                onClick={() => { processCommand(`examinar ${key}`); setInput('') }}
              >
                {obj.name}
              </Button>
            ))}
          </div>
        )}

        {/* Command input */}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <label htmlFor="cmd-input" className="sr-only">Ingresa un comando de investigación</label>
          <input
            id="cmd-input"
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="ir a biblioteca, examinar copa, hablar con Clara..."
            className="flex-1 px-4 py-2.5 rounded bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#ffd700]"
            autoComplete="off"
          />
          <Button type="submit">Enviar</Button>
        </form>

        <p className="mt-2 text-xs text-[#555]">
          Flechas ↑↓ para historial · H = instrucciones · R = releer sala
        </p>
      </div>
    </GameShell>
  )
}
