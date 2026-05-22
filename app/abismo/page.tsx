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
type CharacterClass = 'comandante' | 'biologa' | 'explorador'

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
    desc: '+8 de daño en combate · 120 de vida · El arpón legendario duplica el daño contra el Leviatán',
  },
  biologa: {
    name: 'Bióloga Marina',
    maxHp: 80,
    dmgBonus: 0,
    magic: true,
    scouting: false,
    desc: 'Pulso de sonar en combate (35–60 de daño, cada 3 turnos) · 80 de vida',
  },
  explorador: {
    name: 'Explorador de Profundidades',
    maxHp: 100,
    dmgBonus: 3,
    magic: false,
    scouting: true,
    desc: 'Comando "sondear" para ver las zonas adyacentes · +20% en recompensas · 100 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'abismo-leviatan-v1'
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
  'Esclusa de presión. El agua helada gotea entre los paneles de titanio de la entrada.',
  'Corredor sumergido. Algas bioluminiscentes de color azul tapizan las paredes de metal oxidado.',
  'Cámara de observación. Los cristales reforzados muestran las profundidades absolutas del abismo.',
  'Sala de control. Los paneles de mandos parpadean bajo varios centímetros de agua salada.',
  'Laboratorio de biología. Muestras de criaturas desconocidas flotan en cilindros de cristal roto.',
  'Bodega de provisiones. Las cajas estancas de metal están apiladas hasta el techo inundado.',
  'Sala de máquinas. Los engranajes de la vieja instalación aún giran lentamente bajo el agua.',
  'Corredor de las tuberías. Vapor termal escapa de las grietas en el metal oxidado de las paredes.',
  'Cámara de las esporas. Hongos marinos de colores improbables cubren el suelo de piedra volcánica.',
  'Pasillo de las ruinas atlantes. Columnas de mármol negro salpicadas de percebes milenarios.',
  'Sala de los artefactos. Objetos de civilizaciones olvidadas descansan en pedestales de coral.',
  'Cámara de los cristales. Formaciones de cuarzo marino emiten un tenue resplandor azulado.',
  'Gruta de las corrientes. El agua fluye en espirales hipnóticas entre las estalactitas de sal.',
  'Sala de los naufragios. Fragmentos de barcos de cinco siglos distintos se mezclan en el suelo.',
  'Corredor de los tentáculos. Marcas de succión en las paredes sugieren que algo grande pasó aquí.',
  'Cámara de presión extrema. Las paredes ceden levemente con cada variación de la corriente.',
  'Sala de los mapas sumergidos. Cartas náuticas de lugares imposibles grabadas en piedra volcánica.',
  'Gruta de las medusas. Criaturas translúcidas iluminan la sala con su bioluminiscencia fantasmal.',
  'Cámara de los fósiles. Criaturas extintas hace millones de años están incrustadas en la roca.',
  'Pasillo del volcán submarino. El suelo está caliente; fumarolas de azufre perforan las piedras.',
  'Sala de los espejos de obsidiana. Tu reflejo en la roca negra parece moverse con retraso.',
  'Cámara de la tripulación. Los restos del equipo anterior están dispersos entre los corales.',
  'Gruta del silencio. El sonido parece absorbido por las paredes; el silencio oprime.',
  'Sala de los ídolos submarinos. Figuras de piedra representan criaturas sin nombre conocido.',
  'Corredor de las burbujas. Una corriente de burbujas sube desde grietas en el suelo de pizarra.',
  'Cámara de las conchas gigantes. Caracolas de metro y medio emiten un zumbido profundo y constante.',
  'Sala de los corales rojos. Una formación de coral carmesí ocupa el centro, perfectamente simétrica.',
  'Gruta de las anguilas. Las marcas de dientes en el metal indican el paso de criaturas eléctricas.',
  'Corredor de la niebla azul. Partículas bioluminiscentes flotan creando una neblina suave.',
  'Cámara de las anémonas. Enormes anémonas marinas de colores vivos tapizan el suelo y las paredes.',
  'Sala de la nave sumergida. Una nave de investigación hundida ocupa la mitad de la cámara circular.',
  'Gruta de los ecos. Cada movimiento genera ondas sonoras que rebotan durante largo tiempo.',
  'Cámara de los tesoros de Atlántida. La mayoría de los cofres están abiertos y vacíos, saqueados.',
  'Pasillo del hielo profundo. La temperatura cae drásticamente; escarcha crece en las paredes.',
  'Sala de los tentáculos fosilizados. Brazos petrificados de un kraken milenario llenan la sala.',
  'Cámara del reactor. Un antiguo reactor de fusión fría late con un zumbido verde bajo el agua.',
  'Gruta de la corriente caliente. Una chimenea termal calienta esta sala hasta temperaturas tropicales.',
  'Sala de los drones. Máquinas sumergidas malfuncionantes deambulan sin rumbo entre las ruinas.',
  'Corredor de los fósiles vivientes. Celacantos de ojos luminosos te observan desde las grietas.',
  'Cámara de las runas submarinas. Jeroglíficos desconocidos grabados en roca pulsan con luz azul.',
  'Gruta del abismo total. Las paredes se abren a una oscuridad que no tiene fondo visible.',
  'Sala de los guardianes de piedra. Figuras de basalto negro representan centinelas del mundo antiguo.',
  'Corredor del flujo magnético. Las brújulas giran sin control; la tecnología falla aquí.',
  'Cámara de las algas cazadoras. Algas con propiedades cazadoras retiran sus frondas a tu paso.',
  'Gran sala de las ruinas centrales. Columnas de mármol negro de treinta metros rodean el espacio.',
  'Pasillo de la corriente inversa. El agua fluye hacia arriba en este tramo de forma inexplicable.',
  'Sala de las sombras abisales. Algo muy grande se mueve en la penumbra al otro lado del cristal.',
  'Antecámara del Leviatán. El agua vibra con cada respiración de la criatura que aguarda dentro.',
]

