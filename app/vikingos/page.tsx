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
type CharacterClass = 'guerrero' | 'escaldo' | 'berserker'

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
    name: 'Guerrero Vikingo',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · El hacha de guerra legendaria duplica el daño contra el Jarl',
  },
  escaldo: {
    name: 'Escaldo',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Canto rúnico en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  berserker: {
    name: 'Berserker',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "rabia" para ver las salas adyacentes en tu trance de furia · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'vikingos-jarl-v1'
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
  'Entrada del fortín. Las puertas de roble tallado con runas de protección están abiertas de par en par.',
  'Patio de armas. Escudos astillados y hachas de guerra yacen apilados contra las paredes de troncos.',
  'Gran salón del mead. Los bancos largos de roble están volcados. La hoguera central aún humea.',
  'Armería del jarl. Espadas, lanzas y hachas de doble filo cuelgan en los estantes del herrero.',
  'Sala de los escaldos. Runas talladas en la madera narran las sagas de los guerreros caídos.',
  'Pasillo de los cuervos. Pendones negros con el cuervo de Odín cuelgan de las vigas ennegrecidas.',
  'Sala de las runas. Grandes piedras rúnicas ocupan el centro de la cámara circular de piedra.',
  'Pozo sagrado. Las aguas oscuras del pozo reflejan visiones distorsionadas del pasado.',
  'Fragua del herrero. Yunques y martillos de hierro entre brasas casi extintas.',
  'Sala del trono menor. El asiento de piedra volcánica tallada está frío y vacío.',
  'Granero del fortín. Toneles de mead y salazones de pescado entre telarañas espesas.',
  'Corredor de las hachas. Las marcas de impactos en las paredes documentan siglos de entrenamiento.',
  'Sala de los hombres libres. Bancos largos donde los guerreros deliberaban en asamblea.',
  'Cámara de la völva. Pieles de animal y huesos de ave cuelgan del techo en nudos complejos.',
  'Pasaje de los espíritus. La temperatura cae varios grados al cruzar el umbral de piedra.',
  'Torre de vigía norte. Desde aquí se divisa el fiordo y las aguas oscuras del mar helado.',
  'Sala de los estandartes caídos. Las banderas de los clanes aliados yacen en el polvo.',
  'Bodega de armas. Flechas con punta de hierro nórdico alineadas en sus carcajes de cuero curtido.',
  'Cámara del sacrificio. Un altar de piedra con marcas negras domina el centro de la sala circular.',
  'Sala de los ídolos. Figurillas de madera tallada de los dioses nórdicos descansan en nichos de piedra.',
  'Pasillo del dragón marino. Un mural pintado con tinta de calamar narra expediciones vikingos.',
  'Sala de los pergaminos. Pieles curtidas con mapas de los reinos conocidos y las tierras inexploradas.',
  'Cámara del cofre del clan. La mayoría de los cofres están abiertos y saqueados.',
  'Sala de las espadas. Cientos de hojas de acero adquiridas en las incursiones al sur y al este.',
  'Corredor de los caídos. Los nombres de los guerreros muertos están grabados en las piedras del suelo.',
  'Sala del consejo. La mesa larga de roble tallado donde los jarles tomaban sus decisiones de guerra.',
  'Cámara de los prisioneros. Cadenas de hierro en las paredes, aunque las celdas están vacías.',
  'Sala de los tesoros menores. Monedas árabes, joyas francas y cruces de plata de las incursiones.',
  'Pasillo de las antorchas. Las llamas se agitan sin que haya ningún viento perceptible.',
  'Sala del nido de cuervos. Decenas de cuervos disecados te miran con ojos de piedra negra.',
  'Torre sur. El viento del norte aúlla entre las grietas de la madera oscurecida por siglos.',
  'Cámara del escriba rúnico. Huesos con inscripciones rúnicas apilados en vasijas de barro.',
  'Sala de los guerreros de élite. Las marcas de combate en el suelo narran duelos legendarios.',
  'Corredor del hielo. Una corriente polar entra por las ranuras de la madera podrida.',
  'Sala de los drakkar tallados. Miniaturas de barcos vikingos con velas de lino pintadas.',
  'Cámara de los lobos. Pieles de lobo sobre estacas, con ojos de ámbar que parecen vivos.',
  'Sala del heraldo. Un atril con el libro de sagas. La última página está en blanco y manchada de sangre.',
  'Cámara de los berserkers. Las marcas de garras en las paredes indican la pérdida de cordura.',
  'Pasillo del eco. Cada paso resuena como diez, y los susurros del pasado llenan el aire frío.',
  'Sala de los trofeos. Cráneos de criaturas marinas y garras de bestias del abismo polar.',
  'Corredor de Loki. Pinturas en las paredes muestran a un dios encadenado sonriendo con crueldad.',
  'Cámara del fuego eterno. Llamas de color verde que nunca se apagan en un brasero de piedra antigua.',
  'Sala de las visiones. El suelo cubierto de huesos de ave forma el patrón de una runa gigante.',
  'Corredor de los traidores. Sus espíritus encadenados se perciben en la penumbra perpetua.',
  'Gran cámara del jarl. El asiento dorado del Jarl Haraldur domina la sala, aún caliente.',
  'Pasillo de los juramentos. Las palabras de cada guerrero que sirvió al clan están grabadas en piedra.',
  'Sala de las sombras. Las antorchas no alumbran aquí. La oscuridad parece viva y hambrienta.',
  'Antecámara del Jarl Oscuro. El suelo tiembla con la fuerza del ser que aguarda al otro lado.',
]

const BOSS_ROOM_DESC =
  'Salón del trono del Jarl Oscuro. Haraldur el Traidor se alza de su trono de hueso y oro maldito, ' +
  'cubierto con una armadura de escamas negras imbuida con la magia de Loki. ' +
  'Su hacha de guerra resplandece con un brillo carmesí. Los ojos del Jarl arden con la maldición.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Un guerrero agonizante apoyado contra la pared susurra con esfuerzo: ' +
      '"El Jarl Haraldur hizo un pacto con Loki. Su armadura de escamas negras resiste cualquier hoja ordinaria. ' +
      'Solo el hacha de guerra legendaria del clan fundador puede atravesarla. ' +
      'Está escondida en algún rincón del fortín." ' +
      'Te pasa su cinto vacío y cierra los ojos para siempre.',
    reward: 40,
  },
  {
    text:
      'Las paredes muestran inscripciones en carbón: ' +
      '"La maldición de Loki que porta Haraldur hace su piel impenetrable al hierro corriente. ' +
      'Solo el hacha legendaria, forjada en la fragua de los dioses, ' +
      'puede cortar la magia oscura. Quien la empuñe infligirá el doble de daño al Jarl Traidor."',
    reward: 25,
  },
  {
    text:
      'Un viejo escaldo aparece entre las sombras: ' +
      '"Escucha bien, guerrero. El Jarl Haraldur golpea con la fuerza de un gigante de hielo. ' +
      'Si portas el escudo nórdico cuando su hacha caiga sobre ti, ' +
      'los encantamientos rúnicos del escudo absorberán parte del impacto. ' +
      'La sabiduría salva tanto como la fuerza." ' +
      'El escaldo desaparece sin dejar rastro.',
    reward: 30,
  },
  {
    text:
      'Las paredes están grabadas con los nombres de los guerreros que cayeron ante Haraldur. ' +
      'Cientos de nombres, y al pie la inscripción: ' +
      '"Murieron con honor. Que quien llegue hasta aquí lleve el acero adecuado ' +
      'para devolver la paz al clan y liberar su espíritu del dominio de Loki." ' +
      'El suelo vibra. El salón del trono está cerca.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Guerrero renegado', hp: 30, attack: 12, reward: 20 },
  { name: 'Berserker traidor', hp: 40, attack: 18, reward: 30 },
  { name: 'Arquera del norte', hp: 20, attack: 8, reward: 15 },
  { name: 'Guardián de hierro', hp: 70, attack: 28, reward: 50 },
  { name: 'Espíritu draugr', hp: 35, attack: 15, reward: 25 },
  { name: 'Vikingo corrupto', hp: 25, attack: 20, reward: 35 },
  { name: 'Centinela del jarl', hp: 50, attack: 22, reward: 40 },
  { name: 'Campeón renegado', hp: 80, attack: 32, reward: 60 },
  { name: 'Valquiria oscura', hp: 45, attack: 19, reward: 35 },
  { name: 'Monje de Loki', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'Jarl Haraldur el Oscuro', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'El suelo cede bajo tus pies. Caes en un foso oculto bajo las pieles del suelo.', damage: 20 },
  { desc: 'Una trampa de ballesta dispara una flecha desde la pared al cruzar el umbral.', damage: 15 },
  { desc: 'Pisas una losa que activa una lluvia de dardos envenenados desde el techo.', damage: 18 },
  { desc: 'Un hacha pendular oculta en la oscuridad te golpea al cruzar la sala.', damage: 25 },
  { desc: 'Gas soporífico sale de un brasero de piedra oculto bajo el suelo de madera.', damage: 22 },
  { desc: 'Una trampa de alambre te corta las piernas al intentar desactivarla.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Un cofre de madera con cerraduras de plata lleno de monedas de oro árabes.', reward: 30 },
  { desc: 'Una espada ceremonial con empuñadura de hueso de ballena y filo de plata.', reward: 50 },
  { desc: 'Un collar de ámbar báltico con runas doradas grabadas a fuego.', reward: 25 },
  { desc: 'Una figurilla de oro de Odín con ojos de rubí extraídos de tierras lejanas.', reward: 40 },
  { desc: 'Un broche de plata con el dragón Jörmungandr en relieve, de valor incalculable.', reward: 45 },
  { desc: 'Un cáliz de plata con inscripciones rúnicas que aumentan la fuerza del portador.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Un frasco de hidromiel medicinal con hierbas del norte fermentadas durante un año.', amount: 25 },
  { desc: 'Una bolsa de corteza de abedul con propiedades curativas conocidas por los chamanes.', amount: 35 },
  { desc: 'Un manantial de agua sagrada brota entre las piedras del suelo del fortín.', amount: 30 },
  { desc: 'Un ungüento de grasa de oso y plantas árticas en un cuenco de madera tallada.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'hacha', name: 'Hacha de guerra legendaria', desc: 'Aumenta tu daño en combate. El Guerrero Vikingo la empuña con maestría letal.' },
  { id: 'escudo', name: 'Escudo nórdico', desc: 'Reduce el daño recibido en combate gracias a sus runas de protección.' },
  { id: 'hidromiel', name: 'Hidromiel sagrado', desc: 'Restaura 50 puntos de vida al beberlo.' },
]

