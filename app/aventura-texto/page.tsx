'use client'

import { useState, useRef, useEffect } from 'react'
import GameShell from '@/components/games/GameShell'
import Button from '@/components/ui/Button'
import { announceAssertive, announcePolite } from '@/lib/announce'
import { audio } from '@/lib/audio'
import { saveScore } from '@/app/actions/scores'

// ─── Types ────────────────────────────────────────────────────────────────────

type Direction = 'norte' | 'sur' | 'este' | 'oeste'
type Phase = 'idle' | 'selecting' | 'playing' | 'won' | 'lost'
type CharacterClass = 'guerrero' | 'mago' | 'explorador'

interface ClassDef {
  name: string
  maxHp: number
  dmgBonus: number
  magic: boolean
  scouting: boolean
  desc: string
}

interface ItemDef { id: string; name: string; desc: string }

interface Room {
  description: string
  exits: Partial<Record<Direction, number>>
  lockedExits: Partial<Record<Direction, boolean>>
  event: 'nothing' | 'treasure' | 'trap' | 'enemy' | 'healing' | 'item' | 'boss' | 'narrative'
  cleared: boolean
  trap?: { desc: string; damage: number }
  treasure?: { desc: string; reward: number }
  heal?: { desc: string; amount: number }
  enemy?: { name: string; hp: number; attack: number; reward: number }
  item?: ItemDef
  narrative?: { text: string; reward: number }
}

interface ActiveEnemy {
  name: string; hp: number; maxHp: number; attack: number; reward: number; isBoss: boolean
}

type HistEntry = { type: 'scene' | 'cmd' | 'ok' | 'bad' | 'combat' | 'item' | 'narrative'; text: string }

interface SaveData {
  version: number
  world: Room[]
  roomId: number
  prevId: number | null
  health: number
  score: number
  inventory: string[]
  characterClass: CharacterClass
  magicCooldown: number
}

// ─── Class definitions ────────────────────────────────────────────────────────

const CLASS_DEFS: Record<CharacterClass, ClassDef> = {
  guerrero: {
    name: 'Guerrero',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · La espada duplica el daño contra el Liche',
  },
  mago: {
    name: 'Mago',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Hechizo "magia" en combate (35–60 daño, cada 3 turnos) · 80 de vida',
  },
  explorador: {
    name: 'Explorador',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "explorar" para ver salas adyacentes · +20% en tesoros · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'aventura-texto-v2'
const SAVE_VERSION = 2

function persistSave(data: SaveData) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)) } catch {}
}

function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as SaveData
    return d.version === SAVE_VERSION ? d : null
  } catch { return null }
}

function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY) } catch {}
}

// ─── Static data ──────────────────────────────────────────────────────────────

