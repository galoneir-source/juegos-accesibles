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
type CharacterClass = 'cazador' | 'medium' | 'alquimista'

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
  cazador: {
    name: 'Cazador de Vampiros',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · La estaca de roble sagrado duplica el daño contra el Conde',
  },
  medium: {
    name: 'Médium',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Luz sagrada en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  alquimista: {
    name: 'Alquimista',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "analizar" para ver las estancias adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'castillo-conde-v1'
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
  'Entrada del castillo. Las puertas de roble ennegrecido se abren con un crujido sobrenatural.',
  'Patio interior. Las estatuas de piedra parecen haber cambiado de posición desde que entraste.',
  'Gran salón. Un retrato del Conde Vordrak te observa con ojos que parecen seguirte.',
  'Cripta de los antepasados. Los sarcófagos están abiertos y vacíos desde hace tiempo.',
  'Torre del observatorio. Un telescopio apunta a una constelación que no existe en ningún atlas.',
  'Biblioteca del Conde. Tomos de magia negra encuadernados en cuero de origen desconocido.',
  'Capilla profanada. El altar invertido emite un olor a azufre y flores descompuestas.',
  'Laboratorio del alquimista. Retortas y crisoles con residuos de experimentos centenarios.',
  'Sala de los espejos. Tu reflejo aparece con un segundo de retraso en las superficies azogadas.',
  'Bodega oscura. Las botellas de un líquido carmesí espeso confirman los peores rumores.',
  'Salón de baile. Siluetas espectrales danzan en silencio en la oscuridad absoluta.',
  'Sala de las armaduras. Los trajes de metal parecen moverse cuando no los miras directamente.',
  'Corredor de los retratos. Los ojos pintados de los nobles Vordrak siguen cada uno de tus pasos.',
  'Cámara de las velas negras. Cientos de llamas que nunca se apagan iluminan el altar oscuro.',
  'Torre norte. El viento aúlla entre las almenas formando palabras ininteligibles.',
  'Sala de los instrumentos. Un clavicémbalo toca una sonata fúnebre sin que nadie lo toque.',
  'Mazmorra. Las cadenas en las paredes conservan rastros de los que fueron prisioneros aquí.',
  'Sala de las reliquias. Objetos sagrados corrompidos por la maldición del Conde Vordrak.',
  'Corredor de los tapices. Escenas bordadas en seda negra narran rituales de oscuridad.',
  'Cámara de la invocación. Un círculo de sal y huesos en el suelo todavía activo.',
  'Torre del reloj. El mecanismo marca siempre la misma hora: las tres de la madrugada.',
  'Sala de los cofres. La mayoría abiertos y vacíos, aunque algunos conservan cerraduras intactas.',
  'Cripta secundaria. Ataúdes sellados con plomo y cera negra, algunos con marcas de arañazos internos.',
  'Pasillo de las antorchas. Las llamas azules se apagan al pasar y se reavivan tras de ti.',
  'Sala del trono menor. El asiento de ébano tallado con calaveras sigue emanando frío.',
  'Laboratorio de sangre. Tubos y mecanismos para extraer y conservar la esencia vital.',
  'Sala de los autómatas. Marionetas de madera con engranajes, detenidas a medio movimiento.',
  'Cámara del pacto. Las paredes muestran el contrato firmado entre Vordrak y la oscuridad.',
  'Corredor de los suspiros. Un viento helado cargado de voces corre a ras del suelo de piedra.',
  'Sala de los herbarios malditos. Plantas que crecen en la oscuridad absoluta sin tierra ni agua.',
  'Torre sur. Desde aquí se divisa el bosque embrujado que rodea el castillo por todas partes.',
  'Cámara de las cartas. Correspondencia cifrada con entidades de otros planos, sin responder.',
  'Sala de los sueños. Quienes duermen aquí no despiertan durante años, según los lugareños.',
  'Corredor de las sombras vivas. Las sombras se mueven de forma independiente a quien las proyecta.',
  'Sala de los huesos. Un mosaico de cráneos en el suelo forma el escudo heráldico de los Vordrak.',
  'Cámara del familiar. La jaula del cuervo del Conde está vacía pero las plumas siguen calientes.',
  'Sala de los mapas astrales. Cartas estelares con constelaciones de otro cielo grabadas en pergamino.',
  'Corredor de las estatuas lloronas. Figuras de mármol blanco con lágrimas de sangre en las mejillas.',
  'Sala de las luciérnagas. Insectos bioluminiscentes de color violeta cubren el techo como un cielo.',
  'Cámara del espejo negro. Una superficie de obsidiana que muestra imágenes de lugares lejanos.',
  'Corredor del tiempo detenido. Un reloj de arena con arena negra que cae hacia arriba.',
  'Sala de los presagios. Vísceras de animales en bandejas de plata, leídas para predecir el futuro.',
  'Cripta de los sirvientes eternos. Los que sirvieron al Conde en vida y en muerte descansan aquí.',
  'Pasillo del umbral. La frontera entre el mundo de los vivos y los muertos es más fina aquí.',
  'Gran cámara de las sombras. El Conde Vordrak se materializa en las noches sin luna en este lugar.',
  'Corredor de los secretos. Puertas falsas y pasajes ocultos en cada pared de piedra negra.',
  'Sala de los espejos rotos. Siete espejos rotos que dicen traer siete siglos de maldición.',
  'Antecámara del Conde. El frío absoluto que precede a la presencia del no-muerto te paraliza.',
]

const BOSS_ROOM_DESC =
  'Sala del trono eterno. El Conde Vordrak se materializa desde la oscuridad: ' +
  'una figura pálida de túnica negra con ojos carmesí que brillan como brasas. ' +
  'Su presencia absorbe la luz de las antorchas y hace temblar el suelo de piedra. ' +
  '"Has llegado demasiado lejos, mortal." Su voz es el sonido del viento en las tumbas.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Un diario manchado de sangre entre los escombros: ' +
      '"Soy el cazador Renfield. El Conde Vordrak es invulnerable a las armas comunes. ' +
      'Solo la estaca de roble sagrado bendecida en la capilla puede destruir su esencia. ' +
      'En las manos de un Cazador de Vampiros es aún más letal: duplica el daño. ' +
      'Está escondida en algún rincón del castillo." ' +
      'Las últimas páginas están arrancadas.',
    reward: 40,
  },
  {
    text:
      'Inscripciones grabadas en la piedra de la cripta: ' +
      '"La capa encantada del orden de los cazadores fue forjada para resistir las garras del no-muerto. ' +
      'Su tejido mágico absorbe parte de cada golpe sobrenatural. ' +
      'Sin ella, los ataques del Conde arrancan el alma junto con la carne."',
    reward: 25,
  },
  {
    text:
      'Una voz etérea emerge del aire: ' +
      '"Soy el espíritu de la hermana Agata. El Conde teme la luz sagrada sobre todas las cosas. ' +
      'Una Médium que canalice la energía divina puede proyectar esa luz en forma de ataque puro, ' +
      'causando un daño devastador a su esencia oscura. ' +
      'Pero la luz necesita tiempo para recargarse entre usos." ' +
      'La voz se desvanece como niebla al sol.',
    reward: 30,
  },
  {
    text:
      'Las paredes están cubiertas con los nombres de quienes intentaron llegar hasta el Conde. ' +
      'Cientos de nombres borrados, y al pie la inscripción en rojo oscuro: ' +
      '"Todos llegaron sin la estaca ni la capa. El equipo adecuado ' +
      'es la diferencia entre el exorcismo y unirse a los no-muertos del castillo." ' +
      'El frío aumenta. El trono del Conde está muy cerca.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Fantasma guardián', hp: 30, attack: 12, reward: 20 },
  { name: 'Vampiro menor', hp: 40, attack: 18, reward: 30 },
  { name: 'Esqueleto armado', hp: 20, attack: 8, reward: 15 },
  { name: 'Lobo de las sombras', hp: 70, attack: 28, reward: 50 },
  { name: 'Gárgola viviente', hp: 35, attack: 15, reward: 25 },
  { name: 'Dama espectral', hp: 25, attack: 20, reward: 35 },
  { name: 'Zombi noble', hp: 50, attack: 22, reward: 40 },
  { name: 'Murciélago colosal', hp: 80, attack: 32, reward: 60 },
  { name: 'Espectro del mayordomo', hp: 45, attack: 19, reward: 35 },
  { name: 'Cultista de la oscuridad', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'Conde Vordrak', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'El suelo falso sobre la cripta cede y caes entre los huesos de las catacumbas.', damage: 20 },
  { desc: 'Una vela maldita te roza la mano. El contacto drena tu energía vital de inmediato.', damage: 15 },
  { desc: 'Una trampa de pinchos medievales se activa al pisar la losa marcada con una calavera.', damage: 18 },
  { desc: 'Gas soporífico del laboratorio del alquimista llena la sala al abrir la puerta.', damage: 25 },
  { desc: 'Una cuchilla oculta en el umbral corta profundo al cruzar sin percatarte.', damage: 22 },
  { desc: 'Tocas un objeto maldito. La energía oscura se transmite a través de tus dedos.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Un cofre con joyas del clan Vordrak: rubíes negros y esmeraldas de corte antiguo.', reward: 30 },
  { desc: 'Monedas de oro del siglo anterior con el perfil del primer Conde Vordrak acuñado.', reward: 50 },
  { desc: 'Un candelabro de plata maciza con inscripciones en latín eclesiástico antiguo.', reward: 25 },
  { desc: 'El anillo de sello del Conde: un rubí oscuro sobre montura de oro negro.', reward: 40 },
  { desc: 'Un collar de esmeraldas talladas con la historia del linaje Vordrak en imágenes.', reward: 45 },
  { desc: 'Un grimorio menor con hechizos del nivel inferior, encuadernado en cuero de dragón.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Un vial de agua bendita de la capilla. Su contacto sella las heridas y calma el dolor.', amount: 25 },
  { desc: 'Hierbas medicinales del jardín del castillo, conservadas en aceite de mirra.', amount: 35 },
  { desc: 'Un elixir de vida del laboratorio, de color dorado y olor a rosa y miel.', amount: 30 },
  { desc: 'El calor de la chimenea del gran salón restaura tus fuerzas y sella tus heridas.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'estaca', name: 'Estaca de roble sagrado', desc: 'Aumenta tu daño en combate. El Cazador la empuña con una eficacia mortal.' },
  { id: 'capa', name: 'Capa encantada del cazador', desc: 'Reduce el daño recibido en combate gracias a su tejido mágico protector.' },
  { id: 'elixir', name: 'Elixir de vida', desc: 'Restaura 50 puntos de vida al beberlo.' },
]

