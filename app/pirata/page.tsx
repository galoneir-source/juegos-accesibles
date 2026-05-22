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
type CharacterClass = 'capitan' | 'bruja' | 'navegante'

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
  capitan: {
    name: 'Capitán',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · El sable de ébano duplica el daño contra el Corsario',
  },
  bruja: {
    name: 'Bruja del Mar',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Hechizo "maldecir" en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  navegante: {
    name: 'Navegante',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "explorar" para ver zonas adyacentes · +20% en recompensas de tesoro · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'pirata-corsario-v1'
const SAVE_VERSION = 1

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
  'Playa de arena negra. Las olas rompen con fuerza contra las rocas afiladas.',
  'Muelle de madera podrida. Los tablones crujen bajo tus pasos.',
  'Taberna abandonada. Jarras de ron volcadas sobre las mesas de madera.',
  'Mercado de contrabando. Tenderetes vacíos y sacos rasgados por el suelo.',
  'Cueva de la costa. El sonido del mar resuena en las paredes de piedra.',
  'Acantilado con vistas al mar. Un viento salado golpea tu cara.',
  'Selva espesa. Las lianas cuelgan como serpientes entre los árboles.',
  'Ruinas de un fuerte colonial. Los cañones oxidados apuntan al mar.',
  'Choza de pescadores. Redes y anzuelos cuelgan del techo.',
  'Cascada oculta. El agua forma un estanque cristalino en la base.',
  'Cementerio de náufragos. Cruces de madera salpican la arena mojada.',
  'Almacén de pólvora. El olor a azufre impregna el aire húmedo.',
  'Puente de cuerdas sobre un barranco. Oscila peligrosamente con la brisa.',
  'Laguna de aguas turquesas. Restos de un naufragio asoman bajo la superficie.',
  'Cantera abandonada. Bloques de piedra a medio tallar llenan el suelo.',
  'Templo de piedra cubierto de musgo. Inscripciones en idioma desconocido.',
  'Corredor de manglares. Las raíces forman un laberinto retorcido.',
  'Plataforma de observación carcomida. Ofrece vistas al horizonte marino.',
  'Bodega de un galeón varado. Las bodegas aún huelen a especias exóticas.',
  'Cueva de estalactitas. Gotitas de agua suenan como campanas al caer.',
  'Vivienda de nativos abandonada. Pinturas tribales cubren las paredes.',
  'Cueva de los murciélagos. Un ruido agudo llena el espacio oscuro.',
  'Cala secreta. Solo accesible por una grieta entre los arrecifes.',
  'Mina de sal abandonada. Los cristales brillan con la poca luz que entra.',
  'Torre de vigilancia en ruinas. Desde aquí se domina toda la bahía.',
  'Bodega de provisiones. Barriles vacíos y sacos de harina putrefacta.',
  'Sala de mapas de un barco encallado. Cartas náuticas cubren la pared.',
  'Catacumba de piratas caídos. Cráneos y tibias decoran las paredes.',
  'Playa de coral. El suelo raspa como cristal roto bajo las botas.',
  'Pasadizo subterráneo. El techo raspa la cabeza al caminar.',
  'Sala del eco. Cualquier sonido rebota amplificado por las rocas.',
  'Cámara de las ofrendas. Un altar de piedra con monedas antiguas.',
  'Pasaje inundado hasta los tobillos. El agua huele a sal y algas.',
  'Galería de retratos. Cuadros de piratas temibles miran desde las paredes.',
  'Cueva de los vientos. Las corrientes de aire hacen silbar las grietas.',
  'Caleta con barca varada. El remo está roto por la mitad.',
  'Anfiteatro natural de roca. Aquí los piratas celebraban sus victorias.',
  'Cámara del oráculo. Un espejo negro y pulido refleja formas extrañas.',
  'Almacén de armas oxidadas. Sables, mosquetes y dagas yacen en el suelo.',
  'Corredor de las trampas. Marcas en el suelo delatan mecanismos desactivados.',
  'Sala del trono pirata. Un sillón de huesos preside la estancia.',
  'Cámara del botín maldito. Monedas negras llenan el suelo.',
  'Cripta sellada. El sello fue roto hace poco, desde dentro.',
  'Pasaje que huele a pólvora quemada. Marcas de cañonazo en las paredes.',
  'Sala de reuniones del clan. Una mesa circular con siete sillas vacías.',
  'Corredor en zigzag. Antorchas apagadas proyectan sombras en las paredes.',
  'Cámara del tesoro falso. Solo hay monedas de latón sin valor.',
  'Corredor del Corsario. Símbolos de calavera cubren cada palmo de pared.',
  'Antecámara del tesoro. El suelo tiembla con los pasos del Corsario Negro.',
]

const BOSS_ROOM_DESC =
  'Cámara del Tesoro Final. Cofres apilados hasta el techo rebosan oro y joyas. ' +
  'En el centro, el Corsario Negro te espera con su sable de obsidiana desenvainado.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Encuentras a un marinero moribundo apoyado contra la pared. Con voz entrecortada te dice: ' +
      '"El Corsario Negro... robó el Gran Tesoro hace tres noches. Tiene el corazón de piedra negra, ' +
      'la única debilidad es el sable de ébano. Está en algún lugar de esta isla." ' +
      'El marinero te lanza su mapa de bolsillo y cierra los ojos para siempre.',
    reward: 40,
  },
  {
    text:
      'Las paredes muestran inscripciones talladas en piedra: ' +
      '"El Corsario Negro no puede ser herido por arma ordinaria. Solo el sable de ébano, ' +
      'forjado en la fragua submarina, puede partir su armadura maldita. ' +
      'El Capitán que lo empuñe infligirá el doble de daño al demonio."',
    reward: 25,
  },
  {
    text:
      'Un loro disecado montado en un palo habla con voz mecánica: ' +
      '"¡Tesoro al norte! ¡Corsario al sur! ¡La bruja del mar conoce el hechizo del tormento! ' +
      'Si llevas el escudo de cuero cuando el Corsario ataque, la mitad del daño se absorberá. ' +
      '¡Piezas de a ocho! ¡Piezas de a ocho!" El mecanismo se detiene con un clic.',
    reward: 30,
  },
  {
    text:
      'Las paredes están grabadas con los nombres de piratas que cayeron ante el Corsario. ' +
      'Una inscripción final reza: "Aquí yacen quienes desafiaron al Corsario Negro ' +
      'sin el sable de ébano en mano. Que su destino sea diferente al tuyo, forastero." ' +
      'Un escalofrío recorre tu espalda. El tesoro está cerca.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Pirata borracho', hp: 30, attack: 12, reward: 20 },
  { name: 'Marinero renegado', hp: 40, attack: 18, reward: 30 },
  { name: 'Tiburón varado', hp: 20, attack: 8, reward: 15 },
  { name: 'Gigante del mar', hp: 70, attack: 28, reward: 50 },
  { name: 'Espectro corsario', hp: 35, attack: 15, reward: 25 },
  { name: 'Cangrejo gigante', hp: 25, attack: 20, reward: 35 },
  { name: 'Guardia del tesoro', hp: 50, attack: 22, reward: 40 },
  { name: 'Berserker de cubierta', hp: 80, attack: 32, reward: 60 },
  { name: 'Capitán traicionero', hp: 45, attack: 19, reward: 35 },
  { name: 'Bruja rival', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'El Corsario Negro', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'El suelo cede. Caes en una trampa de arena movediza.', damage: 20 },
  { desc: 'Una flecha envenenada sale de un hueco en la pared y te roza el brazo.', damage: 15 },
  { desc: 'Pisas una losa que activa un chorro de agua a presión desde el techo.', damage: 18 },
  { desc: 'Un contrapeso cae y te golpea con fuerza en el hombro.', damage: 25 },
  { desc: 'Gas venenoso de origen volcánico sale por grietas del suelo.', damage: 22 },
  { desc: 'Una trampa de red cae sobre ti y te enreda durante unos instantes.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Un cofre lleno de doblones de oro recién acuñados.', reward: 30 },
  { desc: 'Un rubí del tamaño de un puño que brilla con luz propia.', reward: 50 },
  { desc: 'Un collar de perlas negras envuelto en terciopelo carmesí.', reward: 25 },
  { desc: 'Una estatuilla de jade con ojos de diamante.', reward: 40 },
  { desc: 'Un sextante de oro grabado con constelaciones marinas.', reward: 45 },
  { desc: 'Un saco de monedas antiguas de civilizaciones desaparecidas.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Un botiquín del médico de a bordo, aún con sus hierbas medicinales.', amount: 25 },
  { desc: 'Un barril de ron curado con propiedades antisépticas. Te vendes las heridas.', amount: 35 },
  { desc: 'Una fuente de agua dulce y cristalina brota entre las rocas.', amount: 30 },
  { desc: 'Un ungüento nativo guardado en una vasija de arcilla. Sus propiedades son notables.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'sable', name: 'Sable de ébano', desc: 'Aumenta tu daño en combate. El Capitán lo usa con maestría.' },
  { id: 'escudo', name: 'Escudo de cuero', desc: 'Reduce el daño recibido en combate.' },
  { id: 'botiquin', name: 'Botiquín de hierbas', desc: 'Restaura 50 puntos de vida al usarlo.' },
]