const ROOM_DESCS = [
  'Cámara oscura con paredes de piedra húmeda. El suelo cruje.',
  'Pasillo estrecho iluminado por antorchas parpadeantes.',
  'Sala circular con columnas rotas y polvo por todas partes.',
  'Cripta con nichos vacíos. El silencio es sepulcral.',
  'Bodega abandonada. Toneles rotos yacen por el suelo.',
  'Salón con un trono derruido en el centro.',
  'Habitación con un pozo seco y antiguas inscripciones en las paredes.',
  'Laboratorio en ruinas. Frascos rotos cubren las mesas.',
  'Sala de guardia vacía. Armaduras oxidadas en las paredes.',
  'Biblioteca derruida. Los libros son ceniza.',
  'Comedor con una larga mesa y cubiertos oxidados.',
  'Capilla profanada. El altar está volcado y las velas apagadas.',
  'Pasaje bajo y sinuoso. Hay que agacharse para avanzar.',
  'Cámara de tortura abandonada. Las cadenas aún cuelgan de las paredes.',
  'Sala con un mosaico brillante en el suelo.',
  'Alcoba con una cama desvencijada y telarañas en el techo.',
  'Corredor con marcas de garras en las paredes de piedra.',
  'Almacén con cajas vacías apiladas hasta el techo.',
  'Sala inundada. El agua llega a los tobillos y huele a podredumbre.',
  'Pasillo derrumbado a medias. Hay que sortear los escombros.',
  'Cuarto de guardias con una mesa volcada y dados esparcidos.',
  'Galería con retratos deteriorados que parecen observarte.',
  'Cámara con un enorme reloj de arena detenido para siempre.',
  'Pasaje secreto detrás de una librería giratoria.',
  'Galería de estatuas. Las figuras de piedra te observan con ojos vacíos.',
  'Sala de mapas. Los pergaminos están demasiado deteriorados para leer.',
  'Bodega subterránea con barriles de vino añejo.',
  'Cámara de meditación. Círculos mágicos grabados en el suelo.',
  'Pasillo de columnas. La piedra está cubierta de musgo húmedo.',
  'Cueva natural convertida en celda. Las rejas están oxidadas.',
  'Sala del eco. Cada sonido reverbera durante largos segundos.',
  'Bóveda sellada. Alguien la forzó hace mucho tiempo.',
  'Corredor inundado. El agua llega a las rodillas.',
  'Sala de armas abandonada. La mayoría son inútiles por el óxido.',
  'Cámara con un enorme espejo que refleja una imagen distorsionada.',
  'Pasaje que huele a azufre. Las paredes están ennegrecidas.',
  'Habitación con suelo de cristal. Bajo él se ven huesos antiguos.',
  'Sala circular con un pozo en el centro. El fondo no se ve.',
  'Alcoba de guardia. Restos de una comida que lleva siglos ahí.',
  'Corredor en zigzag. Las antorchas extintas dejan sólo oscuridad.',
  'Cámara de rituales. Pentagramas grabados en las paredes.',
  'Sala con un órgano de tubos oxidados y silencioso.',
  'Pasillo de los lamentos. Un viento frío trae ecos de voces.',
  'Cámara de los cofres. Todos están vacíos y abiertos.',
  'Sala del banquete maldito. Las sillas están volcadas.',
  'Corredor con una trampa visible en el suelo. Ya fue desactivada.',
  'Sala de observación. Una grieta deja pasar un rayo de luna.',
  'Antecámara antigua. Símbolos de advertencia cubren las paredes.',
]

const BOSS_ROOM_DESC =
  'Cámara del trono. Un altar de huesos ocupa el centro. Un frío sobrenatural impregna el aire.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Encuentras a un soldado moribundo recostado contra la pared. Con voz ronca te dice: ' +
      '"Has venido a matar al Liche. Hace cien años el reino lo desterró aquí, pero ha recuperado su poder. ' +
      'Busca el altar de huesos en la sala del trono... El Orbe de Luz es tu única esperanza." ' +
      'El soldado te lanza una bolsa de monedas y cierra los ojos para siempre.',
    reward: 40,
  },
  {
    text:
      'Las paredes están cubiertas de inscripciones en lengua antigua. Descifras: ' +
      '"El Liche Oscuro fue antaño un arconte del reino, corrompido por su sed de inmortalidad. ' +
      'Su punto débil es la luz. Aquellos que empuñan la Espada de Acero le infligen el doble de daño."',
    reward: 25,
  },
  {
    text:
      'Un espíritu etéreo flota ante ti y susurra: ' +
      '"Viajero... el Liche te aguarda en la sala más profunda. ' +
      'Si llevas el Escudo de Madera, su magia oscura se reducirá considerablemente. ' +
      'Ve... y acaba con esta pesadilla." El espíritu desaparece dejando un cálido resplandor.',
    reward: 30,
  },
  {
    text:
      'Las paredes están cubiertas de huesos. Una inscripción en el suelo reza: ' +
      '"Aquí yacen todos los que osaron desafiar al Liche Oscuro desde que el reino cayó. ' +
      'Que tu destino sea diferente." Sientes un frío glacial. La sala del trono está cerca.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Goblin', hp: 30, attack: 12, reward: 20 },
  { name: 'Esqueleto guerrero', hp: 40, attack: 18, reward: 30 },
  { name: 'Murciélago gigante', hp: 20, attack: 8, reward: 15 },
  { name: 'Troll de las cavernas', hp: 70, attack: 28, reward: 50 },
  { name: 'Zombi antiguo', hp: 35, attack: 15, reward: 25 },
  { name: 'Araña venenosa', hp: 25, attack: 20, reward: 35 },
  { name: 'Espectro oscuro', hp: 50, attack: 22, reward: 40 },
  { name: 'Ogro de la cripta', hp: 80, attack: 32, reward: 60 },
  { name: 'Sombra encadenada', hp: 45, attack: 19, reward: 35 },
  { name: 'Vampiro menor', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'El Liche Oscuro', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'El suelo cede. Caes en una trampa oculta.', damage: 20 },
  { desc: 'Una flecha sale de la pared y te alcanza.', damage: 15 },
  { desc: 'Pisas una placa que activa una lluvia de dardos.', damage: 18 },
  { desc: 'Un foso oculto se abre a tus pies. Te agarras al borde con esfuerzo.', damage: 25 },
  { desc: 'Gas venenoso sale de una rejilla en el suelo.', damage: 22 },
  { desc: 'Un bloque de piedra cae del techo rozándote.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Una bolsa llena de monedas de oro.', reward: 30 },
  { desc: 'Un cofre con joyas preciosas.', reward: 50 },
  { desc: 'Un pergamino con una inscripción mágica.', reward: 25 },
  { desc: 'Una estatuilla de valor incalculable.', reward: 40 },
  { desc: 'Una gema brillante del tamaño de un puño.', reward: 45 },
  { desc: 'Un anillo que brilla con luz propia.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Un manantial de agua cristalina. Bebes y te sientes mejor.', amount: 25 },
  { desc: 'Una poción de curación olvidada en un estante.', amount: 35 },
  { desc: 'Un haz de luz mágica te envuelve y sana tus heridas.', amount: 30 },
  { desc: 'Un altar menor con poderes curativos. Te arrodillas ante él.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'espada', name: 'Espada de acero', desc: 'Aumenta tu daño en combate.' },
  { id: 'escudo', name: 'Escudo de madera', desc: 'Reduce el daño recibido en combate.' },
  { id: 'pocion', name: 'Poción de vida', desc: 'Restaura 50 puntos de vida al usarla.' },
]

