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
type CharacterClass = 'cazador' | 'medium' | 'ladron'

interface ClassDef {
  name: string
  maxHp: number
  maxSanity: number
  dmgBonus: number
  ritualPower: boolean
  stealth: boolean
  desc: string
}

interface ItemDef { id: string; name: string; desc: string }

interface Room {
  description: string
  exits: Partial<Record<Direction, number>>
  lockedExits: Partial<Record<Direction, boolean>>
  event: 'nothing' | 'treasure' | 'terror' | 'enemy' | 'healing' | 'item' | 'boss' | 'narrative' | 'sanity'
  cleared: boolean
  terror?: { desc: string; damage: number; sanityDmg: number }
  treasure?: { desc: string; reward: number }
  heal?: { desc: string; hp: number; sanity: number }
  enemy?: { name: string; hp: number; attack: number; reward: number; sanityDmg: number }
  item?: ItemDef
  narrative?: { text: string; reward: number }
  sanityEvent?: { desc: string; sanityDmg: number; reward: number }
}

interface ActiveEnemy {
  name: string; hp: number; maxHp: number; attack: number; reward: number; sanityDmg: number; isBoss: boolean
}

type HistEntry = { type: 'scene' | 'cmd' | 'ok' | 'bad' | 'combat' | 'item' | 'narrative' | 'terror'; text: string }

interface SaveData {
  version: number
  world: Room[]
  roomId: number
  prevId: number | null
  health: number
  sanity: number
  score: number
  inventory: string[]
  characterClass: CharacterClass
  ritualCooldown: number
}

// ─── Class definitions ────────────────────────────────────────────────────────

const CLASS_DEFS: Record<CharacterClass, ClassDef> = {
  cazador: {
    name: 'Cazador',
    maxHp: 110,
    maxSanity: 80,
    dmgBonus: 10,
    ritualPower: false,
    stealth: false,
    desc: '+10 de daño en combate · 110 de vida · La escopeta duplica el daño contra el Espectro',
  },
  medium: {
    name: 'Médium',
    maxHp: 70,
    maxSanity: 130,
    dmgBonus: 0,
    ritualPower: true,
    stealth: false,
    desc: 'Ritual de exorcismo en combate (40–70 daño, cada 3 turnos) · 130 de cordura máxima · 70 de vida',
  },
  ladron: {
    name: 'Ladrón',
    maxHp: 90,
    maxSanity: 100,
    dmgBonus: 4,
    ritualPower: false,
    stealth: true,
    desc: 'Comando "acechar" para ver habitaciones adyacentes · +20% en tesoros · 90 de vida',
  },
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY = 'casa-encantada-v1'
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
  'Vestíbulo de entrada. Las arañas han tejido velos entre los candelabros.',
  'Biblioteca. Los libros están abiertos en páginas que nadie ha tocado en décadas.',
  'Sala de música. Un piano de cola suena una nota sola, sin que nadie lo toque.',
  'Comedor. Los platos están puestos como si los invitados fueran a llegar en cualquier momento.',
  'Cocina. El olor a carne podrida impregna el aire. Los fogones están fríos desde hace años.',
  'Bodega. Las botellas explotan solas en la oscuridad con sonidos secos.',
  'Sala de estar. Los retratos en las paredes tienen los ojos marcados con carbón.',
  'Estudio. Un diario abierto sobre el escritorio describe rituales que no deberían existir.',
  'Galería de arte. Las pinturas muestran escenas que cambian cada vez que miras.',
  'Invernadero abandonado. Las plantas carnívoras han crecido sin control.',
  'Sala de billar. Las bolas ruedan solas por el tapete verde.',
  'Habitación infantil. Una caja de música gira sin que nadie la haya dado cuerda.',
  'Sala de costura. Las agujas flotan en el aire formando patrones inquietantes.',
  'Lavandería. La ropa mojada se mueve sola en las tinas.',
  'Sala de armas. Las espadas y hachas vibran con una energía oscura.',
  'Capilla privada. El altar está invertido y cubierto de cera negra.',
  'Archivo. Carpetas llenas de nombres tachados en rojo.',
  'Sala de espejos. Cada reflejo muestra una versión diferente y más oscura de ti.',
  'Dormitorio principal. La cama está hecha con sábanas manchadas de un líquido oscuro.',
  'Cuarto de baño. El espejo está roto en siete pedazos y el grifo no para de gotear sangre.',
  'Habitación de invitados. Maletas abiertas con ropa que nunca fue recogida.',
  'Sala de trofeos. Cabezas disecadas cuyos ojos parecen seguirte.',
  'Mirador. Desde aquí se ve el cementerio privado de la mansión.',
  'Sala de juegos. Tableros con partidas inconclusas y piezas de ajedrez rotas.',
  'Desván. Baúles sellados que emiten sonidos desde dentro.',
  'Habitación de servicio. Un uniforme antiguo cuelga de la pared, sin nadie dentro.',
  'Pasillo este. Las lámparas de gas parpadean en un ritmo que parece un código.',
  'Pasillo norte. Huellas de pies descalzos en el polvo van y vienen sin llegar a ningún lado.',
  'Corredor oeste. Un viento helado recorre el pasillo aunque no hay ventanas.',
  'Sala de control. Un cuadro eléctrico obsoleto chisporrotea en la oscuridad.',
  'Laboratorio oculto. Frascos con especímenes no identificados llenan las estanterías.',
  'Cámara de rituales. Pentagramas grabados en el suelo con marcas de quemaduras.',
  'Cripta familiar. Ataúdes abiertos con marcas de arañazos por dentro.',
  'Salón del trono. Un sillón de huesos en el centro de la sala.',
  'Túnel subterráneo. Las paredes rezuman un líquido negro y frío.',
]