const ITEM_KEY: ItemDef = {
  id: 'mapa',
  name: 'Mapa del tesoro',
  desc: 'Muestra el camino a través de pasajes sellados con la maldición del Corsario.',
}

const ITEM_NAME: Record<string, string> = Object.fromEntries(
  [...ITEM_REGULAR, ITEM_KEY].map(i => [i.id, i.name])
)

const EVENT_LABELS: Partial<Record<Room['event'], string>> = {
  treasure: 'posible tesoro',
  trap: 'peligro',
  enemy: 'presencia hostil',
  healing: 'señal curativa',
  item: 'objeto en el suelo',
  boss: '¡jefe final!',
  narrative: 'punto de interés',
}

const INSTRUCTIONS =
  'El Tesoro del Corsario Negro. Explora 49 zonas de la Isla Maldita, ' +
  'descubre el paradero del Gran Tesoro y derrota al Corsario Negro. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la zona. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar botiquín para curarte. ' +
  'El sable de ébano sube el daño. El escudo de cuero reduce el daño recibido. ' +
  'El mapa del tesoro abre pasajes sellados por la maldición. ' +
  'En combate: atacar o huir. No puedes huir del Corsario Negro. ' +
  'Capitán: más vida y daño. El sable duplica el daño contra el Corsario. ' +
  'Bruja del Mar: escribe maldecir en combate para un hechizo devastador cada 3 turnos. ' +
  'Navegante: escribe explorar para ver qué hay en las zonas adyacentes. ' +
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

