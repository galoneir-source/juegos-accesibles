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
type CharacterClass = 'paladin' | 'hechicera' | 'ladron'

interface ClassDef {
  name: string
  maxHp: number
  dmgBonus: number
  desc: string
}

interface ItemDef { id: string; name: string; desc: string }

interface Room {
  description: string
  exits: Partial<Record<Direction, number>>
  lockedExits: Partial<Record<Direction, boolean>>
  event: 'nothing' | 'treasure' | 'trap' | 'enemy' | 'healing' | 'item' | 'boss' | 'narrative' | 'shard'
  cleared: boolean
  trap?: { desc: string; damage: number }
  treasure?: { desc: string; reward: number }
  heal?: { desc: string; amount: number }
  enemy?: { name: string; hp: number; attack: number; reward: number }
  item?: ItemDef
  narrative?: { text: string; reward: number }
  shardName?: string
}

interface ActiveEnemy {
  name: string
  hp: number
  maxHp: number
  attack: number
  reward: number
  isBoss: boolean
  breathTurn: number
}

type HistEntry = {
  type: 'scene' | 'cmd' | 'ok' | 'bad' | 'combat' | 'item' | 'narrative' | 'shard'
  text: string
}

interface SaveData {
  version: number
  world: Room[]
  roomId: number
  prevId: number | null
  health: number
  score: number
  inventory: string[]
  shards: string[]
  characterClass: CharacterClass
  specialCooldown: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SAVE_KEY = 'aventura-magica-v1'
const SAVE_VERSION = 1
const BOSS_ROOM_ID = 48
const SHARD_ROOM_IDS = [10, 30, 42]
const SHARD_NAMES = ['Fragmento del Alba', 'Fragmento del Crepúsculo', 'Fragmento de la Medianoche']

// ─── Class definitions ────────────────────────────────────────────────────────

const CLASS_DEFS: Record<CharacterClass, ClassDef> = {
  paladin: {
    name: 'Paladín',
    maxHp: 120,
    dmgBonus: 8,
    desc: 'Comando "curar" en combate restaura 30 de vida (una vez por batalla) · 120 de vida · +8 daño · +20 bonus vs el Dragón',
  },
  hechicera: {
    name: 'Hechicera',
    maxHp: 75,
    dmgBonus: 0,
    desc: '"Hechizo" en combate (40–70 daño, cada 3 turnos) · 75 de vida · Con los 3 fragmentos: +40 bonus al hechizo vs el Dragón',
  },
  ladron: {
    name: 'Ladrón',
    maxHp: 95,
    dmgBonus: 5,
    desc: '"Sigilo" para evitar el evento de una sala · "Robar" en combate para obtener puntos extra · Detecta trampas antes de activarlas · 95 de vida',
  },
}

// ─── Static data ──────────────────────────────────────────────────────────────

const ROOM_DESCS = [
  'Una encrucijada en el camino real. Postes con flechas apuntan en todas direcciones.',
  'Un prado de flores silvestres mecidas por el viento. Mariposas plateadas revolotean.',
  'Las ruinas de una antigua posada. Solo quedan las paredes de piedra.',
  'Un bosque de abedules con corteza plateada. La luz se filtra entre las hojas.',
  'Un puente de madera sobre un arroyo de aguas cristalinas.',
  'Un claro con una fogata apagada. Cenizas recientes en el suelo.',
  'Un camino bordeado de rosales en flor. El olor es embriagador.',
  'Las afueras de un pueblo pequeño. Casas de paja con humo en las chimeneas.',
  'Un mercado abandonado. Los tenderetes están vacíos y cubiertos de polvo.',
  'Un cementerio olvidado. Lápidas cubiertas de musgo y líquenes.',
  'Una torre en ruinas cubierta de hiedra. Las escaleras se perdieron hace tiempo.',
  'Un lago de aguas oscuras. En el centro hay una pequeña isla.',
  'Una cueva somera tallada en roca volcánica. Cristales negros en las paredes.',
  'Un paso de montaña estrecho. El viento helado corta como una cuchilla.',
  'Una aldea élfica abandonada. Los árboles aún tienen plataformas entre sus ramas.',
  'Un jardín encantado con fuentes de piedra secas. Estatuas de hadas sin alas.',
  'Un pantano de aguas turbias. Luces fantasmales flotan sobre la superficie.',
  'Una biblioteca en ruinas. Estantes volcados y pergaminos ennegrecidos.',
  'Una capilla de piedra blanca. El techo se ha derrumbado parcialmente.',
  'Un bosque de robles centenarios. Sus raíces forman laberintos sobre el suelo.',
  'Una fragua abandonada. El yunque está oxidado y los fuelles, rotos.',
  'Un barranco profundo. Un puente de cuerdas cruza de un lado al otro.',
  'Una explanada de piedra con runas grabadas. Brillan tenuemente al anochecer.',
  'Un campamento abandonado. Tiendas desgarradas y espadas rotas por el suelo.',
  'Una gruta con estalactitas. El agua gotea formando charcos iridiscentes.',
  'Una colina con una piedra monolítica en el centro. Inscripciones en idioma antiguo.',
  'Un río helado. El hielo cruje bajo los pies pero aguanta el peso.',
  'Un bosque de pinos negros. Un silencio sepulcral pesa sobre el lugar.',
  'Una fortaleza en ruinas. Las almenas están caídas y el foso, seco.',
  'Una caverna con hongos luminiscentes que proyectan luz azul sobre las paredes.',
  'Una llanura abierta barrida por un viento constante y frío.',
  'Un viejo molino de agua junto a un río tranquilo. Las aspas están paradas.',
  'Un bosque de bambú dorado. Los tallos crujen al rozar unos con otros.',
  'Una cima desde la que se ve todo el reino. Nubes de tormenta en el horizonte.',
  'Un callejón entre dos acantilados. La roca rezuma agua por las grietas.',
  'Un castillo desolado. Sus banderas están hechas jirones por el tiempo.',
  'Una cripta sellada. La puerta de piedra fue forzada desde dentro.',
  'Un bosque de sauces llorones junto a un lago tranquilo.',
  'Una cueva con pinturas rupestres que narran una batalla ancestral.',
  'Un valle encantado donde el tiempo parece haberse detenido.',
  'Una torre de vigilancia desde la que se ven las tierras del Dragón.',
  'Un campo de batalla antiguo. Armas oxidadas emergen del suelo.',
  'Las catacumbas bajo un templo caído. El aire huele a polvo y tiempo.',
  'Un camino empedrado que lleva directamente a la guarida del Dragón.',
  'Un círculo de piedras con símbolos arcanos. El aire vibra con energía.',
  'Un bosque quemado. Los árboles negros apuntan al cielo como dedos.',
  'Una fosa volcánica. El calor es opresivo y el suelo cruje al pisarlo.',
  'La entrada a la Guarida del Dragón. Las piedras están chamuscadas.',
]

const BOSS_ROOM_DESC =
  'La Cámara del Dragón de las Sombras. Huesos de héroes caídos cubren el suelo. ' +
  'El calor es insoportable. La oscuridad aquí es densa, casi palpable.'

const NARRATIVES = [
  {
    text:
      'Un ermitaño anciano se asoma desde su cabaña oculta entre los arbustos. ' +
      '"¡Viajero! El Dragón de las Sombras destruyó el Cristal Eterno hace tres lunas. ' +
      'Sus fragmentos cayeron por todo el reino. Sin él, la oscuridad lo devorará todo. ' +
      'Busca los tres Fragmentos y únelos ante su guarida." ' +
      'Te lanza una bolsa de monedas y desaparece entre la maleza.',
    reward: 40,
  },
  {
    text:
      'Las runas de la piedra monolítica dicen: ' +
      '"El Dragón de las Sombras fue antaño guardián del Cristal Eterno. La codicia lo corrompió. ' +
      'Hay tres Fragmentos: el del Alba (al noreste), el del Crepúsculo (al centro) ' +
      'y el de la Medianoche (al suroeste). Quien los reúna podrá sellar al Dragón para siempre."',
    reward: 25,
  },
  {
    text:
      'El espíritu de un caballero caído se materializa ante ti. ' +
      '"Fui el último en intentarlo. El Dragón no sangra con armas normales... ' +
      'pero con los tres Fragmentos reunidos, la Espada Élfica triplica su poder. ' +
      'El Escudo Encantado también absorbe su aliento de fuego. ' +
      'Ve preparado." El espíritu desaparece con una reverencia.',
    reward: 30,
  },
  {
    text:
      'Una página de diario está clavada en un árbol. ' +
      '"Día 40: He encontrado el primer Fragmento. Brilla con luz dorada. ' +
      'Día 67: El segundo emite un resplandor carmesí. ' +
      'Día 89: El Dragón atacó antes de que pudiera reunir el tercero. ' +
      'Quienquiera que leas esto: los Fragmentos iluminan las salas que los guardan. No los ignores." ' +
      'La tinta está manchada de sangre.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Lobo del Bosque',       hp: 28, attack: 12, reward: 18 },
  { name: 'Bandido Emboscador',    hp: 35, attack: 15, reward: 25 },
  { name: 'Goblin de las Nieblas', hp: 22, attack: 10, reward: 15 },
  { name: 'Trol del Puente',       hp: 65, attack: 25, reward: 45 },
  { name: 'Espíritu del Pantano',  hp: 40, attack: 18, reward: 30 },
  { name: 'Grifo Joven',           hp: 45, attack: 20, reward: 35 },
  { name: 'Harpía',                hp: 30, attack: 22, reward: 28 },
  { name: 'Elemental de Sombra',   hp: 50, attack: 20, reward: 40 },
  { name: 'Caballero Oscuro',      hp: 70, attack: 28, reward: 55 },
  { name: 'Vampiro de las Ruinas', hp: 55, attack: 24, reward: 48 },
]

const BOSS_DEF = { name: 'el Dragón de las Sombras', hp: 250, attack: 40, reward: 250 }

const TRAP_POOL = [
  { desc: 'Una trampa de caza oculta entre las hojas se cierra sobre tu pierna.',    damage: 18 },
  { desc: 'Una flecha mágica sale de una estatua y te alcanza en el hombro.',        damage: 15 },
  { desc: 'El suelo cede bajo tus pies. Caes en un hoyo lleno de estacas.',          damage: 25 },
  { desc: 'Una nube de esporas venenosas explota de un hongo al pisarlo.',            damage: 20 },
  { desc: 'Cuerdas invisibles se activan y te golpean contra la pared de piedra.',   damage: 16 },
  { desc: 'Una runa de fuego grabada en el suelo detona al pisarla.',                damage: 22 },
]

const TREASURE_POOL = [
  { desc: 'Una bolsa de monedas de oro escondida bajo una piedra suelta.',  reward: 30 },
  { desc: 'Un cofre élfico con joyas refulgentes.',                          reward: 50 },
  { desc: 'Un pergamino de venta de un mago viajero, muy valioso.',          reward: 25 },
  { desc: 'Una estatuilla de dragón de marfil con valor de anticuario.',    reward: 40 },
  { desc: 'Una gema del tamaño de un huevo que emite un brillo cálido.',    reward: 45 },
  { desc: 'Un anillo con una esmeralda. Alguien lo perdió huyendo.',        reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Un manantial de agua encantada. Bebes y tus heridas se cierran.',        amount: 25 },
  { desc: 'Una poción de curación colgada de un árbol. Un regalo de los dioses.',   amount: 35 },
  { desc: 'Un haz de luz sagrada desciende del cielo y te envuelve.',               amount: 30 },
  { desc: 'Un altar menor con poderes restauradores. Te arrodillas un momento.',    amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'espada', name: 'Espada Élfica',    desc: 'Aumenta tu daño en combate.' },
  { id: 'escudo', name: 'Escudo Encantado', desc: 'Reduce el daño recibido, incluyendo el aliento de fuego.' },
  { id: 'pocion', name: 'Poción de Vida',   desc: 'Restaura 50 puntos de vida al usarla.' },
]

const ITEM_KEY: ItemDef = {
  id: 'llave',
  name: 'Llave Rúnica',
  desc: 'Abre pasajes sellados con magia.',
}

const EVENT_LABELS: Partial<Record<Room['event'], string>> = {
  treasure: 'posible tesoro',
  trap:     'peligro',
  enemy:    'presencia hostil',
  healing:  'aura curativa',
  item:     'objeto en el suelo',
  boss:     '¡guarida del Dragón!',
  shard:    '¡energía cristalina!',
  narrative:'punto de interés',
}

const INSTRUCTIONS =
  'Aventura Mágica: El Cristal Eterno. Recorre el reino, reúne los 3 Fragmentos del Cristal y derrota al Dragón de las Sombras. ' +
  'Comandos: ir norte/sur/este/oeste. Mirar para releer la sala. ' +
  'Inventario para ver vida, fragmentos y objetos. Tomar para recoger objetos. Usar poción para curarte. ' +
  'En combate: atacar o huir. No puedes huir del Dragón. ' +
  'Paladín: curar en combate restaura 30 de vida (una vez por batalla). ' +
  'Hechicera: hechizo en combate (40–70 daño, cada 3 turnos). Con los 3 fragmentos: +40 bonus vs el Dragón. ' +
  'Ladrón: sigilo para evitar el evento de una sala; robar en combate para ganar puntos extra; detecta trampas. ' +
  'La puerta del Dragón está sellada hasta que tengas los 3 Fragmentos. Tecla H repite instrucciones.'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

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

// ─── World generation ─────────────────────────────────────────────────────────

function generateWorld(): Room[] {
  const COLS = 7, N = 49
  const NARRATIVE_IDS = new Set([8, 20, 35, 45])
  const SHARD_IDS = new Set(SHARD_ROOM_IDS)

  const eventPool: Room['event'][] = [
    'nothing', 'nothing', 'nothing', 'nothing', 'nothing', 'nothing',
    'treasure', 'treasure', 'treasure', 'treasure', 'treasure', 'treasure',
    'enemy', 'enemy', 'enemy', 'enemy', 'enemy', 'enemy', 'enemy', 'enemy', 'enemy',
    'trap', 'trap', 'trap', 'trap', 'trap',
    'healing', 'healing', 'healing', 'healing',
    'item', 'item', 'item',
  ]
  while (eventPool.length < 55) eventPool.push('nothing')
  const evts = [...eventPool].sort(() => Math.random() - 0.5)

  const descs = [...ROOM_DESCS].sort(() => Math.random() - 0.5)

  const validKeyRooms = Array.from({ length: 15 }, (_, i) => i + 1)
    .filter(id => !NARRATIVE_IDS.has(id) && !SHARD_IDS.has(id))
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

    const description = descs[id % descs.length]

    if (id === 0) return { description, exits, lockedExits, event: 'nothing', cleared: true }
    if (id === BOSS_ROOM_ID) return { description: BOSS_ROOM_DESC, exits, lockedExits, event: 'boss', cleared: false }

    if (SHARD_IDS.has(id)) {
      const shardIndex = SHARD_ROOM_IDS.indexOf(id)
      return { description, exits, lockedExits, event: 'shard', cleared: false, shardName: SHARD_NAMES[shardIndex] }
    }

    if (NARRATIVE_IDS.has(id)) {
      const narrative = NARRATIVES[narrativeIdx++ % NARRATIVES.length]
      return { description, exits, lockedExits, event: 'narrative', cleared: false, narrative }
    }

    const event: Room['event'] = id === keyRoomId ? 'item' : evts[evtIdx++ % evts.length]
    const base: Room = { description, exits, lockedExits, event, cleared: false }

    if (event === 'trap')     base.trap     = { ...pick(TRAP_POOL) }
    if (event === 'treasure') base.treasure = pick(TREASURE_POOL)
    if (event === 'healing')  base.heal     = pick(HEAL_POOL)
    if (event === 'enemy')    base.enemy    = { ...pick(ENEMY_POOL) }
    if (event === 'item')     base.item     = id === keyRoomId ? ITEM_KEY : ITEM_REGULAR[regularItemIdx++ % ITEM_REGULAR.length]

    return base
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AventuraMagicaPage() {
  const worldRef      = useRef<Room[]>([])
  const roomIdRef     = useRef(0)
  const prevIdRef     = useRef<number | null>(null)
  const healthRef     = useRef(100)
  const maxHpRef      = useRef(100)
  const scoreRef      = useRef(0)
  const inCombat      = useRef(false)
  const enemyRef      = useRef<ActiveEnemy | null>(null)
  const cmdHistRef    = useRef<string[]>([])
  const inventoryRef  = useRef<string[]>([])
  const shardsRef     = useRef<string[]>([])
  const classRef      = useRef<CharacterClass>('paladin')
  const specialCdRef  = useRef(0)
  const healUsedRef   = useRef(false)
  const sigiloUsedRef = useRef(false)
  const phaseRef      = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('paladin')
  const [health,        setHealth]        = useState(100)
  const [maxHp,         setMaxHp]         = useState(100)
  const [score,         setScore]         = useState(0)
  const [enemy,         setEnemy]         = useState<ActiveEnemy | null>(null)
  const [inventory,     setInventory]     = useState<string[]>([])
  const [shards,        setShards]        = useState<string[]>([])
  const [history,       setHistory]       = useState<HistEntry[]>([])
  const [input,         setInput]         = useState('')
  const [saved,         setSaved]         = useState(false)
  const [saveError,     setSaveError]     = useState('')
  const [histIdx,       setHistIdx]       = useState(-1)
  const [hasSaveData,   setHasSaveData]   = useState(false)
  const [specialCD,     setSpecialCD]     = useState(0)
  const [healUsed,      setHealUsed]      = useState(false)

  const inputRef  = useRef<HTMLInputElement>(null)
  const historyEl = useRef<HTMLDivElement>(null)

  function goPhase(p: Phase) { phaseRef.current = p; setPhaseState(p) }

  useEffect(() => { setHasSaveData(readSave() !== null) }, [])

  useEffect(() => {
    if (historyEl.current) historyEl.current.scrollTop = historyEl.current.scrollHeight
  }, [history])

  // ── Sync helpers ───────────────────────────────────────────────────────────

  function addHist(type: HistEntry['type'], text: string) {
    setHistory(h => [...h, { type, text }])
  }

  function syncHealth(v: number)    { healthRef.current   = v; setHealth(v)   }
  function syncScore(v: number)     { scoreRef.current    = v; setScore(v)    }
  function syncSpecialCD(v: number) { specialCdRef.current = v; setSpecialCD(v) }
  function syncInventory(inv: string[]) { inventoryRef.current = inv; setInventory(inv) }
  function syncShards(s: string[])  { shardsRef.current   = s; setShards(s)  }
  function syncHealUsed(v: boolean) { healUsedRef.current = v; setHealUsed(v) }

  function describeRoom(room: Room) {
    const dirs = (Object.keys(room.exits) as Direction[]).map(d =>
      room.lockedExits[d] ? `${d} (sellada)` : d
    )
    const shardHint = room.event === 'shard' && !room.cleared
      ? ' Sientes una energía cristalina pulsando en esta sala.'
      : ''
    const msg = `${room.description}${shardHint} Salidas: ${dirs.join(', ')}.`
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
      shards: shardsRef.current,
      characterClass: classRef.current,
      specialCooldown: specialCdRef.current,
    })
  }

  // ── Room entry ─────────────────────────────────────────────────────────────

  function enterRoom(id: number) {
    // Boss door check before updating position
    if (id === BOSS_ROOM_ID && shardsRef.current.length < 3) {
      const have = shardsRef.current.length
      const list = have > 0 ? shardsRef.current.join(', ') : 'ninguno'
      addHist('bad',
        `La entrada a la guarida está sellada por magia draconiana. ` +
        `Necesitas los 3 Fragmentos del Cristal. Tienes ${have}/3: ${list}.`
      )
      audio.incorrect()
      announceAssertive(`Entrada sellada. Necesitas los 3 fragmentos. Tienes ${have} de 3.`)
      return
    }

    prevIdRef.current = roomIdRef.current
    roomIdRef.current = id
    sigiloUsedRef.current = false
    const room = worldRef.current[id]
    syncScore(scoreRef.current + 5)
    describeRoom(room)
    if (room.cleared) return
    if (room.event !== 'item' && room.event !== 'shard') room.cleared = true

    // Ladrón detects traps and takes minimal damage
    if (room.event === 'trap' && classRef.current === 'ladron') {
      const hp = Math.max(0, healthRef.current - 5)
      syncHealth(hp)
      addHist('ok',
        `Instinto de Ladrón: detectas la trampa. ${room.trap!.desc} ` +
        `Logras esquivarla en parte. Solo pierdes 5 de vida. Vida: ${hp}/${maxHpRef.current}.`
      )
      audio.click()
      announcePolite('Detectaste una trampa. Daño mínimo.')
      return
    }

    switch (room.event) {
      case 'boss': {
        healUsedRef.current = false; setHealUsed(false)
        const ae: ActiveEnemy = { ...BOSS_DEF, maxHp: BOSS_DEF.hp, isBoss: true, breathTurn: 0 }
        enemyRef.current = ae; inCombat.current = true; setEnemy(ae)
        const cl = classRef.current
        addHist('combat',
          `El Dragón de las Sombras abre los ojos. Sus escamas absorben la luz a su alrededor. ` +
          `Los 3 Fragmentos en tu posesión brillan con intensidad cegadora. ` +
          `Vida del Dragón: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${cl === 'hechicera' ? ' o "hechizo"' : cl === 'paladin' ? ' o "curar"' : ' o "robar"'}.`
        )
        audio.incorrect()
        announceAssertive('¡El Dragón de las Sombras! Combate final.')
        break
      }

      case 'shard': {
        const shardName = room.shardName!
        const newShards = [...shardsRef.current, shardName]
        syncShards(newShards)
        room.cleared = true
        syncScore(scoreRef.current + 100)
        const total = newShards.length
        addHist('shard',
          `¡Fragmento hallado! El ${shardName} estaba oculto aquí. Brilla con luz propia al tomarlo. ` +
          `+100 puntos. Fragmentos reunidos: ${total}/3.` +
          (total === 3 ? ' ¡El Cristal Eterno está casi completo! El sello del Dragón se debilita.' : '')
        )
        audio.start()
        announceAssertive(`¡Fragmento! ${shardName}. Tienes ${total} de 3.`)
        if (total === 3) announcePolite('¡Los 3 fragmentos reunidos! Puedes enfrentar al Dragón.')
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
          addHist('bad', 'Has muerto. Fin de la aventura.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        syncScore(scoreRef.current + reward)
        addHist('ok', `Tesoro — ${desc} +${reward} puntos.`)
        audio.correct()
        announcePolite(`Tesoro encontrado. +${reward} puntos.`)
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
        healUsedRef.current = false; setHealUsed(false)
        const e = room.enemy!
        const ae: ActiveEnemy = { ...e, maxHp: e.hp, isBoss: false, breathTurn: 0 }
        enemyRef.current = ae; inCombat.current = true; setEnemy(ae)
        const cl = classRef.current
        addHist('combat',
          `Un ${e.name} te intercepta. Vida enemiga: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${cl === 'hechicera' ? ', "hechizo"' : cl === 'paladin' ? ', "curar"' : ', "robar"'} o "huir".`
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
          `¡Derrotas al Dragón de las Sombras! Los Fragmentos brillan con luz cegadora y el Dragón se desvanece en humo oscuro. ` +
          `El Cristal Eterno queda restaurado. La luz regresa al reino. ` +
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
        const heal = 20
        syncHealth(Math.min(maxHpRef.current, healthRef.current + heal))
        addHist('ok', `Entre sus restos encuentras una poción pequeña. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    // Dragon uses Aliento de Fuego every 3 turns
    const newBreathTurn = e.breathTurn + 1
    let received: number
    let attackNote: string

    if (e.isBoss && newBreathTurn % 3 === 0) {
      const rawBreath = 55
      received = hasEscudo ? 25 : rawBreath
      attackNote = hasEscudo
        ? ` El Dragón usa Aliento de Fuego (${rawBreath} normal, pero el Escudo Encantado absorbe gran parte: solo ${received} de daño).`
        : ` ¡El Dragón usa Aliento de Fuego! ${rawBreath} de daño de fuego.`
    } else {
      const rawAtk = e.attack
      received = hasEscudo ? Math.floor(rawAtk * 0.6) : rawAtk
      attackNote = hasEscudo ? ` (escudo: -${rawAtk - received} absorbido)` : ''
    }

    const playerHp = Math.max(0, healthRef.current - received)
    const updated: ActiveEnemy = { ...e, hp: enemyHp, breathTurn: newBreathTurn }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño.${attackNote} Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe final. Has caído.`)
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

    if (specialCdRef.current > 0) syncSpecialCD(specialCdRef.current - 1)

    // Huir
    if (/^(huir|flee|escapar|retirarse)$/.test(cmd)) {
      if (e.isBoss) {
        addHist('bad', 'El Dragón bloquea la salida con sus alas. ¡No puedes huir!')
        audio.incorrect(); return
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      syncScore(Math.max(0, scoreRef.current - 5))
      addHist('bad', `Huyes del ${e.name}. -5 puntos.`)
      audio.incorrect()
      announcePolite('Huiste del combate.')
      const prev = prevIdRef.current
      if (prev !== null) { roomIdRef.current = prev; describeRoom(worldRef.current[prev]) }
      return
    }

    // Hechicera — hechizo de hielo
    if (/^(hechizo|magia|spell|magic|hielo)$/.test(cmd)) {
      if (classRef.current !== 'hechicera') {
        addHist('bad', 'Solo la Hechicera puede lanzar hechizos.'); return
      }
      if (specialCdRef.current > 0) {
        addHist('bad', `Tu energía mágica se recupera. Faltan ${specialCdRef.current} turno${specialCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncSpecialCD(3)
      const bonus = (e.isBoss && shardsRef.current.length === 3) ? 40 : 0
      const dmg = 40 + Math.floor(Math.random() * 31) + bonus
      const bonusNote = bonus > 0 ? ` (+${bonus} bonus de los 3 Fragmentos)` : ''
      addHist('combat', `Lanzas un hechizo de hielo: ${dmg} de daño arcano${bonusNote}.`)
      resolveAttack(dmg, e)
      return
    }

    // Paladín — bendición curadora
    if (/^(curar|sanar|heal|curacion|bendicion)$/.test(cmd)) {
      if (classRef.current !== 'paladin') {
        addHist('bad', 'Solo el Paladín puede invocar la Bendición Curadora.'); return
      }
      if (healUsedRef.current) {
        addHist('bad', 'Ya usaste la Bendición Curadora en este combate.'); return
      }
      syncHealUsed(true)
      const hp = Math.min(maxHpRef.current, healthRef.current + 30)
      syncHealth(hp)
      addHist('ok', `La Bendición Sagrada te envuelve. +30 de vida. Vida: ${hp}/${maxHpRef.current}.`)
      audio.correct()
      // Enemy counterattacks
      const rawAtk = e.attack
      const hasEscudo = inventoryRef.current.includes('escudo')
      const received = hasEscudo ? Math.floor(rawAtk * 0.6) : rawAtk
      const hpAfter = Math.max(0, healthRef.current - received)
      syncHealth(hpAfter)
      const shieldNote = hasEscudo ? ` (escudo: -${rawAtk - received} absorbido)` : ''
      addHist('combat', `Pero el ${e.name} aprovecha para atacar: ${received} de daño${shieldNote}. Vida: ${hpAfter}/${maxHpRef.current}.`)
      announcePolite(`Curación. Vida: ${hpAfter}.`)
      if (hpAfter <= 0) {
        addHist('bad', 'Has caído.')
        audio.gameOver()
        deleteSave(); setHasSaveData(false)
        goPhase('lost')
      }
      return
    }

    // Ladrón — robar
    if (/^(robar|steal|robo)$/.test(cmd)) {
      if (classRef.current !== 'ladron') {
        addHist('bad', 'Solo el Ladrón puede intentar robar.'); return
      }
      if (Math.random() < 0.55) {
        const bonus = 20 + Math.floor(Math.random() * 21)
        syncScore(scoreRef.current + bonus)
        addHist('ok', `¡Robo exitoso! Sustraes ${bonus} puntos de valor del ${e.name} sin que lo note.`)
        audio.correct()
      } else {
        const penalty = Math.floor(e.attack * 1.5)
        const hp = Math.max(0, healthRef.current - penalty)
        syncHealth(hp)
        addHist('bad', `¡Fallo! El ${e.name} te pilla y te golpea con furia: ${penalty} de daño. Vida: ${hp}/${maxHpRef.current}.`)
        audio.incorrect()
        if (hp <= 0) {
          addHist('bad', 'Has caído intentando robar.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
          return
        }
      }
      return
    }

    // Atacar
    if (/^(atacar?|attack|pelear|luchar|a)$/.test(cmd)) {
      const hasEspada = inventoryRef.current.includes('espada')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasEspada ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const paladinBonus = classRef.current === 'paladin' && e.isBoss ? 20 : 0
      const dmg = dmgRaw + paladinBonus
      const notes = [
        hasEspada ? 'Espada Élfica' : '',
        paladinBonus > 0 ? `+${paladinBonus} Bendición Sagrada` : '',
      ].filter(Boolean).join(', ')
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${notes ? ` (${notes})` : ''}.`)
      resolveAttack(dmg, e)
      return
    }

    const hints: Record<CharacterClass, string> = {
      paladin:   'atacar, curar o huir',
      hechicera: 'atacar, hechizo o huir',
      ladron:    'atacar, robar o huir',
    }
    addHist('bad', e.isBoss
      ? `Frente al Dragón. Escribe: ${hints[classRef.current].replace(' o huir', '')}.`
      : `En combate. Escribe: ${hints[classRef.current]}.`
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
      const items = inventoryRef.current.length ? inventoryRef.current.join(', ') : 'ninguno'
      const shardList = shardsRef.current.length ? shardsRef.current.join(', ') : 'ninguno'
      const cdNote = classRef.current === 'hechicera' && specialCdRef.current > 0
        ? ` · Hechizo disponible en ${specialCdRef.current} turno${specialCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}. Fragmentos (${shardsRef.current.length}/3): ${shardList}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    // Ladrón — sigilo
    if (/^(sigilo|stealth|evitar|esquivar)$/.test(cmd)) {
      if (classRef.current !== 'ladron') {
        addHist('bad', 'Solo el Ladrón puede usar el sigilo.'); return
      }
      if (sigiloUsedRef.current) {
        addHist('bad', 'Ya usaste el sigilo en esta sala. Solo puedes usarlo una vez por sala.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      if (room.cleared || ['nothing', 'shard', 'narrative'].includes(room.event)) {
        addHist('bad', 'No hay ningún peligro que evitar aquí.'); return
      }
      sigiloUsedRef.current = true
      room.cleared = true
      syncScore(Math.max(0, scoreRef.current - 10))
      addHist('ok', 'Te mueves en silencio y evitas el peligro de esta sala. -10 puntos.')
      announcePolite('Sigilo. Sala evitada.')
      doAutoSave(); return
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
      if (/^(pocion|pocion de vida)$/.test(usarMatch[1].trim())) {
        if (!inventoryRef.current.includes('pocion')) {
          addHist('bad', 'No tienes ninguna poción.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'pocion'))
        addHist('ok', `Bebes la poción. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas la poción. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'La espada y el escudo se usan automáticamente en combate.'); return
    }

    const go = cmd.match(/^(?:ir|go|caminar)\s+(?:al?\s+)?(.+)$/)
    if (go) {
      const dir = go[1].trim() as Direction
      const room = worldRef.current[roomIdRef.current]
      const dest = room.exits[dir]
      if (dest === undefined) {
        addHist('bad', `No puedes ir al ${dir} desde aquí.`); audio.incorrect(); return
      }
      if (room.lockedExits[dir]) {
        if (inventoryRef.current.includes('llave')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'llave'))
          addHist('ok', `La salida al ${dir} estaba sellada. Usas la Llave Rúnica para abrirla.`)
          announcePolite(`Usas la llave. Paso al ${dir} abierto.`)
        } else {
          addHist('bad', `La salida al ${dir} está sellada con magia. Necesitas una Llave Rúnica.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar poción.')
    audio.incorrect()
  }

  // ── Game lifecycle ─────────────────────────────────────────────────────────

  function resetRefs(cl: CharacterClass) {
    const def = CLASS_DEFS[cl]
    classRef.current      = cl
    maxHpRef.current      = def.maxHp
    healthRef.current     = def.maxHp
    scoreRef.current      = 0
    inCombat.current      = false
    enemyRef.current      = null
    cmdHistRef.current    = []
    inventoryRef.current  = []
    shardsRef.current     = []
    specialCdRef.current  = 0
    healUsedRef.current   = false
    sigiloUsedRef.current = false
  }

  function applyUIState(
    cl: CharacterClass, hp: number, sc: number,
    inv: string[], shr: string[], hist: HistEntry[], scd: number
  ) {
    const def = CLASS_DEFS[cl]
    setMaxHp(def.maxHp)
    setHealth(hp)
    setScore(sc)
    setInventory(inv)
    setShards(shr)
    setEnemy(null)
    setSaved(false)
    setSaveError('')
    setHistIdx(-1)
    setInput('')
    setSpecialCD(scd)
    setHealUsed(false)
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
      `${def.name} elegido. ${def.desc}. ` +
      `Tu misión: reunir los 3 Fragmentos del Cristal Eterno y derrotar al Dragón de las Sombras. ` +
      `${room.description} Salidas: ${dirs.join(', ')}.`

    applyUIState(cl, def.maxHp, 0, [], [], [{ type: 'scene', text: msg }], 0)
    goPhase('playing')
    announcePolite(msg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  function loadGame() {
    const save = readSave()
    if (!save) return
    const cl = save.characterClass
    worldRef.current      = save.world
    roomIdRef.current     = save.roomId
    prevIdRef.current     = save.prevId
    classRef.current      = cl
    maxHpRef.current      = CLASS_DEFS[cl].maxHp
    healthRef.current     = save.health
    scoreRef.current      = save.score
    inventoryRef.current  = save.inventory
    shardsRef.current     = save.shards ?? []
    inCombat.current      = false
    enemyRef.current      = null
    cmdHistRef.current    = []
    specialCdRef.current  = save.specialCooldown ?? 0
    healUsedRef.current   = false
    sigiloUsedRef.current = false

    const room = save.world[save.roomId]
    const dirs = (Object.keys(room.exits) as Direction[]).map(d =>
      room.lockedExits?.[d] ? `${d} (sellada)` : d
    )
    const roomMsg = `${room.description} Salidas: ${dirs.join(', ')}.`
    const shr = save.shards ?? []
    const initHist: HistEntry[] = [
      { type: 'ok',    text: `Partida cargada. Fragmentos: ${shr.length}/3.` },
      { type: 'scene', text: roomMsg },
    ]

    applyUIState(cl, save.health, save.score, save.inventory, shr, initHist, save.specialCooldown ?? 0)
    goPhase('playing')
    announcePolite('Partida cargada. ' + roomMsg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleSaveScore() {
    const result = await saveScore('aventura-magica', score)
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
    shard:     'text-[#e879f9]',
  }

  if (phase === 'idle') {
    return (
      <GameShell title="El Cristal Eterno" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Aventura Mágica: El Cristal Eterno</h2>
          <p className="text-[#888] text-sm">
            El Dragón de las Sombras ha destruido el Cristal Eterno. Recorre el reino de Eloria, reúne los 3 Fragmentos y derrota al Dragón antes de que la oscuridad lo devore todo.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => goPhase('selecting')}>Nueva aventura</Button>
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
    const classes: CharacterClass[] = ['paladin', 'hechicera', 'ladron']
    return (
      <GameShell title="El Cristal Eterno" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#ffd700] text-center">Elige tu personaje</h2>
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            role="radiogroup"
            aria-label="Selecciona personaje"
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
            <Button onClick={startGame}>Comenzar aventura</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="El Cristal Eterno" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡El Cristal Eterno ha sido restaurado!' : 'Has caído en la oscuridad'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              Los tres Fragmentos se fusionan con un destello cegador. El Dragón de las Sombras se desvanece.
              La luz regresa al reino de Eloria. Tu nombre vivirá en las crónicas para siempre.
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
      title="El Cristal Eterno"
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
          <span
            className="text-[#e879f9] text-xs font-medium"
            aria-live="polite"
            aria-label={`Fragmentos: ${shards.length} de 3`}
          >
            Fragmentos: {shards.length}/3
          </span>
          <span className="text-[#555] text-xs">{CLASS_DEFS[classRef.current].name}</span>
          {classRef.current === 'hechicera' && specialCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Hechizo en {specialCD}t</span>
          )}
          {inventory.length > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-label={`Objetos: ${inventory.join(', ')}`}>
              {inventory.join(' · ')}
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
          <div className="flex gap-2 mb-3 flex-wrap" role="group" aria-label="Acciones de combate">
            <Button className="flex-1" onClick={() => { processCommand('atacar'); setInput('') }}>
              Atacar
            </Button>
            {classRef.current === 'hechicera' && (
              <Button
                variant={specialCD === 0 ? 'primary' : 'secondary'}
                className="flex-1"
                onClick={() => { processCommand('hechizo'); setInput('') }}
              >
                {specialCD === 0 ? 'Hechizo' : `Hechizo (${specialCD}t)`}
              </Button>
            )}
            {classRef.current === 'paladin' && (
              <Button
                variant={!healUsed ? 'primary' : 'secondary'}
                className="flex-1"
                onClick={() => { processCommand('curar'); setInput('') }}
              >
                {!healUsed ? 'Curar' : 'Curar (usado)'}
              </Button>
            )}
            {classRef.current === 'ladron' && (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { processCommand('robar'); setInput('') }}
              >
                Robar
              </Button>
            )}
            {!enemy.isBoss && (
              <Button variant="secondary" className="flex-1" onClick={() => { processCommand('huir'); setInput('') }}>
                Huir
              </Button>
            )}
          </div>
        )}

        {/* Command input */}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <label htmlFor="cmd-input-magica" className="sr-only">Ingresa un comando</label>
          <input
            id="cmd-input-magica"
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={enemy ? 'atacar...' : 'ir norte, tomar, inventario...'}
            className="flex-1 px-4 py-2.5 rounded bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#ffd700]"
            autoComplete="off"
          />
          <Button type="submit">Enviar</Button>
        </form>

        <p className="mt-2 text-xs text-[#555]">
          Flechas ↑↓ para historial · Partida guardada automáticamente
        </p>
      </div>
    </GameShell>
  )
}