const BOSS_ROOM_DESC =
  'Cámara del Amo. El corazón de la mansión. Velas negras iluminan un altar donde una figura oscura espera tu llegada con paciencia infinita.'

const NARRATIVES: Array<{ text: string; reward: number }> = [
  {
    text:
      'Encuentras el diario del detective que investigó la mansión hace cincuenta años. ' +
      'La última entrada dice: "El Espectro del Amo no puede ser dañado por armas normales. ' +
      'Solo la Reliquia de Luz puede destruirlo, y solo el Crucifijo de Plata reduce su poder. ' +
      'Quien lo enfrente sin ellos está condenado." La página está manchada de sangre.',
    reward: 40,
  },
  {
    text:
      'Una inscripción en la pared reza: "Aldric Voss pactó con fuerzas oscuras en 1887 ' +
      'para obtener la inmortalidad. Murió esa misma noche, pero su espíritu quedó atrapado ' +
      'en estas paredes, incapaz de descansar. El único modo de liberarlo es destruir el altar ' +
      'en la Cámara del Amo." Las palabras parpadean como si respiraran.',
    reward: 25,
  },
  {
    text:
      'El espíritu de una antigua doncella aparece brevemente. Susurra con voz tenue: ' +
      '"El Amo es vulnerable cuando usa su magia oscura. Si tienes el Crucifijo de Plata ' +
      'su magia se debilitará. Y la Reliquia de Luz... triplicará el daño de tus ataques." ' +
      'La figura se disuelve entre lágrimas de luz.',
    reward: 30,
  },
  {
    text:
      'Encuentras una fotografía de grupo con fecha de 1901. Todos los rostros están tachados ' +
      'salvo uno: un hombre elegante con ojos vacíos al fondo. Al dorso, escrito a lápiz: ' +
      '"Él es el último. Y cuando lo veas, ya será demasiado tarde para huir."',
    reward: 15,
  },
]

const ENEMY_POOL = [
  { name: 'Fantasma llorón', hp: 25, attack: 10, reward: 20, sanityDmg: 10 },
  { name: 'Sombra deslizante', hp: 40, attack: 16, reward: 30, sanityDmg: 8 },
  { name: 'Muñeca poseída', hp: 20, attack: 8, reward: 15, sanityDmg: 12 },
  { name: 'Poltergeist furioso', hp: 60, attack: 24, reward: 50, sanityDmg: 15 },
  { name: 'Espíritu de niño', hp: 30, attack: 12, reward: 25, sanityDmg: 20 },
  { name: 'Banshee aullante', hp: 35, attack: 18, reward: 35, sanityDmg: 25 },
  { name: 'Doppelgänger', hp: 50, attack: 20, reward: 40, sanityDmg: 18 },
  { name: 'Revenant antiguo', hp: 75, attack: 28, reward: 60, sanityDmg: 10 },
  { name: 'Ectoplasma vivo', hp: 45, attack: 15, reward: 35, sanityDmg: 12 },
  { name: 'Espectro encadenado', hp: 55, attack: 22, reward: 45, sanityDmg: 20 },
]

const BOSS_DEF = { name: 'El Espectro del Amo', hp: 220, attack: 30, reward: 250, sanityDmg: 30 }

const TERROR_POOL = [
  { desc: 'Las paredes sangran. El miedo te paraliza por un instante.', damage: 15, sanityDmg: 20 },
  { desc: 'Algo invisible te empuja contra la pared.', damage: 18, sanityDmg: 10 },
  { desc: 'Escuchas tu nombre susurrado desde dentro del techo.', damage: 0, sanityDmg: 25 },
  { desc: 'El suelo cede. Caes en un sótano que no debería existir.', damage: 22, sanityDmg: 15 },
  { desc: 'Una mano fría te agarra el tobillo desde bajo el suelo.', damage: 12, sanityDmg: 18 },
  { desc: 'El espejo más cercano muestra tu cadáver. El corazón se te encoge.', damage: 0, sanityDmg: 30 },
]