export default function PirataPage() {
  const worldRef     = useRef<Room[]>([])
  const roomIdRef    = useRef(0)
  const prevIdRef    = useRef<number | null>(null)
  const healthRef    = useRef(100)
  const maxHpRef     = useRef(100)
  const scoreRef     = useRef(0)
  const inCombat     = useRef(false)
  const enemyRef     = useRef<ActiveEnemy | null>(null)
  const cmdHistRef   = useRef<string[]>([])
  const inventoryRef = useRef<string[]>([])
  const classRef     = useRef<CharacterClass>('capitan')
  const magicCdRef   = useRef(0)
  const phaseRef     = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('capitan')
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

  const inputRef  = useRef<HTMLInputElement>(null)
  const historyEl = useRef<HTMLDivElement>(null)

  function goPhase(p: Phase) { phaseRef.current = p; setPhaseState(p) }

  useEffect(() => { setHasSaveData(readSave() !== null) }, [])

  useEffect(() => {
    if (historyEl.current) historyEl.current.scrollTop = historyEl.current.scrollHeight
  }, [history])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function addHist(type: HistEntry['type'], text: string) {
    setHistory(h => [...h, { type, text }])
  }

  function syncHealth(v: number)  { healthRef.current  = v; setHealth(v)  }
  function syncScore(v: number)   { scoreRef.current   = v; setScore(v)   }
  function syncMagicCD(v: number) { magicCdRef.current = v; setMagicCD(v) }

  function syncInventory(inv: string[]) { inventoryRef.current = inv; setInventory(inv) }

  function describeRoom(room: Room) {
    const dirs = (Object.keys(room.exits) as Direction[]).map(d =>
      room.lockedExits[d] ? `${d} (sellada)` : d
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
          `El Corsario Negro surge de entre las sombras con su sable de obsidiana. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'bruja' ? ' o "maldecir"' : ''}. No puedes huir.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El Corsario Negro te ataca.')
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
          addHist('bad', 'Has muerto. Tu aventura termina en la isla maldita.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'navegante' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Tesoro — ${desc} +${total} puntos${bonus ? ` (bonus navegante +${bonus})` : ''}.`)
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
          `Un ${e.name} te corta el paso. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'bruja' ? ', "maldecir"' : ''} o "huir".`
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
          `¡Derrotas al ${e.name}! Su cuerpo se disuelve en humo negro y el Gran Tesoro es tuyo. ` +
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
        addHist('ok', `Entre sus pertenencias encuentras un frasco de ron medicinal. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
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
      addHist('bad', `El ${e.name} te da el golpe final. Has muerto en la isla maldita.`)
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
        addHist('bad', 'El Corsario Negro bloquea toda salida. ¡No puedes huir!')
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

    if (/^(maldecir|maldicion|hechizo|magia|encantamiento)$/.test(cmd)) {
      if (classRef.current !== 'bruja') {
        addHist('bad', 'Solo la Bruja del Mar puede lanzar maldiciones de combate.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `Tu poder mágico aún se recupera. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Lanzas una maldición marina: ${dmg} de daño mágico.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|a)$/.test(cmd)) {
      const hasSable = inventoryRef.current.includes('sable')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasSable ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasSable ? dmgRaw * 2 : dmgRaw
      const sableNote = e.isBoss && hasSable ? ` (sable ×2 vs Corsario: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${sableNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al jefe. Escribe: atacar${classRef.current === 'bruja' ? ' o maldecir' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'bruja' ? ', maldecir' : ''} o huir.`
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
      const items = inventoryRef.current.length ? inventoryRef.current.map(id => ITEM_NAME[id] ?? id).join(', ') : 'ninguno'
      const cdNote = classRef.current === 'bruja' && magicCdRef.current > 0
        ? ` · Maldición disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(explorar|escanear|scan|reconocer)$/.test(cmd)) {
      if (classRef.current !== 'navegante') {
        addHist('bad', 'Solo el Navegante puede explorar zonas adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (sellada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'zona tranquila')
        return `${d}: ${label}${locked}`
      })
      const msg = `Reconocimiento: ${lines.join('. ')}.`
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
      const target = usarMatch[1].trim()
      if (/^(botiquin|botiquín|kit|hierbas|ron)$/.test(target)) {
        if (!inventoryRef.current.includes('botiquin')) {
          addHist('bad', 'No tienes ningún botiquín de hierbas.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'botiquin'))
        addHist('ok', `Usas el botiquín de hierbas. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas el botiquín. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'El sable y el escudo se usan automáticamente en combate.'); return
    }

    const go = cmd.match(/^(?:ir|go|caminar|navegar|avanzar)\s+(?:al?\s+)?(.+)$/)
    if (go) {
      const dir = go[1].trim() as Direction
      const room = worldRef.current[roomIdRef.current]
      const dest = room.exits[dir]
      if (dest === undefined) {
        addHist('bad', `No puedes ir al ${dir} desde aquí.`); audio.incorrect(); return
      }
      if (room.lockedExits[dir]) {
        if (inventoryRef.current.includes('mapa')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'mapa'))
          addHist('ok', `El paso al ${dir} estaba sellado por la maldición del Corsario. El mapa del tesoro rompe el sello.`)
          announcePolite(`Usas el mapa para romper el sello al ${dir}.`)
        } else {
          addHist('bad', `El paso al ${dir} está sellado por la maldición del Corsario Negro. Necesitas el mapa del tesoro.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar botiquín.')
    audio.incorrect()
  }

  // ── Game lifecycle ─────────────────────────────────────────────────────────

  function resetRefs(cl: CharacterClass) {
    const def = CLASS_DEFS[cl]
    classRef.current     = cl
    maxHpRef.current     = def.maxHp
    healthRef.current    = def.maxHp
    scoreRef.current     = 0
    inCombat.current     = false
    enemyRef.current     = null
    cmdHistRef.current   = []
    inventoryRef.current = []
    magicCdRef.current   = 0
  }

  function applyUIState(cl: CharacterClass, hp: number, sc: number, inv: string[], hist: HistEntry[], mcd: number) {
    setMaxHp(CLASS_DEFS[cl].maxHp)
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
      `${def.name} elegido. ${def.desc}. Llegas a la Isla Maldita en busca del Gran Tesoro del Corsario Negro. ` +
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
    worldRef.current     = save.world
    roomIdRef.current    = save.roomId
    prevIdRef.current    = save.prevId
    classRef.current     = cl
    maxHpRef.current     = CLASS_DEFS[cl].maxHp
    healthRef.current    = save.health
    scoreRef.current     = save.score
    inventoryRef.current = save.inventory
    inCombat.current     = false
    enemyRef.current     = null
    cmdHistRef.current   = []
    magicCdRef.current   = save.magicCooldown

    const room = save.world[save.roomId]
    const dirs = (Object.keys(room.exits) as Direction[]).map(d =>
      room.lockedExits[d] ? `${d} (sellada)` : d
    )
    const roomMsg = `${room.description} Salidas: ${dirs.join(', ')}.`
    const initHist: HistEntry[] = [
      { type: 'ok',    text: 'Aventura reanudada.' },
      { type: 'scene', text: roomMsg },
    ]

    applyUIState(cl, save.health, save.score, save.inventory, initHist, save.magicCooldown)
    goPhase('playing')
    announcePolite('Aventura reanudada. ' + roomMsg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleSaveScore() {
    const result = await saveScore('pirata', score)
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
      <GameShell title="El Tesoro del Corsario Negro" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">El Tesoro del Corsario Negro</h2>
          <p className="text-[#888] text-sm">
            Explora 49 zonas de la Isla Maldita. Descubre el Gran Tesoro y derrota al Corsario Negro para ganar.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => goPhase('selecting')}>Nueva aventura</Button>
            {hasSaveData && (
              <Button size="lg" variant="secondary" onClick={loadGame}>
                Continuar aventura guardada
              </Button>
            )}
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'selecting') {
    const classes: CharacterClass[] = ['capitan', 'bruja', 'navegante']
    return (
      <GameShell title="El Tesoro del Corsario Negro" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700] text-center">Elige tu clase</h2>
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
            <Button onClick={startGame}>¡Zarpar!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="El Tesoro del Corsario Negro" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Has derrotado al Corsario Negro!' : 'Has muerto en la isla'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              El Gran Tesoro es tuyo. Las leyendas hablarán de tu hazaña durante generaciones.
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
      title="El Tesoro del Corsario Negro"
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
          {classRef.current === 'bruja' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Maldición en {magicCD}t</span>
          )}
          {inventory.length > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-label={`Objetos: ${inventory.map(id => ITEM_NAME[id] ?? id).join(', ')}`}>
              {inventory.map(id => ITEM_NAME[id] ?? id).join(' · ')}
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
            {classRef.current === 'bruja' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('maldecir'); setInput('') }}
              >
                {magicCD > 0 ? `Maldecir (${magicCD}t)` : 'Maldecir'}
              </Button>
            )}
            {!enemy.name.includes('Corsario') && (
              <Button className="flex-1" variant="secondary" onClick={() => { processCommand('huir'); setInput('') }}>
                Huir
              </Button>
            )}
          </div>
        )}

        {/* Command input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <label htmlFor="cmd-input" className="sr-only">Escribe un comando</label>
          <input
            id="cmd-input"
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            className="flex-1 bg-[#0a0a0a] border border-[#333] rounded px-3 py-2 text-sm font-mono text-[#f0f0f0] focus:outline-none focus:ring-1 focus:ring-[#ffd700]"
            placeholder="ir norte · atacar · tomar · inventario"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit">Enviar</Button>
        </form>

      </div>
    </GameShell>
  )
}
