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
type CharacterClass = 'explorador' | 'chaman' | 'arqueologa'

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
  explorador: {
    name: 'Explorador',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · El machete de obsidiana duplica el daño contra Kukulkán',
  },
  chaman: {
    name: 'Chamán',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Maldición ancestral en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  arqueologa: {
    name: 'Arqueóloga',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "descifrar" para ver las zonas adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'templo-kukulkan-v1'
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
  'Claro de entrada a la jungla. Las lianas cuelgan entre los árboles y el calor húmedo es sofocante.',
  'Sendero hundido entre la vegetación. Las pisadas de animales desconocidos rodean el camino.',
  'Ruinas de un observatorio maya. Las estrellas talladas en piedra señalan hacia el interior de la selva.',
  'Orilla de un río de aguas oscuras. Cocodrilos dormitan sobre rocas calentadas por el sol tropical.',
  'Aldea abandonada. Los hogares de barro y paja han sido devorados por la selva en décadas.',
  'Cenote oculto entre las raíces. El agua verde esmeralda refleja la luz filtrada por el dosel vegetal.',
  'Cima de una pirámide menor. Desde aquí se divisa el templo principal en el corazón de la jungla.',
  'Cámara de las ofrendas. Cuencos de obsidiana vacíos rodean un altar manchado de antiguas ceremonias.',
  'Corredor de las serpientes. Los bajorrelieves muestran a Kukulkán devorando el sol y la luna.',
  'Sala del códice perdido. Fragmentos de un libro ilustrado cubren el suelo de piedra volcánica.',
  'Templo de los guerreros. Columnas con figuras de soldados de piedra flanquean la entrada sellada.',
  'Pasadizo subterráneo. El sonido del agua subterránea llena los oídos en la oscuridad húmeda.',
  'Sala del jaguar. Una enorme escultura del felino sagrado preside la estancia con ojos de jade.',
  'Puente de lianas sobre un barranco. El abismo emite un eco de viento y agua lejana.',
  'Altar del sacrificio exterior. Manchas oscuras en la piedra dejan poco margen a la imaginación.',
  'Bosque de estelas mayas. Losas de piedra con inscripciones que ningún arqueólogo ha descifrado.',
  'Cueva de los murciélagos. Miles de ellos cuelgan del techo y llenan el aire con sus chillidos.',
  'Plaza ceremonial. El suelo de losas perfectas contrasta con el caos verde que la rodea.',
  'Fuente sagrada. Una corriente de agua cristalina emerge de la boca de una serpiente de piedra.',
  'Sala del cronograma cósmico. El calendario maya tallado en la pared mide ciclos de milenios.',
  'Torre de vigilancia en ruinas. Desde lo alto se ve la selva extenderse hasta el horizonte brumoso.',
  'Mercado petrificado. Los puestos de comercio maya quedaron congelados en el tiempo hace siglos.',
  'Templo menor del dios Chaac. Máscaras de lluvia decoran cada centímetro de las paredes húmedas.',
  'Cámara de las máscaras. Docenas de rostros de dioses de terracota observan desde los estantes.',
  'Pasaje de entrada al templo principal. La oscuridad al fondo pulsa como un ser vivo.',
  'Vestíbulo interior del templo. El aire cargado de incienso rancio pesa en los pulmones.',
  'Sala de los guardianes. Esculturas de chac-mools con cuencos de piedra flanquean el paso.',
  'Corredor de los espejos de obsidiana. Tu reflejo se multiplica en las superficies pulidas y negras.',
  'Cámara del viento. Un silbido constante emerge de grietas invisibles en las paredes de piedra.',
  'Sala de los códices quemados. Cenizas de libros sagrados cubren el suelo como nieve negra.',
  'Trono de piedra serpentina. El asiento del rey-sacerdote mira hacia la oscuridad del norte.',
  'Galería de los ancestros. Bustos de gobernantes mayas con tocados elaborados en cada nicho.',
  'Cámara del fuego eterno. Una llama que arde sin combustible visible ilumina el centro del cuarto.',
  'Sala de los astros. El techo está perforado para proyectar constelaciones en el suelo de roca.',
  'Pasaje de los murales. Frescos que narran la guerra entre los dioses tiñen las paredes de rojo y azul.',
  'Cámara de los cenotes sagrados. Un pozo en el suelo cae hasta la oscuridad sin fondo visible.',
  'Sala del viento de Kukulkán. Espirales de aire frío giran sin causa aparente en la estancia.',
  'Cripta de los reyes-sacerdotes. Sarcófagos de jade alineados y cubiertos de inscripciones funerarias.',
  'Corredor de las trampas antiguas. El polvo perturbado delata que otros intentaron pasar antes.',
  'Sala de la constelación de la serpiente. El suelo muestra el camino de Venus trazado en mosaico.',
  'Antecámara ritual. Incensarios de barro humeantes flanquean la entrada a la sala del poder.',
  'Cámara de la sangre y el maíz. Los frisos narran el mito de la creación en colores vívidos.',
  'Sala de los tambores sagrados. Instrumentos de piel tensa que nadie ha tocado en siglos resuenan solos.',
  'Corredor final del templo. Las paredes se cierran ligeramente hacia el centro a medida que avanzas.',
  'Sala del pacto con Kukulkán. Un contrato de piedra sellado con símbolos que queman al mirarlos.',
  'Cámara del corazón del templo. El suelo vibra con una energía que no tiene nombre en ningún idioma.',
  'Antesala del Dios Serpiente. Las antorchas se apagan solas al entrar; la oscuridad es absoluta.',
  'Galería de las ofrendas finales. Objetos dejados por devotos que buscaban el favor del Dios Serpiente.',
]

const BOSS_ROOM_DESC =
  'Sanctuario de Kukulkán, el Dios Serpiente. El techo de la cámara se pierde en la oscuridad y las paredes están ' +
  'tapizadas de serpientes emplumadas talladas en obsidiana viva. El aire vibra con una energía ancestral que eriza la piel. ' +
  'En el centro de la sala, una figura de luz y sombra cobra forma: Kukulkán, el Dios Serpiente, se materializa con ' +
  'escamas de oro y ojos de fuego blanco. ' +
  '"MORTAL OSADO. EL TEMPLO NO PERTENECE A TU MUNDO." ' +
  'Su voz hace temblar las piedras mientras despliega sus alas de quetzal y lanza la primera ráfaga de energía serpentina.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Una inscripción en la pared del templo, parcialmente descifrada: ' +
      '"El machetl de obsidiana sagrada, forjado en el corazón del volcán, es el único arma capaz de herir ' +
      'la forma física de Kukulkán. En manos de un Explorador diestro, su filo penetra las escamas doradas ' +
      'del Dios Serpiente y duplica el daño infligido." ' +
      'El texto está rodeado de serpientes emplumadas en bajorrelieve.',
    reward: 40,
  },
  {
    text:
      'Pintado por un chamán en la pared hace siglos: ' +
      '"El amuleto de jade de los antiguos sacerdotes lleva la protección de los dioses benignos. ' +
      'Quien lo porta en combate siente cómo absorbe una parte de cada golpe recibido, ' +
      'reduciendo el daño que alcanza al portador de forma significativa."',
    reward: 25,
  },
  {
    text:
      'Un papiro doblado dentro de un cuenco de cerámica: ' +
      '"Kukulkán, el Dios Serpiente, tiene una debilidad: su forma entre los mundos. ' +
      'El Chamán que conozca la maldición ancestral de Ixchel puede desestabilizar su energía ' +
      'y causarle un daño devastador. La maldición se recarga entre usos: ' +
      'la paciencia del Chamán es su mayor arma." ' +
      'El papiro se deshace al terminar de leerlo.',
    reward: 30,
  },
  {
    text:
      'Grabado en la roca con una piedra afilada, con letra reciente: ' +
      '"He llegado hasta aquí antes que tú. Los pasajes sellados con glifos sagrados no se abren con fuerza. ' +
      'Encontré el glifo en las estancias anteriores. Sin él, el Templo no te dejará pasar. ' +
      'Yo encontré el camino." ' +
      'No hay rastro del que lo escribió.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Guerrero jaguar', hp: 30, attack: 12, reward: 20 },
  { name: 'Sacerdote corrupto', hp: 40, attack: 18, reward: 30 },
  { name: 'Serpiente gigante', hp: 20, attack: 8, reward: 15 },
  { name: 'Espíritu guerrero maya', hp: 70, attack: 28, reward: 50 },
  { name: 'Cazador de la tribu maldita', hp: 35, attack: 15, reward: 25 },
  { name: 'Centinela de piedra animado', hp: 25, attack: 20, reward: 35 },
  { name: 'Araña de las sombras', hp: 50, attack: 22, reward: 40 },
  { name: 'Guardián del cenote', hp: 80, attack: 32, reward: 60 },
  { name: 'Demonio del inframundo', hp: 45, attack: 19, reward: 35 },
  { name: 'Chamán rival corrompido', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'Kukulkán, el Dios Serpiente', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'Flechas envenenadas disparadas desde la pared al pisar una losa oculta.', damage: 20 },
  { desc: 'Una losa que cede bajo tus pies te precipita hacia un foso de espinas.', damage: 25 },
  { desc: 'Gas soporífero brota de urnas ceremoniales rotas al rozarlas.', damage: 18 },
  { desc: 'Una red de lianas cortantes cae del techo al cruzar el umbral.', damage: 15 },
  { desc: 'Un mecanismo de aplastamiento se activa en las paredes del corredor.', damage: 22 },
  { desc: 'Un dardo de cerbatana activado por un hilo invisible te alcanza en el cuello.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Una máscara de jade del rey-sacerdote, cubierta de glifos de poder.', reward: 30 },
  { desc: 'Un collar de dientes de jaguar y turquesas engarzadas en oro nativo.', reward: 50 },
  { desc: 'Un disco solar de oro macizo con el calendario de Kukulkán grabado.', reward: 25 },
  { desc: 'Una jarra sellada con cacao sagrado y ofrendas de cobre puro.', reward: 40 },
  { desc: 'Una estela portátil con inscripciones invaluables para la arqueología.', reward: 45 },
  { desc: 'Un recipiente de obsidiana repleto de turquesas y jade sin tallar.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Una fuente de agua purificada por los sacerdotes mayas te devuelve las fuerzas.', amount: 25 },
  { desc: 'Una sala con hierbas medicinales de la selva, frescas y bien conservadas.', amount: 35 },
  { desc: 'Las aguas de un cenote sagrado cierran tus heridas al bañarlas.', amount: 30 },
  { desc: 'Un bálsamo de copal y resinas sagradas alivia el dolor y cura las heridas.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'machete', name: 'Machete de obsidiana maya', desc: 'Aumenta tu daño en combate. El Explorador lo maneja con una destreza letal.' },
  { id: 'amuleto', name: 'Amuleto de protección de jade', desc: 'Reduce el daño recibido gracias a su energía protectora ancestral.' },
  { id: 'pocion', name: 'Poción curativa de hierbas sagradas', desc: 'Restaura 50 puntos de vida al beberla.' },
]

