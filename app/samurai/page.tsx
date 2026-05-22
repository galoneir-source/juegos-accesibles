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
type CharacterClass = 'samurai' | 'ninja' | 'monje'

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
  samurai: {
    name: 'Samurái',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · La katana legendaria duplica el daño contra el Shogun',
  },
  ninja: {
    name: 'Ninja',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Técnica "sombra" en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  monje: {
    name: 'Monje guerrero',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "meditar" para ver estancias adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'samurai-shogun-v1'
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
  'Entrada del castillo. Los mon (escudos heráldicos) del clan Kurogane adornan las puertas de madera lacada.',
  'Patio de entrenamiento. La arena está marcada por miles de combates pasados.',
  'Sala de los kakemono. Rollos de caligrafía con poemas de guerra cuelgan de las vigas.',
  'Corredor de los shoji. Los paneles de papel traslúcido filtran la luz de la luna.',
  'Sala del ikebana. Arreglos florales secos siguen sobre sus pedestales de cedro.',
  'Pasillo de las armaduras. Doce trajes de ō-yoroi montan guardia en silencio.',
  'Sala del té abandonada. El tatami está rasgado y el agua fría en el caldero.',
  'Jardín de piedras. El rastrillado de la arena forma espirales perfectas.',
  'Torre de vigilancia. Desde aquí se domina todo el feudo de Kurogane.',
  'Almacén de armas. Arcos, flechas y lanzas apiladas en estantes de bambú.',
  'Dojo principal. Las marcas de cortes en el suelo narran mil duelos.',
  'Sala de los mapas. Pergaminos con el feudo al detalle cubren la mesa de laca.',
  'Corredor de las linternas. Las luces de papel proyectan sombras danzantes.',
  'Sala del kagami. Un espejo de bronce pulido refleja la oscuridad del castillo.',
  'Cámara de las ofrendas. Incienso frío y sake derramado ante una estatua de Raijin.',
  'Sala de meditación. Un cuenco de cuarzo emite un zumbido grave en el silencio.',
  'Pasillo del dragón. Un mural de dragón negro recorre los veinte metros de pared.',
  'Biblioteca de los pergaminos. Técnicas de combate secretas en rollos de seda.',
  'Bodega de sake. Cientos de barriles de madera con el sello del clan.',
  'Sala de los instrumentos. Koto y shakuhachi olvidados sobre sus soportes.',
  'Pabellón del estanque. El agua negra refleja el cielo sin estrellas.',
  'Cripta del fundador. El sarcófago de piedra del primer señor Kurogane.',
  'Pasaje secreto detrás de un panel de madera laqueada.',
  'Sala del noh. Las máscaras de teatro te miran desde las paredes con expresión vacía.',
  'Cámara de los sellos. Documentos con el sello imperial en lacre rojo.',
  'Cocina del castillo. Ollas y espadas de bambú para entrenar mezcladas sin orden.',
  'Cuarto de los sirvientes. Futons enrollados y kimonos doblados en silencio eterno.',
  'Sala de las flores de cerezo. Pétalos secos cubren el suelo de madera.',
  'Pasillo de las flechas. Los orificios en la pared delatan antiguas troneras.',
  'Sala de la lluvia. Un tejado roto deja caer hilo de agua sobre las losas.',
  'Cámara del eco. Cada palabra regresa distorsionada desde las paredes de piedra.',
  'Sala de los cofres del daimyo. La mayoría abiertos y vacíos, saqueados.',
  'Corredor del viento norte. Una corriente helada entra por las grietas de la madera.',
  'Sala de los guerreros de terracota. Figuras pintadas con rostros individuales.',
  'Pabellón del bonsái. Árboles centenarios en macetas de cerámica azul y blanca.',
  'Pasaje de las trampas. Alambres de seda a la altura del cuello, ya cortados.',
  'Sala del incienso. El humo acumulado de años pesa en el ambiente oscuro.',
  'Cámara del pergamino negro. Un solo rollo en el centro, escrito en sangre.',
  'Sala de los arcos. Blancos de paja a distancias imposibles para un arquero normal.',
  'Corredor de los espíritus. La temperatura cae diez grados al cruzarlo.',
  'Sala de las monedas de oro. Pilas de koban derramadas entre telarañas.',
  'Cámara del altar de Inari. Estatuas de zorro blanco con ojos de ópalo.',
  'Pasaje del bambú. El suelo cruje como si el bambú creciera bajo las losas.',
  'Sala de los estandartes. Banderas de batalla manchadas de sangre seca.',
  'Cámara del trono del daimyo. El asiento vacío todavía irradia autoridad.',
  'Corredor de las sombras. Las antorchas se apagan solas al cruzarlo.',
  'Sala de los retratos. Los ojos de los Kurogane parecen seguirte.',
  'Antecámara del Shogun. El suelo tiembla con cada paso del tirano.',
]

const BOSS_ROOM_DESC =
  'Gran salón del trono. El Shogun Kurogane Katsuro se alza de su sitial de oro negro, ' +
  'con su armadura ceremonial y la mirada de quien ha ordenado mil ejecuciones. ' +
  'La katana maldita que porta emana un resplandor carmesí en la oscuridad.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Encuentras a un ashigaru agonizante apoyado contra una columna. Con voz débil dice: ' +
      '"El Shogun Kurogane... tomó el feudo con traición hace una luna. ' +
      'Su armadura maldita es invulnerable a cualquier hoja común. ' +
      'Solo la katana legendaria del fundador puede atravesarla. ' +
      'Está escondida en algún lugar del castillo." ' +
      'Te lanza su cinto con una vaina vacía y cierra los ojos.',
    reward: 40,
  },
  {
    text:
      'Las paredes muestran inscripciones en tinta negra: ' +
      '"El Shogun Kurogane forjó un pacto con los oni del inframundo. ' +
      'Su armadura absorbe el golpe de cualquier arma ordinaria. ' +
      'Solo la katana legendaria, templada en el volcán sagrado, ' +
      'puede cortar la maldición. El Samurái que la empuñe infligirá el doble de daño."',
    reward: 25,
  },
  {
    text:
      'Un monje anciano aparece de entre las sombras: ' +
      '"Escucha bien. El Shogun Kurogane golpea con la fuerza de un oni. ' +
      'Si llevas la armadura de laca negra cuando su katana caiga sobre ti, ' +
      'la mitad del daño será absorbido por sus placas encantadas. ' +
      'El camino del bushido exige sabiduría además de valor." ' +
      'El monje desaparece entre las sombras sin dejar rastro.',
    reward: 30,
  },
  {
    text:
      'Las paredes están grabadas con los nombres de los guerreros que cayeron ante el Shogun. ' +
      'Cientos de nombres, y al pie la inscripción: ' +
      '"Murieron con honor. Que quien llegue hasta aquí haya aprendido de su sacrificio ' +
      'y porte el acero adecuado para devolver la paz al feudo." ' +
      'El suelo vibra. El gran salón está cerca.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Ashigaru renegado', hp: 30, attack: 12, reward: 20 },
  { name: 'Samurái traidor', hp: 40, attack: 18, reward: 30 },
  { name: 'Kunoichi de élite', hp: 20, attack: 8, reward: 15 },
  { name: 'Ō-yoroi viviente', hp: 70, attack: 28, reward: 50 },
  { name: 'Espíritu oni menor', hp: 35, attack: 15, reward: 25 },
  { name: 'Arquero de las sombras', hp: 25, attack: 20, reward: 35 },
  { name: 'Guardián del clan', hp: 50, attack: 22, reward: 40 },
  { name: 'Berserker ronin', hp: 80, attack: 32, reward: 60 },
  { name: 'Tengu encadenado', hp: 45, attack: 19, reward: 35 },
  { name: 'Monje corrupto', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'El Shogun Kurogane', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'El suelo cede. Caes en un foso de bambú afilado oculto bajo el tatami.', damage: 20 },
  { desc: 'Una aguja envenenada sale de una ranura en el marco de la puerta y te roza el cuello.', damage: 15 },
  { desc: 'Pisas una losa que dispara una lluvia de shuriken desde la pared.', damage: 18 },
  { desc: 'Un contrapeso de piedra cae desde el techo y te golpea en el hombro.', damage: 25 },
  { desc: 'Gas soporífico sale de un incensario oculto bajo el suelo.', damage: 22 },
  { desc: 'Una trampa de alambre de seda te corta las manos al intentar desactivarla.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Un cofre de laca roja lleno de koban de oro del clan Kurogane.', reward: 30 },
  { desc: 'Un tanto de ceremonial con funda de ray y empuñadura de seda blanca.', reward: 50 },
  { desc: 'Un collar de magatama de jade verde traídos de la corte imperial.', reward: 25 },
  { desc: 'Una estatuilla de oro del dios Hotei con ojos de rubí.', reward: 40 },
  { desc: 'Un abanico de guerra con varillas de plata y seda pintada con tinta de oro.', reward: 45 },
  { desc: 'Un sello de jade con el mon del clan Kurogane, de valor incalculable.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Un botiquín del médico del castillo con hierbas medicinales de las montañas.', amount: 25 },
  { desc: 'Un frasco de sake medicinal curado con raíces de ginseng salvaje.', amount: 35 },
  { desc: 'Un manantial de agua sagrada brota entre las piedras del jardín interior.', amount: 30 },
  { desc: 'Un ungüento de resina de ciprés y algas marinas en una caja de paulownia.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'katana', name: 'Katana legendaria', desc: 'Aumenta tu daño en combate. El Samurái la usa con una maestría mortal.' },
  { id: 'armadura', name: 'Armadura de laca negra', desc: 'Reduce el daño recibido en combate.' },
  { id: 'medicina', name: 'Medicina del monje', desc: 'Restaura 50 puntos de vida al usarla.' },
]

