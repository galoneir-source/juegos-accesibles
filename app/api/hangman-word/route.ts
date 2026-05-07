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

export async function GET() {
  try {
    const res = await fetch(
      'https://random-word-api.herokuapp.com/word?lang=es&number=30',
      { signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) throw new Error('word API failed')
    const words: string[] = await res.json()

    const candidates = words.filter(isValidWord)

    for (const word of candidates) {
      const hint = await getDefinition(word)
      if (hint) {
        return Response.json({ word: word.toUpperCase(), hint })
      }
    }
  } catch {
    // fall through to fallback
  }

  const fallback = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)]
  return Response.json(fallback)
}
