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
type CharacterClass = 'heroe' | 'sacerdotisa' | 'ladron'

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
  heroe: {
    name: 'Héroe',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · La espada de Aquiles duplica el daño contra Cronos',
  },
  sacerdotisa: {
    name: 'Sacerdotisa de Atenea',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Égida divina en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  ladron: {
    name: 'Ladrón del Olimpo',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "sigilo" para ver las zonas adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'grecia-titan-v1'
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
  'Puerto de Atenas. Los trirremes atracados ceden paso a héroes que regresan de guerras lejanas.',
  'Ágora de Atenas. Los filósofos debaten entre columnas de mármol blanco bajo el sol mediterráneo.',
  'Templo del Partenón. Las columnas dóricas proyectan sombras perfectas sobre el suelo de mármol.',
  'Bosque sagrado de olivos. Las ramas retorcidas forman figuras que recuerdan a los dioses.',
  'Oráculo de Delfos. El vapor de las grietas en la roca produce visiones turbadoras.',
  'Ladera del Monte Olimpo. El trueno resuena aunque el cielo esté completamente despejado.',
  'Puente de piedra sobre el río Estigia. El agua negra refleja una oscuridad más profunda que la noche.',
  'Caverna de las Ninfas. Fuentes de agua cristalina brotan de las paredes de piedra blanca.',
  'Arena del anfiteatro. La arena roja guarda el recuerdo de mil combates heroicos.',
  'Templo de Poseidón en la costa. El mar embravecido choca contra los escalones de mármol.',
  'Laberinto de Cnosos. Los corredores de piedra se bifurcan una y otra vez en la oscuridad.',
  'Fragua de Hefesto. Martillos abandonados y metales fundidos se enfriaron hace siglos.',
  'Jardín de las Hespérides. Manzanas de oro brillan entre las ramas de árboles centenarios.',
  'Entrada al Tártaro. El calor sulfuroso sube desde las profundidades del inframundo.',
  'Establo de los caballos alados. Las huellas de los pegasos todavía se ven en el suelo de barro.',
  'Sala del Oráculo de Zeus. Tablillas de oro con profecías que nadie ha podido descifrar.',
  'Cripta de los héroes caídos. Nombres de semidioses grabados en piedra blanca llenan las paredes.',
  'Templo de Artemisa. Arcos y flechas de plata abandonados junto a ofrendas de flores secas.',
  'Fuente de la Memoria. Sus aguas plateadas reflejan el pasado de quien se mira en ellas.',
  'Sala del Consejo de los Doce Olímpicos. Doce tronos vacíos rodean una llama eterna.',
  'Torre de vigía de Hermes. El mensajero de los dioses dejó aquí sus sandalias aladas olvidadas.',
  'Mercado de Corinto petrificado. Los puestos de cerámica y vino quedaron congelados en el tiempo.',
  'Templo menor de Hades. Las paredes rezuman una oscuridad que no es ausencia de luz.',
  'Cámara de las Moiras. Hilos de destino de diferentes colores cuelgan del techo como una telaraña.',
  'Pasaje de entrada al laberinto del Olimpo. El suelo cambia de mármol blanco a obsidiana negra.',
  'Corredor de los semidioses. Estatuas de Heracles, Perseo y Aquiles flanquean el paso.',
  'Sala de los guardianes de piedra. Estatuas de soldados griegos con lanza y escudo apuntan al intruso.',
  'Corredor de los espejos de bronce. Tu reflejo aparece multiplicado en miles de superficies pulidas.',
  'Cámara del viento de Eolo. Corrientes de aire frío forman espirales que giran sin cesar.',
  'Sala de los pergaminos quemados. Cenizas de textos sagrados cubren el suelo como nieve gris.',
  'Trono de Zeus. El asiento del rey de los dioses está vacío pero su poder vibra en el aire.',
  'Galería de los Titanes derrotados. Relieves de piedra narran la Titanomaquia en detalle brutal.',
  'Cámara del fuego de Prometeo. Una llama robada del Olimpo arde sin consumirse en un cuenco de oro.',
  'Sala de los astros griegos. El techo está pintado con las constelaciones creadas por los dioses.',
  'Pasaje de los murales de Troya. Frescos que narran la caída de Ilión en colores vivos y eternos.',
  'Cámara del Leteo. Un río de agua oscura cuya profundidad nadie ha podido medir fluye lentamente.',
  'Sala del viento de Cronos. Un frío sobrenatural que distorsiona el tiempo llena la estancia.',
  'Cripta de los Titanes encadenados. Sarcófagos de piedra negra con cadenas de adamantio rotas.',
  'Corredor de las trampas antiguas. Marcas en el suelo delatan mecanismos que siguen activos.',
  'Sala de la constelación de Orión. El mosaico del suelo reproduce al cazador divino en turquesa.',
  'Antecámara del Tártaro. El aire huele a azufre y a eternidad congelada.',
  'Cámara del néctar sagrado. Ánforas de oro llenas del líquido de los dioses llenan las estanterías.',
  'Sala de los tambores de la guerra. Instrumentos de cuero que resuenan solos con el ritmo de la batalla.',
  'Corredor final del laberinto. Las paredes de mármol se van cerrando lentamente a medida que avanzas.',
  'Sala del pacto con los Titanes. Un acuerdo de sangre grabado en obsidiana brilla con luz roja.',
  'Cámara del corazón del Olimpo. El suelo vibra al ritmo de los dioses como si el mundo respirara.',
  'Antesala del Titán. Las llamas de las antorchas se vuelven azules al entrar; el frío es absoluto.',
  'Galería de los tiempos perdidos. Sombras de momentos que ya no existen flotan en el aire quieto.',
]

const BOSS_ROOM_DESC =
  'Sanctuario de Cronos, el Titán del Tiempo. El tiempo aquí no fluye con normalidad: objetos se mueven hacia atrás, ' +
  'llamas parpadeantes muestran escenas del pasado y el futuro de forma simultánea. ' +
  'En el centro, entre cadenas de adamantio rotas, Cronos, el Padre del Tiempo, se alza en toda su magnitud: ' +
  'su forma oscila entre joven y anciano con cada respiración, y empuña la hoz de adamantio con la que castró el cielo. ' +
  '"PEQUEÑO MORTAL. EL TIEMPO ME PERTENECE. TÚ TAMBIÉN." ' +
  'La hoz gira y el aire se hiela mientras el Titán se prepara para borrarte de la historia.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Una inscripción grabada en mármol por un héroe anterior: ' +
      '"La espada forjada por Hefesto con el acero de Aquiles conserva el filo de la inmortalidad. ' +
      'Su hoja puede cortar incluso la forma etérea de Cronos, el Titán del Tiempo. ' +
      'En manos de un Héroe que conozca los movimientos de los dioses, ' +
      'su golpe contra el Titán duplica su poder devastador." ' +
      'La inscripción está rodeada de laureles tallados en la piedra.',
    reward: 40,
  },
  {
    text:
      'Pintado por una sacerdotisa en la pared del templo: ' +
      '"El peplos sagrado de Atenea fue tejido en el telar del Olimpo con hilos de luz y voluntad divina. ' +
      'Quien lo viste en combate siente cómo absorbe una parte de cada golpe del enemigo, ' +
      'devolviendo intacta una fracción de la fuerza del portador."',
    reward: 25,
  },
  {
    text:
      'Un pergamino enrollado dentro de una ánfora sellada: ' +
      '"Cronos, el Titán del Tiempo, tiene una debilidad: teme la Égida de Atenea, el escudo divino ' +
      'que en manos de una Sacerdotisa pura puede ser convertido en arma de ataque. ' +
      'La Égida invocada causa un daño devastador al Titán y necesita tiempo para recargarse. ' +
      'La paciencia de la sacerdotisa es la clave de la victoria." ' +
      'El pergamino se deshace en polvo de estrellas al terminar de leerlo.',
    reward: 30,
  },
  {
    text:
      'Grabado con urgencia en la piedra, con letra irreconocible: ' +
      '"Los pasos custodiados por guardianes del Olimpo no se abren con fuerza mortal. ' +
      'Encontré el Sello del Olimpo en las zonas anteriores y me abrió el camino. ' +
      'Sin él, el laberinto no te dejará avanzar hacia el Titán." ' +
      'No hay rastro de quien escribió estas palabras.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Guerrero espartano maldito', hp: 30, attack: 12, reward: 20 },
  { name: 'Cíclope menor', hp: 40, attack: 18, reward: 30 },
  { name: 'Hidra bicéfala', hp: 20, attack: 8, reward: 15 },
  { name: 'Centauro guerrero', hp: 70, attack: 28, reward: 50 },
  { name: 'Harpia veloz', hp: 35, attack: 15, reward: 25 },
  { name: 'Minotauro menor', hp: 25, attack: 20, reward: 35 },
  { name: 'Gorgona menor', hp: 50, attack: 22, reward: 40 },
  { name: 'Guardián del Tártaro', hp: 80, attack: 32, reward: 60 },
  { name: 'Espectro del Érebo', hp: 45, attack: 19, reward: 35 },
  { name: 'Titánide menor', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'Cronos, el Titán del Tiempo', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'Flechas de plata de Artemisa disparadas desde el techo al pisar la losa sagrada.', damage: 20 },
  { desc: 'Una losa que cede bajo tus pies te precipita a un foso de serpientes de Medusa.', damage: 25 },
  { desc: 'Gas narcótico de amapolas del Leteo brota de urnas sagradas al rozarlas.', damage: 18 },
  { desc: 'Una red de espinas de rosal maldito cae del techo al cruzar el umbral de piedra.', damage: 15 },
  { desc: 'Un mecanismo de aplastamiento de mármol se activa al pisar la losa central.', damage: 22 },
  { desc: 'Un dardo envenenado con veneno de Hidra se activa por un hilo invisible al cruzar.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Una máscara de oro de actor trágico ateniense con inscripciones de Apolo.', reward: 30 },
  { desc: 'Un collar de coral rojo y perlas del Mar Egeo engarzadas en hilo de plata.', reward: 50 },
  { desc: 'Una ánfora de vino de los dioses con sellos dorados del Olimpo intactos.', reward: 25 },
  { desc: 'Monedas de oro del tesoro sagrado del oráculo de Delfos sin circular.', reward: 40 },
  { desc: 'Una estatuilla de marfil de Afrodita con ojos de zafiro y base de ámbar.', reward: 45 },
  { desc: 'Un espejo de bronce pulido con inscripciones de Hermes que aún brillan.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Una fuente de agua del río Hidaspes bendecida por Asclepio te restaura las fuerzas.', amount: 25 },
  { desc: 'Una sala con hierbas medicinales de Asclepio, dios de la medicina, frescas y potentes.', amount: 35 },
  { desc: 'Aguas del manantial sagrado de Atenea cierran tus heridas al bañarlas brevemente.', amount: 30 },
  { desc: 'Néctar diluido de los dioses hallado en una ánfora sellada te devuelve la vitalidad.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'espada', name: 'Espada forjada por Hefesto', desc: 'Aumenta tu daño en combate. El Héroe la empuña con la destreza de Aquiles.' },
  { id: 'peplos', name: 'Peplos sagrado de Atenea', desc: 'Reduce el daño recibido gracias a los hilos de luz divina con que fue tejido.' },
  { id: 'ambrosia', name: 'Ambrosía de los dioses', desc: 'Restaura 50 puntos de vida al beberla.' },
]

