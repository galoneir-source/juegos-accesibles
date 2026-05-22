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
type CharacterClass = 'mercenario' | 'netrunner' | 'espia'

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
  mercenario: {
    name: 'Mercenario',
    maxHp: 120,
    dmgBonus: 8,
    magic: false,
    scouting: false,
    desc: '+8 de daño en combate · 120 de vida · La monokatana duplica el daño contra el Director Nexus',
  },
  netrunner: {
    name: 'Netrunner',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Hackeo neural en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  espia: {
    name: 'Espía Corporativo',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "infiltrar" para ver los sectores adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'corp-nexus-v1'
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
  'Vestíbulo de la Torre Nexus. Los hologramas corporativos parpadean en el aire contaminado.',
  'Corredor de seguridad. Cámaras con ojos rojos rastrean cada movimiento en el pasillo.',
  'Centro de datos principal. Miles de servidores zumban con el peso de secretos corporativos.',
  'Planta de producción. Brazos robóticos ensamblan implantes neurales en cadenas de montaje.',
  'Sala de control de drones. Los paneles muestran la megaciudad desde mil ángulos distintos.',
  'Cibercínica corporativa. Sillones de cirugía y piezas de repuesto para empleados mejorados.',
  'Cafetería de la Torre. Las bandejas de sinteproteína se acumulan sin nadie que las consuma.',
  'Sala de reuniones de alto nivel. Las pantallas muestran gráficos de beneficios disparados.',
  'Corredor de mantenimiento. Tuberías de refrigeración gotean líquido azul de nanobots.',
  'Archivo corporativo. Expedientes digitales de millones de ciudadanos catalogados sin permiso.',
  'Laboratorio de I+D. Prototipos de armas y tecnología que aún no existe en el mercado negro.',
  'Sala del servidor maestro. El corazón digital de toda la red corporativa Nexus late aquí.',
  'Túnel de suministros. Cintas transportadoras paradas con cajas marcadas con "CLASIFICADO".',
  'Zona de detención. Celdas de contención electromagnética vacías pero recién utilizadas.',
  'Azotea de la torre media. El smog de neón tiñe el horizonte de naranja y violeta.',
  'Sala de operaciones encubiertas. Mapas tácticos de la megaciudad con zonas marcadas en rojo.',
  'Mercado negro interno. Implantes de contrabando y datos robados en intercambio clandestino.',
  'Zona de pruebas de armamento. Blancos destrozados y marcas de impacto en paredes blindadas.',
  'Sala de los hackeos exitosos. Sistemas comprometidos listados como trofeos en las pantallas.',
  'Cuartel de seguridad privada. Los guardias estuvieron aquí hace poco; el café aún está caliente.',
  'Planta de generación energética. Reactores de fusión fría alimentan toda la Torre Nexus.',
  'Sala de comunicaciones. Interceptores que monitorizan cada transmisión de la megaciudad.',
  'Centro de manipulación mediática. Aquí se fabrican las noticias que el ciudadano consume.',
  'Zona de la IA secundaria. Un sistema de inteligencia artificial controla los subsistemas.',
  'Sala de trofeos del Director. Objetos de empresas rivales que Nexus destruyó y absorbió.',
  'Corredor de la fibra óptica. Las paredes translúcidas revelan miles de cables de datos.',
  'Sala de descanso de ejecutivos. Lujo obsceno contrastando con la miseria del exterior.',
  'Centro de lavado de créditos. Las transacciones ilegales fluyen aquí como agua.',
  'Zona de eliminación de residuos. Documentos incriminatorios destruidos, aunque algunos quedan.',
  'Sala de los implantes experimentales. Piezas de cuerpo humano mejorado en contenedores crио.',
  'Corredor de emergencia. Las luces rojas de alarma siguen parpadeando desde hace días.',
  'Sala de los espías eliminados. Una lista con nombres tachados en rojo cubre la pared.',
  'Zona de control climático. El Director decide la temperatura de cada sector de la ciudad.',
  'Centro de hackeo defensivo. Cortafuegos y contramedidas para los que intentan infiltrarse.',
  'Sala de los experimentos humanos. Diarios de voluntarios que no lo eran realmente.',
  'Corredor de los disidentes. Graffiti prohibido cubre las paredes antes de que lo borren.',
  'Sala de los datos biométricos. El perfil completo de cada ciudadano de la megalópolis.',
  'Zona de los drones desactivados. Centenares de unidades en espera, aguardando activación.',
  'Sala de la IA rebelde. Un sistema que empezó a cuestionar sus propias directivas.',
  'Corredor de los neones rotos. El lujo de la torre no llega hasta aquí; el olvido sí.',
  'Sala de los contratos ilegales. Acuerdos con gobiernos corruptos archivados como activos.',
  'Zona de entrenamiento del Director. Simuladores de combate donde practicó durante décadas.',
  'Sala del Protocolo Omega. El manual del plan de exterminio está en esta habitación.',
  'Corredor de los últimos leales. Los que siguieron al Director hasta el final están aquí.',
  'Antesala del Director. Asistentes virtuales paralizados esperan instrucciones que no llegan.',
  'Sala de servidores privados. Los datos más comprometedores del Director, encriptados.',
  'Corredor final. Las paredes están forradas de acero blindado y sensores biométricos.',
  'Antecámara del Director Nexus. El suelo vibra con la energía de los sistemas de seguridad.',
]

const BOSS_ROOM_DESC =
  'Sala del Director. Nexus se alza desde su trono de interfaces neurales, enchufado directamente a la red. ' +
  'Su cuerpo es mitad humano, mitad máquina: brazos de titanio, ojos de cámara y una sonrisa sin emoción. ' +
  '"Intruso identificado. Iniciando secuencia de eliminación." ' +
  'Los implantes de combate en su cuerpo se activan con un zumbido de sobrecalentamiento.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Un archivo de datos corruptos se abre en el terminal: ' +
      '"Informe interno: el exoesqueleto de combate del Director Nexus resiste cualquier arma convencional. ' +
      'Solo la monokatana de filo monomolecular, capaz de cortar entre las juntas del blindaje, ' +
      'puede causar daño real. En manos de un Mercenario entrenado duplica su efecto." ' +
      'El archivo se autodestruye.',
    reward: 40,
  },
  {
    text:
      'Graffiti digital proyectado en la pared por un activista: ' +
      '"El blindaje cibernético de combate absorbe una parte de cada impacto. ' +
      'Los guardias de élite de Nexus lo usan porque saben lo que les espera. ' +
      'Si consigues uno, úsalo: la diferencia entre vivir y morir puede ser ese porcentaje."',
    reward: 25,
  },
  {
    text:
      'Una transmisión encriptada de la resistencia se filtra por las ondas: ' +
      '"Aquí Cipher. El Director Nexus tiene un fallo crítico: sus implantes neurales ' +
      'son vulnerables a un exploit de bajo nivel que desestabiliza su sistema nervioso digital. ' +
      'Un Netrunner que conozca el código puede usarlo para causarle un daño devastador en combate." ' +
      'La señal se corta con estática.',
    reward: 30,
  },
  {
    text:
      'Los registros de las cámaras muestran a otros infiltrados que no llegaron. ' +
      'Nombres en una lista, y debajo la nota interna: ' +
      '"Todos neutralizados antes de la sala del Director. ' +
      'Ninguno portaba la monokatana ni el blindaje. ' +
      'El equipo adecuado es la única variable que no podemos controlar." ' +
      'El despacho del Director está al otro lado de esa puerta.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Guardia corporativo', hp: 30, attack: 12, reward: 20 },
  { name: 'Drone de seguridad', hp: 40, attack: 18, reward: 30 },
  { name: 'Hacker rival', hp: 20, attack: 8, reward: 15 },
  { name: 'Cyborg asesino', hp: 70, attack: 28, reward: 50 },
  { name: 'Agente encubierto', hp: 35, attack: 15, reward: 25 },
  { name: 'Escuadrón antidisturbios', hp: 25, attack: 20, reward: 35 },
  { name: 'Soldado mech ligero', hp: 50, attack: 22, reward: 40 },
  { name: 'Mercenario de élite rival', hp: 80, attack: 32, reward: 60 },
  { name: 'IA guardian autónoma', hp: 45, attack: 19, reward: 35 },
  { name: 'Francotirador de neón', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'Director Nexus', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'Una rejilla electrificada oculta en el suelo se activa al cruzar el umbral.', damage: 20 },
  { desc: 'Un sensor láser dispara una descarga paralizante al detectar tu presencia.', damage: 15 },
  { desc: 'Una nube de nanobots agresivos emerge de un conducto de ventilación al pasar.', damage: 18 },
  { desc: 'Un explosivo de carga hueca oculto en la pared detona por control remoto.', damage: 25 },
  { desc: 'Gas paralizante se filtra por el sistema de climatización al entrar al sector.', damage: 22 },
  { desc: 'Un drone kamikaze de bolsillo se activa y detona contra ti antes de que reacciones.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Una tarjeta con créditos corporativos de alta denominación sin rastrear.', reward: 30 },
  { desc: 'Un chip de datos con información clasificada suficiente para hundir a Nexus legalmente.', reward: 50 },
  { desc: 'Un implante neural de alta gama que vale una fortuna en el mercado negro.', reward: 25 },
  { desc: 'Un prototipo de arma de Nexus que aún no existe en catálogo público.', reward: 40 },
  { desc: 'Drogas estimulantes de uso militar que aumentan los reflejos durante horas.', reward: 45 },
  { desc: 'Un cristal de almacenamiento cuántico con backups de todo el sistema Nexus.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Un stim médico de grado militar sella las heridas internas en segundos.', amount: 25 },
  { desc: 'Un inyector de nanobots reparadores que reconstruyen el tejido dañado al instante.', amount: 35 },
  { desc: 'Una sala de descanso ejecutiva con sistema de regeneración celular activo.', amount: 30 },
  { desc: 'Un kit de primeros auxilios cibernético con parches dérmicos y anticoagulantes.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'monokatana', name: 'Monokatana de filo monomolecular', desc: 'Aumenta tu daño en combate. El Mercenario la maneja con una precisión letal.' },
  { id: 'blindaje', name: 'Blindaje cibernético de combate', desc: 'Reduce el daño recibido gracias a sus placas de aleación balística.' },
  { id: 'stim', name: 'Stim médico de grado militar', desc: 'Restaura 50 puntos de vida al inyectarlo.' },
]