const ITEM_KEY: ItemDef = { id: 'llave', name: 'Llave oxidada', desc: 'Abre puertas cerradas con llave.' }

const EVENT_LABELS: Partial<Record<Room['event'], string>> = {
  treasure: 'posible tesoro',
  trap: 'peligro',
  enemy: 'presencia hostil',
  healing: 'aura curativa',
  item: 'objeto en el suelo',
  boss: '¡jefe final!',
  narrative: 'punto de interés',
}

const INSTRUCTIONS =
  'Aventura de texto: La Mazmorra. Explora 49 salas, descubre la historia y derrota al Liche Oscuro. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la sala. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar poción para curarte. ' +
  'La espada sube el daño. El escudo reduce el daño recibido. La llave abre puertas. ' +
  'En combate: atacar o huir. No puedes huir del jefe final. ' +
  'Guerrero: más vida y daño. La espada duplica el daño contra el Liche. ' +
  'Mago: escribe magia en combate para un ataque arcano poderoso cada 3 turnos. ' +
  'Explorador: escribe explorar para ver qué hay en las salas adyacentes. ' +
  'La partida se guarda automáticamente. Tecla H repite instrucciones.'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// ─── World generation ─────────────────────────────────────────────────────────

function generateWorld(): Room[] {
  const COLS = 7, N = 49
  const NARRATIVE_IDS = new Set([8, 20, 35, 45])

  const eventPool: Room['event'][] = [
    'nothing', 'nothing', 'nothing', 'nothing', 'nothing', 'nothing',
    'treasure', 'treasure', 'treasure', 'treasure', 'treasure', 'treasure',
    'enemy', 'enemy', 'enemy', 'enemy', 'enemy', 'enemy', 'enemy', 'enemy', 'enemy',
    'trap', 'trap', 'trap', 'trap', 'trap',
    'healing', 'healing', 'healing', 'healing',
    'item', 'item', 'item', 'item',
  ]
  while (eventPool.length < 55) eventPool.push('nothing')
  const evts = [...eventPool].sort(() => Math.random() - 0.5)

  const descs = [...ROOM_DESCS].sort(() => Math.random() - 0.5)

  const validKeyRooms = Array.from({ length: 14 }, (_, i) => i + 1).filter(id => !NARRATIVE_IDS.has(id))
  const keyRoomId = validKeyRooms[Math.floor(Math.random() * validKeyRooms.length)]

  const lockRow1 = 7 + Math.floor(Math.random() * 7)
  const lockRow3 = 21 + Math.floor(Math.random() * 7)

  let evtIdx = 0, narrativeIdx = 0, regularItemIdx = 0

  return Array.from({ length: N }, (_, id): Room => {
    const row = Math.floor(id / COLS)
    const col = id % COLS
    const exits: Partial<Record<Direction, number>> = {}
    const lockedExits: Partial<Record<Direction, boolean>> = {}

    if (row > 0) exits.norte = id - COLS
    if (row < 6) exits.sur   = id + COLS
    if (col > 0) exits.oeste = id - 1
    if (col < 6) exits.este  = id + 1

    if ((id === lockRow1 || id === lockRow3) && exits.sur !== undefined) lockedExits.sur = true

    if (id === 0) return { description: descs[0], exits, lockedExits, event: 'nothing', cleared: true }
    if (id === N - 1) return { description: BOSS_ROOM_DESC, exits, lockedExits, event: 'boss', cleared: false }

    if (NARRATIVE_IDS.has(id)) {
      const narrative = NARRATIVES[narrativeIdx++ % NARRATIVES.length]
      return { description: descs[id % descs.length], exits, lockedExits, event: 'narrative', cleared: false, narrative }
    }

    const event: Room['event'] = id === keyRoomId ? 'item' : evts[evtIdx++ % evts.length]
    const base: Room = { description: descs[id % descs.length], exits, lockedExits, event, cleared: false }

    if (event === 'trap')     base.trap     = pick(TRAP_POOL)
    if (event === 'treasure') base.treasure = pick(TREASURE_POOL)
    if (event === 'healing')  base.heal     = pick(HEAL_POOL)
    if (event === 'enemy')    base.enemy    = { ...pick(ENEMY_POOL) }
    if (event === 'item')     base.item     = id === keyRoomId ? ITEM_KEY : ITEM_REGULAR[regularItemIdx++ % ITEM_REGULAR.length]

    return base
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AventuraTextoPage() {
  const worldRef         = useRef<Room[]>([])
  const roomIdRef        = useRef(0)
  const prevIdRef        = useRef<number | null>(null)
  const healthRef        = useRef(100)
  const maxHpRef         = useRef(100)
  const scoreRef         = useRef(0)
  const inCombat         = useRef(false)
  const enemyRef         = useRef<ActiveEnemy | null>(null)
  const cmdHistRef       = useRef<string[]>([])
  const inventoryRef     = useRef<string[]>([])
  const classRef         = useRef<CharacterClass>('guerrero')
  const magicCdRef       = useRef(0)
  const phaseRef         = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('guerrero')
  const [health,        setHealth]        = useState(100)
  const [maxHp,         setMaxHp]         = useState(100)
  const [score,         setScore]         = useState(0)
  const [enemy,         setEnemy]         = useState<ActiveEnemy | null>(null)
  const [inventory,     setInventory]     = useState<string[]>([])
  const [history,       setHistory]       = useState<HistEntry[]>([])
  const [input,         setInput]         = useState('')
  const [saved,         setSaved]         = useState(false)
  const [saveError,     setSaveError]     = useState('')
  const [histIdx,       setHistIdx]       = useState(-1)
  const [hasSaveData,   setHasSaveData]   = useState(false)
  const [magicCD,       setMagicCD]       = useState(0)

  const inputRef   = useRef<HTMLInputElement>(null)
  const historyEl  = useRef<HTMLDivElement>(null)

  function goPhase(p: Phase) { phaseRef.current = p; setPhaseState(p) }

  useEffect(() => { setHasSaveData(readSave() !== null) }, [])

  useEffect(() => {
    if (historyEl.current) historyEl.current.scrollTop = historyEl.current.scrollHeight
  }, [history])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function addHist(type: HistEntry['type'], text: string) {
    setHistory(h => [...h, { type, text }])
  }

  function syncHealth(v: number) { healthRef.current = v; setHealth(v) }
  function syncScore(v: number)  { scoreRef.current  = v; setScore(v)  }
  function syncMagicCD(v: number) { magicCdRef.current = v; setMagicCD(v) }

  function syncInventory(inv: string[]) { inventoryRef.current = inv; setInventory(inv) }

  function describeRoom(room: Room) {
    const dirs = (Object.keys(room.exits) as Direction[]).map(d =>
      room.lockedExits[d] ? `${d} (cerrada)` : d
    )
    const msg = `${room.description} Salidas: ${dirs.join(', ')}.`
    addHist('scene', msg)
    announcePolite(msg)
  }

  function doAutoSave() {
    if (phaseRef.current !== 'playing' || worldRef.current.length === 0) return
    persistSave({
      version: SAVE_VERSION,
      world: worldRef.current,
      roomId: roomIdRef.current,
      prevId: prevIdRef.current,
      health: healthRef.current,
      score: scoreRef.current,
      inventory: inventoryRef.current,
      characterClass: classRef.current,
      magicCooldown: magicCdRef.current,
    })
  }

  // ── Room entry & events ────────────────────────────────────────────────────

  function enterRoom(id: number) {
    prevIdRef.current = roomIdRef.current
    roomIdRef.current = id
    const room = worldRef.current[id]
    syncScore(scoreRef.current + 5)
    describeRoom(room)
    if (room.cleared) return
    if (room.event !== 'item') room.cleared = true

    switch (room.event) {
      case 'boss': {
        const ae: ActiveEnemy = { ...BOSS_DEF, maxHp: BOSS_DEF.hp, isBoss: true }
        enemyRef.current = ae; inCombat.current = true; setEnemy(ae)
        addHist('combat',
          `El Liche Oscuro se levanta del altar con ojos ardientes. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. Escribe "atacar"${classRef.current === 'mago' ? ' o "magia"' : ''}. No puedes huir.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El Liche Oscuro te ataca.')
        break
      }

      case 'narrative': {
        const n = room.narrative!
        syncScore(scoreRef.current + n.reward)
        addHist('narrative', `${n.text} (+${n.reward} puntos)`)
        announcePolite(n.text)
        break
      }

      case 'trap': {
        const { desc, damage } = room.trap!
        const hp = Math.max(0, healthRef.current - damage)
        syncHealth(hp)
        addHist('bad', `Trampa — ${desc} Pierdes ${damage} de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.incorrect()
        announceAssertive(`Trampa. Pierdes ${damage} de vida. Vida: ${hp}.`)
        if (hp <= 0) {
          addHist('bad', 'Has muerto. Fin de la aventura.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'explorador' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Tesoro — ${desc} +${total} puntos${bonus ? ` (bonus explorador +${bonus})` : ''}.`)
        audio.correct()
        announcePolite(`Tesoro encontrado. +${total} puntos.`)
        break
      }

      case 'healing': {
        const { desc, amount } = room.heal!
        const hp = Math.min(maxHpRef.current, healthRef.current + amount)
        syncHealth(hp)
        addHist('ok', `Curación — ${desc} Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct()
        announcePolite(`Te curas. Vida: ${hp}.`)
        break
      }

      case 'enemy': {
        const e = room.enemy!
        const ae: ActiveEnemy = { ...e, maxHp: e.hp, isBoss: false }
        enemyRef.current = ae; inCombat.current = true; setEnemy(ae)
        addHist('combat',
          `Un ${e.name} te ataca. Vida enemiga: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'mago' ? ', "magia"' : ''} o "huir".`
        )
        audio.incorrect()
        announceAssertive(`Combate. Un ${e.name} te ataca.`)
        break
      }

      case 'item': {
        addHist('item', `Ves en el suelo: ${room.item!.name}. ${room.item!.desc} Escribe "tomar" para recogerlo.`)
        announcePolite(`Objeto: ${room.item!.name}. Escribe tomar.`)
        break
      }
    }
  }

  // ── Combat ─────────────────────────────────────────────────────────────────

  function resolveAttack(dmg: number, e: ActiveEnemy): boolean {
    const hasEscudo = inventoryRef.current.includes('escudo')
    const enemyHp = e.hp - dmg

    if (enemyHp <= 0) {
      syncScore(scoreRef.current + e.reward)
      if (e.isBoss) {
        const bonus = Math.floor(healthRef.current / 2)
        syncScore(scoreRef.current + bonus)
        inCombat.current = false; enemyRef.current = null; setEnemy(null)
        addHist('ok',
          `¡Derrotas al ${e.name}! La mazmorra queda en silencio. ` +
          `+${e.reward} puntos. Bonus de vida: +${bonus} puntos.`
        )
        audio.start()
        announceAssertive(`Victoria. Puntuación final: ${scoreRef.current}.`)
        deleteSave(); setHasSaveData(false)
        goPhase('won')
        return true
      }
      addHist('ok', `Derrotas al ${e.name}. +${e.reward} puntos.`)
      audio.correct()
      if (Math.random() < 0.3) {
        const heal = 25
        syncHealth(Math.min(maxHpRef.current, healthRef.current + heal))
        addHist('ok', `Entre sus restos encuentras una poción. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasEscudo ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const shieldNote = hasEscudo ? ` (escudo: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${shieldNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe final. Has muerto.`)
      audio.gameOver()
      deleteSave(); setHasSaveData(false)
      announceAssertive('Has muerto. Fin del juego.')
      goPhase('lost')
    }
    return false
  }

  function handleCombat(cmd: string) {
    const e = enemyRef.current
    if (!e) return

    if (magicCdRef.current > 0) syncMagicCD(magicCdRef.current - 1)

    if (/^(huir|flee|escapar|retirarse)$/.test(cmd)) {
      if (e.isBoss) {
        addHist('bad', 'El Liche Oscuro bloquea la salida. ¡No puedes huir!')
        audio.incorrect(); return
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      syncScore(Math.max(0, scoreRef.current - 5))
      addHist('bad', `Huyes del combate con el ${e.name}. -5 puntos.`)
      audio.incorrect()
      announcePolite('Huiste del combate.')
      const prev = prevIdRef.current
      if (prev !== null) { roomIdRef.current = prev; describeRoom(worldRef.current[prev]) }
      return
    }

    if (/^(magia|hechizo|spell|magic)$/.test(cmd)) {
      if (classRef.current !== 'mago') {
        addHist('bad', 'Sólo el Mago puede usar magia.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `Tu energía mágica aún se recupera. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Lanzas un hechizo fulminante: ${dmg} de daño arcano.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|a)$/.test(cmd)) {
      const hasEspada = inventoryRef.current.includes('espada')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasEspada ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasEspada ? dmgRaw * 2 : dmgRaw
      const swordNote = e.isBoss && hasEspada ? ` (espada ×2 vs Liche: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${swordNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al jefe. Escribe: atacar${classRef.current === 'mago' ? ' o magia' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'mago' ? ', magia' : ''} o huir.`
    )
  }

  // ── Command parser ─────────────────────────────────────────────────────────

  function processCommand(raw: string) {
    if (phaseRef.current !== 'playing') return
    const cmd = normalize(raw)
    addHist('cmd', `> ${raw}`)
    cmdHistRef.current.unshift(raw)
    setHistIdx(-1)

    if (inCombat.current) { handleCombat(cmd); doAutoSave(); return }

    if (/^(mirar?|look?|l)$/.test(cmd)) {
      describeRoom(worldRef.current[roomIdRef.current]); return
    }

    if (/^(inventario|inv|i)$/.test(cmd)) {
      const items = inventoryRef.current.length ? inventoryRef.current.join(', ') : 'ninguno'
      const cdNote = classRef.current === 'mago' && magicCdRef.current > 0
        ? ` · Magia disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(explorar|scout)$/.test(cmd)) {
      if (classRef.current !== 'explorador') {
        addHist('bad', 'Sólo el Explorador puede usar este comando.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (cerrada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'sala tranquila')
        return `${d}: ${label}${locked}`
      })
      const msg = `Exploración: ${lines.join('. ')}.`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(tomar|recoger|coger|agarrar|t)$/.test(cmd)) {
      const room = worldRef.current[roomIdRef.current]
      if (!room.item || room.cleared) {
        addHist('bad', 'No hay nada que tomar aquí.'); audio.incorrect(); return
      }
      const item = room.item
      room.cleared = true; room.item = undefined
      syncInventory([...inventoryRef.current, item.id])
      addHist('ok', `Recoges: ${item.name}. ${item.desc}`)
      audio.correct(); announcePolite(`Recogiste ${item.name}.`)
      doAutoSave(); return
    }

    const usarMatch = cmd.match(/^usar\s+(.+)$/)
    if (usarMatch) {
      if (/^(pocion|pocion de vida)$/.test(usarMatch[1].trim())) {
        if (!inventoryRef.current.includes('pocion')) {
          addHist('bad', 'No tienes ninguna poción.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'pocion'))
        addHist('ok', `Bebes la poción. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas la poción. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'La espada y el escudo se usan automáticamente en combate.'); return
    }

    const go = cmd.match(/^(?:ir|go|caminar)\s+(?:al?\s+)?(.+)$/)
    if (go) {
      const dir = go[1].trim() as Direction
      const room = worldRef.current[roomIdRef.current]
      const dest = room.exits[dir]
      if (dest === undefined) {
        addHist('bad', `No puedes ir al ${dir} desde aquí.`); audio.incorrect(); return
      }
      if (room.lockedExits[dir]) {
        if (inventoryRef.current.includes('llave')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'llave'))
          addHist('ok', `La puerta al ${dir} estaba cerrada. Usas la llave oxidada para abrirla.`)
          announcePolite(`Usas la llave para abrir la puerta al ${dir}.`)
        } else {
          addHist('bad', `La puerta al ${dir} está cerrada con llave. Necesitas una llave.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar poción.')
    audio.incorrect()
  }

  // ── Game lifecycle ─────────────────────────────────────────────────────────

  function resetRefs(cl: CharacterClass) {
    const def = CLASS_DEFS[cl]
    classRef.current         = cl
    maxHpRef.current         = def.maxHp
    healthRef.current        = def.maxHp
    scoreRef.current         = 0
    inCombat.current         = false
    enemyRef.current         = null
    cmdHistRef.current       = []
    inventoryRef.current     = []
    magicCdRef.current       = 0
  }

  function applyUIState(cl: CharacterClass, hp: number, sc: number, inv: string[], hist: HistEntry[], mcd: number) {
    const def = CLASS_DEFS[cl]
    setMaxHp(def.maxHp)
    setHealth(hp)
    setScore(sc)
    setInventory(inv)
    setEnemy(null)
    setSaved(false)
    setSaveError('')
    setHistIdx(-1)
    setInput('')
    setMagicCD(mcd)
    setHistory(hist)
  }

  function startGame() {
    const cl = selectedClass
    const world = generateWorld()
    worldRef.current  = world
    roomIdRef.current = 0
    prevIdRef.current = null
    resetRefs(cl)

    const def = CLASS_DEFS[cl]
    const room = world[0]
    const dirs = Object.keys(room.exits)
    const msg =
      `${def.name} elegido. ${def.desc}. Comienzas tu aventura. ` +
      `${room.description} Salidas: ${dirs.join(', ')}.`

    applyUIState(cl, def.maxHp, 0, [], [{ type: 'scene', text: msg }], 0)
    goPhase('playing')
    announcePolite(msg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  function loadGame() {
    const save = readSave()
    if (!save) return
    const cl = save.characterClass
    worldRef.current         = save.world
    roomIdRef.current        = save.roomId
    prevIdRef.current        = save.prevId
    classRef.current         = cl
    maxHpRef.current         = CLASS_DEFS[cl].maxHp
    healthRef.current        = save.health
    scoreRef.current         = save.score
    inventoryRef.current     = save.inventory
    inCombat.current         = false
    enemyRef.current         = null
    cmdHistRef.current       = []
    magicCdRef.current       = save.magicCooldown

    const room = save.world[save.roomId]
    const dirs = (Object.keys(room.exits) as Direction[]).map(d =>
      room.lockedExits[d] ? `${d} (cerrada)` : d
    )
    const roomMsg = `${room.description} Salidas: ${dirs.join(', ')}.`
    const initHist: HistEntry[] = [
      { type: 'ok',    text: 'Partida cargada.' },
      { type: 'scene', text: roomMsg },
    ]

    applyUIState(cl, save.health, save.score, save.inventory, initHist, save.magicCooldown)
    goPhase('playing')
    announcePolite('Partida cargada. ' + roomMsg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleSaveScore() {
    const result = await saveScore('aventura', score)
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

  // ─── Render ───────────────────────────────────────────────────────────────

  const histColors: Record<HistEntry['type'], string> = {
    scene:     'text-[#f0f0f0]',
    cmd:       'text-[#ffd700]',
    ok:        'text-[#22c55e]',
    bad:       'text-[#ef4444]',
    combat:    'text-[#f97316]',
    item:      'text-[#a78bfa]',
    narrative: 'text-[#38bdf8]',
  }

  if (phase === 'idle') {
    return (
      <GameShell title="Aventura de Texto" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Aventura de Texto: La Mazmorra</h2>
          <p className="text-[#888] text-sm">
            Explora una mazmorra de 49 salas. Descubre la historia del Liche Oscuro y derrótalo para ganar.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => goPhase('selecting')}>Nueva aventura</Button>
            {hasSaveData && (
              <Button size="lg" variant="secondary" onClick={loadGame}>
                Continuar partida guardada
              </Button>
            )}
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'selecting') {
    const classes: CharacterClass[] = ['guerrero', 'mago', 'explorador']
    return (
      <GameShell title="Aventura de Texto" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700] text-center">Elige tu clase de personaje</h2>
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            role="radiogroup"
            aria-label="Selecciona clase de personaje"
          >
            {classes.map(cl => {
              const def = CLASS_DEFS[cl]
              const sel = selectedClass === cl
              return (
                <button
                  key={cl}
                  role="radio"
                  aria-checked={sel}
                  onClick={() => setSelectedClass(cl)}
                  className={`p-4 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd700] cursor-pointer ${
                    sel ? 'border-[#ffd700] bg-[#1a1a1a]' : 'border-[#333] bg-[#111] hover:border-[#555]'
                  }`}
                >
                  <span className={`block text-base font-bold mb-2 ${sel ? 'text-[#ffd700]' : 'text-[#f0f0f0]'}`}>
                    {def.name}
                  </span>
                  <span className="block text-xs text-[#888] leading-relaxed">{def.desc}</span>
                  <span className="block text-xs text-[#555] mt-2">Vida: {def.maxHp}</span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="secondary" onClick={() => goPhase('idle')}>Volver</Button>
            <Button onClick={startGame}>Comenzar aventura</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Aventura de Texto" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Has conquistado la mazmorra!' : 'Has muerto'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              El Liche Oscuro ha caído. El Orbe de Luz brilla de nuevo. La mazmorra vuelve al silencio.
            </p>
          )}
          <p className="text-3xl font-mono font-bold" aria-live="polite">Puntuación final: {score}</p>
          {!saved ? (
            <>
              <Button onClick={handleSaveScore}>Guardar puntuación</Button>
              {saveError && <p role="alert" className="text-[#ef4444] text-sm">{saveError}</p>}
            </>
          ) : (
            <p role="status" className="text-[#22c55e]">Guardado.</p>
          )}
          <Button variant="secondary" onClick={() => goPhase('idle')}>Volver al inicio</Button>
        </div>
      </GameShell>
    )
  }

  return (
    <GameShell
      title="Aventura de Texto"
      instructions={INSTRUCTIONS}
      score={score}
      onReread={() => describeRoom(worldRef.current[roomIdRef.current])}
    >
      <div className="flex flex-col h-[62vh]">

        {/* Status bar */}
        <div className="flex items-center justify-between mb-3 text-sm flex-wrap gap-2">
          <span>
            Vida:{' '}
            <strong className={
              health <= maxHp * 0.3 ? 'text-[#ef4444]' :
              health <= maxHp * 0.6 ? 'text-[#f97316]' : 'text-[#22c55e]'
            }>
              {health}
            </strong>
            /{maxHp}
          </span>
          <span className="text-[#555] text-xs">{CLASS_DEFS[classRef.current].name}</span>
          {classRef.current === 'mago' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Magia en {magicCD}t</span>
          )}
          {inventory.length > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-label={`Objetos: ${inventory.join(', ')}`}>
              {inventory.join(' · ')}
            </span>
          )}
          {enemy && (
            <span
              className="text-[#f97316] font-medium"
              aria-live="polite"
              aria-label={`En combate contra ${enemy.name}, vida ${enemy.hp} de ${enemy.maxHp}`}
            >
              {enemy.name}: {enemy.hp}/{enemy.maxHp}
            </span>
          )}
        </div>

        {/* History terminal */}
        <div
          ref={historyEl}
          className="flex-1 overflow-y-auto border border-[#333] rounded p-4 mb-3 space-y-1.5 font-mono text-sm"
          aria-live="polite"
          aria-label="Historial de la aventura"
          tabIndex={0}
        >
          {history.map((h, i) => (
            <p key={i} className={histColors[h.type]}>{h.text}</p>
          ))}
        </div>

        {/* Combat quick buttons */}
        {enemy && (
          <div className="flex gap-3 mb-3" role="group" aria-label="Acciones de combate">
            <Button className="flex-1" onClick={() => { processCommand('atacar'); setInput('') }}>
              Atacar
            </Button>
            {classRef.current === 'mago' && (
              <Button
                variant={magicCD === 0 ? 'primary' : 'secondary'}
                className="flex-1"
                onClick={() => { processCommand('magia'); setInput('') }}
              >
                {magicCD === 0 ? 'Magia' : `Magia (${magicCD}t)`}
              </Button>
            )}
            {!enemy.isBoss && (
              <Button variant="secondary" className="flex-1" onClick={() => { processCommand('huir'); setInput('') }}>
                Huir
              </Button>
            )}
          </div>
        )}

        {/* Command input */}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <label htmlFor="cmd-input" className="sr-only">Ingresa un comando</label>
          <input
            id="cmd-input"
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={enemy ? 'atacar...' : 'ir norte, tomar, explorar...'}
            className="flex-1 px-4 py-2.5 rounded bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#ffd700]"
            autoComplete="off"
          />
          <Button type="submit">Enviar</Button>
        </form>

        <p className="mt-2 text-xs text-[#555]">
          Flechas ↑↓ para historial · Partida guardada automáticamente
        </p>
      </div>
    </GameShell>
  )
}
