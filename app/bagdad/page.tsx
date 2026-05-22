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
    name: 'Guerrero del Desierto',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · La cimitarra de Sinbad duplica el daño contra el Califa',
  },
  hechicera: {
    name: 'Hechicera',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Conjuro del libro de los djinns en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  ladron: {
    name: 'Ladrón de Bagdad',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "sombra" para ver las zonas adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'bagdad-califa-v1'
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
  'Entrada al gran bazar de Bagdad. Los vendedores callan y las miradas se desvían al verte llegar.',
  'Mercado de especias. El aroma de canela, azafrán y cardamomo flota en el aire del atardecer.',
  'Jardines del palacio del califa bueno. Las fuentes de mármol están selladas desde su caída.',
  'Caravanserai abandonado. Los camellos se fueron y las alforjas de cuero quedaron donde cayeron.',
  'Pozo del oasis sagrado. El agua refleja el cielo estrellado aunque sea pleno día.',
  'Taller del orfebre real. Moldes de oro y plata fundida llenos de joyas a medio terminar.',
  'Cueva de los cuarenta ladrones. Las vasijas de aceite siguen allí, vacías desde la derrota de Alí Babá.',
  'Tienda del mago de la ciudad. Pergaminos y viales con líquidos de colores imposibles llenan los estantes.',
  'Cámara del djinn encadenado. Las cadenas de bronce grabado siguen atadas a una pared invisible.',
  'Torre de los astrólogos. El telescopio de cobre apunta a una estrella que no debería existir.',
  'Hammam privado del visir. Los mosaicos de azulejos azules narran batallas que aún no han ocurrido.',
  'Sala de los cuentos prohibidos. Tablillas con historias que el Califa de las Sombras mandó quemar.',
  'Biblioteca del sabio Harún. Miles de pergaminos sobre magia, astronomía y la naturaleza del djinn.',
  'Patio de la danza de las estrellas. El suelo de mosaico muestra constelaciones que se mueven solas.',
  'Establo de los caballos alados. Las huellas en la arena son demasiado grandes para un caballo normal.',
  'Sala del oráculo de Bagdad. Una bola de cristal negro muestra imágenes de lo que pudo haber sido.',
  'Cripta de los visires caídos. Sus nombres están borrados de las lápidas pero sus fantasmas permanecen.',
  'Jardín de las rosas encantadas. Las flores de colores imposibles perfuman el aire de forma hipnótica.',
  'Fuente de los deseos. Monedas de cien reinos diferentes yacen en el fondo de sus aguas quietas.',
  'Sala del consejo del califa bueno. Los doce asientos vacíos rodean una mesa de ébano y marfil.',
  'Torre de la guardia del visir. Desde aquí se ve Bagdad extenderse hasta el río Tigris.',
  'Mercado del conocimiento petrificado. Los puestos de libros y pergaminos quedaron congelados en el tiempo.',
  'Templo menor del Califa de las Sombras. Las paredes rezuman una oscuridad sin origen visible.',
  'Cámara de los espejos del destino. Cada espejo muestra una versión diferente de tu futuro posible.',
  'Pasaje de entrada al palacio oscuro. El suelo cambia de mosaico de colores a piedra negra sin luz.',
  'Corredor de los genios capturados. Lámparas y anillos con djinns prisioneros en cada vitrina.',
  'Sala de los guardianes de bronce. Estatuas de guerreros árabes con alfanje apuntan al visitante.',
  'Corredor de los tapices animados. Las escenas en los tejidos se mueven y narran historias de terror.',
  'Cámara del viento del desierto. Una corriente de arena fina gira en espiral en el centro de la sala.',
  'Sala de los libros quemados. Cenizas de sabiduría ancestral cubren el suelo como nieve negra.',
  'Trono del califa bueno. El asiento de marfil y oro está vacío pero su calor se percibe en el aire.',
  'Galería de los sultanes vencidos. Retratos de gobernantes que el Califa de las Sombras destruyó.',
  'Cámara del fuego eterno del desierto. Una llama azul que no consume nada arde en una copa de oro.',
  'Sala de los astros árabes. El techo azul pintado con las constelaciones del cielo de Oriente Medio.',
  'Pasaje de los murales de las batallas. Frescos que narran conquistas de reinos lejanos en colores vivos.',
  'Cámara del río de arena. Una corriente de arena dorada cuya profundidad nadie ha podido medir.',
  'Sala del viento del Califa. Un frío sobrenatural que no pertenece al desierto invade la estancia.',
  'Cripta de los magos derrotados. Sarcófagos de ébano con inscripciones de maldición todavía activas.',
  'Corredor de las trampas antiguas. Marcas en los mosaicos delatan mecanismos que siguen activos.',
  'Sala de la constelación de la espada. El mosaico reproduce la batalla estelar del dios guerrero.',
  'Antecámara del trono de sombras. El aire huele a sándalo quemado y a poder corrompido.',
  'Cámara del néctar del califa. Ánforas de vino especiado selladas con cera negra llenan las estanterías.',
  'Sala de los tambores de la guerra. Instrumentos que resuenan solos con el ritmo del ejército en marcha.',
  'Corredor final del palacio oscuro. Las paredes de mosaico se oscurecen a medida que avanzas.',
  'Sala del pacto con los djinns. Un acuerdo de sangre grabado en plata fundida brilla con luz verde.',
  'Cámara del corazón del palacio. El suelo vibra al ritmo del poder oscuro que lo habita.',
  'Antesala del Califa. Las antorchas emiten llamas negras al entrar; el silencio es absoluto.',
  'Galería de las almas capturadas. Sombras de personas atrapadas en lámparas apiladas en estantes.',
]

const BOSS_ROOM_DESC =
  'Sala del trono del Califa de las Sombras. Las paredes están cubiertas de sombras que se mueven solas ' +
  'y el aire huele a sándalo quemado y traición. Djinns encadenados de obsidiana flanquean el camino ' +
  'al trono de piedra negra donde se sienta el Califa, envuelto en ropas de sombra con ojos que brillan ' +
  'con una luz que no viene del sol ni de las estrellas. ' +
  '"MORTAL OSADO. MI PALACIO NO ES LUGAR PARA LOS VIVOS." ' +
  'Levanta su báculo de cristal negro y los djinns se sueltan de sus cadenas mientras se levanta a atacar.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Una inscripción en la pared escrita en tinta de azafrán: ' +
      '"La cimitarra forjada por el herrero de los djinns con acero caído del cielo lleva en su filo ' +
      'el poder de las estrellas. Su hoja puede cortar incluso las sombras materializadas del Califa. ' +
      'En manos de un Guerrero del Desierto que conozca los movimientos del combate ancestral, ' +
      'su golpe contra el señor de las sombras duplica su poder." ' +
      'La inscripción está rodeada de caligrafía árabe dorada.',
    reward: 40,
  },
  {
    text:
      'Pintado en la pared por una hechicera en su huida: ' +
      '"El velo tejido con hilos de luna por las hadas del desierto lleva bordados de protección activos. ' +
      'Quien lo viste en combate siente cómo absorbe una parte de cada golpe del enemigo, ' +
      'reduciendo el daño de forma significativa gracias a la magia tejida en cada hilo."',
    reward: 25,
  },
  {
    text:
      'Un pergamino enrollado dentro de un jarrón sellado: ' +
      '"El Califa de las Sombras tiene una debilidad: su forma de sombra es vulnerable a la magia del libro ' +
      'de los djinns. La Hechicera que conozca el conjuro correcto puede desestabilizar su esencia de oscuridad ' +
      'y causarle un daño devastador. El conjuro necesita tiempo de recarga entre usos." ' +
      'El pergamino se deshace en polvo de estrellas al terminar de leerlo.',
    reward: 30,
  },
  {
    text:
      'Grabado a toda prisa en un azulejo con un anillo: ' +
      '"Llegué hasta aquí antes que tú. Los pasos encantados no se abren con fuerza mortal. ' +
      'Encontré la Lámpara de Aladino en las primeras zonas y me abrió el camino hacia el palacio oscuro. ' +
      'Sin ella, las sombras del Califa no te dejarán avanzar." ' +
      'No hay rastro del que lo escribió.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Guardia del Califa de las Sombras', hp: 30, attack: 12, reward: 20 },
  { name: 'Djinn menor encadenado', hp: 40, attack: 18, reward: 30 },
  { name: 'Ladrón del bazar maldito', hp: 20, attack: 8, reward: 15 },
  { name: 'Espíritu del desierto furioso', hp: 70, attack: 28, reward: 50 },
  { name: 'Guerrero con alfanje dorado', hp: 35, attack: 15, reward: 25 },
  { name: 'Genio maligno liberado', hp: 25, attack: 20, reward: 35 },
  { name: 'Asesino de la Orden Oscura', hp: 50, attack: 22, reward: 40 },
  { name: 'Guardián del palacio de sombras', hp: 80, attack: 32, reward: 60 },
  { name: 'Hechicero rival del Califa', hp: 45, attack: 19, reward: 35 },
  { name: 'Serpiente encantada de dos cabezas', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'Califa de las Sombras', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'Arena movediza oculta bajo un tapiz de seda te hunde hasta la cintura antes de poder reaccionar.', damage: 20 },
  { desc: 'Dardos envenenados con veneno de escorpión del desierto se disparan desde los azulejos de la pared.', damage: 25 },
  { desc: 'Una red de seda cortante cae del techo al cruzar el umbral de mosaico de la estancia.', damage: 18 },
  { desc: 'Gas de adormidera concentrado brota de un incensario oculto al pisar la losa central.', damage: 15 },
  { desc: 'Un mecanismo de aplastamiento oculto en las paredes se activa al pisar el mosaico central.', damage: 22 },
  { desc: 'Agujas impregnadas en veneno de víbora del desierto se activan por un hilo invisible al cruzar.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Una alfombra persa tejida con hilos de oro y seda de la India enrollada con cuidado.', reward: 30 },
  { desc: 'Una bolsa de cuero con rubíes y esmeraldas sin tallar del comerciante de Damasco.', reward: 50 },
  { desc: 'Una ánfora de perfume de rosas de Damasco, el más preciado del mercado oriental.', reward: 25 },
  { desc: 'Un collar de perlas del Mar Arábigo engarzadas en cadena de oro del califato.', reward: 40 },
  { desc: 'Un cofre con monedas de oro del califato con el sello del soberano legítimo.', reward: 45 },
  { desc: 'Un espejo encantado con marco de plata labrada que muestra la verdad al mirarlo.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Una fuente de agua bendita del oasis sagrado del desierto te devuelve las fuerzas.', amount: 25 },
  { desc: 'Una sala con hierbas del médico del califa bueno, frescas y perfectamente conservadas.', amount: 35 },
  { desc: 'Un hammam privado con aguas curativas bendecidas por el imam de Bagdad.', amount: 30 },
  { desc: 'Una pócima de alquimista olvidada en una estantería, todavía activa y potente.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'cimitarra', name: 'Cimitarra de Sinbad el Marino', desc: 'Aumenta tu daño en combate. El Guerrero del Desierto la empuña con la destreza de los héroes legendarios.' },
  { id: 'velo', name: 'Velo de protección encantado', desc: 'Reduce el daño recibido gracias a los bordados de protección tejidos por las hadas del desierto.' },
  { id: 'datiles', name: 'Dátiles mágicos del oasis', desc: 'Restaura 50 puntos de vida al comerlos.' },
]

