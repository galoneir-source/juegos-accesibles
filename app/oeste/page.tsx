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
type CharacterClass = 'pistolero' | 'curandera' | 'buscador'

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
  pistolero: {
    name: 'Pistolero',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · El revólver de plata duplica el daño contra Deadwood Jack',
  },
  curandera: {
    name: 'Curandera Apache',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Ritual Apache en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  buscador: {
    name: 'Buscador de Oro',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "rastrear" para ver las zonas adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'oeste-forajido-v1'
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
  'Entrada al pueblo fantasma de Dust Creek. El viento arrastra polvo y periódicos viejos por la calle principal.',
  'Cantina del pueblo. Vasos de whisky a medio beber y cartas de póker esparcidas sobre las mesas.',
  'Banco federal en ruinas. Las cajas fuertes están abiertas y vacías desde el último atraco.',
  'Herrería del pueblo. Las herraduras a medio forjar y el yunque frío delatan una huida repentina.',
  'Oficina del sheriff. La placa sobre el escritorio brilla entre el polvo y las telarañas acumuladas.',
  'Cementerio de Boot Hill. Las lápidas de madera se inclinan con nombres borrados por el sol.',
  'Mina de plata abandonada. Los raíles de la vagoneta desaparecen en la oscuridad de los túneles.',
  'Campamento Apache en las colinas. Los tepees de cuero vacíos rodean un fuego apagado.',
  'Cañón del Diablo. Las paredes de roca roja amplifican los sonidos hasta hacerlos aterradores.',
  'Estación de tren. El último tren llegó hace meses y nadie lo vio partir.',
  'Granja abandonada. El molino de viento gira lentamente aunque no haya viento.',
  'Posada de los viajeros. Los libros de registro muestran nombres tachados con tinta roja.',
  'Saloon del extremo norte. Los espejos detrás de la barra reflejan a gente que no está allí.',
  'Establo del pueblo. Los caballos se fueron pero las sillas de montar siguen en su sitio.',
  'Torre de agua. El depósito sigue lleno de un líquido que ya no es agua limpia.',
  'Despacho del telegrafista. El aparato morse teclea solo mensajes que nadie envió.',
  'Almacén general. Los estantes llenos de provisiones que nadie se llevó, como si esperaran.',
  'Iglesia del pueblo. Las bancas están volcadas y la Biblia abierta en el Apocalipsis.',
  'Escuela abandonada. Las pizarras muestran la última lección del último día de clase.',
  'Reserva Apache del río Piedra. Los ancianos de la tribu se fueron antes de que llegara la maldición.',
  'Puesto de avanzada del ejército. Los uniformes abandonados siguen en las literas sin sus soldados.',
  'Corrales del rodeo. Las vallas rotas y el polvo pisoteado delatan una estampida repentina.',
  'Cabaña del buscador de oro. El mapa del tesoro en la pared tiene marcas que llevan a la mina.',
  'Cañada de los cactus. Los cardones proyectan sombras que parecen figuras con sombreros.',
  'Paso de montaña. El sendero se estrecha entre riscos y el viento ulula como un lamento.',
  'Cueva de los bandidos. Cajas de dinamita y bolsas de monedas robadas cubren el suelo de roca.',
  'Sala de juegos clandestina. Mesas de dados y ruleta abandonadas con fichas de hueso esparcidas.',
  'Corredor de los espejos de plata. Los espejos importados de la costa reflejan el pasado del pueblo.',
  'Cámara de los vientos del cañón. Corrientes de aire caliente entran y salen por grietas en la roca.',
  'Depósito de pólvora del ejército. Cajas marcadas con calaveras rodean las paredes de madera podrida.',
  'Silla del alcalde. El asiento del salón municipal lleva años vacío y lleno de telarañas.',
  'Galería de los buscados. Carteles de forajidos con recompensas cubren todas las paredes del despacho.',
  'Fragua del armero. Pistolas y rifles a medio reparar esperan manos que nunca volvieron.',
  'Sala de las estrellas del desierto. Las noches en el Oeste son tan claras que las constelaciones se ven.',
  'Desfiladero de los forajidos. Las marcas de cascos y huellas de botas cubren el suelo de polvo.',
  'Laguna del Diablo. El agua roja del atardecer tiñe la superficie de un color que no trae buenas señales.',
  'Sala del viento de Deadwood. Un frío sobrenatural que no pertenece al desierto invade la estancia.',
  'Cripta de los forajidos caídos. Lápidas sin nombre en una cueva sellada con dinamita sin detonar.',
  'Corredor de las trampas del bandido. Marcas en el suelo delatan cables trampa que siguen activos.',
  'Sala de las constelaciones del Oeste. El techo de la cueva está pintado con las estrellas guía de los vaqueros.',
  'Antecámara del fortín de Deadwood. El aire huele a pólvora quemada y a muerte reciente.',
  'Armería personal del forajido. Armas de todos los que intentaron detenerle llenan las paredes.',
  'Sala de los tambores del desierto. El sonido rítmico de rituales Apache resuena sin que haya nadie.',
  'Corredor final del fortín. Las paredes de adobe se estrechan a medida que avanzas hacia el fondo.',
  'Sala del pacto de sangre. Las marcas de una alianza con algo oscuro están grabadas en la piedra.',
  'Cámara del corazón del fortín. El suelo tiembla con el poder que habita aquí desde hace décadas.',
  'Antesala de Deadwood Jack. Las balas de los que llegaron antes están incrustadas en las paredes.',
  'Galería de los cazarrecompensas caídos. Los sombreros y las placas de los que lo intentaron cubren el suelo.',
]

const BOSS_ROOM_DESC =
  'Santuario de Deadwood Jack, el Forajido Inmortal. Las paredes del fortín están cubiertas de marcas de bala ' +
  'y carteles de "Se busca" con su propia cara que él mismo arrancó de los postes. ' +
  'En el centro, apoyado contra la pared con los pulgares en el cinturón, Deadwood Jack te mira con sus ojos de calavera ' +
  'y sonríe con la boca de un muerto que sigue caminando. ' +
  '"OTRA VEZ UN HÉROE DE CARTÓN. LOS ENTIERRO YO MISMO." ' +
  'Sus dos revólveres de plata aparecen en sus manos antes de que puedas parpadear.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Un cartel clavado en la pared con una bala, escrito a mano: ' +
      '"El revólver de plata del sheriff Henderson fue forjado con plata pura de la mina de Deadwood. ' +
      'La plata es el único metal que puede herir de verdad a Deadwood Jack, que sobrevive a las balas normales. ' +
      'En manos de un Pistolero que conozca el arte del duelo, sus disparos contra el Forajido Inmortal ' +
      'duplican el daño causado." ' +
      'El cartel tiene huellas de sangre en las esquinas.',
    reward: 40,
  },
  {
    text:
      'Grabado en la madera de la pared con un cuchillo Bowie: ' +
      '"El chaleco de cuero doble reforzado del armero de Dodge City llevaba placas de hierro cosidas por dentro. ' +
      'Quien lo lleva en combate siente cómo absorbe una parte de los impactos recibidos, ' +
      'reduciendo significativamente el daño que llega al cuerpo."',
    reward: 25,
  },
  {
    text:
      'Un mensaje en papel de fumar dentro del cañón de un rifle vacío: ' +
      '"Deadwood Jack hace un pacto con los espíritus del inframundo Apache. Solo la Curandera Apache ' +
      'que conozca el ritual de los espíritus ancestrales puede romper ese pacto y causarle un daño real. ' +
      'El ritual es poderoso pero necesita tiempo de recarga entre invocaciones." ' +
      'El papel se deshace al terminar de leerlo.',
    reward: 30,
  },
  {
    text:
      'Escrito con carbón en el suelo, con letra de alguien que temblaba: ' +
      '"Llegué hasta aquí antes que tú. Las puertas del fortín de Deadwood no se abren con fuerza. ' +
      'Encontré la placa del sheriff en las primeras zonas del pueblo. Sin ella, ' +
      'los esbirros del Forajido no te dejarán avanzar hacia el interior." ' +
      'No hay rastro del que lo escribió.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Pistolero forajido del gang', hp: 30, attack: 12, reward: 20 },
  { name: 'Bandido con escopeta recortada', hp: 40, attack: 18, reward: 30 },
  { name: 'Serpiente de cascabel gigante', hp: 20, attack: 8, reward: 15 },
  { name: 'Espectro del vaquero muerto', hp: 70, attack: 28, reward: 50 },
  { name: 'Dinamitero loco del gang', hp: 35, attack: 15, reward: 25 },
  { name: 'Cazarrecompensas corrupto', hp: 25, attack: 20, reward: 35 },
  { name: 'Oso del desierto enrabiado', hp: 50, attack: 22, reward: 40 },
  { name: 'Lugarteniente de Deadwood Jack', hp: 80, attack: 32, reward: 60 },
  { name: 'Tirador de élite del gang', hp: 45, attack: 19, reward: 35 },
  { name: 'Mercenario del Forajido', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'Deadwood Jack, el Forajido Inmortal', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'Un cable trampa acciona una escopeta oculta en la pared al cruzar el umbral.', damage: 20 },
  { desc: 'Un foso cubierto con ramas de cactus cede bajo tus pies al pisar el suelo falso.', damage: 25 },
  { desc: 'Gas soporífero de amapolas del desierto brota de una vasija rota al rozarla.', damage: 18 },
  { desc: 'Un lazo trampa colgado del techo te atrapa el tobillo y te arrastra hacia arriba.', damage: 15 },
  { desc: 'Una carga de dinamita con mecha corta se activa al pisar una tabla suelta.', damage: 22 },
  { desc: 'Un trampazo con vigas pesadas se desploma desde el techo al cruzar el punto marcado.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Una bolsa con monedas de oro del banco federal que nadie reclamó tras el atraco.', reward: 30 },
  { desc: 'Un lingote de plata de la mina abandonada, sellado con el sello del gobierno.', reward: 50 },
  { desc: 'Un collar de turquesa Apache con valor ceremonial y espiritual incalculable.', reward: 25 },
  { desc: 'Alforjas con el dinero robado del último tren, todavía con el sello del banco.', reward: 40 },
  { desc: 'Un reloj de bolsillo de oro grabado con iniciales que pertenecía al sheriff Henderson.', reward: 45 },
  { desc: 'Una botella sellada de whisky de reserva de treinta años con etiqueta de Kentucky.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Una cantimplora con agua fresca del manantial sagrado Apache te restaura las fuerzas.', amount: 25 },
  { desc: 'Una cabaña con hierbas medicinales de la curandera Apache, frescas y bien conservadas.', amount: 35 },
  { desc: 'Una fuente de agua subterránea en una cueva que ningún forajido conoce todavía.', amount: 30 },
  { desc: 'El kit médico del médico del pueblo, intacto y con todos sus remedios en su sitio.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'revolver', name: 'Revólver de plata del Sheriff', desc: 'Aumenta tu daño en combate. El Pistolero lo empuña con la puntería legendaria de los duelistas del Oeste.' },
  { id: 'chaleco', name: 'Chaleco de cuero reforzado', desc: 'Reduce el daño recibido gracias a las placas de hierro cosidas en su interior por el armero de Dodge City.' },
  { id: 'whisky', name: 'Whisky medicinal de la cantina', desc: 'Restaura 50 puntos de vida al beberlo.' },
]

