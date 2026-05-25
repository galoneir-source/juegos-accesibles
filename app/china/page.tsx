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
type CharacterClass = 'guerrero' | 'hechicera' | 'espia'

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
    name: 'Guerrero Imperial',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · El Sable del General Zhang duplica el daño contra el Dragón del Cielo',
  },
  hechicera: {
    name: 'Hechicera del Dragón',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Invocación del Dragón Blanco en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  espia: {
    name: 'Espía de la Seda',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "sombra" para ver las zonas adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'china-dragon-v1'
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
  'Puerta del Mediodía del Palacio Prohibido. Las enormes puertas de madera lacada roja permanecen entreabiertas en un silencio inquietante.',
  'Río de Aguas Doradas. El canal interior del palacio refleja el cielo pero sus aguas fluyen en dirección contraria al viento.',
  'Pabellón de las Flores de Cerezo. Los pétalos rosas caen al suelo aunque no hay brisa y los árboles están muertos.',
  'Sala de los Mil Pasos. Baldosas de jade blanco que emiten un suave resplandor al pisarlas.',
  'Jardín de las Tortugas Inmortales. Las estatuas de piedra se han movido desde la última visita: sus cabezas apuntan todas al norte.',
  'Taller del Maestro Lacador Imperial. Moldes de madera pintados con dragones en rojo y negro sin terminar.',
  'Biblioteca de los Anales Imperiales. Rollos de seda con la historia de cada dinastía yacen abiertos en el suelo.',
  'Torre del Tambor. El gran tambor de cuero con borde de bronce golpea solo a intervalos irregulares.',
  'Jardín del Dragón de Jade. Una estatua de dragón verde esmeralda en el centro parece seguirte con los ojos.',
  'Pabellón de las Estaciones. Pinturas murales que cambian de escena con cada hora que pasa.',
  'Sala del Té Imperial. Vasijas de porcelana con el sello del dragón llenas de té que aún humea.',
  'Corredor de las Linternas de Papel. Miles de linternas rojas colgadas que se balancean sin viento.',
  'Sala del Consejo de los Nueve Ministros. Nueve sillas de madera lacada vacías alrededor de una mesa de ébano.',
  'Pabellón del Jade Negro. Columnatas de jade oscuro que absorben la luz dejando el recinto en penumbra eterna.',
  'Jardín de los Bonsáis Encantados. Árboles en miniatura que recrecen si se rompe una rama a los pocos segundos.',
  'Establo Imperial de los Caballos de Guerra. Las cuadras vacías conservan aún el calor de los animales que las habitaban.',
  'Sala del Fénix de Bronce. Una escultura de fénix con las alas abiertas sobre una base de jade rojo.',
  'Torre de las Estrellas. Un observatorio astronómico con un cuadrante de bronce apuntando a constelaciones inexistentes.',
  'Sala de las Armaduras Lacadas. Docenas de armaduras imperiales negras y rojas de pie como guardianes sin alma.',
  'Patio del Gran Sello. Un bajorrelieve circular en el suelo muestra el sello del dragón oscuro que domina el palacio.',
  'Corredor de los Espejos de Bronce. Cada espejo refleja una versión distorsionada de ti mismo.',
  'Sala del Trono Menor. Un trono de madera lacada con incrustaciones de nácar vacío pero con el cojín aún caliente.',
  'Pagoda de los Cinco Pisos. Escaleras de piedra que giran en espiral hacia una cúpula pintada con nubes de tormenta.',
  'Sala de las Campanas de Bronce. Campanas de tamaños distintos que vibran solas emitiendo notas armónicas.',
  'Cámara del Dragón Dormido. Un dragón tallado en jade llena toda la pared del norte como si durmiera dentro de la piedra.',
  'Pasaje de los Guerreros de Terracota. Estatuas de guerreros imperiales que parecen respirar en la oscuridad.',
  'Jardín del Crisantemo Imperial. Flores doradas imposibles en pleno invierno que perfuman el aire con olor a tinta.',
  'Sala de los Mapas del Imperio. Mapas de seda pintados que muestran el Imperio mucho más grande de lo que fue.',
  'Templo de los Ancestros Imperiales. Tablillas conmemorativas con los nombres de cien emperadores pasados.',
  'Cámara del Fuego del Dragón. Un cuenco de bronce con una llama verde que no consume el combustible y no da calor.',
  'Pabellón de la Música del Viento. Flautas de bambú colgadas que producen una melodía cuando pasa el aire.',
  'Galería de los Retratos Imperiales. Pinturas de emperadores cuyos ojos siguen al visitante sin importar el ángulo.',
  'Sala del Cielo de Jade. El techo es una bóveda de jade translúcido que filtra una luz verde sobrenatural.',
  'Corredor de los Dragones de Cerámica. Cenefas de dragones pintados en azul cobalto sobre paredes blancas.',
  'Sala del Viento del Norte. Una corriente de aire helado que sopla del suelo aunque no hay apertura visible.',
  'Cámara de las Perlas del Dragón. Centenares de perlas de agua dulce en vasijas de porcelana sin dueño.',
  'Sala del Dragón de Sombras. Las sombras en las paredes tienen forma de dragones que se mueven solas.',
  'Pasaje de los Talismanes Rotos. Amuletos imperiales en el suelo partidos por la mitad, su protección anulada.',
  'Cámara del Viento del Dragón. El aire huele a sándalo y a escamas de dragón quemadas.',
  'Galería de los Estandartes Imperiales. Banderas de seda con el dragón dorado del Imperio rasgadas de arriba abajo.',
  'Antecámara del Gran Dragón. El suelo de mármol blanco está manchado de tinta negra en forma de garra de dragón.',
  'Sala del Néctar Imperial. Ánforas de porcelana con licor de arroz selladas con el sello del dragón oscuro.',
  'Corredor de los Guerreros Caídos. Armaduras vacías esparcidas como si sus ocupantes se hubieran disuelto en el aire.',
  'Sala de los Tambores de Guerra. Grandes tambores de piel de tigre que resuenan solos con un ritmo marcial.',
  'Pasaje Final del Palacio. Las paredes de jade negro se cierran ligeramente al pasar, como si respiraran.',
  'Sala del Corazón del Dragón. El suelo vibra con un pulso regular que sube por las plantas de los pies.',
  'Cámara del Aliento del Dragón. Un vaho oscuro flota en el aire y el sonido de tu voz se distorsiona al hablar.',
  'Antesala del Trono del Dragón. Las antorchas emiten llamas negras que enfrían el aire en lugar de calentarlo.',
]

const BOSS_ROOM_DESC =
  'Sala del Trono del Dragón del Cielo Oscuro. Las columnas de jade negro se elevan hasta un techo de nubes en tormenta que ruedan sin descanso. ' +
  'Estatuas de dragones de ónix con ojos de rubí flanquean el camino al trono de mármol negro. ' +
  'El Dragón del Cielo Oscuro se manifiesta: una serpiente colosal con escamas de jade negro y garras doradas ' +
  'cuyo cuerpo serpentea entre las columnas mientras sus ojos de rubí te observan con milenios de desdén. ' +
  '"MORTAL INSENSATO. EL PALACIO PROHIBIDO PERTENECE AL DRAGÓN DESDE EL PRIMER DÍA DEL CIELO." ' +
  'Despliega sus alas de sombra y lanza el primer aliento de oscuridad directamente hacia ti.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Una inscripción en seda roja cosida a la pared: ' +
      '"El Sable del General Zhang fue forjado en el corazón de un meteoro y templado en el lago del dragón celeste. ' +
      'Su filo puede cortar incluso las escamas de jade oscuro del Dragón del Cielo. ' +
      'En manos de un Guerrero Imperial que domine el arte del combate ancestral, ' +
      'su golpe contra el señor del cielo duplica su poder letal." ' +
      'La inscripción está rodeada de caracteres imperiales bordados en hilo de oro.',
    reward: 40,
  },
  {
    text:
      'Pintado en la pared por un artesano en su huida: ' +
      '"La Armadura de Seda Imperial está tejida con hilos de seda de dragón blanco tratada con magia ancestral. ' +
      'Sus láminas de jade absorben una parte de cada impacto en combate, ' +
      'reduciendo el daño recibido de forma significativa gracias a los encantamientos bordados en cada pieza."',
    reward: 25,
  },
  {
    text:
      'Un pergamino de seda enrollado dentro de una vasija sellada: ' +
      '"El Dragón del Cielo Oscuro tiene una debilidad: su forma de jade negro es vulnerable a la invocación del Dragón Blanco Celeste. ' +
      'La Hechicera que conozca el ritual correcto puede desestabilizar su esencia de oscuridad ' +
      'y causarle un daño devastador con cada invocación. El ritual necesita tiempo de recarga entre usos." ' +
      'El pergamino se deshace en polvo dorado al terminar de leerlo.',
    reward: 30,
  },
  {
    text:
      'Grabado a toda prisa en una losa de jade con un alfiler de pelo: ' +
      '"Llegué hasta aquí antes que tú. Los pasos sellados con el poder del dragón no se abren con fuerza mortal. ' +
      'Encontré el Sello Imperial en las primeras salas y me abrió el camino hacia el corazón del palacio. ' +
      'Sin él, la magia del Dragón no te dejará avanzar." ' +
      'No hay rastro del que lo escribió.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Guardia imperial corrompido por el dragón', hp: 30, attack: 12, reward: 20 },
  { name: 'Espíritu del guerrero de terracota', hp: 40, attack: 18, reward: 30 },
  { name: 'Asesino de la Orden de la Sombra', hp: 20, attack: 8, reward: 15 },
  { name: 'Dragón menor de jade oscuro', hp: 70, attack: 28, reward: 50 },
  { name: 'General espectral del dragón', hp: 35, attack: 15, reward: 25 },
  { name: 'Eunuco corrompido del palacio', hp: 25, attack: 20, reward: 35 },
  { name: 'Tigre de las sombras imperiales', hp: 50, attack: 22, reward: 40 },
  { name: 'Guardián de bronce animado', hp: 80, attack: 32, reward: 60 },
  { name: 'Monje guerrero corrompido', hp: 45, attack: 19, reward: 35 },
  { name: 'Serpiente de jade de dos cabezas', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'Dragón del Cielo Oscuro', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'Flechas envenenadas de bambú se disparan desde los paneles de madera al pisar la losa central.', damage: 20 },
  { desc: 'Agujas impregnadas en veneno de víbora de la montaña se activan por un hilo de seda invisible al cruzar.', damage: 25 },
  { desc: 'Una baldosa trampa de jade abre un pozo en el suelo que te hace caer varios peldaños.', damage: 18 },
  { desc: 'Gas de adormidera concentrado brota de un incensario de bronce oculto al pisar el umbral.', damage: 15 },
  { desc: 'Un mecanismo de aplastamiento oculto en las paredes se activa al pisar la losa del dragón.', damage: 22 },
  { desc: 'Polvo venenoso de jade negro cae del techo al abrir una caja de madera lacada.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Una vasija de porcelana azul y blanca de la dinastía Ming llena de monedas de oro.', reward: 30 },
  { desc: 'Un collar de jade imperial verde esmeralda engarzado en hilo de seda dorada.', reward: 50 },
  { desc: 'Un abanico de seda pintado con tinta de dragón y varillas de marfil tallado.', reward: 25 },
  { desc: 'Un cofre de madera de sándalo con polvo de jade y piedras preciosas del norte.', reward: 40 },
  { desc: 'Un rollo de seda con caligrafía imperial en tinta de oro sobre fondo carmesí.', reward: 45 },
  { desc: 'Un espejo de bronce imperial con el dragón grabado en relieve en el reverso.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Una fuente de agua bendita del manantial sagrado del palacio te devuelve las fuerzas.', amount: 25 },
  { desc: 'Un jardín interior con plantas medicinales del herbolario imperial, frescas y perfectamente conservadas.', amount: 35 },
  { desc: 'Un baño de vapor imperial con aguas termales que alivian las heridas de combate.', amount: 30 },
  { desc: 'Una pócima del alquimista taoísta olvidada en una estantería de jade, todavía activa y potente.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'sable', name: 'Sable del General Zhang', desc: 'Aumenta tu daño en combate. El Guerrero Imperial lo empuña con la destreza de los héroes legendarios.' },
  { id: 'armadura', name: 'Armadura de seda imperial', desc: 'Reduce el daño recibido gracias a las láminas de jade blanco tejidas con magia ancestral.' },
  { id: 'te', name: 'Té de jade imperial', desc: 'Restaura 50 puntos de vida al beberlo.' },
]