const ITEM_KEY: ItemDef = {
  id: 'sello',
  name: 'Sello del Olimpo',
  desc: 'Desbloquea los pasos custodiados por guardianes divinos del laberinto.',
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
  'Las Puertas del Olimpo. Explora 49 zonas del laberinto griego, ' +
  'derrota criaturas mitológicas y enfrenta a Cronos, el Titán del Tiempo. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la zona. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar ambrosía para curarte. ' +
  'La espada de Hefesto sube el daño en combate. El peplos de Atenea reduce el daño recibido. ' +
  'El Sello del Olimpo desbloquea los pasos custodiados por guardianes divinos. ' +
  'En combate: atacar o huir. No puedes huir de Cronos. ' +
  'Héroe: más vida y daño. La espada duplica el daño contra Cronos. ' +
  'Sacerdotisa de Atenea: escribe egida en combate para invocar la Égida divina cada 3 turnos. ' +
  'Ladrón del Olimpo: escribe sigilo para ver qué hay en las zonas adyacentes. ' +
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

export default function GreciaPage() {
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
  const classRef     = useRef<CharacterClass>('heroe')
  const magicCdRef   = useRef(0)
  const phaseRef     = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('heroe')
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
      room.lockedExits[d] ? `${d} (custodiada)` : d
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
          `Cronos, el Titán del Tiempo, distorsiona la realidad y empuña su hoz de adamantio. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'sacerdotisa' ? ' o "egida"' : ''}. No puedes huir del Titán del Tiempo.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! Cronos, el Titán del Tiempo, te desafía.')
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
          addHist('bad', 'Cronos borra tu historia del tiempo. El Titán ha ganado.')
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
          `Escribe "atacar"${classRef.current === 'sacerdotisa' ? ', "egida"' : ''} o "huir".`
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
    const hasPeplos = inventoryRef.current.includes('peplos')
    const enemyHp = e.hp - dmg

    if (enemyHp <= 0) {
      syncScore(scoreRef.current + e.reward)
      if (e.isBoss) {
        const bonus = Math.floor(healthRef.current / 2)
        syncScore(scoreRef.current + bonus)
        inCombat.current = false; enemyRef.current = null; setEnemy(null)
        addHist('ok',
          `¡Derrotas a ${e.name}! Su forma titánica se deshace en el flujo del tiempo mientras emite un rugido eterno. ` +
          `Los dioses del Olimpo celebran tu victoria con rayos de luz. ` +
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
        addHist('ok', `Entre sus pertenencias encuentras hierbas de Asclepio. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasPeplos ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const peplosNote = hasPeplos ? ` (peplos: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${peplosNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe definitivo. Tu historia queda borrada del tiempo.`)
      audio.gameOver()
      deleteSave(); setHasSaveData(false)
      announceAssertive('Has caído en el laberinto. Fin del juego.')
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
        addHist('bad', 'Cronos desdobla el tiempo a tu alrededor, atrapándote en un bucle eterno. ¡No hay escapatoria del Titán del Tiempo!')
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

    if (/^(egida|égida|atenea|escudo|invocar|diosa|minerva|plegaria)$/.test(cmd)) {
      if (classRef.current !== 'sacerdotisa') {
        addHist('bad', 'Solo la Sacerdotisa de Atenea puede invocar la Égida divina.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `La Égida aún se recarga. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Invocas la Égida sagrada de Atenea: ${dmg} de daño divino que atraviesa las defensas del enemigo.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|cortar|golpear|a)$/.test(cmd)) {
      const hasEspada = inventoryRef.current.includes('espada')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasEspada ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasEspada ? dmgRaw * 2 : dmgRaw
      const espadaNote = e.isBoss && hasEspada ? ` (espada ×2 vs Cronos: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${espadaNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente a Cronos. Escribe: atacar${classRef.current === 'sacerdotisa' ? ' o egida' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'sacerdotisa' ? ', egida' : ''} o huir.`
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
        ? ` · Égida disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(sigilo|acechar|espiar|reconocer|vigilar)$/.test(cmd)) {
      if (classRef.current !== 'ladron') {
        addHist('bad', 'Solo el Ladrón del Olimpo puede moverse con sigilo para conocer las zonas adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (custodiada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'zona en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Te mueves con sigilo y observas: ${lines.join('. ')}.`
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
      if (/^(ambrosia|ambrosía|nectar|néctar|curar|beber|dioses|fruto)$/.test(target)) {
        if (!inventoryRef.current.includes('ambrosia')) {
          addHist('bad', 'No tienes ninguna ambrosía de los dioses.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'ambrosia'))
        addHist('ok', `Bebes la ambrosía de los dioses. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas la ambrosía. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'La espada y el peplos se usan automáticamente en combate.'); return
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
          addHist('ok', `El paso al ${dir} estaba custodiado por guardianes divinos. El Sello del Olimpo los disuelve y el paso queda libre.`)
          announcePolite(`Usas el sello para abrir el paso al ${dir}.`)
        } else {
          addHist('bad', `El paso al ${dir} está custodiado por guardianes del Olimpo. Necesitas el Sello del Olimpo para cruzar.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar ambrosía.')
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
      `${def.name} elegido. ${def.desc}. Te adentras en el laberinto del Olimpo para detener a Cronos, ` +
      `el Titán del Tiempo, que ha escapado del Tártaro y amenaza con borrar la historia del mundo. ` +
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
      room.lockedExits[d] ? `${d} (custodiada)` : d
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
    const result = await saveScore('grecia', score)
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
      <GameShell title="Las Puertas del Olimpo" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Las Puertas del Olimpo</h2>
          <p className="text-[#888] text-sm">
            Explora 49 zonas del laberinto griego. Derrota criaturas mitológicas y enfrenta a Cronos, el Titán del Tiempo, que ha escapado del Tártaro.
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
    const classes: CharacterClass[] = ['heroe', 'sacerdotisa', 'ladron']
    return (
      <GameShell title="Las Puertas del Olimpo" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Entrar en el Laberinto!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Las Puertas del Olimpo" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Cronos, el Titán del Tiempo, ha sido derrotado!' : 'Has perecido en el laberinto'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              Cronos se ha disuelto en el flujo eterno del tiempo. Los dioses del Olimpo celebran tu victoria y el mundo queda a salvo de la venganza del Titán para siempre.
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
      title="Las Puertas del Olimpo"
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
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Égida en {magicCD}t</span>
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
                onClick={() => { processCommand('egida'); setInput('') }}
              >
                {magicCD > 0 ? `Égida (${magicCD}t)` : 'Égida'}
              </Button>
            )}
            {!enemy.name.includes('Cronos') && (
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