const ITEM_KEY: ItemDef = {
  id: 'crucifijo',
  name: 'Crucifijo de plata bendito',
  desc: 'Rompe la maldición del Conde que sella algunas puertas del castillo.',
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
  'La Maldición del Conde. Explora 49 estancias del castillo maldito, ' +
  'descubre sus secretos y exorciza al Conde Vordrak. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la estancia. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar elixir para curarte. ' +
  'La estaca de roble sagrado sube el daño. La capa encantada reduce el daño recibido. ' +
  'El crucifijo de plata abre puertas selladas por la maldición del Conde. ' +
  'En combate: atacar o huir. No puedes huir del Conde Vordrak. ' +
  'Cazador: más vida y daño. La estaca duplica el daño contra el Conde. ' +
  'Médium: escribe luz en combate para proyectar luz sagrada devastadora cada 3 turnos. ' +
  'Alquimista: escribe analizar para ver qué hay en las estancias adyacentes. ' +
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

export default function CastilloPage() {
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
  const classRef     = useRef<CharacterClass>('cazador')
  const magicCdRef   = useRef(0)
  const phaseRef     = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('cazador')
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
      room.lockedExits[d] ? `${d} (maldita)` : d
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
          `El Conde Vordrak te fija con sus ojos carmesí y despliega sus colmillos con una sonrisa glacial. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'medium' ? ' o "luz"' : ''}. No puedes huir del Conde.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El Conde Vordrak te desafía.')
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
          addHist('bad', 'Has muerto. El castillo reclama una víctima más para el Conde.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'alquimista' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Tesoro — ${desc} +${total} puntos${bonus ? ` (bonus alquimista +${bonus})` : ''}.`)
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
          `Un ${e.name} emerge de las sombras del castillo. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'medium' ? ', "luz"' : ''} o "huir".`
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
    const hasCapa = inventoryRef.current.includes('capa')
    const enemyHp = e.hp - dmg

    if (enemyHp <= 0) {
      syncScore(scoreRef.current + e.reward)
      if (e.isBoss) {
        const bonus = Math.floor(healthRef.current / 2)
        syncScore(scoreRef.current + bonus)
        inCombat.current = false; enemyRef.current = null; setEnemy(null)
        addHist('ok',
          `¡Exorcizas al ${e.name}! El Conde emite un grito sobrenatural y su forma se disuelve en polvo negro. ` +
          `La maldición del castillo se rompe para siempre. ` +
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
        addHist('ok', `Entre sus restos encuentras un vial de agua bendita. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasCapa ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const capaNote = hasCapa ? ` (capa: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${capaNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe final. El castillo tiene una nueva víctima eterna.`)
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
        addHist('bad', 'El Conde bloquea todas las salidas con su presencia sobrenatural. ¡No hay escapatoria!')
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

    if (/^(luz|luz sagrada|sagrada|invocar|exorcizar|orar|rezar|santa luz|santa)$/.test(cmd)) {
      if (classRef.current !== 'medium') {
        addHist('bad', 'Solo el Médium puede canalizar la luz sagrada en combate.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `La luz sagrada aún se recarga. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Canalizas la luz sagrada con toda tu energía espiritual: ${dmg} de daño divino al enemigo.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|clavar|a)$/.test(cmd)) {
      const hasEstaca = inventoryRef.current.includes('estaca')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasEstaca ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasEstaca ? dmgRaw * 2 : dmgRaw
      const estacaNote = e.isBoss && hasEstaca ? ` (estaca ×2 vs Conde: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${estacaNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al Conde. Escribe: atacar${classRef.current === 'medium' ? ' o luz' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'medium' ? ', luz' : ''} o huir.`
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
      const cdNote = classRef.current === 'medium' && magicCdRef.current > 0
        ? ` · Luz sagrada disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(analizar|explorar|estudiar|examinar|observar|percibir)$/.test(cmd)) {
      if (classRef.current !== 'alquimista') {
        addHist('bad', 'Solo el Alquimista puede analizar las estancias adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (maldita)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'estancia en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Análisis alquímico: ${lines.join('. ')}.`
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
      if (/^(elixir|pocion|poción|curar|beber|vida|frasco)$/.test(target)) {
        if (!inventoryRef.current.includes('elixir')) {
          addHist('bad', 'No tienes ningún elixir de vida.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'elixir'))
        addHist('ok', `Bebes el elixir de vida. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas el elixir. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'La estaca y la capa se usan automáticamente en combate.'); return
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
        if (inventoryRef.current.includes('crucifijo')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'crucifijo'))
          addHist('ok', `La puerta al ${dir} estaba sellada por la maldición del Conde. El crucifijo de plata rompe el hechizo.`)
          announcePolite(`Usas el crucifijo para abrir la puerta al ${dir}.`)
        } else {
          addHist('bad', `La puerta al ${dir} está maldita por el Conde Vordrak. Necesitas el crucifijo de plata.`)
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
      `${def.name} elegido. ${def.desc}. Entras al castillo maldito del Conde Vordrak. ` +
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
      room.lockedExits[d] ? `${d} (maldita)` : d
    )
    const roomMsg = `${room.description} Salidas: ${dirs.join(', ')}.`
    const initHist: HistEntry[] = [
      { type: 'ok',    text: 'Investigación reanudada.' },
      { type: 'scene', text: roomMsg },
    ]

    applyUIState(cl, save.health, save.score, save.inventory, initHist, save.magicCooldown)
    goPhase('playing')
    announcePolite('Investigación reanudada. ' + roomMsg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleSaveScore() {
    const result = await saveScore('castillo', score)
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
      <GameShell title="La Maldición del Conde" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">La Maldición del Conde</h2>
          <p className="text-[#888] text-sm">
            Explora 49 estancias del castillo maldito. Descubre sus secretos y exorciza al Conde Vordrak para siempre.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => goPhase('selecting')}>Nueva investigación</Button>
            {hasSaveData && (
              <Button size="lg" variant="secondary" onClick={loadGame}>
                Continuar investigación guardada
              </Button>
            )}
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'selecting') {
    const classes: CharacterClass[] = ['cazador', 'medium', 'alquimista']
    return (
      <GameShell title="La Maldición del Conde" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Entrar al castillo!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="La Maldición del Conde" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡El Conde Vordrak ha sido exorcizado!' : 'El castillo te ha reclamado'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              El Conde Vordrak se ha disuelto para siempre. La maldición del castillo se ha roto y los espíritus atrapados en sus muros por fin pueden descansar en paz.
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
      title="La Maldición del Conde"
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
          {classRef.current === 'medium' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Luz sagrada en {magicCD}t</span>
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
          aria-label="Historial de la investigación"
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
            {classRef.current === 'medium' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('luz'); setInput('') }}
              >
                {magicCD > 0 ? `Luz (${magicCD}t)` : 'Luz sagrada'}
              </Button>
            )}
            {!enemy.name.includes('Conde') && (
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
