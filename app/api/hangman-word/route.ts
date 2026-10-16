import { clientIp, hit } from '@/lib/rate-limit'

const FALLBACK_WORDS = [
  { word: 'ELEFANTE', hint: 'Animal grande con trompa' },
  { word: 'MARIPOSA', hint: 'Insecto con alas coloridas' },
  { word: 'TELESCOPIO', hint: 'Instrumento para observar las estrellas' },
  { word: 'CHOCOLATE', hint: 'Dulce hecho de cacao' },
  { word: 'DINOSAURIO', hint: 'Animal prehistórico extinto' },
]

function isValidWord(word: string): boolean {
  return /^[a-záéíóúüñ]{5,12}$/.test(word)
}

function cleanWikitext(text: string): string {
  return text
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')         // <ref>...</ref>
    .replace(/<ref[^/]* \/>/g, '')                      // self-closing <ref />
    .replace(/\{\{(?:plm|l\+?|link)\|(?:[a-z]+\|)?([^|}]+)[^}]*\}\}/gi, '$1') // {{plm|word}} → word
    .replace(/\{\{[^}]*\}\}/g, '')                      // remaining {{templates}}
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1') // [[link|text]] → text
    .replace(/'{2,3}/g, '')                             // ''italic''/'''bold'''
    .replace(/<[^>]+>/g, '')                            // remaining HTML
    .replace(/^\([^)]+\)\s*/g, '')                      // leading parenthetical
    .replace(/\s+/g, ' ')
    .trim()
}

// Wikimedia responde 429 a las peticiones sin un User-Agent propio (el de
// fetch de Node es genérico), y entonces el juego siempre caía en la lista de
// reserva. Su política pide nombre de la herramienta y un contacto.
const USER_AGENT = 'JuegosAccesibles/1.0 (https://juegos.dvillalon.com; contacto@dvillalon.com)'

const MAX_HINT = 80

async function getDefinition(word: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://es.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word)}&prop=wikitext&format=json`,
      { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    const wikitext: string = data?.parse?.wikitext?.['*'] ?? ''
    if (!wikitext) return null

    const match = wikitext.match(/;1[^:]*:\s*(.+)/)
    if (!match) return null

    const cleaned = cleanWikitext(match[1])
    if (cleaned.length < 10) return null

    // First sentence only, max 80 chars, cut at a word boundary
    const sentence = cleaned.split(/[.;]/)[0].trim()
    if (sentence.length <= 10) return null
    if (sentence.length <= MAX_HINT) return sentence
    const cut = sentence.slice(0, MAX_HINT + 1)
    const end = cut.lastIndexOf(' ')
    return (end > 0 ? cut.slice(0, end) : cut.slice(0, MAX_HINT)).replace(/[\s,:(]+$/, '') + '…'
  } catch {
    return null
  }
}

// Cada petición lanza llamadas a APIs externas: se limita por IP y se acota
// cuántas definiciones se piden (en paralelo, así el peor caso es ~5 s + 4 s).
const MAX_CANDIDATES = 8

function fallbackWord() {
  const fallback = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)]
  return Response.json(fallback)
}

export async function GET(request: Request) {
  if (!hit(`hangman:${clientIp(request.headers)}`, 20, 60 * 1000)) return fallbackWord()

  try {
    const res = await fetch(
      'https://random-word-api.herokuapp.com/word?lang=es&number=30',
      { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) throw new Error('word API failed')
    const words: string[] = await res.json()

    const candidates = words.filter(isValidWord).slice(0, MAX_CANDIDATES)
    const hints = await Promise.all(candidates.map(getDefinition))
    const i = hints.findIndex(Boolean)
    if (i !== -1) {
      return Response.json({ word: candidates[i].toUpperCase(), hint: hints[i] })
    }
  } catch {
    // fall through to fallback
  }

  return fallbackWord()
}
