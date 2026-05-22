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
type CharacterClass = 'soldado' | 'medica' | 'saqueador'

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
  soldado: {
    name: 'Soldado',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · El rifle de precisión duplica el daño contra el Señor de la Zona',
  },
  medica: {
    name: 'Médica de Campo',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Toxina química en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  saqueador: {
    name: 'Saqueador',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "rastrear" para ver las zonas adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'zona-senor-v1'
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
  'Entrada de la zona de exclusión. Vallas de alambre de cuchillas caídas delimitan el perímetro.',
  'Calle devastada. Los edificios de hormigón colapsados forman cañones de escombros y polvo gris.',
  'Gasolinera abandonada. Los surtidores oxidados gotean un líquido negro no identificado.',
  'Supermercado saqueado. Las estanterías volcadas y los envases vacíos narran el pánico del día cero.',
  'Hospital de campaña en ruinas. Camillas volcadas y vendas empapadas de sangre seca.',
  'Búnker de hormigón. Las paredes reforzadas resisten décadas de radiación. Una linterna parpadeante.',
  'Zona de impacto. El cráter en el centro de la manzana aún emite un calor residual perceptible.',
  'Armería saqueada. La mayoría de los estantes vacíos; algunos casquillos de bala en el suelo.',
  'Laboratorio en ruinas. Equipamiento científico destrozado y frascos de sustancias desconocidas.',
  'Pasillo del metro abandonado. Los raíles están doblados y el techo ha cedido en varios puntos.',
  'Sala de seguridad. Los monitores rotos muestran estática. Un panel de control sin corriente.',
  'Zona de cuarentena. Señales de peligro biológico cubren las paredes de plástico amarillo.',
  'Central eléctrica. Los generadores siguen zumbando a baja potencia décadas después.',
  'Campamento abandonado. Latas vacías y restos de hogueras recientes entre los escombros.',
  'Torre de vigilancia. Desde aquí se divisa kilómetros de páramo gris bajo el cielo plomizo.',
  'Almacén saqueado. La mayoría de las cajas están rotas y el contenido desapareció.',
  'Calle del mercado negro. Toldos de lona y mesas volcadas entre basura y chatarra.',
  'Fábrica química. Los tanques de almacenamiento oxidados perforan el suelo con goteos ácidos.',
  'Sala de servidores. Las máquinas parpadean con un mínimo de energía residual.',
  'Zona de radiación alta. Un contador Geiger roto en el suelo marca el peligro perpetuo.',
  'Refugio subterráneo. Los civiles que lo habitaban se fueron hace tiempo. Solo quedan recuerdos.',
  'Pasillo de ventilación. El viento radiactivo silba entre los paneles de metal corroído.',
  'Sala del comité. Mesa larga con sillas volcadas y documentos clasificados chamuscados.',
  'Zona de pruebas de tiro. Siluetas pintadas en la pared con marcas de múltiples calibres.',
  'Biblioteca en ruinas. Los libros ennegrecidos se deshacen al tocarlos. El conocimiento, perdido.',
  'Hangar desmantelado. Restos de vehículos militares convertidos en chatarra y piezas sueltas.',
  'Zona de residuos tóxicos. Montañas de desechos irradiados de colores imposibles.',
  'Sala de comunicaciones. Antenas destrozadas y transmisores que nunca más transmitirán.',
  'Corredor de los caídos. Los restos óseos del día del colapso permanecen en el suelo.',
  'Zona de rebosamiento tóxico. Líquido radioactivo corre entre las grietas del suelo.',
  'Sala de máquinas industriales. Prensas hidráulicas oxidadas e inmóviles en la penumbra.',
  'Zona de entrenamiento de raiders. Obstáculos y blancos improvisados entre los escombros.',
  'Estación de metro. Las taquillas fundidas y los carteles decolorados narran otro mundo.',
  'Almacén de residuos nucleares. Bidones sellados apilados de forma precaria hasta el techo.',
  'Cámara de crionización. Las unidades de suspensión vacías, sus puertas abiertas y frías.',
  'Sala de propaganda. Carteles del Señor de la Zona cubren cada centímetro de pared.',
  'Zona de ejecuciones. Postes y cuerdas que hablan de la ley del más fuerte en el páramo.',
  'Depósito de armas. Los armarios están vacíos, saqueados por los propios guardias del Señor.',
  'Corredor de los cables. Madejas de cable de alta tensión cuelgan del techo como lianas.',
  'Sala de radiofrecuencia. Un transmisor emite estática y fragmentos de voces del pasado.',
  'Zona de implosión. El edificio colapsó hacia dentro, creando una cueva de hormigón y acero.',
  'Sala de los experimentos. Tanques de vidrio rotos con restos de proyectos genéticos.',
  'Pasillo de los espejos. El cristal roto refleja tu imagen multiplicada en el polvo.',
  'Zona de los vehículos. Coches y camiones aplastados apilados por alguna fuerza colosal.',
  'Gran plaza del Señor. Los altavoces oxidados retransmiten consignas de control grabadas.',
  'Pasillo de acceso restringido. Marcas de bala recientes en las paredes de hormigón.',
  'Sala de archivos del régimen. Documentos que detallan el ascenso del Señor de la Zona.',
  'Antecámara del Señor. El suelo vibra con los pasos del tirano que aguarda al otro lado.',
]

const BOSS_ROOM_DESC =
  'Sala del trono del páramo. El Señor de la Zona se alza entre pilas de chatarra y trofeos de sus víctimas, ' +
  'enfundado en su armadura de combate de titanio reforzado con placas de acero reciclado. ' +
  'Su rifle de asalto modificado emite un zumbido de sobrecalentamiento. ' +
  'Los ojos tras el visor de la máscara de gas brillan con una crueldad calculada.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Un registro de audio cruje en un walkie-talkie abandonado: ' +
      '"Aquí la resistencia. La armadura del Señor resiste cualquier arma de mano ordinaria. ' +
      'Solo el rifle de precisión de largo alcance del ejército anterior, ' +
      'con munición perforante de tungsteno, puede atravesar su coraza. ' +
      'Está escondido en algún lugar de la zona." ' +
      'El audio se corta con una ráfaga de disparos.',
    reward: 40,
  },
  {
    text:
      'Graffiti grabado con navaja en la pared de hormigón: ' +
      '"El Señor golpea con la fuerza de un vehículo blindado. ' +
      'La armadura de placas de acero reciclado puede absorber una parte del impacto. ' +
      'Sin protección, sus golpes son casi siempre letales. ' +
      'Consigue el equipo antes de intentar llegar a su trono."',
    reward: 25,
  },
  {
    text:
      'Una transmisión fragmentada emerge de un terminal: ' +
      '"Soy la Dra. Mira, antigua investigadora del régimen. El Señor tiene un punto débil: ' +
      'las juntas de su armadura no están reforzadas. Una toxina química concentrada ' +
      'puede penetrar por las grietas y causarle un daño devastador. ' +
      'La Médica de Campo que conozca la fórmula puede usarla en combate." ' +
      'La señal se corta.',
    reward: 30,
  },
  {
    text:
      'Las paredes están cubiertas con los nombres de quienes se atrevieron a desafiar al Señor. ' +
      'Decenas de nombres tachados, y al pie la inscripción pintada en rojo: ' +
      '"Todos llegaron sin el equipo. El rifle y la armadura son la diferencia ' +
      'entre liberar el páramo y convertirte en otro nombre en esta pared." ' +
      'El suelo tiembla. El trono del Señor está muy cerca.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Saqueador armado', hp: 30, attack: 12, reward: 20 },
  { name: 'Mutante carroñero', hp: 40, attack: 18, reward: 30 },
  { name: 'Drone centinela malfuncionante', hp: 20, attack: 8, reward: 15 },
  { name: 'Guardia de élite del Señor', hp: 70, attack: 28, reward: 50 },
  { name: 'Raider fanático', hp: 35, attack: 15, reward: 25 },
  { name: 'Mercenario pesado', hp: 25, attack: 20, reward: 35 },
  { name: 'Centinela acorazado', hp: 50, attack: 22, reward: 40 },
  { name: 'Berserker del páramo', hp: 80, attack: 32, reward: 60 },
  { name: 'Francotirador de la zona', hp: 45, attack: 19, reward: 35 },
  { name: 'Cultista enmascarado', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'El Señor de la Zona', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'Pisas una mina antipersonal oculta bajo los escombros. La explosión te sacude.', damage: 20 },
  { desc: 'Un cable trampa activa una descarga eléctrica de alta tensión al cruzar el umbral.', damage: 15 },
  { desc: 'Una bolsa de gas tóxico explota al pisarla. Inhalas el veneno antes de alejarte.', damage: 18 },
  { desc: 'Un explosivo casero colgado del techo se activa con tu peso en las losas.', damage: 25 },
  { desc: 'Pisas una trampa de presión que dispara esquirlas de metal desde la pared.', damage: 22 },
  { desc: 'Un cable trampa de alambre de cuchillas te corta las piernas al cruzarlo.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Un maletín sellado con provisiones médicas y munición del ejército anterior.', reward: 30 },
  { desc: 'Un cristal de datos cifrado con planos de instalaciones secretas del régimen.', reward: 50 },
  { desc: 'Un reloj de comandante de titanio con grabado "por los caídos del día cero".', reward: 25 },
  { desc: 'Una caja fuerte abierta con lingotes de cobre y componentes electrónicos raros.', reward: 40 },
  { desc: 'Un lote de alimentos sellados al vacío de antes del colapso, intactos.', reward: 45 },
  { desc: 'Una placa de identificación militar de oro con datos de inteligencia grabados.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Un botiquín de primeros auxilios sellado al vacío con suero y antibióticos.', amount: 25 },
  { desc: 'Un estimulante médico inyectable recupera tu energía y sella las heridas menores.', amount: 35 },
  { desc: 'Una fuente de agua purificada por filtros militares. Bebes con avidez y te recuperas.', amount: 30 },
  { desc: 'Un kit de cirugía de campo con anestesia local y material de sutura.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'rifle', name: 'Rifle de precisión', desc: 'Aumenta tu daño en combate. El Soldado lo maneja con precisión letal.' },
  { id: 'armadura', name: 'Armadura de placas recicladas', desc: 'Reduce el daño recibido en combate gracias a sus capas de acero reciclado.' },
  { id: 'botiquin', name: 'Botiquín de campo', desc: 'Restaura 50 puntos de vida al usarlo.' },
]