const BOSS_ROOM_DESC =
  'Cámara del Leviatán. La criatura abismal ocupa la sala entera: tentáculos del grosor de un árbol, ' +
  'ojos del tamaño de un escudo que emiten una luz hipnótica violeta, ' +
  'y una piel de escamas negras que ha resistido los milenios de las profundidades. ' +
  'El agua vibra con cada movimiento de la bestia primordial.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Un registro de audio cruje en los altavoces dañados: ' +
      '"Aquí el Dr. Reyes, expedición AX-7. El Leviatán es invulnerable al armamento convencional. ' +
      'Su piel resiste cualquier proyectil ordinario. ' +
      'Solo el arpón legendario del clan fundador, forjado con aleación de meteorito marino, ' +
      'puede penetrar su dermis. Está en algún lugar de las ruinas." ' +
      'El audio se corta con un chapoteo y un grito.',
    reward: 40,
  },
  {
    text:
      'Las paredes muestran inscripciones grabadas con apresuramiento: ' +
      '"El Leviatán golpea con una fuerza que rompe el titanio. ' +
      'El traje de presión reforzado, con su capa de polímero biónico, ' +
      'puede absorber parte del impacto de sus tentáculos. ' +
      'Sin protección, un solo golpe puede ser fatal."',
    reward: 25,
  },
  {
    text:
      'Una voz distorsionada emerge de un terminal submarino: ' +
      '"Soy la Dra. Voss, bióloga jefa. El Leviatán tiene un punto débil: ' +
      'sus receptores de sonar son extremadamente sensibles. ' +
      'Un pulso de sonar concentrado puede aturdir o herir gravemente a la criatura. ' +
      'La Bióloga Marina que conozca la frecuencia exacta puede usarlo en combate." ' +
      'El terminal explota en chispas eléctricas.',
    reward: 30,
  },
  {
    text:
      'Las paredes están marcadas con los números de identificación de los buzos que no regresaron. ' +
      'Docenas de placas de identificación clavadas en la roca, y al pie la inscripción: ' +
      '"Llegaron demasiado lejos sin el equipo adecuado. ' +
      'El arpón y el traje son la diferencia entre regresar y quedarse aquí para siempre." ' +
      'El suelo tiembla. La cámara del Leviatán está muy cerca.',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Tiburón de las profundidades', hp: 30, attack: 12, reward: 20 },
  { name: 'Pulpo guardián', hp: 40, attack: 18, reward: 30 },
  { name: 'Anguila eléctrica gigante', hp: 20, attack: 8, reward: 15 },
  { name: 'Cangrejo acorazado', hp: 70, attack: 28, reward: 50 },
  { name: 'Drone sumergido malfuncionante', hp: 35, attack: 15, reward: 25 },
  { name: 'Medusa venenosa colosal', hp: 25, attack: 20, reward: 35 },
  { name: 'Guardián de las ruinas', hp: 50, attack: 22, reward: 40 },
  { name: 'Serpiente marina ancestral', hp: 80, attack: 32, reward: 60 },
  { name: 'Criatura bioluminiscente', hp: 45, attack: 19, reward: 35 },
  { name: 'Molusco cazador blindado', hp: 55, attack: 24, reward: 45 },
]