const ITEM_KEY: ItemDef = {
  id: 'glifo',
  name: 'Glifo sagrado maya',
  desc: 'Desbloquea los pasajes sellados con inscripciones ancestrales del templo.',
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
  'El Templo Perdido. Explora 49 zonas de la jungla y el templo maya perdido, ' +
  'descubre sus secretos y derrota al Dios Serpiente Kukulkán. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la zona. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar poción para curarte. ' +
  'El machete de obsidiana sube el daño en combate. El amuleto de jade reduce el daño recibido. ' +
  'El glifo sagrado desbloquea los pasajes sellados con inscripciones mayas. ' +
  'En combate: atacar o huir. No puedes huir de Kukulkán. ' +
  'Explorador: más vida y daño. El machete duplica el daño contra Kukulkán. ' +
  'Chamán: escribe maldicion en combate para lanzar una maldición ancestral devastadora cada 3 turnos. ' +
  'Arqueóloga: escribe descifrar para ver qué hay en las zonas adyacentes. ' +
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

export default function TemploPage() {
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
  const classRef     = useRef<CharacterClass>('explorador')
  const magicCdRef   = useRef(0)
  const phaseRef     = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('explorador')
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
          `Kukulkán, el Dios Serpiente, te envuelve con su energía serpentina. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'chaman' ? ' o "maldicion"' : ''}. No puedes huir del Dios Serpiente.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! Kukulkán, el Dios Serpiente, te desafía.')
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
          addHist('bad', 'El templo reclama tu alma. Kukulkán ha ganado.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'arqueologa' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Tesoro — ${desc} +${total} puntos${bonus ? ` (bonus arqueóloga +${bonus})` : ''}.`)
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
          `Un ${e.name} te intercepta en el camino. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'chaman' ? ', "maldicion"' : ''} o "huir".`
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
    const hasAmuleto = inventoryRef.current.includes('amuleto')
    const enemyHp = e.hp - dmg

    if (enemyHp <= 0) {
      syncScore(scoreRef.current + e.reward)
      if (e.isBoss) {
        const bonus = Math.floor(healthRef.current / 2)
        syncScore(scoreRef.current + bonus)
        inCombat.current = false; enemyRef.current = null; setEnemy(null)
        addHist('ok',
          `¡Derrotas a ${e.name}! La sala tiembla y las serpientes de piedra se desmoronan. ` +
          `El Dios Serpiente emite un último rugido cósmico antes de disolverse en polvo dorado. ` +
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
        addHist('ok', `Entre sus pertenencias encuentras hierbas medicinales de la selva. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasAmuleto ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const amuletoNote = hasAmuleto ? ` (amuleto: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${amuletoNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe definitivo. El templo reclama tu alma.`)
      audio.gameOver()
      deleteSave(); setHasSaveData(false)
      announceAssertive('Has caído en el templo. Fin del juego.')
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
        addHist('bad', 'Kukulkán te rodea con serpientes de energía cósmica. ¡No hay escapatoria del Dios Serpiente!')
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

    if (/^(maldicion|maldición|hechizo|conjuro|ritual|maleficio|magia|invocar)$/.test(cmd)) {
      if (classRef.current !== 'chaman') {
        addHist('bad', 'Solo el Chamán conoce las maldiciones ancestrales mayas.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `La maldición aún se recarga. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Lanzas una maldición ancestral de Ixchel sobre el enemigo: ${dmg} de daño mágico.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|cortar|disparar|a)$/.test(cmd)) {
      const hasMachete = inventoryRef.current.includes('machete')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasMachete ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasMachete ? dmgRaw * 2 : dmgRaw
      const macheteNote = e.isBoss && hasMachete ? ` (machete ×2 vs Kukulkán: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${macheteNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente a Kukulkán. Escribe: atacar${classRef.current === 'chaman' ? ' o maldicion' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'chaman' ? ', maldicion' : ''} o huir.`
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
      const cdNote = classRef.current === 'chaman' && magicCdRef.current > 0
        ? ` · Maldición disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(descifrar|interpretar|examinar|analizar|leer)$/.test(cmd)) {
      if (classRef.current !== 'arqueologa') {
        addHist('bad', 'Solo la Arqueóloga puede descifrar las inscripciones para conocer las zonas adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (sellada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'zona en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Descifras las inscripciones: ${lines.join('. ')}.`
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
      if (/^(pocion|poción|brebaje|hierba|pocima|pócima|curar|beber|remedios)$/.test(target)) {
        if (!inventoryRef.current.includes('pocion')) {
          addHist('bad', 'No tienes ninguna poción curativa.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'pocion'))
        addHist('ok', `Bebes la poción curativa de hierbas sagradas. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas la poción. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'El machete y el amuleto se usan automáticamente en combate.'); return
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
        if (inventoryRef.current.includes('glifo')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'glifo'))
          addHist('ok', `El pasaje al ${dir} estaba sellado con inscripciones mayas. El glifo sagrado hace que se abra el paso.`)
          announcePolite(`Usas el glifo para abrir el pasaje al ${dir}.`)
        } else {
          addHist('bad', `El pasaje al ${dir} está sellado con inscripciones mayas. Necesitas el glifo sagrado.`)
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
      `${def.name} elegido. ${def.desc}. Te adentras en la jungla hacia el Templo Perdido para enfrentarte al Dios Serpiente Kukulkán. ` +
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
    const result = await saveScore('templo', score)
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
      <GameShell title="El Templo Perdido" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">El Templo Perdido</h2>
          <p className="text-[#888] text-sm">
            Explora 49 zonas de la jungla y el templo maya perdido. Descubre sus secretos y derrota al Dios Serpiente Kukulkán.
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
    const classes: CharacterClass[] = ['explorador', 'chaman', 'arqueologa']
    return (
      <GameShell title="El Templo Perdido" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Adentrarse en la Jungla!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="El Templo Perdido" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Kukulkán, el Dios Serpiente, ha sido derrotado!' : 'Has perecido en el templo'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              Kukulkán se ha disuelto en polvo dorado y la maldición milenaria del templo se levanta para siempre. La jungla recupera su silencio y el Templo Perdido queda libre de la sombra del Dios Serpiente.
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
      title="El Templo Perdido"
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
          {classRef.current === 'chaman' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Maldición en {magicCD}t</span>
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
            {classRef.current === 'chaman' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('maldicion'); setInput('') }}
              >
                {magicCD > 0 ? `Maldición (${magicCD}t)` : 'Maldición'}
              </Button>
            )}
            {!enemy.name.includes('Kukulkán') && (
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