const ITEM_KEY: ItemDef = {
  id: 'sello',
  name: 'Sello Imperial del Dragón',
  desc: 'Desbloquea los pasos sellados con la magia del Dragón del Cielo Oscuro.',
}

const ITEM_NAME: Record<string, string> = Object.fromEntries(
  [...ITEM_REGULAR, ITEM_KEY].map(i => [i.id, i.name])
)

const EVENT_LABELS: Partial<Record<Room['event'], string>> = {
  treasure: 'posible tesoro',
  trap: 'peligro',
  enemy: 'presencia hostil',
  healing: 'fuente curativa',
  item: 'objeto en el suelo',
  boss: '¡jefe final!',
  narrative: 'inscripción de interés',
}

const INSTRUCTIONS =
  'El Dragón del Cielo. Explora 49 zonas del Palacio Prohibido, ' +
  'descubre sus secretos y derrota al Dragón del Cielo Oscuro. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la zona. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar té para curarte. ' +
  'El Sable del General Zhang sube el daño en combate. La Armadura de seda imperial reduce el daño recibido. ' +
  'El Sello Imperial desbloquea los pasos sellados por el Dragón del Cielo Oscuro. ' +
  'En combate: atacar o huir. No puedes huir del Dragón del Cielo. ' +
  'Guerrero Imperial: más vida y daño. El sable duplica el daño contra el Dragón del Cielo. ' +
  'Hechicera del Dragón: escribe dragón en combate para invocar al Dragón Blanco cada 3 turnos. ' +
  'Espía de la Seda: escribe sombra para ver qué hay en las zonas adyacentes. ' +
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

