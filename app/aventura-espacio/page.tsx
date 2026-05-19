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
type CharacterClass = 'comandante' | 'ingeniero' | 'explorador'

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
  comandante: {
    name: 'Comandante',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · La pistola de plasma duplica el daño contra el Vórtex',
  },
  ingeniero: {
    name: 'Ingeniero',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Ataque "hackear" en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  explorador: {
    name: 'Explorador Espacial',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "escanear" para ver secciones adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'aventura-espacio-v1'
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
  'Cámara de acceso principal. Las luces de emergencia parpadean en rojo.',
  'Pasillo de mantenimiento. Tuberías de oxígeno corren por el techo.',
  'Compartimento de almacenaje. Cajas de suministros volcadas por el suelo.',
  'Sala de comunicaciones. Los paneles están destruidos y silenciosos.',
  'Laboratorio de biología. Muestras rotas contaminan el suelo.',
  'Cuartel de la tripulación. Las literas están vacías y revueltas.',
  'Comedor de la estación. La comida liofilizada sigue en las bandejas.',
  'Centro médico. Los equipos de diagnóstico están activos pero sin personal.',
  'Sala de control de sistemas. Monitores muestran alertas en cascada.',
  'Hangar de vehículos. Una lanzadera dañada ocupa la mayor parte del espacio.',
  'Taller de reparaciones. Herramientas esparcidas por todas las superficies.',
  'Cámara de criogénesis. Los módulos están vacíos y abiertos.',
  'Pasillo de ingeniería. Las paredes vibran con el sonido de los reactores.',
  'Sala de energía auxiliar. Generadores de respaldo funcionan al mínimo.',
  'Cámara de observación. Una ventana panorámica muestra el vacío del espacio.',
  'Archivo de datos. Los servidores siguen funcionando en silencio.',
  'Módulo de investigación xenobiótica. Todo está sellado con biohazard.',
  'Pasillo de seguridad. Marcas de disparos en las paredes metálicas.',
  'Cuarto de control de gravedad. La gravedad aquí fluctúa levemente.',
  'Sala de ingeniería avanzada. Planos de la estación cubren las paredes.',
  'Compartimento de armamento. Los casilleros están forzados y vacíos.',
  'Módulo de comunicaciones de largo alcance. La antena está averiada.',
  'Sala de monitoreo ambiental. Los sensores muestran niveles de oxígeno bajos.',
  'Pasillo secreto detrás de un panel de mantenimiento suelto.',
  'Galería de cápsulas de escape. Todas han sido activadas ya.',
  'Sala de mapas estelares. Las constelaciones brillan en el holograma.',
  'Bodega de combustible. Los depósitos están casi vacíos.',
  'Cámara de descanso de la tripulación. Círculos de luz zen en el suelo.',
  'Pasillo de módulos científicos. Las puertas están todas cerradas.',
  'Celda de contención. Las rejas magnéticas están desactivadas.',
  'Sala del eco de la estación. Cada sonido reverbera en las paredes metálicas.',
  'Bóveda sellada de investigación. El sello fue forzado recientemente.',
  'Corredor inundado con líquido refrigerante. Llega a los tobillos.',
  'Sala de armamento de seguridad. La mayoría de las armas han sido tomadas.',
  'Cámara con un espejo de observación hacia la sala de interrogatorios.',
  'Pasaje que huele a ozono quemado. Los cables están fundidos.',
  'Sala con suelo de cristal transparente. Abajo se ve el vacío del espacio.',
  'Sala circular con un reactor secundario. Emite un zumbido constante.',
  'Alcoba de guardia. Restos de una comida interrumpida hace días.',
  'Corredor en zigzag. Las luces de emergencia proyectan sombras extrañas.',
  'Módulo de muestras alienígenas. Símbolos desconocidos cubren las paredes.',
  'Sala con un sintetizador de materia averiado y en silencio.',
  'Pasillo de los lamentos. Un viento frío circula desde una brecha en el casco.',
  'Cámara de almacenaje de muestras. Todos los recipientes están destruidos.',
  'Sala de reuniones de la tripulación. Las sillas volcadas muestran signos de lucha.',
  'Corredor con una trampa de dron visible en el suelo. Ya fue desactivada.',
  'Sala de observación lateral. Una grieta en el cristal deja entrar el frío del espacio.',
  'Antecámara del núcleo. Símbolos del Vórtex cubren todas las paredes.',
]

const BOSS_ROOM_DESC =
  'Sala del Núcleo Central. Un vórtice de energía oscura ocupa el centro de la sala. Un frío sobrenatural impregna el aire.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Encuentras a un tripulante inconsciente apoyado contra la pared. Con voz débil te dice: ' +
      '"El Vórtex... tomó el control del núcleo hace tres días. Consume la energía de todo ser vivo. ' +
      'Necesitas la Pistola de Plasma... es la única arma que puede dañarlo de verdad." ' +
      'El tripulante te lanza su tarjeta de acceso y cierra los ojos para siempre.',
    reward: 40,
  },
  {
    text:
      'Las paredes muestran registros proyectados en hológrafo. Descifras: ' +
      '"El Vórtex fue detectado en el sector Omega hace seis meses. Es una entidad de energía pura ' +
      'capaz de poseer sistemas electrónicos. Los Comandantes que empuñan la Pistola de Plasma ' +
      'le infligen el doble de daño."',
    reward: 25,
  },
  {
    text:
      'Una IA auxiliar aún operativa proyecta un mensaje: ' +
      '"Atención, superviviente. El Vórtex se encuentra en la Sala del Núcleo. ' +
      'Si llevas el Escudo Energético activo, su descarga de energía se reducirá considerablemente. ' +
      'Procede con precaución." El hológrama desaparece con un pitido.',
    reward: 30,
  },
  {
    text:
      'Las paredes están marcadas con nombres de tripulantes. Un registro en el suelo reza: ' +
      '"Aquí descansaron todos los que cayeron ante el Vórtex desde que la estación fue comprometida. ' +
      'Que tu destino sea diferente." Sientes un frío glacial. El núcleo está cerca.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Dron de combate', hp: 30, attack: 12, reward: 20 },
  { name: 'Robot poseído', hp: 40, attack: 18, reward: 30 },
  { name: 'Alienígena menor', hp: 20, attack: 8, reward: 15 },
  { name: 'Titán de combate', hp: 70, attack: 28, reward: 50 },
  { name: 'Zombi estelar', hp: 35, attack: 15, reward: 25 },
  { name: 'Araña mecánica', hp: 25, attack: 20, reward: 35 },
  { name: 'Espectro del Vórtex', hp: 50, attack: 22, reward: 40 },
  { name: 'Guardián corrupto', hp: 80, attack: 32, reward: 60 },
  { name: 'Sombra alienígena', hp: 45, attack: 19, reward: 35 },
  { name: 'Vampiro de energía', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'El Vórtex Primario', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'El suelo cede. Caes en un panel de trampa oculto.', damage: 20 },
  { desc: 'Una descarga eléctrica sale de un panel dañado y te alcanza.', damage: 15 },
  { desc: 'Pisas una placa de presión que activa una descarga sónica.', damage: 18 },
  { desc: 'Una trampa de gravedad localizada te aplasta brevemente contra el suelo.', damage: 25 },
  { desc: 'Gas tóxico sale de una rejilla de ventilación averiada.', damage: 22 },
  { desc: 'Un panel del techo se desprende y cae sobre ti.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Una unidad de datos con valiosa información científica cifrada.', reward: 30 },
  { desc: 'Un cofre de suministros sellado con equipamiento de alto valor.', reward: 50 },
  { desc: 'Un cristal de energía que emite un suave resplandor azul.', reward: 25 },
  { desc: 'Un dispositivo de investigación avanzado aún funcional.', reward: 40 },
  { desc: 'Un componente de motor cuántico de valor incalculable.', reward: 45 },
  { desc: 'Un anillo de almacenamiento cuántico que brilla con luz propia.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Una estación de regeneración médica aún operativa. Te regeneras en ella.', amount: 25 },
  { desc: 'Un kit de curación avanzado en una caja de emergencia.', amount: 35 },
  { desc: 'Un campo de nanobots reparadores te envuelve y sana tus heridas.', amount: 30 },
  { desc: 'Un módulo de recuperación con energía médica activa. Te recuperas ante él.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'pistola', name: 'Pistola de plasma', desc: 'Aumenta tu daño en combate.' },
  { id: 'escudo', name: 'Escudo energético', desc: 'Reduce el daño recibido en combate.' },
  { id: 'kit', name: 'Kit médico avanzado', desc: 'Restaura 50 puntos de vida al usarlo.' },
]

