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

async function getDefinition(word: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://es.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word)}&prop=wikitext&format=json`,
      { signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    const wikitext: string = data?.parse?.wikitext?.['*'] ?? ''
    if (!wikitext) return null

    const match = wikitext.match(/;1[^:]*:\s*(.+)/)
    if (!match) return null

    const cleaned = cleanWikitext(match[1])
    if (cleaned.length < 10) return null

    // First sentence only, max 80 chars
    const sentence = cleaned.split(/[.;]/)[0].trim()
    return sentence.length > 10 ? sentence.slice(0, 80) : null
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
      { signal: AbortSignal.timeout(5000) },
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
