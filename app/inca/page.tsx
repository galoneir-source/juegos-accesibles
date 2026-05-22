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
type CharacterClass = 'guerrero' | 'sacerdotisa' | 'ladron'

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
    name: 'Guerrero Inca',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · El hacha ceremonial duplica el daño contra Supay',
  },
  sacerdotisa: {
    name: 'Sacerdotisa del Sol',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Oración de Inti en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  ladron: {
    name: 'Ladrón de Oro',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "acechar" para ver las zonas adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'inca-supay-v1'
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
  'Entrada al valle andino. Las cumbres nevadas de los Andes se alzan sobre un cielo de un azul imposible.',
  'Terrazas de cultivo abandonadas. Las plantas de maíz sagrado crecen sin manos que las cuiden.',
  'Camino inca empedrado. Las piedras encajan con una precisión que ningún mortero puede explicar.',
  'Puente de cuerda colgante sobre un abismo. El viento andino lo hace oscilar con suavidad amenazante.',
  'Templo del Sol en ruinas. Los bloques de granito tallado yacen volcados por un terremoto olvidado.',
  'Baños rituales de piedra. El agua sigue fluyendo por canales milenarios sin razón aparente.',
  'Almacén de quipus sagrados. Cuerdas con nudos de colores que codifican siglos de historia imperial.',
  'Sala del consejo de los Cuatro Suyos. Cuatro tronos vacíos miran al centro desde sus esquinas.',
  'Cripta de los señores del tiempo. Momias sentadas en nichos observan la eternidad en silencio.',
  'Plaza ceremonial de la ciudadela. Los adoquines muestran el mapa estelar del cielo inca grabado a fuego.',
  'Taller de los orfebres del Inca. Moldes de oro fundido y herramientas de obsidiana cubren las mesas.',
  'Corredor de los guerreros de élite. Los frisos de piedra narran batallas victoriosas del Imperio.',
  'Sala de las llamas sagradas. Efigies de bronce del animal guía del Imperio flanquean cada paso.',
  'Mirador sobre el cañón del río Urubamba. El rugido del agua llega amortiguado desde la profundidad.',
  'Altar del sacrificio al Sol. Las manchas de sangre seca son demasiado oscuras para ser antiguas.',
  'Bosque de ceibas milenarias. Sus raíces abrazan las piedras del camino inca con fuerza de siglos.',
  'Cueva de la Pachamama. Ofrendas de coca, chicha y maíz llenan el suelo de la caverna sagrada.',
  'Plaza del Ushnu, la pirámide escalonada. Desde lo alto se ve el Imperio hasta donde alcanza la vista.',
  'Fuente de agua sagrada. El chorro emerge de la boca de un puma tallado en roca volcánica.',
  'Sala del calendario lunar. Ventanas perforadas proyectan círculos de luz en el solsticio.',
  'Torre de vigilancia inca. Desde aquí los mensajeros chasquis divisaban las rutas del Capac Ñan.',
  'Mercado petrificado del Imperio. Los puestos de trueque quedaron congelados cuando la maldición cayó.',
  'Templo menor de Supay. Las paredes están cubiertas de calaveras de piedra que parecen moverse.',
  'Cámara de las momias reales. Los Incas muertos gobiernan desde aquí a través de sus sacerdotes.',
  'Pasaje de entrada a la ciudadela sagrada. El suelo cambia de color: la roca blanca cede al negro volcánico.',
  'Vestíbulo interior de la ciudadela. El eco de tus pasos regresa multiplicado desde paredes invisibles.',
  'Sala de los guardianes de piedra. Estatuas de soldados incas con lanzas apuntan al visitante.',
  'Corredor de los espejos de mica. Tu reflejo aparece roto en mil fragmentos brillantes.',
  'Cámara del viento sagrado. Corrientes de aire frío forman espirales que giran sin cesar.',
  'Sala de los códices andinos. Tablillas de madera con grabados que ningún académico ha descifrado.',
  'Trono del Sapa Inca. El asiento del soberano está vacío pero la energía de su poder aún vibra.',
  'Galería de los ancestros imperiales. Retratos tallados en piedra de los Incas que gobernaron.',
  'Cámara del fuego sagrado de Inti. Una llama que nunca se apaga arde desde tiempos inmemoriales.',
  'Sala de los astros del Sur. El techo está pintado con las constelaciones andinas en polvo de oro.',
  'Pasaje de los murales de guerra. Frescos que narran la conquista de los pueblos vecinos del Imperio.',
  'Cámara del cenote negro. Un pozo de agua oscura cuya profundidad nadie ha podido medir.',
  'Sala del viento de Supay. Un frío sobrenatural que no tiene origen físico visible invade la estancia.',
  'Cripta de los sacerdotes de la muerte. Sarcófagos pintados de negro con jeroglíficos de maldición.',
  'Corredor de las trampas antiguas. Huecos en el suelo delatan mecanismos que aún funcionan.',
  'Sala de la constelación del Cóndor. El mosaico del suelo reproduce el vuelo del ave sagrada.',
  'Antecámara del inframundo. El aire huele a tierra mojada y a flores de muerto.',
  'Cámara del maíz sagrado. Espigas de oro macizo llenan las estanterías de piedra hasta el techo.',
  'Sala de los tambores del trueno. Instrumentos de cuero estirado que resuenan solos en la oscuridad.',
  'Corredor final de la ciudadela. Las paredes se estrechan y el techo desciende centímetro a centímetro.',
  'Sala del pacto con Supay. Un contrato de sangre grabado en obsidiana pulida refleja tu imagen distorsionada.',
  'Cámara del corazón de los Andes. El suelo vibra al ritmo de la montaña como si respirara.',
  'Antesala del Dios de la Muerte. Las velas se apagan solas al entrar y el silencio se vuelve absoluto.',
  'Galería de las almas perdidas. Sombras atrapadas en las paredes claman en susurros que no llegan a ser palabras.',
]

const BOSS_ROOM_DESC =
  'Sanctuario de Supay, el Dios de la Muerte. El techo está cubierto de huesos dorados y las paredes rezuman una oscuridad que no es falta de luz sino presencia de sombra. ' +
  'En el centro, sobre un trono de obsidiana y cráneos, una figura oscura se materializa lentamente: Supay, el Dios de la Muerte del inframundo inca, se alza con su capa de sombras y sus ojos de fuego negro. ' +
  '"MORTAL. NADIE HA LLEGADO HASTA AQUÍ PARA CONTARLO." ' +
  'Su voz resuena desde todos los rincones a la vez mientras extiende sus brazos y la oscuridad avanza hacia ti.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Una inscripción grabada en la pared por un sacerdote inca: ' +
      '"El hacha ceremonial de Tiwanaku, forjada con meteorito sagrado caído del cielo de Inti, ' +
      'es el único arma que puede penetrar la armadura de sombras de Supay. ' +
      'En manos de un Guerrero Inca que conozca los rituales de combate, ' +
      'su impacto sobre el Dios de la Muerte duplica su poder." ' +
      'El texto está rodeado de figuras de cóndores en vuelo.',
    reward: 40,
  },
  {
    text:
      'Pintado por una sacerdotisa en la pared hace generaciones: ' +
      '"El escudo ceremonial de Pachacamac lleva la bendición de los dioses benignos del Cielo. ' +
      'Quien lo porta en combate siente cómo absorbe una parte de cada golpe del enemigo, ' +
      'devolviendo intacta una fracción de la fuerza del portador."',
    reward: 25,
  },
  {
    text:
      'Un mensaje grabado en una tablilla de madera dentro de una vasija sellada: ' +
      '"Supay, el Dios de la Muerte, teme una sola cosa: la luz de Inti invocada por una Sacerdotisa pura. ' +
      'La oración sagrada de Inti puede atravesar sus sombras y causarle un daño devastador. ' +
      'La oración necesita tiempo para recargarse entre usos: ' +
      'la paciencia de la sacerdotisa es su escudo más poderoso." ' +
      'La tablilla se deshace en polvo dorado al terminar de leerla.',
    reward: 30,
  },
  {
    text:
      'Grabado con urgencia en la roca, con letra temblorosa: ' +
      '"Llegué hasta aquí antes que tú. Los pasajes sagrados no se abren con fuerza. ' +
      'Encontré el quipu ceremonial en las zonas anteriores. Sin él, la ciudadela no te dejará pasar. ' +
      'Ojalá llegues más lejos que yo." ' +
      'No hay rastro de quien lo escribió.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Guerrero llantaruna', hp: 30, attack: 12, reward: 20 },
  { name: 'Sacerdote de Supay', hp: 40, attack: 18, reward: 30 },
  { name: 'Cóndor gigante', hp: 20, attack: 8, reward: 15 },
  { name: 'Momia guerrera del inframundo', hp: 70, attack: 28, reward: 50 },
  { name: 'Cazador con honda de guerra', hp: 35, attack: 15, reward: 25 },
  { name: 'Estatua animada del dios negro', hp: 25, attack: 20, reward: 35 },
  { name: 'Serpiente pitón sagrada', hp: 50, attack: 22, reward: 40 },
  { name: 'Guardián de la ciudadela', hp: 80, attack: 32, reward: 60 },
  { name: 'Espíritu del pacarimoc', hp: 45, attack: 19, reward: 35 },
  { name: 'Chamán rival de las sombras', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'Supay, el Dios de la Muerte', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'Flechas envenenadas con curare disparadas desde orificios en la pared al cruzar la losa.', damage: 20 },
  { desc: 'Una losa que cede bajo tus pies te precipita a un foso de estacas de obsidiana.', damage: 25 },
  { desc: 'Gas narcótico brota de urnas ceremoniales rotas al rozarlas con el hombro.', damage: 18 },
  { desc: 'Una red de espinas camuflada cae del techo al cruzar el umbral de piedra.', damage: 15 },
  { desc: 'Un mecanismo de aplastamiento oculto en las paredes se activa al pisar la losa central.', damage: 22 },
  { desc: 'Un dardo impregnado en veneno de sapo kambó te alcanza en el cuello desde la oscuridad.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Una máscara ceremonial de oro puro con incrustaciones de turquesa y coral rojo.', reward: 30 },
  { desc: 'Un collar de esmeraldas y turquesas engarzadas en hilo de oro del Qhapaq.', reward: 50 },
  { desc: 'Una llama de bronce macizo con ojos de jade y lana de alpaca bordada.', reward: 25 },
  { desc: 'Un quipu de hilos de oro que codifica los secretos económicos del Imperio.', reward: 40 },
  { desc: 'Una vasija de cerámica inca sellada con cacao sagrado y monedas de cobre.', reward: 45 },
  { desc: 'Un cuchillo tupu de oro macizo con empuñadura de plumas de quetzal.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Una fuente termal de aguas curativas bendecidas por los sacerdotes de Inti te restaura.', amount: 25 },
  { desc: 'Una cámara con hierbas medicinales andinas frescas, perfectamente conservadas.', amount: 35 },
  { desc: 'Aguas sagradas del cenote inca cierran tus heridas al bañarlas brevemente.', amount: 30 },
  { desc: 'Un bálsamo de hojas de coca y plantas curativas de los Andes alivia el dolor.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'hacha', name: 'Hacha ceremonial de Tiwanaku', desc: 'Aumenta tu daño en combate. El Guerrero Inca la maneja con una destreza devastadora.' },
  { id: 'escudo', name: 'Escudo ceremonial de Pachacamac', desc: 'Reduce el daño recibido gracias a la bendición de los dioses del Cielo.' },
  { id: 'chicha', name: 'Chicha sagrada de maíz morado', desc: 'Restaura 50 puntos de vida al beberla.' },
]