const TREASURE_POOL = [
  { desc: 'Una caja fuerte abierta con joyas del siglo XIX.', reward: 30 },
  { desc: 'Documentos firmados con sellos de oro valorados en una fortuna.', reward: 50 },
  { desc: 'Un reloj de bolsillo de oro con grabados extraños.', reward: 25 },
  { desc: 'Monedas antiguas en un cofre de madera.', reward: 40 },
  { desc: 'Un collar de diamantes abandonado en un tocador.', reward: 45 },
  { desc: 'Una colección de sellos raros que valen una fortuna.', reward: 35 },
]

const HEAL_POOL = [
  { desc: 'Un botiquín de primeros auxilios olvidado en un armario.', hp: 25, sanity: 0 },
  { desc: 'Un frasco de brandy añejo que calma los nervios y cura los rasguños.', hp: 20, sanity: 15 },
  { desc: 'Una sala con una ventana abierta. La luz del sol entra brevemente y te reconforta.', hp: 10, sanity: 25 },
  { desc: 'Un amuleto colgado en la pared irradia una energía calmante.', hp: 0, sanity: 35 },
]

const SANITY_POOL = [
  { desc: 'Las voces en la pared no paran de repetir tu nombre.', sanityDmg: 20, reward: 15 },
  { desc: 'Ves tu reflejo moverse antes que tú. El pánico se apodera de ti.', sanityDmg: 25, reward: 20 },
  { desc: 'El reloj de la mansión da doce campanadas aunque son las tres de la madrugada.', sanityDmg: 15, reward: 10 },
  { desc: 'Una figura oscura en el umbral de la puerta desaparece al mirarla.', sanityDmg: 18, reward: 12 },
]

const ITEM_REGULAR: ItemDef[] = [
  { id: 'escopeta', name: 'Escopeta anticuada', desc: 'Aumenta el daño en combate.' },
  { id: 'crucifijo', name: 'Crucifijo de plata', desc: 'Reduce el daño del jefe final.' },
  { id: 'botiquin', name: 'Botiquín completo', desc: 'Restaura 60 de vida al usarlo.' },
]

const ITEM_KEY: ItemDef = { id: 'llave-maestra', name: 'Llave maestra', desc: 'Abre puertas cerradas con llave.' }
const ITEM_RELIC: ItemDef = { id: 'reliquia', name: 'Reliquia de Luz', desc: 'Triplica el daño contra el Espectro del Amo.' }

const EVENT_LABELS: Partial<Record<Room['event'], string>> = {
  treasure: 'brillo de riqueza',
  terror: 'peligro sobrenatural',
  enemy: 'presencia hostil',
  healing: 'energía curativa',
  item: 'objeto en el suelo',
  boss: '¡el Amo!',
  narrative: 'punto de interés',
  sanity: 'perturbación mental',
}

const INSTRUCTIONS =
  'Casa Encantada: La Mansión Voss. Explora 36 habitaciones y derrota al Espectro del Amo. ' +
  'Comandos: ir norte, sur, este u oeste. Mirar para releer la habitación. ' +
  'Inventario para ver vida, cordura y objetos. Tomar para recoger objetos. Usar botiquín para curarte. ' +
  'La escopeta sube el daño. El crucifijo reduce el daño del jefe. La llave abre puertas. ' +
  'La Reliquia de Luz triplica el daño contra el jefe. ' +
  'En combate: atacar o huir. No puedes huir del Espectro del Amo. ' +
  'Cazador: más vida y daño. La escopeta duplica el daño contra el Amo. ' +
  'Médium: escribe ritual en combate para un exorcismo poderoso cada 3 turnos. Más cordura. ' +
  'Ladrón: escribe acechar para ver las habitaciones adyacentes. ' +
  'Ojo con la cordura: llegar a 0 es igual de fatal que quedarte sin vida. ' +
  'La partida se guarda automáticamente. Tecla H repite instrucciones.'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// ─── World generation ─────────────────────────────────────────────────────────