export default function ChinaPage() {
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
  const classRef     = useRef<CharacterClass>('guerrero')
  const magicCdRef   = useRef(0)
  const phaseRef     = useRef<Phase>('idle')

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
          `El Dragón del Cielo Oscuro despliega sus alas de sombra y lanza el primer aliento de oscuridad. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'hechicera' ? ' o "dragón"' : ''}. No puedes huir del Dragón del Cielo Oscuro.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El Dragón del Cielo Oscuro te desafía.')
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
          addHist('bad', 'El Palacio Prohibido te ha reclamado. El Dragón del Cielo Oscuro ha ganado.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'espia' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Tesoro — ${desc} +${total} puntos${bonus ? ` (bonus espía +${bonus})` : ''}.`)
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
        announcePolite(`Te recuperas. Vida: ${hp}.`)
        break
      }

      case 'enemy': {
        const e = room.enemy!
        const ae: ActiveEnemy = { ...e, maxHp: e.hp, isBoss: false }
        enemyRef.current = ae; inCombat.current = true; setEnemy(ae)
        addHist('combat',
          `Un ${e.name} te bloquea el camino. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'hechicera' ? ', "dragón"' : ''} o "huir".`
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
          `¡Derrotas al ${e.name}! Sus escamas de jade negro se disuelven mientras el Palacio Prohibido recupera su esplendor. ` +
          `Los guerreros liberados de su hechizo despiertan confundidos y el Imperio respira de nuevo bajo el sol del Cielo Eterno. ` +
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
        addHist('ok', `Entre sus pertenencias encuentras una pócima de jade. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasArmadura ? Math.floor(rawAtk * 0.6) : rawAtk
    const armaduraNote = hasArmadura ? ` (armadura: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(Math.max(0, healthRef.current - received))

    const playerHp = Math.max(0, healthRef.current)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${armaduraNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe definitivo. Tu historia se apaga como una linterna en la tormenta.`)
      audio.gameOver()
      deleteSave(); setHasSaveData(false)
      announceAssertive('Has caído en el Palacio Prohibido. Fin del juego.')
      goPhase('lost')
    }
    return false
  }

  function handleCombat(cmd: string) {
    const e = enemyRef.current
    if (!e) return

    if (magicCdRef.current > 0) syncMagicCD(magicCdRef.current - 1)

    if (/^(huir|flee|escapar|retirarse|salir)$/.test(cmd)) {
      if (e.isBoss) {
        addHist('bad', 'El Dragón del Cielo Oscuro extiende sus alas de sombra bloqueando todas las salidas. ¡No hay escapatoria del señor del cielo!')
        audio.incorrect(); return
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      syncScore(Math.max(0, scoreRef.current - 5))
      addHist('bad', `Te retiras del combate con el ${e.name}. -5 puntos.`)
      audio.incorrect()
      announcePolite('Te retiraste del combate.')
      const prev = prevIdRef.current
      if (prev !== null) { roomIdRef.current = prev; describeRoom(worldRef.current[prev]) }
      return
    }

    if (/^(dragon|dragón|invocar|conjuro|hechizo|magia|encanto|sortilegio)$/.test(cmd)) {
      if (classRef.current !== 'hechicera') {
        addHist('bad', 'Solo la Hechicera del Dragón conoce los rituales de invocación del Dragón Blanco Celeste.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `La invocación aún se recarga. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Invocas al Dragón Blanco Celeste: ${dmg} de daño de fuego sagrado que quema las escamas del dragón desde dentro.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|cortar|golpear|a)$/.test(cmd)) {
      const hasSable = inventoryRef.current.includes('sable')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasSable ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasSable ? dmgRaw * 2 : dmgRaw
      const sableNote = e.isBoss && hasSable ? ` (sable ×2 vs Dragón: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${sableNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al Dragón. Escribe: atacar${classRef.current === 'hechicera' ? ' o dragón' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'hechicera' ? ', dragón' : ''} o huir.`
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

    if (/^(mirar?|look?|l|observar)$/.test(cmd)) {
      describeRoom(worldRef.current[roomIdRef.current]); return
    }

    if (/^(inventario|inv|i)$/.test(cmd)) {
      const items = inventoryRef.current.length ? inventoryRef.current.map(id => ITEM_NAME[id] ?? id).join(', ') : 'ninguno'
      const cdNote = classRef.current === 'hechicera' && magicCdRef.current > 0
        ? ` · Invocación disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(sombra|acechar|espiar|sigilo|reconocer)$/.test(cmd)) {
      if (classRef.current !== 'espia') {
        addHist('bad', 'Solo el Espía de la Seda puede moverse como una sombra para conocer las zonas adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (sellada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'zona en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Te mueves como una sombra de seda y observas: ${lines.join('. ')}.`
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
      if (/^(te|té|jade|beber|infusion|infusión|taza)$/.test(target)) {
        if (!inventoryRef.current.includes('te')) {
          addHist('bad', 'No tienes ningún té de jade imperial.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'te'))
        addHist('ok', `Bebes el té de jade imperial. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Bebes el té. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'El sable y la armadura se usan automáticamente en combate.'); return
    }

    const go = cmd.match(/^(?:ir|go|avanzar|entrar|moverme?|acceder)\s+(?:al?\s+)?(.+)$/)
    if (go) {
      const dir = go[1].trim() as Direction
      const room = worldRef.current[roomIdRef.current]
      const dest = room.exits[dir]
      if (dest === undefined) {
        addHist('bad', `No puedes ir al ${dir} desde aquí.`); audio.incorrect(); return
      }
      if (room.lockedExits[dir]) {
        if (inventoryRef.current.includes('sello')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'sello'))
          addHist('ok', `El paso al ${dir} estaba sellado con la magia del dragón. El Sello Imperial disuelve el encantamiento y el paso queda libre.`)
          announcePolite(`Usas el Sello Imperial para abrir el paso al ${dir}.`)
        } else {
          addHist('bad', `El paso al ${dir} está sellado con el poder del Dragón del Cielo Oscuro. Necesitas el Sello Imperial.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar té.')
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
      `${def.name} elegido. ${def.desc}. Te adentras en el Palacio Prohibido para derrotar al Dragón del Cielo Oscuro ` +
      `y liberar al Imperio de la oscuridad eterna. ` +
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
    const result = await saveScore('china', score)
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
      <GameShell title="El Dragón del Cielo" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">El Dragón del Cielo</h2>
          <p className="text-[#888] text-sm">
            Explora 49 zonas del Palacio Prohibido. Derrota al Dragón del Cielo Oscuro y libera al Imperio de la oscuridad eterna.
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
    const classes: CharacterClass[] = ['guerrero', 'hechicera', 'espia']
    return (
      <GameShell title="El Dragón del Cielo" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Entrar en el Palacio Prohibido!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="El Dragón del Cielo" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡El Dragón del Cielo Oscuro ha sido derrotado!' : 'Has caído en el Palacio Prohibido'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              Las escamas de jade negro del Dragón se disuelven y el Palacio Prohibido recupera su esplendor dorado. Los guerreros liberados de su hechizo despiertan confundidos mientras el Imperio respira de nuevo bajo el sol del Cielo Eterno.
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
      title="El Dragón del Cielo"
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
          {classRef.current === 'hechicera' && magicCD > 0 && (
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
            {classRef.current === 'hechicera' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('dragon'); setInput('') }}
              >
                {magicCD > 0 ? `Dragón (${magicCD}t)` : 'Invocar Dragón'}
              </Button>
            )}
            {!enemy.isBoss && (
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