const ITEM_KEY: ItemDef = {
  id: 'sello',
  name: 'Sello del daimyo',
  desc: 'Abre las puertas selladas con la maldición del Shogun.',
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
  'El Honor del Samurái. Explora 49 estancias del castillo Kurogane, ' +
  'restaura el honor del feudo y derrota al Shogun Kurogane. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la estancia. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar medicina para curarte. ' +
  'La katana legendaria sube el daño. La armadura de laca negra reduce el daño recibido. ' +
  'El sello del daimyo abre puertas selladas por la maldición. ' +
  'En combate: atacar o huir. No puedes huir del Shogun. ' +
  'Samurái: más vida y daño. La katana legendaria duplica el daño contra el Shogun. ' +
  'Ninja: escribe sombra en combate para una técnica devastadora cada 3 turnos. ' +
  'Monje guerrero: escribe meditar para ver qué hay en las estancias adyacentes. ' +
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

export default function SamuraiPage() {
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
  const classRef     = useRef<CharacterClass>('samurai')
  const magicCdRef   = useRef(0)
  const phaseRef     = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('samurai')
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
          `El Shogun Kurogane desenvaina su katana maldita con una calma aterradora. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'ninja' ? ' o "sombra"' : ''}. No puedes huir.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El Shogun Kurogane te desafía.')
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
          addHist('bad', 'Has muerto. Tu honor queda pendiente de ser restaurado.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'monje' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Tesoro — ${desc} +${total} puntos${bonus ? ` (bonus monje +${bonus})` : ''}.`)
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
          `Un ${e.name} te corta el paso con acero desenvainado. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'ninja' ? ', "sombra"' : ''} o "huir".`
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
          `¡Derrotas al ${e.name}! Cae de rodillas y su katana maldita se fragmenta en polvo negro. El honor del feudo queda restaurado. ` +
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
        addHist('ok', `Entre sus pertenencias encuentras un frasco de hierbas curativas. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasArmadura ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const armorNote = hasArmadura ? ` (armadura: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${armorNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe final. Caes con el honor intacto pero sin vida.`)
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
        addHist('bad', 'El Shogun bloquea todas las salidas. ¡El bushido prohíbe huir del duelo final!')
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

    if (/^(sombra|tecnica sombra|técnica sombra|ninjutsu|shinobi)$/.test(cmd)) {
      if (classRef.current !== 'ninja') {
        addHist('bad', 'Solo el Ninja puede usar las técnicas de las sombras.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `Tu ki aún se recupera. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Desapareces en las sombras y golpeas desde el punto ciego: ${dmg} de daño.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|a)$/.test(cmd)) {
      const hasKatana = inventoryRef.current.includes('katana')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasKatana ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasKatana ? dmgRaw * 2 : dmgRaw
      const katanaNote = e.isBoss && hasKatana ? ` (katana ×2 vs Shogun: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${katanaNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al Shogun. Escribe: atacar${classRef.current === 'ninja' ? ' o sombra' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'ninja' ? ', sombra' : ''} o huir.`
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
      const cdNote = classRef.current === 'ninja' && magicCdRef.current > 0
        ? ` · Técnica disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(meditar|meditacion|meditación|observar|scout)$/.test(cmd)) {
      if (classRef.current !== 'monje') {
        addHist('bad', 'Solo el Monje guerrero puede meditar para percibir las estancias adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (sellada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'estancia en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Meditación: ${lines.join('. ')}.`
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
      if (/^(medicina|medico|medico|hierbas|frasco|curar)$/.test(target)) {
        if (!inventoryRef.current.includes('medicina')) {
          addHist('bad', 'No tienes ninguna medicina del monje.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'medicina'))
        addHist('ok', `Usas la medicina del monje. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas la medicina. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'La katana y la armadura se usan automáticamente en combate.'); return
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
        if (inventoryRef.current.includes('sello')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'sello'))
          addHist('ok', `La puerta al ${dir} estaba sellada con la maldición del Shogun. El sello del daimyo rompe el bloqueo.`)
          announcePolite(`Usas el sello del daimyo para abrir la puerta al ${dir}.`)
        } else {
          addHist('bad', `La puerta al ${dir} está sellada con la maldición del Shogun. Necesitas el sello del daimyo.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar medicina.')
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
      `${def.name} elegido. ${def.desc}. Entras al castillo Kurogane dispuesto a restaurar el honor del feudo. ` +
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
    const result = await saveScore('samurai', score)
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
      <GameShell title="El Honor del Samurái" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">El Honor del Samurái</h2>
          <p className="text-[#888] text-sm">
            Explora 49 estancias del castillo Kurogane. Derrota al Shogun usurpador y restaura el honor del feudo.
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
    const classes: CharacterClass[] = ['samurai', 'ninja', 'monje']
    return (
      <GameShell title="El Honor del Samurái" instructions={INSTRUCTIONS} score={0}>
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
      <GameShell title="El Honor del Samurái" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡El honor del feudo ha sido restaurado!' : 'Has caído en combate'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              El Shogun Kurogane ha sido derrotado. La paz vuelve al feudo y tu nombre será grabado en las crónicas del clan para siempre.
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
      title="El Honor del Samurái"
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
          {classRef.current === 'ninja' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Técnica en {magicCD}t</span>
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
            {classRef.current === 'ninja' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('sombra'); setInput('') }}
              >
                {magicCD > 0 ? `Sombra (${magicCD}t)` : 'Sombra'}
              </Button>
            )}
            {!enemy.name.includes('Shogun') && (
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