function generateWorld(): Room[] {
  const COLS = 6, N = 36
  const NARRATIVE_IDS = new Set([5, 14, 24, 32])
  const RELIC_ROOM_ID = 28

  const eventPool: Room['event'][] = [
    'nothing', 'nothing', 'nothing', 'nothing', 'nothing',
    'treasure', 'treasure', 'treasure', 'treasure', 'treasure',
    'enemy', 'enemy', 'enemy', 'enemy', 'enemy', 'enemy', 'enemy', 'enemy',
    'terror', 'terror', 'terror', 'terror',
    'healing', 'healing', 'healing',
    'item', 'item', 'item',
    'sanity', 'sanity', 'sanity',
  ]
  while (eventPool.length < 42) eventPool.push('nothing')
  const evts = [...eventPool].sort(() => Math.random() - 0.5)

  const descs = [...ROOM_DESCS].sort(() => Math.random() - 0.5)

  const validKeyRooms = Array.from({ length: 10 }, (_, i) => i + 2).filter(
    id => !NARRATIVE_IDS.has(id) && id !== RELIC_ROOM_ID
  )
  const keyRoomId = validKeyRooms[Math.floor(Math.random() * validKeyRooms.length)]

  const lockRow = 6 + Math.floor(Math.random() * 6)

  let evtIdx = 0, narrativeIdx = 0, regularItemIdx = 0, sanityIdx = 0

  return Array.from({ length: N }, (_, id): Room => {
    const row = Math.floor(id / COLS)
    const col = id % COLS
    const exits: Partial<Record<Direction, number>> = {}
    const lockedExits: Partial<Record<Direction, boolean>> = {}

    if (row > 0) exits.norte = id - COLS
    if (row < 5) exits.sur   = id + COLS
    if (col > 0) exits.oeste = id - 1
    if (col < 5) exits.este  = id + 1

    if (id === lockRow && exits.sur !== undefined) lockedExits.sur = true

    if (id === 0) return { description: descs[0], exits, lockedExits, event: 'nothing', cleared: true }
    if (id === N - 1) return { description: BOSS_ROOM_DESC, exits, lockedExits, event: 'boss', cleared: false }

    if (NARRATIVE_IDS.has(id)) {
      const narrative = NARRATIVES[narrativeIdx++ % NARRATIVES.length]
      return { description: descs[id % descs.length], exits, lockedExits, event: 'narrative', cleared: false, narrative }
    }

    if (id === RELIC_ROOM_ID) {
      return { description: descs[id % descs.length], exits, lockedExits, event: 'item', cleared: false, item: ITEM_RELIC }
    }

    const event: Room['event'] = id === keyRoomId ? 'item' : evts[evtIdx++ % evts.length]
    const base: Room = { description: descs[id % descs.length], exits, lockedExits, event, cleared: false }

    if (event === 'terror')  base.terror  = pick(TERROR_POOL)
    if (event === 'treasure') base.treasure = pick(TREASURE_POOL)
    if (event === 'healing')  base.heal    = pick(HEAL_POOL)
    if (event === 'enemy')    base.enemy   = { ...pick(ENEMY_POOL) }
    if (event === 'sanity')   base.sanityEvent = SANITY_POOL[sanityIdx++ % SANITY_POOL.length]
    if (event === 'item')     base.item    = id === keyRoomId ? ITEM_KEY : ITEM_REGULAR[regularItemIdx++ % ITEM_REGULAR.length]

    return base
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CasaEncantadaPage() {
  const worldRef         = useRef<Room[]>([])
  const roomIdRef        = useRef(0)
  const prevIdRef        = useRef<number | null>(null)
  const healthRef        = useRef(100)
  const maxHpRef         = useRef(100)
  const sanityRef        = useRef(100)
  const maxSanityRef     = useRef(100)
  const scoreRef         = useRef(0)
  const inCombat         = useRef(false)
  const enemyRef         = useRef<ActiveEnemy | null>(null)
  const cmdHistRef       = useRef<string[]>([])
  const inventoryRef     = useRef<string[]>([])
  const classRef         = useRef<CharacterClass>('cazador')
  const ritualCdRef      = useRef(0)
  const phaseRef         = useRef<Phase>('idle')

  const [phase,         setPhaseState]    = useState<Phase>('idle')
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('cazador')
  const [health,        setHealth]        = useState(100)
  const [maxHp,         setMaxHp]         = useState(100)
  const [sanity,        setSanity]        = useState(100)
  const [maxSanity,     setMaxSanity]     = useState(100)
  const [score,         setScore]         = useState(0)
  const [enemy,         setEnemy]         = useState<ActiveEnemy | null>(null)
  const [inventory,     setInventory]     = useState<string[]>([])
  const [history,       setHistory]       = useState<HistEntry[]>([])
  const [input,         setInput]         = useState('')
  const [saved,         setSaved]         = useState(false)
  const [saveError,     setSaveError]     = useState('')
  const [histIdx,       setHistIdx]       = useState(-1)
  const [hasSaveData,   setHasSaveData]   = useState(false)
  const [ritualCD,      setRitualCD]      = useState(0)

  const inputRef   = useRef<HTMLInputElement>(null)
  const historyEl  = useRef<HTMLDivElement>(null)

  function goPhase(p: Phase) { phaseRef.current = p; setPhaseState(p) }

  useEffect(() => { setHasSaveData(readSave() !== null) }, [])

  useEffect(() => {
    if (historyEl.current) historyEl.current.scrollTop = historyEl.current.scrollHeight
  }, [history])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function addHist(type: HistEntry['type'], text: string) {
    setHistory(h => [...h, { type, text }])
  }

  function syncHealth(v: number) { healthRef.current = v; setHealth(v) }
  function syncSanity(v: number) { sanityRef.current = v; setSanity(v) }
  function syncScore(v: number)  { scoreRef.current  = v; setScore(v)  }
  function syncRitualCD(v: number) { ritualCdRef.current = v; setRitualCD(v) }
  function syncInventory(inv: string[]) { inventoryRef.current = inv; setInventory(inv) }

  function checkDeath(hp: number, san: number, source: string): boolean {
    if (hp <= 0) {
      addHist('bad', `${source} La oscuridad te engulle. Has muerto.`)
      audio.gameOver()
      deleteSave(); setHasSaveData(false)
      goPhase('lost')
      return true
    }
    if (san <= 0) {
      addHist('bad', `${source} Tu mente se quiebra definitivamente. Has enloquecido.`)
      audio.gameOver()
      deleteSave(); setHasSaveData(false)
      goPhase('lost')
      return true
    }
    return false
  }

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
      sanity: sanityRef.current,
      score: scoreRef.current,
      inventory: inventoryRef.current,
      characterClass: classRef.current,
      ritualCooldown: ritualCdRef.current,
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
          `El Espectro del Amo se materializa desde las sombras. Sus ojos arden con una luz maldita. ` +
          `Vida: ${BOSS_DEF.hp}/${BOSS_DEF.hp}. Escribe "atacar"${classRef.current === 'medium' ? ' o "ritual"' : ''}. No puedes huir.`
        )
        audio.incorrect()
        announceAssertive('¡El Espectro del Amo! No puedes huir.')
        break
      }

      case 'narrative': {
        const n = room.narrative!
        syncScore(scoreRef.current + n.reward)
        addHist('narrative', `${n.text} (+${n.reward} puntos)`)
        announcePolite(n.text)
        break
      }

      case 'terror': {
        const { desc, damage, sanityDmg } = room.terror!
        const hp = Math.max(0, healthRef.current - damage)
        const san = Math.max(0, sanityRef.current - sanityDmg)
        syncHealth(hp); syncSanity(san)
        const parts = []
        if (damage > 0) parts.push(`-${damage} de vida`)
        if (sanityDmg > 0) parts.push(`-${sanityDmg} de cordura`)
        addHist('terror', `Terror — ${desc} ${parts.join(', ')}. Vida: ${hp}/${maxHpRef.current}. Cordura: ${san}/${maxSanityRef.current}.`)
        audio.incorrect()
        announceAssertive(`Terror. ${parts.join(', ')}.`)
        checkDeath(hp, san, desc)
        break
      }

      case 'sanity': {
        const { desc, sanityDmg, reward } = room.sanityEvent!
        const san = Math.max(0, sanityRef.current - sanityDmg)
        syncSanity(san)
        syncScore(scoreRef.current + reward)
        addHist('terror', `Visión — ${desc} -${sanityDmg} de cordura. Cordura: ${san}/${maxSanityRef.current}. +${reward} puntos.`)
        audio.incorrect()
        announceAssertive(`Visión perturbadora. -${sanityDmg} de cordura.`)
        if (san <= 0) checkDeath(healthRef.current, san, desc)
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
        const { desc, hp: hpGain, sanity: sanGain } = room.heal!
        const newHp = Math.min(maxHpRef.current, healthRef.current + hpGain)
        const newSan = Math.min(maxSanityRef.current, sanityRef.current + sanGain)
        syncHealth(newHp); syncSanity(newSan)
        const parts = []
        if (hpGain > 0) parts.push(`+${hpGain} de vida`)
        if (sanGain > 0) parts.push(`+${sanGain} de cordura`)
        addHist('ok', `Alivio — ${desc} ${parts.join(', ')}. Vida: ${newHp}/${maxHpRef.current}. Cordura: ${newSan}/${maxSanityRef.current}.`)
        audio.correct()
        announcePolite(`${parts.join(', ')}.`)
        break
      }

      case 'enemy': {
        const e = room.enemy!
        const ae: ActiveEnemy = { ...e, maxHp: e.hp, isBoss: false }
        enemyRef.current = ae; inCombat.current = true; setEnemy(ae)
        addHist('combat',
          `Un ${e.name} surge de las sombras. Vida enemiga: ${e.hp}/${e.hp}. ` +
          `Escribe "atacar"${classRef.current === 'medium' ? ', "ritual"' : ''} o "huir".`
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
    const hasCrucifijo = inventoryRef.current.includes('crucifijo')
    const enemyHp = e.hp - dmg

    if (enemyHp <= 0) {
      syncScore(scoreRef.current + e.reward)
      if (e.isBoss) {
        const bonus = Math.floor(healthRef.current / 2) + Math.floor(sanityRef.current / 3)
        syncScore(scoreRef.current + bonus)
        inCombat.current = false; enemyRef.current = null; setEnemy(null)
        addHist('ok',
          `¡Destruyes al ${e.name}! La mansión tiembla y la oscuridad se disipa. ` +
          `+${e.reward} puntos. Bonus de supervivencia: +${bonus} puntos.`
        )
        audio.start()
        announceAssertive(`Victoria. El Espectro del Amo ha sido destruido.`)
        deleteSave(); setHasSaveData(false)
        goPhase('won')
        return true
      }
      addHist('ok', `Desvaneces al ${e.name}. +${e.reward} puntos.`)
      audio.correct()
      if (Math.random() < 0.25) {
        const sanRestore = 15
        syncSanity(Math.min(maxSanityRef.current, sanityRef.current + sanRestore))
        addHist('ok', `El miedo disminuye al vencer. +${sanRestore} de cordura. Cordura: ${sanityRef.current}/${maxSanityRef.current}.`)
      }
      inCombat.current = false; enemyRef.current = null; setEnemy(null)
      announceAssertive(`${e.name} desvanecido.`)
      describeRoom(worldRef.current[roomIdRef.current])
      return true
    }

    const rawAtk = e.attack
    const rawSanDmg = e.sanityDmg
    const reducedAtk = hasCrucifijo && e.isBoss ? Math.floor(rawAtk * 0.5) : rawAtk
    const reducedSan = hasCrucifijo && e.isBoss ? Math.floor(rawSanDmg * 0.5) : rawSanDmg
    const crucifNote = hasCrucifijo && e.isBoss ? ` (crucifijo: daño reducido)` : ''

    const playerHp  = Math.max(0, healthRef.current - reducedAtk)
    const playerSan = Math.max(0, sanityRef.current - reducedSan)

    const updated: ActiveEnemy = { ...e, hp: enemyHp }
    enemyRef.current = updated; setEnemy(updated)
    syncHealth(playerHp); syncSanity(playerSan)

    addHist('combat',
      `Le haces ${dmg} de daño al ${e.name} (vida: ${enemyHp}/${e.maxHp}). ` +
      `El ${e.name} te hace ${reducedAtk} de daño y ${reducedSan} de cordura${crucifNote}. ` +
      `Tu vida: ${playerHp}/${maxHpRef.current}. Cordura: ${playerSan}/${maxSanityRef.current}.`
    )
    audio.click()
    announcePolite(`Tu vida: ${playerHp}. Cordura: ${playerSan}. Vida del ${e.name}: ${enemyHp}.`)

    if (checkDeath(playerHp, playerSan, `El ${e.name} te derriba.`)) return false
    return false
  }

  function handleCombat(cmd: string) {
    const e = enemyRef.current
    if (!e) return

    if (ritualCdRef.current > 0) syncRitualCD(ritualCdRef.current - 1)

    if (/^(huir|flee|escapar|retirarse)$/.test(cmd)) {
      if (e.isBoss) {
        addHist('bad', 'El Espectro del Amo bloquea cada salida con su sombra. ¡No puedes huir!')
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

    if (/^(ritual|exorcismo|exorcizar|rezar|reza|orar)$/.test(cmd)) {
      if (classRef.current !== 'medium') {
        addHist('bad', 'Solo el Médium puede realizar exorcismos.'); return
      }
      if (ritualCdRef.current > 0) {
        addHist('bad', `Tu energía espiritual aún se recupera. Faltan ${ritualCdRef.current} turno${ritualCdRef.current > 1 ? 's' : ''}.`)
        audio.incorrect(); return
      }
      syncRitualCD(3)
      const dmg = 40 + Math.floor(Math.random() * 31)
      addHist('combat', `Invocas la luz y lanzas un exorcismo: ${dmg} de daño espiritual.`)
      resolveAttack(dmg, e)
      return
    }

    if (/^(atacar?|attack|pelear|luchar|a|disparar|dispara)$/.test(cmd)) {
      const hasEscopeta = inventoryRef.current.includes('escopeta')
      const hasReliquia = inventoryRef.current.includes('reliquia')
      const def = CLASS_DEFS[classRef.current]
      const base = (hasEscopeta ? 22 : 14) + def.dmgBonus
      const dmgRaw = base + Math.floor(Math.random() * 11)
      let dmg = dmgRaw
      const notes: string[] = []
      if (e.isBoss && hasEscopeta && classRef.current === 'cazador') {
        dmg = dmgRaw * 2
        notes.push(`escopeta ×2 vs Amo`)
      }
      if (e.isBoss && hasReliquia) {
        dmg = dmg * 3
        notes.push(`Reliquia ×3`)
      }
      const noteStr = notes.length ? ` (${notes.join(', ')}: ${dmg})` : ''
      addHist('combat', `Atacas al ${e.name} con ${dmg} de daño${noteStr}.`)
      resolveAttack(dmg, e)
      return
    }

    addHist('bad', e.isBoss
      ? `Estás frente al Amo. Escribe: atacar${classRef.current === 'medium' ? ' o ritual' : ''}.`
      : `Estás en combate. Escribe: atacar${classRef.current === 'medium' ? ', ritual' : ''} o huir.`
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
      const cdNote = classRef.current === 'medium' && ritualCdRef.current > 0
        ? ` · Ritual disponible en ${ritualCdRef.current} turno${ritualCdRef.current > 1 ? 's' : ''}`
        : ''
      const msg = `Vida: ${healthRef.current}/${maxHpRef.current}. Cordura: ${sanityRef.current}/${maxSanityRef.current}. Puntos: ${scoreRef.current}. Objetos: ${items}.${cdNote}`
      addHist('ok', msg); announcePolite(msg); return
    }

    if (/^(acechar|sigilo|scout|espiar)$/.test(cmd)) {
      if (classRef.current !== 'ladron') {
        addHist('bad', 'Solo el Ladrón puede acechar silenciosamente.'); return
      }
      const room = worldRef.current[roomIdRef.current]
      const lines = (Object.keys(room.exits) as Direction[]).map(d => {
        const destRoom = worldRef.current[room.exits[d]!]
        const locked = room.lockedExits[d] ? ' (cerrada)' : ''
        const label = destRoom.cleared ? 'ya explorada' : (EVENT_LABELS[destRoom.event] ?? 'habitación tranquila')
        return `${d}: ${label}${locked}`
      })
      const msg = `Sigilo: ${lines.join('. ')}.`
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
      if (/^(botiquin|botiquin de primeros auxilios|kit|primeros auxilios)$/.test(usarMatch[1].trim())) {
        if (!inventoryRef.current.includes('botiquin')) {
          addHist('bad', 'No tienes ningún botiquín.'); audio.incorrect(); return
        }
        const hp = Math.min(maxHpRef.current, healthRef.current + 60)
        syncHealth(hp)
        syncInventory(inventoryRef.current.filter(i => i !== 'botiquin'))
        addHist('ok', `Usas el botiquín. +60 de vida. Vida: ${hp}/${maxHpRef.current}.`)
        audio.correct(); announcePolite(`Usas el botiquín. Vida: ${hp}.`)
        doAutoSave(); return
      }
      addHist('bad', 'La escopeta, el crucifijo y la reliquia se usan automáticamente en combate.'); return
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
        if (inventoryRef.current.includes('llave-maestra')) {
          room.lockedExits[dir] = false
          syncInventory(inventoryRef.current.filter(i => i !== 'llave-maestra'))
          addHist('ok', `La puerta al ${dir} estaba cerrada. Usas la llave maestra para abrirla.`)
          announcePolite(`Usas la llave para abrir la puerta al ${dir}.`)
        } else {
          addHist('bad', `La puerta al ${dir} está cerrada con llave. Necesitas la llave maestra.`)
          audio.incorrect(); return
        }
      }
      enterRoom(dest)
      doAutoSave(); return
    }

    addHist('bad', 'Comando no reconocido. Prueba: ir norte/sur/este/oeste, mirar, inventario, tomar, usar botiquín.')
    audio.incorrect()
  }

  // ── Game lifecycle ─────────────────────────────────────────────────────────

  function resetRefs(cl: CharacterClass) {
    const def = CLASS_DEFS[cl]
    classRef.current     = cl
    maxHpRef.current     = def.maxHp
    maxSanityRef.current = def.maxSanity
    healthRef.current    = def.maxHp
    sanityRef.current    = def.maxSanity
    scoreRef.current     = 0
    inCombat.current     = false
    enemyRef.current     = null
    cmdHistRef.current   = []
    inventoryRef.current = []
    ritualCdRef.current  = 0
  }

  function applyUIState(
    cl: CharacterClass, hp: number, san: number, sc: number,
    inv: string[], hist: HistEntry[], rcd: number
  ) {
    const def = CLASS_DEFS[cl]
    setMaxHp(def.maxHp)
    setMaxSanity(def.maxSanity)
    setHealth(hp)
    setSanity(san)
    setScore(sc)
    setInventory(inv)
    setEnemy(null)
    setSaved(false)
    setSaveError('')
    setHistIdx(-1)
    setInput('')
    setRitualCD(rcd)
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
      `${def.name} elegido. ${def.desc}. Llegas a la Mansión Voss en plena noche. ` +
      `${room.description} Salidas: ${dirs.join(', ')}.`

    applyUIState(cl, def.maxHp, def.maxSanity, 0, [], [{ type: 'scene', text: msg }], 0)
    goPhase('playing')
    announcePolite(msg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  function loadGame() {
    const save = readSave()
    if (!save) return
    const cl = save.characterClass
    worldRef.current         = save.world
    roomIdRef.current        = save.roomId
    prevIdRef.current        = save.prevId
    classRef.current         = cl
    maxHpRef.current         = CLASS_DEFS[cl].maxHp
    maxSanityRef.current     = CLASS_DEFS[cl].maxSanity
    healthRef.current        = save.health
    sanityRef.current        = save.sanity
    scoreRef.current         = save.score
    inventoryRef.current     = save.inventory
    inCombat.current         = false
    enemyRef.current         = null
    cmdHistRef.current       = []
    ritualCdRef.current      = save.ritualCooldown

    const room = save.world[save.roomId]
    const dirs = (Object.keys(room.exits) as Direction[]).map(d =>
      room.lockedExits[d] ? `${d} (cerrada)` : d
    )
    const roomMsg = `${room.description} Salidas: ${dirs.join(', ')}.`
    const initHist: HistEntry[] = [
      { type: 'ok',    text: 'Partida cargada.' },
      { type: 'scene', text: roomMsg },
    ]

    applyUIState(cl, save.health, save.sanity, save.score, save.inventory, initHist, save.ritualCooldown)
    goPhase('playing')
    announcePolite('Partida cargada. ' + roomMsg)
    audio.start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleSaveScore() {
    const result = await saveScore('casa-encantada', score)
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
    scene:     'text-[#e0d0ff]',
    cmd:       'text-[#ffd700]',
    ok:        'text-[#22c55e]',
    bad:       'text-[#ef4444]',
    combat:    'text-[#f97316]',
    item:      'text-[#a78bfa]',
    narrative: 'text-[#38bdf8]',
    terror:    'text-[#c026d3]',
  }

  if (phase === 'idle') {
    return (
      <GameShell title="Casa Encantada" instructions={INSTRUCTIONS} score={0}>
        <div className="text-center space-y-6">
          <h2 className="text-xl text-[#c026d3]">Casa Encantada: La Mansión Voss</h2>
          <p className="text-[#888] text-sm">
            Explora 36 habitaciones de una mansión maldita. Descubre el secreto del Espectro del Amo y destrúyelo para escapar.
            Cuida tu vida <em>y</em> tu cordura.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => goPhase('selecting')}>Entrar a la mansión</Button>
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
    const classes: CharacterClass[] = ['cazador', 'medium', 'ladron']
    return (
      <GameShell title="Casa Encantada" instructions={INSTRUCTIONS} score={0}>
        <div className="space-y-6">
          <h2 className="text-xl text-[#c026d3] text-center">Elige tu personaje</h2>
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
                  className={`p-4 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c026d3] cursor-pointer ${
                    sel ? 'border-[#c026d3] bg-[#1a0a1a]' : 'border-[#333] bg-[#111] hover:border-[#555]'
                  }`}
                >
                  <span className={`block text-base font-bold mb-2 ${sel ? 'text-[#c026d3]' : 'text-[#e0d0ff]'}`}>
                    {def.name}
                  </span>
                  <span className="block text-xs text-[#888] leading-relaxed">{def.desc}</span>
                  <span className="block text-xs text-[#555] mt-2">Vida: {def.maxHp} · Cordura: {def.maxSanity}</span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="secondary" onClick={() => goPhase('idle')}>Volver</Button>
            <Button onClick={startGame}>Entrar</Button>
          </div>
        </div>
      </GameShell>
    )
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <GameShell title="Casa Encantada" instructions={INSTRUCTIONS} score={score}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl" style={{ color: phase === 'won' ? '#22c55e' : '#ef4444' }}>
            {phase === 'won' ? '¡Has escapado de la Mansión Voss!' : (health <= 0 ? 'Has muerto' : 'Has enloquecido')}
          </h2>
          {phase === 'won' && (
            <p className="text-[#888] text-sm">
              El Espectro del Amo se ha disuelto para siempre. Las luces de la mansión se apagan. Eres libre.
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

  const sanityPct = Math.round((sanity / maxSanity) * 100)
  const sanityColor = sanityPct <= 25 ? '#c026d3' : sanityPct <= 50 ? '#f97316' : '#22c55e'

  return (
    <GameShell
      title="Casa Encantada"
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
          <span>
            Cordura:{' '}
            <strong style={{ color: sanityColor }}>{sanity}</strong>/{maxSanity}
          </span>
          <span className="text-[#555] text-xs">{CLASS_DEFS[classRef.current].name}</span>
          {classRef.current === 'medium' && ritualCD > 0 && (
            <span className="text-[#a78bfa] text-xs" aria-live="polite">Ritual en {ritualCD}t</span>
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
          className="flex-1 overflow-y-auto border border-[#3a1a3a] rounded p-4 mb-3 space-y-1.5 font-mono text-sm bg-[#0a0010]"
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
          <div className="flex gap-3 mb-3" role="group" aria-label="Acciones de combate">
            <Button className="flex-1" onClick={() => { processCommand('atacar'); setInput('') }}>
              Atacar
            </Button>
            {classRef.current === 'medium' && (
              <Button
                variant={ritualCD === 0 ? 'primary' : 'secondary'}
                className="flex-1"
                onClick={() => { processCommand('ritual'); setInput('') }}
              >
                {ritualCD === 0 ? 'Ritual' : `Ritual (${ritualCD}t)`}
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
          <label htmlFor="cmd-input-ce" className="sr-only">Ingresa un comando</label>
          <input
            id="cmd-input-ce"
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={enemy ? 'atacar...' : 'ir norte, tomar, acechar...'}
            className="flex-1 px-4 py-2.5 rounded bg-[#0a0010] border border-[#3a1a3a] text-[#e0d0ff] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#c026d3]"
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