const ITEM_KEY: ItemDef = {
  id: 'quipu',
  name: 'Quipu ceremonial del Sapa Inca',
  desc: 'Desbloquea los pasajes sagrados sellados con sellos imperiales de la ciudadela.',
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
  'El Imperio del Sol. Explora 49 zonas de los Andes y la ciudadela inca perdida, ' +
  'descubre sus secretos y derrota a Supay, el Dios de la Muerte. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la zona. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar chicha para curarte. ' +
  'El hacha ceremonial sube el daño en combate. El escudo ceremonial reduce el daño recibido. ' +
  'El quipu ceremonial desbloquea los pasajes sagrados sellados por el Imperio. ' +
  'En combate: atacar o huir. No puedes huir de Supay. ' +
  'Guerrero Inca: más vida y daño. El hacha duplica el daño contra Supay. ' +
  'Sacerdotisa del Sol: escribe oracion en combate para invocar la luz de Inti cada 3 turnos. ' +
  'Ladrón de Oro: escribe acechar para ver qué hay en las zonas adyacentes. ' +
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

export default function IncaPage() {
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
      room.lockedExits[d] ? `${d} (sagrada)` : d
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
          `Supay, el Dios de la Muerte, despliega sus sombras hacia ti con furia. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'sacerdotisa' ? ' o "oracion"' : ''}. No puedes huir del Dios de la Muerte.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! Supay, el Dios de la Muerte, te desafía.')
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
          addHist('bad', 'Supay cobra su tributo. Las sombras del inframundo te reclaman.')
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
          `Un ${e.name} te bloquea el paso. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'sacerdotisa' ? ', "oracion"' : ''} o "huir".`
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
          `¡Derrotas a ${e.name}! Su forma de sombra se deshace en polvo oscuro mientras emite un aullido que sacude los Andes. ` +
          `La luz de Inti vuelve a brillar sobre la ciudadela. ` +
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
        addHist('ok', `Entre sus pertenencias encuentras hierbas medicinales andinas. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasEscudo ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const escudoNote = hasEscudo ? ` (escudo: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${escudoNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe definitivo. Las sombras del inframundo te reclaman.`)
      audio.gameOver()
      deleteSave(); setHasSaveData(false)
      announceAssertive('Has caído en la ciudadela. Fin del juego.')
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
        addHist('bad', 'Supay te envuelve con las sombras del inframundo. ¡No hay escapatoria del Dios de la Muerte!')
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

    if (/^(oracion|oración|rezo|inti|invocar|luz|plegaria|ruego)$/.test(cmd)) {
      if (classRef.current !== 'sacerdotisa') {
        addHist('bad', 'Solo la Sacerdotisa del Sol conoce la oración sagrada de Inti.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `La oración aún se recarga. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Invocas la luz sagrada de Inti: ${dmg} de daño divino que abrasa las sombras del enemigo.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|cortar|golpear|a)$/.test(cmd)) {
      const hasHacha = inventoryRef.current.includes('hacha')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasHacha ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasHacha ? dmgRaw * 2 : dmgRaw
      const hachaNote = e.isBoss && hasHacha ? ` (hacha ×2 vs Supay: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${hachaNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente a Supay. Escribe: atacar${classRef.current === 'sacerdotisa' ? ' o oracion' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'sacerdotisa' ? ', oracion' : ''} o huir.`
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
      const cdNote = classRef.current === 'sacerdotisa' && magicCdRef.current > 0
        ? ` · Oración disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(acechar|espiar|reconocer|vigilar|observar)$/.test(cmd)) {
      if (classRef.current !== 'ladron') {
        addHist('bad', 'Solo el Ladrón de Oro puede acechar para conocer las zonas adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (sagrada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'zona en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Acechas las zonas adyacentes: ${lines.join('. ')}.`
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
      if (/^(chicha|bebida|brebaje|curar|beber|maiz|maíz)$/.test(target)) {
        if (!inventoryRef.current.includes('chicha')) {
          addHist('bad', 'No tienes ninguna chicha sagrada.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'chicha'))
        addHist('ok', `Bebes la chicha sagrada de maíz morado. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas la chicha. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'El hacha y el escudo se usan automáticamente en combate.'); return
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
        if (inventoryRef.current.includes('quipu')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'quipu'))
          addHist('ok', `El paso al ${dir} estaba sellado con sellos imperiales. El quipu ceremonial los disuelve y el paso queda libre.`)
          announcePolite(`Usas el quipu para abrir el paso al ${dir}.`)
        } else {
          addHist('bad', `El paso al ${dir} está sellado con sellos sagrados del Imperio. Necesitas el quipu ceremonial del Sapa Inca.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar chicha.')
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
      `${def.name} elegido. ${def.desc}. Te adentras en los Andes en busca de Supay, el Dios de la Muerte, ` +
      `para salvar el Imperio del Sol. ` +
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
      room.lockedExits[d] ? `${d} (sagrada)` : d
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
    const result = await saveScore('inca', score)
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
      <GameShell title="El Imperio del Sol" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">El Imperio del Sol</h2>
          <p className="text-[#888] text-sm">
            Explora 49 zonas de los Andes y la ciudadela inca perdida. Descubre sus secretos y derrota a Supay, el Dios de la Muerte.
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
    const classes: CharacterClass[] = ['guerrero', 'sacerdotisa', 'ladron']
    return (
      <GameShell title="El Imperio del Sol" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Adentrarse en los Andes!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="El Imperio del Sol" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Supay, el Dios de la Muerte, ha sido derrotado!' : 'Has perecido en los Andes'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              Supay se ha disuelto en sombra y polvo. La luz de Inti vuelve a brillar sobre los Andes y el Imperio del Sol queda libre de la maldición eterna del Dios de la Muerte.
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
      title="El Imperio del Sol"
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
          {classRef.current === 'sacerdotisa' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Oración en {magicCD}t</span>
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
            {classRef.current === 'sacerdotisa' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('oracion'); setInput('') }}
              >
                {magicCD > 0 ? `Oración (${magicCD}t)` : 'Oración'}
              </Button>
            )}
            {!enemy.name.includes('Supay') && (
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