const ITEM_KEY: ItemDef = {
  id: 'runa',
  name: 'Runa del clan fundador',
  desc: 'Rompe la maldición de Loki que sella algunas puertas del fortín.',
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
  'La Furia del Jarl. Explora 49 salas del fortín Haraldur, ' +
  'libera al clan de la maldición de Loki y derrota al Jarl Oscuro. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la sala. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar hidromiel para curarte. ' +
  'El hacha de guerra legendaria sube el daño. El escudo nórdico reduce el daño recibido. ' +
  'La runa del clan abre puertas selladas por la maldición de Loki. ' +
  'En combate: atacar o huir. No puedes huir del Jarl Oscuro. ' +
  'Guerrero: más vida y daño. El hacha legendaria duplica el daño contra el Jarl. ' +
  'Escaldo: escribe runas en combate para un canto rúnico devastador cada 3 turnos. ' +
  'Berserker: escribe rabia para ver qué hay en las salas adyacentes en tu trance de furia. ' +
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

export default function VikingosPage() {
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
          `Jarl Haraldur el Oscuro alza su hacha de guerra con una calma que hiela la sangre. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'escaldo' ? ' o "runas"' : ''}. No puedes huir del Jarl.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El Jarl Haraldur te desafía.')
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
          addHist('bad', 'Has muerto. Tu saga queda sin terminar.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'berserker' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Tesoro — ${desc} +${total} puntos${bonus ? ` (bonus berserker +${bonus})` : ''}.`)
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
          `Un ${e.name} te corta el paso con acero en mano. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'escaldo' ? ', "runas"' : ''} o "huir".`
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
          `¡Derrotas a ${e.name}! Cae de rodillas y su hacha maldita se fragmenta en polvo negro. La maldición de Loki se disipa. ` +
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
        addHist('ok', `Entre sus pertenencias encuentras un frasco de hidromiel medicinal. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasEscudo ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const shieldNote = hasEscudo ? ` (escudo: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${shieldNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe final. Caes con honor pero sin vida.`)
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
        addHist('bad', 'El Jarl bloquea todas las salidas. ¡Los vikingos no huyen del duelo final!')
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

    if (/^(runas?|canto runico|canto rúnico|rúnico|cantar runas|entonar|runico)$/.test(cmd)) {
      if (classRef.current !== 'escaldo') {
        addHist('bad', 'Solo el Escaldo conoce los cantos rúnicos de combate.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `Tu voz aún se recupera. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Entonas las runas de Odín con voz de trueno: ${dmg} de daño mágico al enemigo.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|a)$/.test(cmd)) {
      const hasHacha = inventoryRef.current.includes('hacha')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasHacha ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasHacha ? dmgRaw * 2 : dmgRaw
      const hachaNote = e.isBoss && hasHacha ? ` (hacha ×2 vs Jarl: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${hachaNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al Jarl. Escribe: atacar${classRef.current === 'escaldo' ? ' o runas' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'escaldo' ? ', runas' : ''} o huir.`
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
      const cdNote = classRef.current === 'escaldo' && magicCdRef.current > 0
        ? ` · Runas disponibles en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(rabia|furia|berserk|trance|presagiar|explorar)$/.test(cmd)) {
      if (classRef.current !== 'berserker') {
        addHist('bad', 'Solo el Berserker puede entrar en trance de rabia para percibir las salas adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (sellada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'sala en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Trance de rabia: ${lines.join('. ')}.`
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
      if (/^(hidromiel|mead|pocion|poción|curar|frasco|bebida)$/.test(target)) {
        if (!inventoryRef.current.includes('hidromiel')) {
          addHist('bad', 'No tienes ningún hidromiel sagrado.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'hidromiel'))
        addHist('ok', `Bebes el hidromiel sagrado. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas el hidromiel. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'El hacha y el escudo se usan automáticamente en combate.'); return
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
        if (inventoryRef.current.includes('runa')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'runa'))
          addHist('ok', `La puerta al ${dir} estaba sellada con la maldición de Loki. La runa del clan rompe el bloqueo.`)
          announcePolite(`Usas la runa del clan para abrir la puerta al ${dir}.`)
        } else {
          addHist('bad', `La puerta al ${dir} está sellada con la maldición de Loki. Necesitas la runa del clan.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar hidromiel.')
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
      `${def.name} elegido. ${def.desc}. Entras al fortín Haraldur dispuesto a liberar al clan de la maldición. ` +
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
      { type: 'ok',    text: 'Saga reanudada.' },
      { type: 'scene', text: roomMsg },
    ]

    applyUIState(cl, save.health, save.score, save.inventory, initHist, save.magicCooldown)
    goPhase('playing')
    announcePolite('Saga reanudada. ' + roomMsg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleSaveScore() {
    const result = await saveScore('vikingos', score)
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
      <GameShell title="La Furia del Jarl" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">La Furia del Jarl</h2>
          <p className="text-[#888] text-sm">
            Explora 49 salas del fortín Haraldur. Derrota al Jarl Oscuro y libera al clan de la maldición de Loki.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => goPhase('selecting')}>Nueva saga</Button>
            {hasSaveData && (
              <Button size="lg" variant="secondary" onClick={loadGame}>
                Continuar saga guardada
              </Button>
            )}
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'selecting') {
    const classes: CharacterClass[] = ['guerrero', 'escaldo', 'berserker']
    return (
      <GameShell title="La Furia del Jarl" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Entrar al fortín!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="La Furia del Jarl" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡La maldición de Loki ha sido rota!' : 'Has caído en combate'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              El Jarl Haraldur el Oscuro ha sido derrotado. El clan está libre de la maldición y tu nombre será cantado en las sagas para siempre.
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
      title="La Furia del Jarl"
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
          {classRef.current === 'escaldo' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Runas en {magicCD}t</span>
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
          aria-label="Historial de la saga"
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
            {classRef.current === 'escaldo' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('runas'); setInput('') }}
              >
                {magicCD > 0 ? `Runas (${magicCD}t)` : 'Runas'}
              </Button>
            )}
            {!enemy.name.includes('Jarl') && (
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
