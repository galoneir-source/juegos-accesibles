import type { MetadataRoute } from 'next'

const BASE_URL = 'https://juegos.dvillalon.com'

// Slugs de las carpetas de juego bajo app/ (cada una es una ruta pública
// con su propio page.tsx). Si se añade o quita un juego, actualizar esta
// lista — no hay una fuente única compartida con app/page.tsx todavía.
const GAMES = [
  '2048', 'abismo', 'anagramas', 'asteroides', 'aventura-espacio',
  'aventura-magica', 'aventura-texto', 'bagdad', 'batalla-naval', 'bingo',
  'blackjack', 'buscaminas', 'casa-encantada', 'castillo', 'china',
  'conecta-cuatro', 'corp', 'egipto', 'frogger', 'generala', 'gin-rummy',
  'gorillas', 'grecia', 'hangman', 'inca', 'laberinto-audio', 'mastermind',
  'mates-rapidas', 'memory-sonidos', 'misterio', 'parchis', 'penaltis',
  'pirata', 'poker', 'pong-audio', 'quince', 'rusia', 'samurai',
  'secuencias', 'sokoban', 'solitario', 'space-invaders', 'templo',
  'tetris', 'tragaperras', 'tres-en-raya', 'truco', 'vikingos', 'wordle',
  'zona',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const gameEntries: MetadataRoute.Sitemap = GAMES.map((slug) => ({
    url: `${BASE_URL}/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    // /tabla-lideres requiere sesión (protegida por el middleware en
    // proxy.ts, redirige a /login sin ella) — no va en el sitemap público.
    ...gameEntries,
  ]
}