const BOSS_DEF = { name: 'El Leviatán del Abismo', hp: 200, attack: 35, reward: 200 }

const TRAP_POOL = [
  { desc: 'Una corriente submarina violenta te arrastra contra las paredes de metal oxidado.', damage: 20 },
  { desc: 'Una red de pesca antigua se enreda en tu traje y te corta mientras forcejeas.', damage: 15 },
  { desc: 'Una bolsa de gas metano explota al pisarla, golpeándote con la onda expansiva.', damage: 18 },
  { desc: 'Un tentáculo fosilizado oculto en el suelo se activa y te agarra el tobillo.', damage: 25 },
  { desc: 'Una trampa de presión se activa: las paredes se comprimen varios centímetros.', damage: 22 },
  { desc: 'Un anzuelo gigante de metal cae del techo y te roza el hombro al cruzar.', damage: 20 },
]

const TREASURE_POOL = [
  { desc: 'Un cofre de oro sólido con el escudo de una expedición hundida hace trescientos años.', reward: 30 },
  { desc: 'Una estatuilla de coral dorado que representa a una criatura marina sin nombre conocido.', reward: 50 },
  { desc: 'Una gema de las profundidades: mineral cristalino que solo se forma a esta presión.', reward: 25 },
  { desc: 'Un artefacto de Atlántida: dispositivo de metal desconocido con inscripciones activas.', reward: 40 },
  { desc: 'Un collar de perlas negras del tamaño de nueces, perfectamente esféricas.', reward: 45 },
  { desc: 'Una escafandra antigua de cobre con visor de cristal de roca, objeto de museo invaluable.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Un botiquín de emergencia sellado al vacío con suero médico y vendas estancas.', amount: 25 },
  { desc: 'Un depósito de oxígeno medicinal mezclado con analgésicos disueltos. Te recuperas.', amount: 35 },
  { desc: 'La chimenea termal emana un calor curativo. Tus músculos se relajan y se recuperan.', amount: 30 },
  { desc: 'Un gel bioluminiscente de propiedades regenerativas cubre tus heridas al contacto.', amount: 40 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'arpon', name: 'Arpón legendario', desc: 'Aumenta tu daño en combate. El Comandante lo maneja con precisión letal.' },
  { id: 'traje', name: 'Traje de presión reforzado', desc: 'Reduce el daño recibido en combate gracias a su capa de polímero biónico.' },
  { id: 'oxigeno', name: 'Tanque de oxígeno medicinal', desc: 'Restaura 50 puntos de vida al usarlo.' },
]