const ITEM_KEY: ItemDef = {
  id: 'tarjeta',
  name: 'Tarjeta de acceso',
  desc: 'Desbloquea puertas con seguridad de nivel alpha.',
}

const ITEM_NAME: Record<string, string> = Object.fromEntries(
  [...ITEM_REGULAR, ITEM_KEY].map(i => [i.id, i.name])
)

const EVENT_LABELS: Partial<Record<Room['event'], string>> = {
  treasure: 'posible recompensa',
  trap: 'peligro',
  enemy: 'presencia hostil',
  healing: 'señal médica',
  item: 'objeto en el suelo',
  boss: '¡jefe final!',
  narrative: 'punto de interés',
}

const INSTRUCTIONS =
  'Aventura Espacial: La Estación. Explora 49 secciones de la estación espacial UES Kronos, ' +
  'descubre qué le ocurrió a la tripulación y destruye al Vórtex Primario. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la sección. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar kit para curarte. ' +
  'La pistola de plasma sube el daño. El escudo energético reduce el daño recibido. ' +
  'La tarjeta de acceso abre puertas bloqueadas. ' +
  'En combate: atacar o huir. No puedes huir del Vórtex Primario. ' +
  'Comandante: más vida y daño. La pistola duplica el daño contra el Vórtex. ' +
  'Ingeniero: escribe hackear en combate para un ataque de código destructivo poderoso cada 3 turnos. ' +
  'Explorador Espacial: escribe escanear para ver qué hay en las secciones adyacentes. ' +
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