const ITEM_KEY: ItemDef = {
  id: 'placa',
  name: 'Placa del Sheriff Henderson',
  desc: 'Desbloquea las puertas cerradas del fortín que los esbirros de Deadwood Jack protegen.',
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
  narrative: 'nota de interés',
}

const INSTRUCTIONS =
  'El Forajido Inmortal. Explora 49 zonas del pueblo y el fortín del Lejano Oeste, ' +
  'derrota forajidos y criaturas del desierto, y enfrenta a Deadwood Jack, el Forajido Inmortal. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la zona. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar whisky para curarte. ' +
  'El revólver de plata sube el daño en combate. El chaleco de cuero reduce el daño recibido. ' +
  'La placa del Sheriff desbloquea las puertas cerradas del fortín de Deadwood Jack. ' +
  'En combate: atacar o huir. No puedes huir de Deadwood Jack. ' +
  'Pistolero: más vida y daño. El revólver duplica el daño contra Deadwood Jack. ' +
  'Curandera Apache: escribe ritual en combate para invocar los espíritus ancestrales cada 3 turnos. ' +
  'Buscador de Oro: escribe rastrear para ver qué hay en las zonas adyacentes. ' +
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

export default function OestePage() {
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
  const classRef     = useRef<CharacterClass>('pistolero')
  const magicCdRef   = useRef(0)
  const phaseRef     = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('pistolero')
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
          `Deadwood Jack saca sus dos revólveres de plata con una sonrisa de calavera. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'curandera' ? ' o "ritual"' : ''}. No puedes huir del Forajido Inmortal.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! Deadwood Jack, el Forajido Inmortal, te desafía.')
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
          addHist('bad', 'Las balas del forajido te alcanzan. El polvo del desierto te cubre.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'buscador' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Tesoro — ${desc} +${total} puntos${bonus ? ` (bonus buscador +${bonus})` : ''}.`)
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
          `Un ${e.name} te apunta con su arma. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'curandera' ? ', "ritual"' : ''} o "huir".`
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
    const hasChaleco = inventoryRef.current.includes('chaleco')
    const enemyHp = e.hp - dmg

    if (enemyHp <= 0) {
      syncScore(scoreRef.current + e.reward)
      if (e.isBoss) {
        const bonus = Math.floor(healthRef.current / 2)
        syncScore(scoreRef.current + bonus)
        inCombat.current = false; enemyRef.current = null; setEnemy(null)
        addHist('ok',
          `¡Derrotas a ${e.name}! Su forma inmortal se desvanece en polvo y hueso seco. ` +
          `Sus revólveres caen al suelo y el pueblo de Dust Creek es libre de nuevo. ` +
          `+${e.reward} puntos. Bonus de vida: +${bonus} puntos.`
        )
        audio.start()
        announceAssertive(`Victoria. Puntuación final: ${scoreRef.current}.`)
        deleteSave(); setHasSaveData(false)
        goPhase('won')
        return true
      }
      addHist('ok', `Abates al ${e.name}. +${e.reward} puntos.`)
      audio.correct()
      if (Math.random() < 0.3) {
        const heal = 25
        syncHealth(Math.min(maxHpRef.current, healthRef.current + heal))
        addHist('ok', `Entre sus pertenencias encuentras hierbas medicinales Apache. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} abatido.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasChaleco ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const chalecoNote = hasChaleco ? ` (chaleco: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${chalecoNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe definitivo. Caes en el polvo del Oeste.`)
      audio.gameOver()
      deleteSave(); setHasSaveData(false)
      announceAssertive('Has caído en el Lejano Oeste. Fin del juego.')
      goPhase('lost')
    }
    return false
  }

  function handleCombat(cmd: string) {
    const e = enemyRef.current
    if (!e) return

    if (magicCdRef.current > 0) syncMagicCD(magicCdRef.current - 1)

    if (/^(huir|flee|escapar|retirarse|salir|correr)$/.test(cmd)) {
      if (e.isBoss) {
        addHist('bad', 'Deadwood Jack ríe y sus balas cortan el camino. ¡No hay escapatoria del Forajido Inmortal!')
        audio.incorrect(); return
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      syncScore(Math.max(0, scoreRef.current - 5))
      addHist('bad', `Te retiras del enfrentamiento con el ${e.name}. -5 puntos.`)
      audio.incorrect()
      announcePolite('Te retiraste del combate.')
      const prev = prevIdRef.current
      if (prev !== null) { roomIdRef.current = prev; describeRoom(worldRef.current[prev]) }
      return
    }

    if (/^(ritual|apache|espiritu|espíritu|danza|invocacion|invocación|rezar)$/.test(cmd)) {
      if (classRef.current !== 'curandera') {
        addHist('bad', 'Solo la Curandera Apache conoce los rituales de los espíritus ancestrales.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `El ritual aún se recarga. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Invocas los espíritus ancestrales Apache con un ritual sagrado: ${dmg} de daño espiritual que golpea al enemigo desde dentro.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|disparar?|pegar|golpear|luchar|a)$/.test(cmd)) {
      const hasRevolver = inventoryRef.current.includes('revolver')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasRevolver ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasRevolver ? dmgRaw * 2 : dmgRaw
      const revolverNote = e.isBoss && hasRevolver ? ` (revólver de plata ×2 vs Deadwood: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${revolverNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente a Deadwood Jack. Escribe: atacar${classRef.current === 'curandera' ? ' o ritual' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'curandera' ? ', ritual' : ''} o huir.`
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
      const cdNote = classRef.current === 'curandera' && magicCdRef.current > 0
        ? ` · Ritual disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(rastrear|rastro|huellas|explorar|acechar|reconocer)$/.test(cmd)) {
      if (classRef.current !== 'buscador') {
        addHist('bad', 'Solo el Buscador de Oro puede rastrear huellas para conocer las zonas adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (cerrada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'zona en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Rastrear huellas en el suelo: ${lines.join('. ')}.`
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
      if (/^(whisky|beber|curar|botella|cantimplora|medicina|alcohol)$/.test(target)) {
        if (!inventoryRef.current.includes('whisky')) {
          addHist('bad', 'No tienes ningún whisky medicinal.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'whisky'))
        addHist('ok', `Bebes el whisky medicinal de la cantina. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas el whisky. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'El revólver y el chaleco se usan automáticamente en combate.'); return
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
        if (inventoryRef.current.includes('placa')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'placa'))
          addHist('ok', `La puerta al ${dir} estaba cerrada por los esbirros del forajido. La placa del Sheriff Henderson la abre de par en par.`)
          announcePolite(`Usas la placa para abrir la puerta al ${dir}.`)
        } else {
          addHist('bad', `La puerta al ${dir} está cerrada por los esbirros de Deadwood Jack. Necesitas la placa del Sheriff Henderson.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar whisky.')
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
      `${def.name} elegido. ${def.desc}. Te adentras en el pueblo maldito de Dust Creek para detener ` +
      `a Deadwood Jack, el Forajido Inmortal, y devolver la ley al Lejano Oeste. ` +
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
      room.lockedExits[d] ? `${d} (cerrada)` : d
    )
    const roomMsg = `${room.description} Salidas: ${dirs.join(', ')}.`
    const initHist: HistEntry[] = [
      { type: 'ok',    text: 'Partida reanudada.' },
      { type: 'scene', text: roomMsg },
    ]

    applyUIState(cl, save.health, save.score, save.inventory, initHist, save.magicCooldown)
    goPhase('playing')
    announcePolite('Partida reanudada. ' + roomMsg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleSaveScore() {
    const result = await saveScore('oeste', score)
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
      <GameShell title="El Forajido Inmortal" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">El Forajido Inmortal</h2>
          <p className="text-[#888] text-sm">
            Explora 49 zonas del pueblo y el fortín del Lejano Oeste. Derrota forajidos y criaturas del desierto, y enfrenta a Deadwood Jack, el Forajido Inmortal.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => goPhase('selecting')}>Nueva partida</Button>
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
    const classes: CharacterClass[] = ['pistolero', 'curandera', 'buscador']
    return (
      <GameShell title="El Forajido Inmortal" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Adentrarse en el Oeste!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="El Forajido Inmortal" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Deadwood Jack, el Forajido Inmortal, ha sido derrotado!' : 'Has perecido en el Lejano Oeste'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              Deadwood Jack se desvanece en polvo y hueso seco. El pueblo de Dust Creek puede respirar de nuevo y la ley vuelve al Lejano Oeste para quedarse.
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
      title="El Forajido Inmortal"
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
          {classRef.current === 'curandera' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Ritual en {magicCD}t</span>
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
          aria-label="Historial de la partida"
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
            {classRef.current === 'curandera' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('ritual'); setInput('') }}
              >
                {magicCD > 0 ? `Ritual (${magicCD}t)` : 'Ritual'}
              </Button>
            )}
            {!enemy.name.includes('Deadwood') && (
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