const ITEM_KEY: ItemDef = {
  id: 'tarjeta',
  name: 'Tarjeta de acceso del régimen',
  desc: 'Desbloquea las puertas de seguridad selladas por el sistema del Señor de la Zona.',
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
  'La Zona Muerta. Explora 49 zonas del páramo postapocalíptico, ' +
  'sobrevive a sus peligros y derrota al Señor de la Zona. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la zona. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar botiquín para curarte. ' +
  'El rifle de precisión sube el daño. La armadura de placas reduce el daño recibido. ' +
  'La tarjeta de acceso abre puertas de seguridad selladas. ' +
  'En combate: atacar o huir. No puedes huir del Señor de la Zona. ' +
  'Soldado: más vida y daño. El rifle de precisión duplica el daño contra el Señor. ' +
  'Médica de Campo: escribe toxina en combate para un ataque químico devastador cada 3 turnos. ' +
  'Saqueador: escribe rastrear para ver qué hay en las zonas adyacentes. ' +
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

export default function ZonaPage() {
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
  const classRef     = useRef<CharacterClass>('soldado')
  const magicCdRef   = useRef(0)
  const phaseRef     = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('soldado')
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
      room.lockedExits[d] ? `${d} (bloqueada)` : d
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
          `El Señor de la Zona te apunta con su rifle con la calma de quien ha matado miles de veces. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'medica' ? ' o "toxina"' : ''}. No puedes huir del Señor.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El Señor de la Zona te desafía.')
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
          addHist('bad', 'Has muerto. El páramo reclamó una víctima más.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'saqueador' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Tesoro — ${desc} +${total} puntos${bonus ? ` (bonus saqueador +${bonus})` : ''}.`)
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
          `Un ${e.name} te sale al paso entre los escombros. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'medica' ? ', "toxina"' : ''} o "huir".`
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
    const hasArmadura = inventoryRef.current.includes('armadura')
    const enemyHp = e.hp - dmg

    if (enemyHp <= 0) {
      syncScore(scoreRef.current + e.reward)
      if (e.isBoss) {
        const bonus = Math.floor(healthRef.current / 2)
        syncScore(scoreRef.current + bonus)
        inCombat.current = false; enemyRef.current = null; setEnemy(null)
        addHist('ok',
          `¡Derrotas al ${e.name}! Cae de rodillas y su armadura se resquebraja. ` +
          `El páramo queda en silencio por primera vez en décadas. ` +
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
        addHist('ok', `Entre sus pertenencias encuentras un estimulante médico. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasArmadura ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const armNote = hasArmadura ? ` (armadura: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${armNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe definitivo. El páramo tiene una víctima más.`)
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

    if (/^(huir|flee|escapar|retirarse|correr)$/.test(cmd)) {
      if (e.isBoss) {
        addHist('bad', 'El Señor bloquea todas las salidas. ¡No hay salida posible!')
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

    if (/^(toxina|veneno|acido|ácido|gas|gas toxico|gas tóxico|quimico|químico|compuesto)$/.test(cmd)) {
      if (classRef.current !== 'medica') {
        addHist('bad', 'Solo la Médica de Campo conoce la fórmula de la toxina química.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `La toxina aún se sintetiza. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Lanzas la toxina química con precisión clínica: ${dmg} de daño al enemigo.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|disparar|a)$/.test(cmd)) {
      const hasRifle = inventoryRef.current.includes('rifle')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasRifle ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasRifle ? dmgRaw * 2 : dmgRaw
      const rifleNote = e.isBoss && hasRifle ? ` (rifle ×2 vs Señor: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${rifleNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al Señor. Escribe: atacar${classRef.current === 'medica' ? ' o toxina' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'medica' ? ', toxina' : ''} o huir.`
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
      const cdNote = classRef.current === 'medica' && magicCdRef.current > 0
        ? ` · Toxina disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(rastrear|explorar|escanear|buscar|sondear|reconocer)$/.test(cmd)) {
      if (classRef.current !== 'saqueador') {
        addHist('bad', 'Solo el Saqueador puede rastrear las zonas adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (bloqueada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'zona en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Reconocimiento de zona: ${lines.join('. ')}.`
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
      if (/^(botiquin|botiquín|medkit|curar|kit|venda|estimulante|medico|médico)$/.test(target)) {
        if (!inventoryRef.current.includes('botiquin')) {
          addHist('bad', 'No tienes ningún botiquín de campo.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'botiquin'))
        addHist('ok', `Usas el botiquín de campo. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas el botiquín. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'El rifle y la armadura se usan automáticamente en combate.'); return
    }

    const go = cmd.match(/^(?:ir|go|caminar|avanzar|entrar|correr)\s+(?:al?\s+)?(.+)$/)
    if (go) {
      const dir = go[1].trim() as Direction
      const room = worldRef.current[roomIdRef.current]
      const dest = room.exits[dir]
      if (dest === undefined) {
        addHist('bad', `No puedes ir al ${dir} desde aquí.`); audio.incorrect(); return
      }
      if (room.lockedExits[dir]) {
        if (inventoryRef.current.includes('tarjeta')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'tarjeta'))
          addHist('ok', `La puerta al ${dir} estaba sellada por el sistema del Señor. La tarjeta de acceso anula el bloqueo.`)
          announcePolite(`Usas la tarjeta para abrir la puerta al ${dir}.`)
        } else {
          addHist('bad', `La puerta al ${dir} está sellada por el sistema de seguridad del Señor. Necesitas la tarjeta de acceso.`)
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
      `${def.name} elegido. ${def.desc}. Entras en la zona de exclusión dispuesto a acabar con el tirano. ` +
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
      room.lockedExits[d] ? `${d} (bloqueada)` : d
    )
    const roomMsg = `${room.description} Salidas: ${dirs.join(', ')}.`
    const initHist: HistEntry[] = [
      { type: 'ok',    text: 'Misión reanudada.' },
      { type: 'scene', text: roomMsg },
    ]

    applyUIState(cl, save.health, save.score, save.inventory, initHist, save.magicCooldown)
    goPhase('playing')
    announcePolite('Misión reanudada. ' + roomMsg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleSaveScore() {
    const result = await saveScore('zona', score)
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
      <GameShell title="La Zona Muerta" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">La Zona Muerta</h2>
          <p className="text-[#888] text-sm">
            Explora 49 zonas del páramo postapocalíptico. Sobrevive a sus peligros y derrota al Señor de la Zona.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => goPhase('selecting')}>Nueva misión</Button>
            {hasSaveData && (
              <Button size="lg" variant="secondary" onClick={loadGame}>
                Continuar misión guardada
              </Button>
            )}
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'selecting') {
    const classes: CharacterClass[] = ['soldado', 'medica', 'saqueador']
    return (
      <GameShell title="La Zona Muerta" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Entrar en la zona!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="La Zona Muerta" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡El Señor de la Zona ha caído!' : 'El páramo te ha reclamado'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              El Señor de la Zona ha sido derrotado. Los supervivientes del páramo son libres por primera vez en décadas. Tu nombre será grabado en la historia de la zona.
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
      title="La Zona Muerta"
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
          {classRef.current === 'medica' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Toxina en {magicCD}t</span>
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
          aria-label="Historial de la misión"
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
            {classRef.current === 'medica' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('toxina'); setInput('') }}
              >
                {magicCD > 0 ? `Toxina (${magicCD}t)` : 'Toxina'}
              </Button>
            )}
            {!enemy.name.includes('Señor') && (
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