const ITEM_KEY: ItemDef = {
  id: 'baliza',
  name: 'Baliza de frecuencia',
  desc: 'Emite la frecuencia contraria al campo magnético del Leviatán que bloquea algunas escotillas.',
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
  'Las Ruinas del Abismo. Explora 49 zonas de las ruinas sumergidas, ' +
  'descubre sus secretos y derrota al Leviatán del Abismo. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la zona. ' +
  'Inventario para ver vida y objetos. Tomar para recoger objetos. Usar oxígeno para curarte. ' +
  'El arpón legendario sube el daño. El traje de presión reduce el daño recibido. ' +
  'La baliza de frecuencia abre escotillas bloqueadas por el campo magnético. ' +
  'En combate: atacar o huir. No puedes huir del Leviatán. ' +
  'Comandante: más vida y daño. El arpón legendario duplica el daño contra el Leviatán. ' +
  'Bióloga Marina: escribe sonar en combate para un pulso devastador cada 3 turnos. ' +
  'Explorador de Profundidades: escribe sondear para ver qué hay en las zonas adyacentes. ' +
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

export default function AbismoPage() {
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
          `El Leviatán del Abismo extiende sus tentáculos con una calma aterradora. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. ` +
          `Escribe "atacar"${classRef.current === 'biologa' ? ' o "sonar"' : ''}. No puedes huir del Leviatán.`
        )
        audio.incorrect()
        announceAssertive('¡Jefe final! El Leviatán del Abismo te ataca.')
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
          addHist('bad', 'Has muerto. Las profundidades te reclaman para siempre.')
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
        addHist('ok', `Tesoro — ${desc} +${total} puntos${bonus ? ` (bonus explorador +${bonus})` : ''}.`)
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
          `Un ${e.name} emerge de las sombras abisales. Vida: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'biologa' ? ', "sonar"' : ''} o "huir".`
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
    const hasTraje = inventoryRef.current.includes('traje')
    const enemyHp = e.hp - dmg

    if (enemyHp <= 0) {
      syncScore(scoreRef.current + e.reward)
      if (e.isBoss) {
        const bonus = Math.floor(healthRef.current / 2)
        syncScore(scoreRef.current + bonus)
        inCombat.current = false; enemyRef.current = null; setEnemy(null)
        addHist('ok',
          `¡Derrotas al ${e.name}! La criatura emite un último bramido y se hunde en las profundidades. ` +
          `Las ruinas quedan en silencio por primera vez en milenios. ` +
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
        addHist('ok', `Entre sus restos encuentras un frasco de gel curativo bioluminiscente. +${heal} de vida. Vida: ${healthRef.current}/${maxHpRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} derrotado.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const received = hasTraje ? Math.floor(rawAtk * 0.6) : rawAtk
    const playerHp = Math.max(0, healthRef.current - received)
    const trajeNote = hasTraje ? ` (traje: -${rawAtk - received} absorbido)` : ''

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated); syncHealth(playerHp)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${received} de daño${trajeNote}. Tu vida: ${playerHp}/${maxHpRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Vida del ${e.name}: ${enemyHp}.`)

    if (playerHp <= 0) {
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      addHist('bad', `El ${e.name} te da el golpe definitivo. Las profundidades te reclaman.`)
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
        addHist('bad', 'El Leviatán bloquea todas las salidas con sus tentáculos. ¡No hay escapatoria!')
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

    if (/^(sonar|pulso sonar|pulso de sonar|pulso|onda sonora|ultrasonido)$/.test(cmd)) {
      if (classRef.current !== 'biologa') {
        addHist('bad', 'Solo la Bióloga Marina conoce las frecuencias del pulso de sonar.'); return
      }
      if (magicCdRef.current > 0) {
        addHist('bad', `El sonar aún se recarga. Faltan ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncMagicCD(3)
      const dmg = 35 + Math.floor(Math.random() * 26)
      addHist('combat', `Emites un pulso de sonar a la frecuencia exacta: ${dmg} de daño sónico al enemigo.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|a)$/.test(cmd)) {
      const hasArpon = inventoryRef.current.includes('arpon')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasArpon ? 20 : 15) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      const dmg = e.isBoss && hasArpon ? dmgRaw * 2 : dmgRaw
      const arponNote = e.isBoss && hasArpon ? ` (arpón ×2 vs Leviatán: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${arponNote}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al Leviatán. Escribe: atacar${classRef.current === 'biologa' ? ' o sonar' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'biologa' ? ', sonar' : ''} o huir.`
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
      const cdNote = classRef.current === 'biologa' && magicCdRef.current > 0
        ? ` · Sonar disponible en ${magicCdRef.current} turno${magicCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(sondear|escanear|rastrear|explorar|sonido|ping)$/.test(cmd)) {
      if (classRef.current !== 'explorador') {
        addHist('bad', 'Solo el Explorador de Profundidades puede sondear las zonas adyacentes.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (bloqueada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'zona en calma')
        return `${d}: ${label}${locked}`
      })
      const msg = `Sondeo de profundidades: ${lines.join('. ')}.`
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
      if (/^(oxigeno|oxígeno|tanque|botiquin|botiquín|curar|frasco|medic)$/.test(target)) {
        if (!inventoryRef.current.includes('oxigeno')) {
          addHist('bad', 'No tienes ningún tanque de oxígeno medicinal.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 50)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'oxigeno'))
        addHist('ok', `Inhalas el oxígeno medicinal. +50 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas el oxígeno. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'El arpón y el traje se usan automáticamente en combate.'); return
    }

    const go = cmd.match(/^(?:ir|go|caminar|avanzar|entrar|nadar)\s+(?:al?\s+)?(.+)$/)
    if (go) {
      const dir = go[1].trim() as Direction
      const room = worldRef.current[roomIdRef.current]
      const dest = room.exits[dir]
      if (dest === undefined) {
        addHist('bad', `No puedes ir al ${dir} desde aquí.`); audio.incorrect(); return
      }
      if (room.lockedExits[dir]) {
        if (inventoryRef.current.includes('baliza')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'baliza'))
          addHist('ok', `La escotilla al ${dir} estaba bloqueada por el campo magnético del Leviatán. La baliza de frecuencia anula el bloqueo.`)
          announcePolite(`Usas la baliza para abrir la escotilla al ${dir}.`)
        } else {
          addHist('bad', `La escotilla al ${dir} está bloqueada por el campo magnético del Leviatán. Necesitas la baliza de frecuencia.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar oxígeno.')
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
      `${def.name} elegido. ${def.desc}. Desciendes a las ruinas sumergidas dispuesto a enfrentar el abismo. ` +
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
      { type: 'ok',    text: 'Inmersión reanudada.' },
      { type: 'scene', text: roomMsg },
    ]

    applyUIState(cl, save.health, save.score, save.inventory, initHist, save.magicCooldown)
    goPhase('playing')
    announcePolite('Inmersión reanudada. ' + roomMsg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleSaveScore() {
    const result = await saveScore('abismo', score)
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
      <GameShell title="Las Ruinas del Abismo" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#ffd700]">Las Ruinas del Abismo</h2>
          <p className="text-[#888] text-sm">
            Explora 49 zonas de las ruinas sumergidas. Descubre sus secretos y derrota al Leviatán del Abismo.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => goPhase('selecting')}>Nueva inmersión</Button>
            {hasSaveData && (
              <Button size="lg" variant="secondary" onClick={loadGame}>
                Continuar inmersión guardada
              </Button>
            )}
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'selecting') {
    const classes: CharacterClass[] = ['comandante', 'biologa', 'explorador']
    return (
      <GameShell title="Las Ruinas del Abismo" instructions={INSTRUCTIONS} score={0}>
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
            <Button onClick={startGame}>¡Descender al abismo!</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Las Ruinas del Abismo" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡El Leviatán ha sido derrotado!' : 'Las profundidades te han reclamado'}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              El Leviatán del Abismo se hunde para siempre en las profundidades. Las ruinas quedan en silencio y tu nombre será grabado en los anales de la exploración submarina.
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
      title="Las Ruinas del Abismo"
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
          {classRef.current === 'biologa' && magicCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Sonar en {magicCD}t</span>
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
          aria-label="Historial de la inmersión"
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
            {classRef.current === 'biologa' && (
              <Button
                className="flex-1"
                variant="secondary"
                disabled={magicCD > 0}
                onClick={() => { processCommand('sonar'); setInput('') }}
              >
                {magicCD > 0 ? `Sonar (${magicCD}t)` : 'Sonar'}
              </Button>
            )}
            {!enemy.name.includes('Leviatán') && (
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