const ITEM_KEY: ItemDef = {
  id: 'lampara',
  name: 'Lámpara de Aladino',
  desc: 'Desbloquea los pasos encantados protegidos por la magia del Califa de las Sombras.',
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
  'Las Mil y Una Noches. Explora 49 zonas de Bagdad y el palacio maldito, ' +
  'descubre sus secretos y derrota al Califa de las Sombras. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la zona. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar dátiles para curarte. ' +
  'La cimitarra de Sinbad sube el daño en combate. El velo encantado reduce el daño recibido. ' +
  'La Lámpara de Aladino desbloquea los pasos encantados por el Califa de las Sombras. ' +
  'En combate: atacar o huir. No puedes huir del Califa. ' +
  'Guerrero del Desierto: más vida y daño. La cimitarra duplica el daño contra el Califa. ' +
  'Hechicera: escribe conjuro en combate para lanzar un hechizo del libro de los djinns cada 3 turnos. ' +
  'Ladrón de Bagdad: escribe sombra para ver qué hay en las zonas adyacentes. ' +
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

export default function BagdadPage() {
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
      room.lockedExits[d] ? `${d} (encantada)` : d
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
          `El Califa de las Sombras levanta su báculo de cristal negro y los djinns se sueltan. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'hechicera' ? ' o "conjuro"' : ''}. No puedes huir del Califa de las Sombras.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El Califa de las Sombras te desafía.')
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
          addHist('bad', 'Las sombras del Califa te envuelven. El palacio de la oscuridad ha ganado.')
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
          `Escribe "atacar"${classRef.current === 'hechicera' ? ', "conjuro"' : ''} o "huir".`
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
    const hasVelo = inventoryRef.current.includes('velo')
    const enemyHp = e.hp - dmg

    if (enemyHp <= 0) {
      syncScore(scoreRef.current + e.reward)
      if (e.isBoss) {
        const bonus = Math.floor(healthRef.current / 2)
        syncScore(scoreRef.current + bonus)
        inCombat.current = false; enemyRef.current = null; setEnemy(null)
        addHist('ok',
          `¡Derrotas al ${e.name}! Sus sombras se disuelven mientras el palacio recupera la luz. ` +
          `Los djinns quedan libres para siempre y Bagdad puede respirar de nuevo. ` +
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
        addHist('ok', `Entre sus pertenencias encuentras dátiles mágicos del desierto. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasVelo ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const veloNote = hasVelo ? ` (velo: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${veloNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe definitivo. Tu historia se apaga como una vela en el desierto.`)
      audio.gameOver()
      deleteSave(); setHasSaveData(false)
      announceAssertive('Has caído en el palacio oscuro. Fin del juego.')
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
        addHist('bad', 'El Califa de las Sombras extiende sus sombras bloqueando todas las salidas. ¡No hay escapatoria del señor de la oscuridad!')
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

    if (/^(conjuro|hechizo|magia|djinn|genio|encanto|sortilegio)$/.test(cmd)) {
      if (classRef.current !== 'hechicera') {
        addHist('bad', 'Solo la Hechicera conoce los conjuros del libro de los djinns.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `El conjuro aún se recarga. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Lanzas un conjuro del libro de los djinns: ${dmg} de daño mágico que quema al enemigo desde dentro.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|cortar|golpear|a)$/.test(cmd)) {
      const hasCimitarra = inventoryRef.current.includes('cimitarra')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasCimitarra ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasCimitarra ? dmgRaw * 2 : dmgRaw
      const cimitarraNote = e.isBoss && hasCimitarra ? ` (cimitarra ×2 vs Califa: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${cimitarraNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al Califa. Escribe: atacar${classRef.current === 'hechicera' ? ' o conjuro' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'hechicera' ? ', conjuro' : ''} o huir.`
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
        ? ` · Conjuro disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(sombra|acechar|espiar|sigilo|reconocer)$/.test(cmd)) {
      if (classRef.current !== 'ladron') {
        addHist('bad', 'Solo el Ladrón de Bagdad puede moverse como una sombra para conocer las zonas adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (encantada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'zona en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Te mueves como una sombra y observas: ${lines.join('. ')}.`
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
      if (/^(datiles|dátiles|frutos|curar|comer|oasis|fecha)$/.test(target)) {
        if (!inventoryRef.current.includes('datiles')) {
          addHist('bad', 'No tienes ningún dátil mágico del oasis.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'datiles'))
        addHist('ok', `Comes los dátiles mágicos del oasis. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas los dátiles. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'La cimitarra y el velo se usan automáticamente en combate.'); return
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
        if (inventoryRef.current.includes('lampara')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'lampara'))
          addHist('ok', `El paso al ${dir} estaba protegido por encantamiento. La Lámpara de Aladino disuelve la magia del Califa y el paso queda libre.`)
          announcePolite(`Usas la lámpara para abrir el paso al ${dir}.`)
        } else {
          addHist('bad', `El paso al ${dir} está protegido por un encantamiento del Califa de las Sombras. Necesitas la Lámpara de Aladino.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar dátiles.')
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
      `${def.name} elegido. ${def.desc}. Te adentras en el palacio de Bagdad para detener al Califa de las Sombras ` +
      `y liberar al reino de la oscuridad eterna. ` +
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
      room.lockedExits[d] ? `${d} (encantada)` : d
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
    const result = await saveScore('bagdad', score)
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
      <GameShell title="Las Mil y Una Noches" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Las Mil y Una Noches</h2>
          <p className="text-[#888] text-sm">
            Explora 49 zonas de Bagdad y el palacio maldito. Derrota al Califa de las Sombras y libera al reino de la oscuridad eterna.
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
      <GameShell title="Las Mil y Una Noches" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Entrar en Bagdad!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Las Mil y Una Noches" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡El Califa de las Sombras ha sido derrotado!' : 'Has perecido en el palacio'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              Las sombras del Califa se disuelven y sus djinns quedan libres para siempre. La luz vuelve a los bazares de Bagdad y el reino respira de nuevo bajo el cielo estrellado.
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
      title="Las Mil y Una Noches"
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
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Conjuro en {magicCD}t</span>
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
                onClick={() => { processCommand('conjuro'); setInput('') }}
              >
                {magicCD > 0 ? `Conjuro (${magicCD}t)` : 'Conjuro'}
              </Button>
            )}
            {!enemy.name.includes('Califa') && (
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
