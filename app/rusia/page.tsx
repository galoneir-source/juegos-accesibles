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
type CharacterClass = 'guerrero' | 'hechicera' | 'ladron'

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
    name: 'Bogatyr',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · La Espada del Bogatyr duplica el daño contra Koschei el Inmortal',
  },
  hechicera: {
    name: 'Hechicera del Bosque',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Invocación del Pájaro de Fuego en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  ladron: {
    name: 'Ladrón del Zar',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "sombra" para ver las zonas adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'rusia-koschei-v1'
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
  'Entrada al palacio del Zar. Las enormes puertas de madera tallada con el águila bicéfala permanecen entreabiertas hacia una oscuridad helada.',
  'Plaza de los Siete Boyardos. Los estandartes bordados con hilos de oro cuelgan inmóviles pese al viento que barre el patio nevado.',
  'Torre del Gran Reloj. Las agujas de hierro forjado giran hacia atrás desde que Koschei tomó el palacio.',
  'Jardín de las Rosas de Nieve. Flores blancas imposibles florecen en la oscuridad sin necesitar luz ni calor.',
  'Establos del Zar. Los corceles blancos del palacio siguen allí, inmóviles como estatuas de mármol viviente.',
  'Cocina imperial. Los pucheros de cobre bullen solos con sopas que nadie preparó y nadie comerá.',
  'Sala de los Iconos de Plata. Santos y arcángeles pintados sobre plata vuelven la cabeza para mirarte al pasar.',
  'Biblioteca del Gran Mago Imperial. Grimorios en ruso antiguo apilados hasta el techo; algunos se abren solos en páginas de conjuros.',
  'Cabaña de Baba Yaga reconstruida en el ala norte. Las patas de gallina siguen moviéndose aunque la estructura está anclada al suelo.',
  'Estanque del Pato Encantado. Las aguas negras reflejan una luna que no existe en el cielo que ves por las ventanas.',
  'Sala de los Espejos del Zar. Cien espejos de marco dorado que muestran reflejos de gente que no está en la sala.',
  'Corredor de los Soldados de Plomo. Figuritas del ejército imperial que se mueven de formación en formación solas.',
  'Salón del Baile Eterno. El suelo de parqué brilla como nuevo y la música de balalaika suena sola sin músicos.',
  'Cámara del Pájaro de Fuego. Una jaula de oro vacía con el calor residual del Fénix arde todavía en el metal.',
  'Cueva del Oso Guardián. El gran oso del norte duerme junto a la entrada; su respiración mueve las velas encendidas.',
  'Taller del Herrero Mágico. Herraduras y armas encantadas a medio terminar sobre una fragua que arde sin combustible.',
  'Sala del Lobo Gris. Pelo plateado en el suelo y huellas de lobo que salen por una pared sin puerta visible.',
  'Jardín de las Manzanas Doradas. El árbol sigue produciendo frutos del color del sol aunque sus ramas son de hielo negro.',
  'Pozo de los Deseos. Una cubeta de plata baja sola al fondo y sube con agua que emite vapores de colores.',
  'Sala del Consejo de los Doce Caballeros. Doce sillas vacías con las armaduras de los paladines del Zar todavía puestas.',
  'Cripta de los Zares Anteriores. Sarcófagos de mármol blanco cuyos ocupantes han sido perturbados pero siguen dentro.',
  'Cámara de los Cuervos Parlantes. Decenas de cuervos negros que recitan fragmentos de conversaciones del pasado.',
  'Pasillo de los Tapices Animados. Batallas bordadas en hilo que se mueven; los soldados caen y se levantan en bucle.',
  'Sala de la Troika Encantada. El trineo de oro del Zar flota sin caballos, girando despacio en el centro.',
  'Cámara del Hielo Eterno. Una columna de hielo transparente contiene algo dentro que no puede verse con claridad.',
  'Torre de las Campanas del Este. Las campanas de bronce tañen solas a intervalos sin ritmo reconocible.',
  'Sala del Samovar de Plata. Una tetera gigante que sirve sola; el té que vierte es negro como la tinta.',
  'Jardín de los Girasoles Negros. Flores que giran siguiendo una luz que no existe y absorben la poca claridad del ambiente.',
  'Sala del Ajedrez de los Zares. Figuras de marfil y ónix que se mueven solas en una partida sin final posible.',
  'Cámara de los Pergaminos del Hechicero. Textos en cirílico antiguo que brillan en rojo cuando los acercas a la luz.',
  'Sala del Trono Auxiliar. Un trono de ámbar báltico vacío pero con el calor de quien acaba de levantarse.',
  'Corredor del Viento del Norte. Un frío sobrenatural que no pertenece a ninguna estación invade la estancia.',
  'Galería de los Retratos del Linaje. Pinturas de zares cuya expresión cambia si las observas durante más de un segundo.',
  'Cámara del Oso Polar Disecado. El oso blanco abre los ojos cuando entras y los cierra cuando sales.',
  'Sala de los Instrumentos del Folclore. Balalaikas, domras y guslis que producen música sola al entrar.',
  'Pasaje de los Talismanes del Este. Amuletos de hueso y madera colgados que giran solos señalando al norte.',
  'Antecámara del Hechicero. Pergaminos quemados con restos de conjuros que aún emiten calor sin brasas visibles.',
  'Sala del Fuego de San Elmo. Llamas azules frías que flotan sin combustible ni humo en el centro de la estancia.',
  'Cripta del General Invencible. La armadura del general más famoso del Imperio, vacía pero de pie como si la vistiera alguien.',
  'Cámara del Vórtice de Nieve. Una ventisca en miniatura gira en espiral bajo el techo sin hacer frío.',
  'Sala de los Conjuros Rotos. Vestigios de magia protectora que Koschei destruyó: cristales y runas partidos.',
  'Corredor de los Espejos Negros. Espejos de ónix que no reflejan nada pero emiten luz propia oscura.',
  'Sala del Altar del Oso Sagrado. Un altar de madera tallada con ofrendas de miel y bayas que siguen frescas.',
  'Pasaje Final del Palacio. Las paredes de piedra se estrechan ligeramente al avanzar, como si respiraran.',
  'Cámara del Corazón del Palacio. El suelo vibra con un pulso frío que sube por las plantas de los pies.',
  'Sala del Aliento de Koschei. El aire huele a tierra helada y a magia antigua corrompida.',
  'Antesala del Trono de Koschei. Las antorchas emiten llamas azules que enfrían el aire en lugar de calentarlo.',
  'Galería de las Almas Capturadas. Frascos de cristal con luces titilantes que representan las almas robadas por Koschei.',
]

const BOSS_ROOM_DESC =
  'Sala del Trono de Koschei el Inmortal. Las paredes de piedra negra están cubiertas de runas de poder antiguo que brillan con luz roja fría. ' +
  'Huesos de dragón y los trofeos de mil batallas adornan cada columna del salón helado. ' +
  'Koschei el Inmortal se levanta de su trono de hierro: una figura emaciada y altísima con dedos como garras ' +
  'y ojos que arden con una llama azul inextinguible desde hace siglos. ' +
  'Su aguja de la muerte brilla en el extremo de un bastón de hueso negro. ' +
  '"MORTAL INSENSATO. MI MUERTE ESTÁ OCULTA DONDE JAMÁS PODRÁS LLEGAR." ' +
  'Eleva su bastón y lanza el primer rayo de oscuridad helada directamente hacia ti.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Una inscripción en pergamino cosido a la pared con hilo de plata: ' +
      '"La Espada del Bogatyr fue forjada por el herrero mágico Svyatogor en el corazón de un meteorito ' +
      'y fue templada en el agua del río sagrado Smorodina. Su acero puede herir incluso lo que ' +
      'no puede morir. En manos de un Bogatyr que conozca el golpe ancestral de los héroes del folclore, ' +
      'su impacto contra Koschei el Inmortal duplica su poder letal." ' +
      'La inscripción está rodeada de runas eslavas bordadas en hilo de oro.',
    reward: 40,
  },
  {
    text:
      'Pintado en la pared por un mago en su huida: ' +
      '"La Capa de Baba Yaga está tejida con plumas del Pájaro de Fuego tratadas con magia del bosque ancestral. ' +
      'Quien la viste en combate siente cómo sus plumas encantadas absorben una parte de cada golpe del enemigo, ' +
      'reduciendo el daño recibido de forma significativa gracias a la magia tejida en cada fibra."',
    reward: 25,
  },
  {
    text:
      'Un pergamino enrollado dentro de un frasco de cristal sellado con cera negra: ' +
      '"Koschei el Inmortal tiene una debilidad: su magia de la muerte es vulnerable al fuego del Pájaro de Fuego celeste. ' +
      'La Hechicera que conozca el ritual correcto puede invocar al Fénix y desestabilizar la esencia de Koschei, ' +
      'causándole un daño devastador con cada invocación. El ritual necesita tiempo de recarga entre usos." ' +
      'El pergamino se deshace en ceniza dorada al terminar de leerlo.',
    reward: 30,
  },
  {
    text:
      'Grabado a toda prisa en una viga de madera con un cuchillo: ' +
      '"Llegué hasta aquí antes que tú. Los pasos bloqueados por la magia de Koschei no ceden con la fuerza de los mortales. ' +
      'Encontré el Huevo de Koschei en las primeras salas y me abrió el camino hacia su corazón de poder. ' +
      'Sin él, sus runas no te dejarán avanzar." ' +
      'No hay rastro del que lo escribió.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Guardia del palacio corrompido por Koschei', hp: 30, attack: 12, reward: 20 },
  { name: 'Espectro de boyardo caído', hp: 40, attack: 18, reward: 30 },
  { name: 'Lobo de las nieves encantado', hp: 20, attack: 8, reward: 15 },
  { name: 'Oso guardián del norte', hp: 70, attack: 28, reward: 50 },
  { name: 'Hechicero menor de Koschei', hp: 35, attack: 15, reward: 25 },
  { name: 'Soldado de plomo animado', hp: 25, attack: 20, reward: 35 },
  { name: 'Dragón menor encadenado', hp: 50, attack: 22, reward: 40 },
  { name: 'Cuervo gigante de las sombras', hp: 80, attack: 32, reward: 60 },
  { name: 'Guerrero esqueleto del ejército de Koschei', hp: 45, attack: 19, reward: 35 },
  { name: 'Serpiente de hielo de tres cabezas', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'Koschei el Inmortal', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'Flechas de hielo se disparan desde los muros al pisar la losa central de runa.', damage: 20 },
  { desc: 'Una trampa de hielo oculta bajo la alfombra te inmoviliza los pies y te corta al liberarte.', damage: 25 },
  { desc: 'Gas venenoso del incensario de Koschei brota al abrir una puerta lateral sin llave.', damage: 18 },
  { desc: 'Una red de alambre encantado invisible al cruzar el umbral te envuelve y desgarra.', damage: 15 },
  { desc: 'Un mecanismo de aplastamiento oculto en las paredes se activa al pisar la runa del suelo.', damage: 22 },
  { desc: 'Polvo mágico de las runas de Koschei cae del techo y quema la piel al inhalar.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Un huevo de Fabergé de esmalte azul y oro con mecanismo de relojería en el interior.', reward: 30 },
  { desc: 'Un collar de ámbar báltico con insectos prehistóricos atrapados en su interior dorado.', reward: 50 },
  { desc: 'Una bolsa de monedas de oro del Imperio con el perfil del Zar acuñado en cada pieza.', reward: 25 },
  { desc: 'Un icono con marco de oro y rubíes que representa a un arcángel con espada de plata.', reward: 40 },
  { desc: 'Un cofre de madera lacada con incrustaciones de nácar lleno de joyas de la corona imperial.', reward: 45 },
  { desc: 'Un cáliz de plata con esmalte azul y el escudo del Imperio grabado en el pie.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Una fuente de agua bendita del manantial sagrado del bosque te devuelve las fuerzas.', amount: 25 },
  { desc: 'Un jardín interior con plantas medicinales del herbolario imperial, frescas en pleno invierno.', amount: 35 },
  { desc: 'Una banya privada con vapor de abedul y hierbas que sana las heridas de combate.', amount: 30 },
  { desc: 'Una pócima del mago imperial olvidada en una estantería de la biblioteca, todavía activa.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'espada', name: 'Espada del Bogatyr', desc: 'Aumenta tu daño en combate. El Bogatyr la empuña con la fuerza de los héroes del folclore eslavo.' },
  { id: 'capa', name: 'Capa de Baba Yaga', desc: 'Reduce el daño recibido gracias a las plumas del Pájaro de Fuego tejidas en su tela encantada.' },
  { id: 'manzana', name: 'Manzana de la Inmortalidad', desc: 'Restaura 50 puntos de vida al comerla.' },
]

