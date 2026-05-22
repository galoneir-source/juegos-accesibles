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
type CharacterClass = 'arqueologa' | 'sacerdote' | 'ladron'

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
  arqueologa: {
    name: 'Arqueóloga',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · El khopesh sagrado duplica el daño contra Amenhotep',
  },
  sacerdote: {
    name: 'Sacerdote de Ra',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Invocación "invocar ra" en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  ladron: {
    name: 'Ladrón de tumbas',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "acechar" para ver cámaras adyacentes · +20% en recompensas de tesoro · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'egipto-faraon-v1'
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
  'Entrada de la tumba. Jeroglíficos tallados en la piedra advierten de la maldición del faraón.',
  'Antecámara de ofrendas. Jarras canópicas selladas alineadas en los nichos de la pared.',
  'Pasillo descendente. Las antorchas grabadas en piedra nunca se apagan.',
  'Sala de los escribas. Rollos de papiro a medio quemar cubren el suelo.',
  'Cámara de los shabtis. Cientos de figurillas de loza te observan con ojos pintados.',
  'Corredor de las columnas. Pilares con relieves de dioses flanquean el paso.',
  'Sala del juicio de Osiris. Una balanza de oro preside el centro de la estancia.',
  'Cámara de los ushebtis. Pequeñas figurillas de bronce listos para servir al faraón.',
  'Pozo de acceso. Una cuerda de lino podrida cuelga desde la oscuridad superior.',
  'Sala de los sarcófagos secundarios. Tres féretros pintados yacen sobre pedestales.',
  'Galería de los reyes. Cartuchos con nombres de faraones cubren cada centímetro.',
  'Cámara de las pinturas. Escenas de la vida después de la muerte adornan las paredes.',
  'Pasaje angosto. El olor a resina y mirra impregna el aire viciado.',
  'Sala del tesoro menor. Estantes vacíos donde antes descansaban las riquezas.',
  'Cripta del visir. Un sarcófago negro lacado reposa entre ofrendas de oro.',
  'Cámara de los canales de ventilación. El viento silba por los conductos de piedra.',
  'Sala de los amuletos. Escarabajos de jade, ojos de Horus y ankhs de turquesa.',
  'Galería inundada. El agua negra llega a los tobillos y huele a azufre.',
  'Cámara de los naos. Pequeñas capillas de granito albergan estatuas de dioses.',
  'Sala de las trampas desactivadas. Mecanismos de piedra asoman del suelo y las paredes.',
  'Corredor del viento. Una corriente de aire frío sale de algún lugar desconocido.',
  'Cámara de la momia del sacerdote. Vendas de lino cubren la figura sentada en el trono.',
  'Sala de los espejos de electro. Tu reflejo parece moverse de forma independiente.',
  'Pasaje de los bajorrelieves. Batallas y cacerías narran la vida del faraón.',
  'Cámara secreta detrás de un bloque de arenisca removido.',
  'Sala de los vasos de alabastro. Perfumes y aceites sagrados en recipientes traslúcidos.',
  'Corredor de las flechas. Mecanismos de ballesta siguen en las paredes, ya agotados.',
  'Cámara del ritual de apertura de la boca. Instrumentos de bronce sobre un altar.',
  'Sala de los carruajes. Dos carros de madera dorada y ruedas de bronce.',
  'Pasaje de las maldiciones. Inscripciones amenazan a quien profane la tumba.',
  'Sala del eco de Ra. Cada palabra pronunciada resuena siete veces en las paredes.',
  'Cámara de los cofres sellados. El sello de arcilla con el escarabajo aún intacto.',
  'Corredor inundado de arena fina. La corriente invisible mueve los granos.',
  'Sala de los guardianes de piedra. Estatuas de anubis flanquean la puerta cerrada.',
  'Cámara del nilómetro. Una escala grabada en piedra mide las crecidas del río sagrado.',
  'Pasaje del libro de los muertos. Versículos en papiro cubren el suelo como alfombra.',
  'Sala de los instrumentos musicales. Arpas y sistros siguen colgados en la pared.',
  'Cámara de las momias de los servidores. Decenas de bultos vendados en nichos.',
  'Sala del gabinete real. Muebles de ébano y marfil apilados contra las paredes.',
  'Corredor en espiral. Desciende hacia las profundidades de la roca viva.',
  'Sala del tribunal divino. Doce jueces pintados presiden desde el mural.',
  'Cámara de las serpientes sagradas. Huesos de víboras sagradas entre los azulejos.',
  'Cripta de la reina consorte. Un sarcófago turquesa entre guirnaldas de flores secas.',
  'Pasaje de las estelas. Losas de granito conmemoran las victorias del faraón.',
  'Sala de los joyeros reales. Cajas vacías de cedro con cierres de oro roto.',
  'Corredor de los guardianes del umbral. Representaciones de Am-mit en las paredes.',
  'Cámara de las tablillas de arcilla. Registros del reinado del faraón en decenas de tablillas.',
  'Antecámara del faraón. El suelo tiembla con los pasos del espíritu inmortal.',
]

const BOSS_ROOM_DESC =
  'Cámara funeraria del faraón Amenhotep III. El sarcófago de oro macizo brilla con luz propia. ' +
  'Del centro surge una figura envuelta en vendas doradas: el espíritu inmortal del faraón, ' +
  'con ojos que arden como brasas y la maldición de los dioses en cada gesto.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Encuentras a un explorador herido detrás de un pilar. Con voz temblorosa susurra: ' +
      '"Amenhotep... su espíritu es inmortal mientras sostenga el Amuleto del Sol. ' +
      'Nada puede herirle salvo el khopesh sagrado, forjado en los albores del reino. ' +
      'Encuéntralo antes de llegar a la cámara funeraria." ' +
      'El explorador te entrega un papiro con un mapa parcial y cierra los ojos.',
    reward: 40,
  },
  {
    text:
      'Las paredes muestran jeroglíficos que puedes descifrar: ' +
      '"El faraón Amenhotep III ordenó que su espíritu permaneciera en guardia ' +
      'por toda la eternidad. Solo aquel que porte el khopesh sagrado y el favor de Ra ' +
      'podrá devolverle al reino de los muertos. Los arqueólogos que empuñen el khopesh ' +
      'infligirán el doble de daño al espíritu inmortal."',
    reward: 25,
  },
  {
    text:
      'Una voz sale de la estatua de Anubis: ' +
      '"Viajero, escucha. El espíritu de Amenhotep ataca con la fuerza de mil soldados. ' +
      'Si llevas el pectoral de Horus cuando su maldición caiga sobre ti, ' +
      'la mitad del daño será absorbido por el poder protector del dios halcón. ' +
      'Actúa con prudencia." La estatua vuelve al silencio eterno.',
    reward: 30,
  },
  {
    text:
      'Las paredes están grabadas con los nombres de quienes intentaron profanar la tumba. ' +
      'Decenas de nombres tachados, y al final la inscripción: ' +
      '"Aquí descansaron sus ambiciones. Que el siguiente viajero conozca el miedo ' +
      'y aun así avance, pues solo el valiente merece el tesoro del faraón." ' +
      'El suelo vibra levemente. La cámara funeraria está cerca.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Guardia momificado', hp: 30, attack: 12, reward: 20 },
  { name: 'Sacerdote renegado', hp: 40, attack: 18, reward: 30 },
  { name: 'Serpiente sagrada', hp: 20, attack: 8, reward: 15 },
  { name: 'Coloso de granito', hp: 70, attack: 28, reward: 50 },
  { name: 'Espectro del visir', hp: 35, attack: 15, reward: 25 },
  { name: 'Escarabajo gigante', hp: 25, attack: 20, reward: 35 },
  { name: 'Centinela de Anubis', hp: 50, attack: 22, reward: 40 },
  { name: 'Guerrero del desierto', hp: 80, attack: 32, reward: 60 },
  { name: 'Espíritu del nilo', hp: 45, attack: 19, reward: 35 },
  { name: 'Momia del escriba', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'El Faraón Amenhotep III', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'El suelo cede. Caes en una trampa de arena movediza oculta bajo las losas.', damage: 20 },
  { desc: 'Un dardo envenenado sale de un orificio en la pared y te roza el cuello.', damage: 15 },
  { desc: 'Pisas una losa de presión que activa una lluvia de arena abrasiva desde el techo.', damage: 18 },
  { desc: 'Un contrapeso de piedra cae y te golpea con violencia en el hombro.', damage: 25 },
  { desc: 'Gas de natrón sale de grietas en el suelo. Toses y pierdes el aliento.', damage: 22 },
  { desc: 'Una trampa de red de bronce cae sobre ti y te corta al intentar liberarte.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Un cofre de ébano lleno de escarabajos de oro macizo.', reward: 30 },
  { desc: 'Un pectoral de lapislázuli con incrustaciones de oro puro.', reward: 50 },
  { desc: 'Un collar de cuentas de cornalina, turquesa y oro del Nilo.', reward: 25 },
  { desc: 'Una estatuilla de marfil del dios Thoth con ojos de zafiro.', reward: 40 },
  { desc: 'Un sistro de oro grabado con el nombre del faraón.', reward: 45 },
  { desc: 'Un saco de sellos de arcilla con el cartucho real, codiciados por coleccionistas.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Un ánfora de aceite de mirra con propiedades curativas. Te ungen las heridas.', amount: 25 },
  { desc: 'Un botiquín del médico real con hierbas del alto Egipto aún eficaces.', amount: 35 },
  { desc: 'Un manantial de agua sagrada brota entre las grietas de la roca.', amount: 30 },
  { desc: 'Un ungüento de resina de cedro y miel silvestre en un cuenco de alabastro.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'khopesh', name: 'Khopesh sagrado', desc: 'Aumenta tu daño en combate. La Arqueóloga lo usa con maestría contra el faraón.' },
  { id: 'pectoral', name: 'Pectoral de Horus', desc: 'Reduce el daño recibido en combate.' },
  { id: 'elixir', name: 'Elixir de mirra', desc: 'Restaura 50 puntos de vida al usarlo.' },
]