export default function AventuraEspacioPage() {
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
  const classRef     = useRef<CharacterClass>('comandante')
  const magicCdRef   = useRef(0)
  const phaseRef     = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('comandante')
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
          `El Vórtex Primario se materializa con una energía oscura cegadora. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'ingeniero' ? ' o "hackear"' : ''}. No puedes huir.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El Vórtex Primario te ataca.')
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
          addHist('bad', 'Has muerto. Fin de la misión.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'explorador' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Recompensa — ${desc} +${total} puntos${bonus ? ` (bonus explorador +${bonus})` : ''}.`)
        audio.correct()
        announcePolite(`Recompensa encontrada. +${total} puntos.`)
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
          `Un ${e.name} te intercepta. Vida enemiga: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'ingeniero' ? ', "hackear"' : ''} o "huir".`
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
          `¡Destruyes al ${e.name}! La estación recupera la calma. ` +
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
        addHist('ok', `Entre sus restos encuentras un kit de emergencia. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
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
      addHist('bad', `El ${e.name} te da el golpe final. Has muerto.`)
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
        addHist('bad', 'El Vórtex bloquea toda salida. ¡No puedes huir!')
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

    if (/^(hackear|hack|hackeo)$/.test(cmd)) {
      if (classRef.current !== 'ingeniero') {
        addHist('bad', 'Solo el Ingeniero puede usar hackeo de combate.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `Tu sistema de hackeo aún se reinicia. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Lanzas un código destructivo: ${dmg} de daño digital.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|a)$/.test(cmd)) {
      const hasPistola = inventoryRef.current.includes('pistola')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasPistola ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasPistola ? dmgRaw * 2 : dmgRaw
      const gunNote = e.isBoss && hasPistola ? ` (pistola ×2 vs Vórtex: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${gunNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al jefe. Escribe: atacar${classRef.current === 'ingeniero' ? ' o hackear' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'ingeniero' ? ', hackear' : ''} o huir.`
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
      const cdNote = classRef.current === 'ingeniero' && magicCdRef.current > 0
        ? ` · Hackeo disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(escanear|scan|explorar)$/.test(cmd)) {
      if (classRef.current !== 'explorador') {
        addHist('bad', 'Solo el Explorador Espacial puede usar este comando.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (bloqueada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'sección tranquila')
        return `${d}: ${label}${locked}`
      })
      const msg = `Escaneo: ${lines.join('. ')}.`
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
      if (/^(kit|kit medico|kit de vida)$/.test(usarMatch[1].trim())) {
        if (!inventoryRef.current.includes('kit')) {
          addHist('bad', 'No tienes ningún kit médico.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'kit'))
        addHist('ok', `Usas el kit médico. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas el kit médico. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'La pistola y el escudo se usan automáticamente en combate.'); return
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
        if (inventoryRef.current.includes('tarjeta')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'tarjeta'))
          addHist('ok', `La puerta al ${dir} estaba bloqueada. Usas la tarjeta de acceso para abrirla.`)
          announcePolite(`Usas la tarjeta para desbloquear la puerta al ${dir}.`)
        } else {
          addHist('bad', `La puerta al ${dir} está bloqueada con seguridad alpha. Necesitas una tarjeta de acceso.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar kit.')
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
      `${def.name} elegido. ${def.desc}. Comienzas tu misión de rescate en la UES Kronos. ` +
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
    const result = await saveScore('aventura-espacio', score)
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
      <GameShell title="Aventura Espacial" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Aventura Espacial: La Estación</h2>
          <p className="text-[#888] text-sm">
            Explora 49 secciones de la estación espacial UES Kronos. Descubre qué le ocurrió a la tripulación y destruye al Vórtex Primario para ganar.
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
    const classes: CharacterClass[] = ['comandante', 'ingeniero', 'explorador']
    return (
      <GameShell title="Aventura Espacial" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>Iniciar misión</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Aventura Espacial" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Has destruido el Vórtex!' : 'Has muerto'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              El Vórtex Primario ha sido neutralizado. La estación recupera la energía. Eres el último superviviente de la UES Kronos.
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
      title="Aventura Espacial"
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
          {classRef.current === 'ingeniero' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Hackeo en {magicCD}t</span>
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
            {classRef.current === 'ingeniero' && (
              <Button
                variant={magicCD === 0 ? 'primary' : 'secondary'}
                className="flex-1"
                onClick={() => { processCommand('hackear'); setInput('') }}
              >
                {magicCD === 0 ? 'Hackear' : `Hackear (${magicCD}t)`}
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
          <label htmlFor="cmd-input-espacio" className="sr-only">Ingresa un comando</label>
          <input
            id="cmd-input-espacio"
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={enemy ? 'atacar...' : 'ir norte, tomar, escanear...'}
            className="flex-1 px-4 py-2.5 rounded bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#ffd700]"
            autoComplete="off"
          />
          <Button type="submit">Enviar</Button>
        </form>

        <p className="mt-2 text-xs text-[#555]">
          Flechas ↑↓ para historial · Misión guardada automáticamente
        </p>
      </div>
    </GameShell>
  )
}