const ITEM_KEY: ItemDef = {
  id: 'chip',
  name: 'Chip de acceso corporativo nivel 9',
  desc: 'Desbloquea los accesos de alta seguridad restringidos por el sistema de Nexus.',
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
  'Protocolo Omega. Explora 49 sectores de la Torre Nexus, ' +
  'neutraliza sus defensas y detén al Director antes de que active el Protocolo Omega. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer el sector. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar stim para curarte. ' +
  'La monokatana sube el daño. El blindaje cibernético reduce el daño recibido. ' +
  'El chip de acceso desbloquea sectores restringidos por el sistema de Nexus. ' +
  'En combate: atacar o huir. No puedes huir del Director Nexus. ' +
  'Mercenario: más vida y daño. La monokatana duplica el daño contra el Director. ' +
  'Netrunner: escribe hackear en combate para un exploit neural devastador cada 3 turnos. ' +
  'Espía Corporativo: escribe infiltrar para ver qué hay en los sectores adyacentes. ' +
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

export default function CorpPage() {
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
  const classRef     = useRef<CharacterClass>('mercenario')
  const magicCdRef   = useRef(0)
  const phaseRef     = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('mercenario')
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
      room.lockedExits[d] ? `${d} (restringida)` : d
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
          `El Director Nexus activa sus implantes de combate con un zumbido de sobrecalentamiento. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'netrunner' ? ' o "hackear"' : ''}. No puedes huir del Director.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El Director Nexus te desafía.')
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
          addHist('bad', 'Has sido neutralizado. Nexus tiene un infiltrado menos que eliminar.')
          audio.gameOver()
          deleteSave(); setHasSaveData(false)
          goPhase('lost')
        }
        break
      }

      case 'treasure': {
        const { desc, reward } = room.treasure!
        const bonus = classRef.current === 'espia' ? Math.floor(reward * 0.2) : 0
        const total = reward + bonus
        syncScore(scoreRef.current + total)
        addHist('ok', `Recurso — ${desc} +${total} puntos${bonus ? ` (bonus espía +${bonus})` : ''}.`)
        audio.correct()
        announcePolite(`Recurso encontrado. +${total} puntos.`)
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
          `Un ${e.name} te detecta y adopta posición de combate. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'netrunner' ? ', "hackear"' : ''} o "huir".`
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
    const hasBlindaje = inventoryRef.current.includes('blindaje')
    const enemyHp = e.hp - dmg

    if (enemyHp <= 0) {
      syncScore(scoreRef.current + e.reward)
      if (e.isBoss) {
        const bonus = Math.floor(healthRef.current / 2)
        syncScore(scoreRef.current + bonus)
        inCombat.current = false; enemyRef.current = null; setEnemy(null)
        addHist('ok',
          `¡Derrotas al ${e.name}! Sus sistemas se apagan en cascada y cae al suelo de metal. ` +
          `El Protocolo Omega queda cancelado para siempre. ` +
          `+${e.reward} puntos. Bonus de vida: +${bonus} puntos.`
        )
        audio.start()
        announceAssertive(`Victoria. Puntuación final: ${scoreRef.current}.`)
        deleteSave(); setHasSaveData(false)
        goPhase('won')
        return true
      }
      addHist('ok', `Neutralizas al ${e.name}. +${e.reward} puntos.`)
      audio.correct()
      if (Math.random() < 0.3) {
        const heal = 25
        syncHealth(Math.min(maxHpRef.current, healthRef.current + heal))
        addHist('ok', `Entre su equipo encuentras un stim médico de emergencia. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} neutralizado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasBlindaje ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const blindNote = hasBlindaje ? ` (blindaje: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${blindNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe definitivo. Misión fallida.`)
      audio.gameOver()
      deleteSave(); setHasSaveData(false)
      announceAssertive('Has sido neutralizado. Fin del juego.')
      goPhase('lost')
    }
    return false
  }

  function handleCombat(cmd: string) {
    const e = enemyRef.current
    if (!e) return

    if (magicCdRef.current > 0) syncMagicCD(magicCdRef.current - 1)

    if (/^(huir|flee|escapar|retirarse|abortar)$/.test(cmd)) {
      if (e.isBoss) {
        addHist('bad', 'El Director Nexus bloquea todos los accesos. ¡La misión no admite retirada!')
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

    if (/^(hackear|hack|exploit|virus|malware|inyectar|codigo|código|programa|brecha)$/.test(cmd)) {
      if (classRef.current !== 'netrunner') {
        addHist('bad', 'Solo el Netrunner conoce los exploits para hackear implantes neurales.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `El exploit aún se compila. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Inyectas el exploit en los implantes neurales del enemigo: ${dmg} de daño digital.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|cortar|disparar|a)$/.test(cmd)) {
      const hasMono = inventoryRef.current.includes('monokatana')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasMono ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasMono ? dmgRaw * 2 : dmgRaw
      const monoNote = e.isBoss && hasMono ? ` (monokatana ×2 vs Director: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${monoNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al Director. Escribe: atacar${classRef.current === 'netrunner' ? ' o hackear' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'netrunner' ? ', hackear' : ''} o huir.`
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

    if (/^(mirar?|look?|l|escanear)$/.test(cmd)) {
      describeRoom(worldRef.current[roomIdRef.current]); return
    }

    if (/^(inventario|inv|i)$/.test(cmd)) {
      const items = inventoryRef.current.length ? inventoryRef.current.map(id => ITEM_NAME[id] ?? id).join(', ') : 'ninguno'
      const cdNote = classRef.current === 'netrunner' && magicCdRef.current > 0
        ? ` · Exploit disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(infiltrar|reconocer|explorar|sondear|analizar|rastrear)$/.test(cmd)) {
      if (classRef.current !== 'espia') {
        addHist('bad', 'Solo el Espía Corporativo puede infiltrarse para reconocer sectores adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (restringida)' : ''
        const label = destRoom.cleared ? 'ya explorado' : (EVENT_LABELS[destRoom.event] ?? 'sector en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Reconocimiento de sectores: ${lines.join('. ')}.`
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
      if (/^(stim|estimulante|medkit|curar|inyectar|medicina|botiquin|botiquín)$/.test(target)) {
        if (!inventoryRef.current.includes('stim')) {
          addHist('bad', 'No tienes ningún stim médico.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'stim'))
        addHist('ok', `Te inyectas el stim médico. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas el stim. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'La monokatana y el blindaje se usan automáticamente en combate.'); return
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
        if (inventoryRef.current.includes('chip')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'chip'))
          addHist('ok', `El acceso al ${dir} estaba restringido por el sistema de Nexus. El chip corporativo nivel 9 anula los protocolos.`)
          announcePolite(`Usas el chip para desbloquear el acceso al ${dir}.`)
        } else {
          addHist('bad', `El acceso al ${dir} está restringido por el sistema de seguridad de Nexus. Necesitas el chip corporativo nivel 9.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar stim.')
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
      `${def.name} elegido. ${def.desc}. Penetras en la Torre Nexus para detener el Protocolo Omega. ` +
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
      room.lockedExits[d] ? `${d} (restringida)` : d
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
    const result = await saveScore('corp', score)
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
      <GameShell title="Protocolo Omega" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Protocolo Omega</h2>
          <p className="text-[#888] text-sm">
            Explora 49 sectores de la Torre Nexus. Neutraliza sus defensas y detén al Director antes de que active el Protocolo Omega.
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
    const classes: CharacterClass[] = ['mercenario', 'netrunner', 'espia']
    return (
      <GameShell title="Protocolo Omega" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Infiltrarse en la Torre!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Protocolo Omega" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡El Director Nexus ha sido neutralizado!' : 'Misión fallida'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              El Director Nexus ha caído y el Protocolo Omega ha sido cancelado. Los ciudadanos de la megaciudad son libres de la vigilancia total. Tu nombre nunca aparecerá en los registros.
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
      title="Protocolo Omega"
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
          {classRef.current === 'netrunner' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Exploit en {magicCD}t</span>
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
            {classRef.current === 'netrunner' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('hackear'); setInput('') }}
              >
                {magicCD > 0 ? `Hackear (${magicCD}t)` : 'Hackear'}
              </Button>
            )}
            {!enemy.name.includes('Director') && (
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