const ITEM_KEY: ItemDef = {
  id: 'huevo',
  name: 'Huevo de Koschei',
  desc: 'Desbloquea los pasos bloqueados con la magia de Koschei el Inmortal.',
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
  'El Último Bogatyr. Explora 49 zonas del palacio del Zar corrompido por Koschei el Inmortal, ' +
  'descubre sus secretos y derrota al hechicero de la muerte. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la zona. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar manzana para curarte. ' +
  'La Espada del Bogatyr sube el daño en combate. La Capa de Baba Yaga reduce el daño recibido. ' +
  'El Huevo de Koschei desbloquea los pasos bloqueados por su magia. ' +
  'En combate: atacar o huir. No puedes huir de Koschei el Inmortal. ' +
  'Bogatyr: más vida y daño. La espada duplica el daño contra Koschei. ' +
  'Hechicera del Bosque: escribe pájaro en combate para invocar al Pájaro de Fuego cada 3 turnos. ' +
  'Ladrón del Zar: escribe sombra para ver qué hay en las zonas adyacentes. ' +
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

export default function RusiaPage() {
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
          `Koschei el Inmortal eleva su bastón de hueso negro y lanza el primer rayo de oscuridad helada. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'hechicera' ? ' o "pájaro"' : ''}. No puedes huir de Koschei el Inmortal.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! Koschei el Inmortal te desafía.')
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
          addHist('bad', 'El palacio helado de Koschei te ha reclamado. El Inmortal ha ganado.')
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
        announcePolite(`Te recuperas. Vida: ${hp}.`)
        break
      }

      case 'enemy': {
        const e = room.enemy!
        const ae: ActiveEnemy = { ...e, maxHp: e.hp, isBoss: false }
        enemyRef.current = ae; inCombat.current = true; setEnemy(ae)
        addHist('combat',
          `Un ${e.name} te bloquea el camino. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'hechicera' ? ', "pájaro"' : ''} o "huir".`
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
          `¡Derrotas a ${e.name}! Su aguja de la muerte se rompe en mil pedazos y sus runas se apagan para siempre. ` +
          `El palacio recupera la luz y los espíritus capturados quedan libres mientras el Imperio respira de nuevo. ` +
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
        addHist('ok', `Entre sus pertenencias encuentras una pócima del bosque. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasCapa ? Math.floor(rawAtk * 0.6) : rawAtk
    const capaNote = hasCapa ? ` (capa: -${rawAtk - received} absorbido)` : ''
    const playerHp = Math.max(0, healthRef.current - received)

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
      addHist('bad', `El ${e.name} te da el golpe definitivo. Tu historia se congela como el río en pleno invierno.`)
      audio.gameOver()
      deleteSave(); setHasSaveData(false)
      announceAssertive('Has caído en el palacio de Koschei. Fin del juego.')
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
        addHist('bad', 'Koschei extiende su mano de garras bloqueando todas las salidas con sus runas. ¡No hay escapatoria del Inmortal!')
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

    if (/^(pajaro|pájaro|fuego|fenix|fénix|conjuro|hechizo|magia|encanto)$/.test(cmd)) {
      if (classRef.current !== 'hechicera') {
        addHist('bad', 'Solo la Hechicera del Bosque conoce el ritual de invocación del Pájaro de Fuego.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `La invocación aún se recarga. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Invocas al Pájaro de Fuego: ${dmg} de daño de llamas sagradas que derriten las runas del enemigo desde dentro.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|cortar|golpear|a)$/.test(cmd)) {
      const hasEspada = inventoryRef.current.includes('espada')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasEspada ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasEspada ? dmgRaw * 2 : dmgRaw
      const espadaNote = e.isBoss && hasEspada ? ` (espada ×2 vs Koschei: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${espadaNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente a Koschei. Escribe: atacar${classRef.current === 'hechicera' ? ' o pájaro' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'hechicera' ? ', pájaro' : ''} o huir.`
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
        ? ` · Pájaro de Fuego disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(sombra|acechar|espiar|sigilo|reconocer)$/.test(cmd)) {
      if (classRef.current !== 'ladron') {
        addHist('bad', 'Solo el Ladrón del Zar puede moverse sigiloso para conocer las zonas adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (bloqueada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'zona en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Te mueves sigiloso como un ladrón del Zar y observas: ${lines.join('. ')}.`
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
      if (/^(manzana|manzanas|fruta|comer|dorada|inmortalidad)$/.test(target)) {
        if (!inventoryRef.current.includes('manzana')) {
          addHist('bad', 'No tienes ninguna manzana de la inmortalidad.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'manzana'))
        addHist('ok', `Muerdes la manzana de la inmortalidad. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas la manzana. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'La espada y la capa se usan automáticamente en combate.'); return
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
        if (inventoryRef.current.includes('huevo')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'huevo'))
          addHist('ok', `El paso al ${dir} estaba bloqueado por la magia de Koschei. El Huevo del Inmortal disuelve las runas y el paso queda libre.`)
          announcePolite(`Usas el Huevo de Koschei para abrir el paso al ${dir}.`)
        } else {
          addHist('bad', `El paso al ${dir} está bloqueado por las runas de Koschei el Inmortal. Necesitas el Huevo de Koschei.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar manzana.')
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
      `${def.name} elegido. ${def.desc}. Te adentras en el palacio del Zar para derrotar a Koschei el Inmortal ` +
      `y liberar las almas capturadas por su magia de la muerte. ` +
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
    const result = await saveScore('rusia', score)
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
      <GameShell title="El Último Bogatyr" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">El Último Bogatyr</h2>
          <p className="text-[#888] text-sm">
            Explora 49 zonas del palacio del Zar corrompido por Koschei el Inmortal. Derrota al hechicero de la muerte y libera las almas capturadas.
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
    const classes: CharacterClass[] = ['guerrero', 'hechicera', 'ladron']
    return (
      <GameShell title="El Último Bogatyr" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Entrar en el palacio del Zar!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="El Último Bogatyr" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Koschei el Inmortal ha sido derrotado!' : 'Has caído en el palacio del Zar'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              La aguja de la muerte de Koschei se rompe en mil pedazos y sus runas se apagan para siempre. El palacio recupera la luz y los espíritus capturados quedan libres mientras el Imperio respira de nuevo bajo el sol del invierno ruso.
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
      title="El Último Bogatyr"
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
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Pájaro en {magicCD}t</span>
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
                onClick={() => { processCommand('pajaro'); setInput('') }}
              >
                {magicCD > 0 ? `Pájaro (${magicCD}t)` : 'Pájaro de Fuego'}
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