const ITEM_KEY: ItemDef = {
  id: 'escarabajo',
  name: 'Escarabajo de jade',
  desc: 'Abre las puertas selladas con la maldición del faraón.',
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
  'La Maldición del Faraón. Explora 49 cámaras de la tumba de Amenhotep III, ' +
  'descifra sus secretos y derrota al espíritu inmortal del faraón. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la cámara. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar elixir para curarte. ' +
  'El khopesh sagrado sube el daño. El pectoral de Horus reduce el daño recibido. ' +
  'El escarabajo de jade abre puertas selladas por la maldición. ' +
  'En combate: atacar o huir. No puedes huir del faraón. ' +
  'Arqueóloga: más vida y daño. El khopesh duplica el daño contra el faraón. ' +
  'Sacerdote de Ra: escribe invocar ra en combate para un ataque divino poderoso cada 3 turnos. ' +
  'Ladrón de tumbas: escribe acechar para ver qué hay en las cámaras adyacentes. ' +
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

export default function EgiptoPage() {
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
  const classRef     = useRef<CharacterClass>('arqueologa')
  const magicCdRef   = useRef(0)
  const phaseRef     = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('arqueologa')
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
          `El espíritu de Amenhotep III se alza del sarcófago envuelto en llamas doradas. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'sacerdote' ? ' o "invocar ra"' : ''}. No puedes huir.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El faraón Amenhotep III te ataca.')
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
          addHist('bad', 'Has muerto. La maldición del faraón se ha cumplido.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'ladron' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Tesoro — ${desc} +${total} puntos${bonus ? ` (bonus ladrón +${bonus})` : ''}.`)
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
          `Un ${e.name} surge de las sombras. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'sacerdote' ? ', "invocar ra"' : ''} o "huir".`
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
    const hasPectoral = inventoryRef.current.includes('pectoral')
    const enemyHp = e.hp - dmg

    if (enemyHp <= 0) {
      syncScore(scoreRef.current + e.reward)
      if (e.isBoss) {
        const bonus = Math.floor(healthRef.current / 2)
        syncScore(scoreRef.current + bonus)
        inCombat.current = false; enemyRef.current = null; setEnemy(null)
        addHist('ok',
          `¡Derrotas al ${e.name}! Su espíritu se disuelve en polvo dorado y la maldición se rompe. ` +
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
        addHist('ok', `Entre sus vendajes encuentras un vial de aceite sagrado. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasPectoral ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const shieldNote = hasPectoral ? ` (pectoral: -${rawAtk - received} absorbido)` : ''

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
      addHist('bad', `El ${e.name} te da el golpe final. La maldición del faraón te reclama.`)
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
        addHist('bad', 'El faraón sella la cámara con su poder divino. ¡No puedes huir!')
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

    if (/^(invocar ra|invocar|ra|invocacion|invocación)$/.test(cmd)) {
      if (classRef.current !== 'sacerdote') {
        addHist('bad', 'Solo el Sacerdote de Ra puede invocar el poder divino.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `El poder de Ra aún se recarga. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Invocas la furia del dios Ra: ${dmg} de daño divino.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|a)$/.test(cmd)) {
      const hasKhopesh = inventoryRef.current.includes('khopesh')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasKhopesh ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasKhopesh ? dmgRaw * 2 : dmgRaw
      const khopeshNote = e.isBoss && hasKhopesh ? ` (khopesh ×2 vs faraón: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${khopeshNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al faraón. Escribe: atacar${classRef.current === 'sacerdote' ? ' o invocar ra' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'sacerdote' ? ', invocar ra' : ''} o huir.`
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
      const cdNote = classRef.current === 'sacerdote' && magicCdRef.current > 0
        ? ` · Invocación disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(acechar|acecho|explorar|escanear|scout)$/.test(cmd)) {
      if (classRef.current !== 'ladron') {
        addHist('bad', 'Solo el Ladrón de tumbas puede acechar cámaras adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (sellada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'cámara tranquila')
        return `${d}: ${label}${locked}`
      })
      const msg = `Acecho: ${lines.join('. ')}.`
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
      if (/^(elixir|mirra|ungüento|unguento|pocion|poción)$/.test(target)) {
        if (!inventoryRef.current.includes('elixir')) {
          addHist('bad', 'No tienes ningún elixir de mirra.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'elixir'))
        addHist('ok', `Usas el elixir de mirra. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas el elixir. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'El khopesh y el pectoral se usan automáticamente en combate.'); return
    }

    const go = cmd.match(/^(?:ir|go|caminar|avanzar|entrar)\s+(?:al?\s+)?(.+)$/)
    if (go) {
      const dir = go[1].trim() as Direction
      const room = worldRef.current[roomIdRef.current]
      const dest = room.exits[dir]
      if (dest === undefined) {
        addHist('bad', `No puedes ir al ${dir} desde aquí.`); audio.incorrect(); return
      }
      if (room.lockedExits[dir]) {
        if (inventoryRef.current.includes('escarabajo')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'escarabajo'))
          addHist('ok', `La puerta al ${dir} estaba sellada por la maldición. El escarabajo de jade rompe el sello.`)
          announcePolite(`Usas el escarabajo de jade para romper el sello al ${dir}.`)
        } else {
          addHist('bad', `La puerta al ${dir} está sellada con la maldición del faraón. Necesitas el escarabajo de jade.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar elixir.')
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
      `${def.name} elegido. ${def.desc}. Desciendes a la tumba del faraón Amenhotep III en busca de su legendario tesoro. ` +
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
      { type: 'ok',    text: 'Expedición reanudada.' },
      { type: 'scene', text: roomMsg },
    ]

    applyUIState(cl, save.health, save.score, save.inventory, initHist, save.magicCooldown)
    goPhase('playing')
    announcePolite('Expedición reanudada. ' + roomMsg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleSaveScore() {
    const result = await saveScore('egipto', score)
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
      <GameShell title="La Maldición del Faraón" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">La Maldición del Faraón</h2>
          <p className="text-[#888] text-sm">
            Explora 49 cámaras de la tumba de Amenhotep III. Descifra sus secretos y derrota al espíritu inmortal del faraón para ganar.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => goPhase('selecting')}>Nueva expedición</Button>
            {hasSaveData && (
              <Button size="lg" variant="secondary" onClick={loadGame}>
                Continuar expedición guardada
              </Button>
            )}
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'selecting') {
    const classes: CharacterClass[] = ['arqueologa', 'sacerdote', 'ladron']
    return (
      <GameShell title="La Maldición del Faraón" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Descender a la tumba!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="La Maldición del Faraón" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Has roto la maldición del faraón!' : 'La maldición te ha reclamado'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              El espíritu de Amenhotep III descansa por fin. El tesoro del faraón es tuyo y tu nombre vivirá eternamente grabado en piedra.
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
      title="La Maldición del Faraón"
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
          {classRef.current === 'sacerdote' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Invocación en {magicCD}t</span>
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
          aria-label="Historial de la expedición"
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
            {classRef.current === 'sacerdote' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('invocar ra'); setInput('') }}
              >
                {magicCD > 0 ? `Invocar Ra (${magicCD}t)` : 'Invocar Ra'}
              </Button>
            )}
            {!enemy.name.includes('Faraón') && (
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
