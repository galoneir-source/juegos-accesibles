import { prisma } from './db'

// Lecturas de puntuaciones: solo se usan desde Server Components. Viven aquí y
// no en app/actions/scores.ts para que no se expongan como Server Actions
// invocables desde el navegador (getUserScores recibe un userId arbitrario).

export const GAME_IDS = [
  'hangman', 'memory', 'aventura', 'aventura-espacio', 'aventura-magica',
  'casa-encantada', 'mastermind', 'wordle', 'mates-rapidas', 'laberinto', 'anagramas',
  'blackjack', 'pong', 'batalla-naval', 'penaltis', 'tres-en-raya', 'gorillas',
  'misterio', 'secuencias', 'conecta4', 'generala', '2048', 'bingo', 'space-invaders',
  'tetris', 'frogger', 'asteroids', 'buscaminas', 'sokoban', 'tragaperras', 'quince',
  'solitario', 'pirata', 'egipto', 'samurai', 'vikingos', 'abismo', 'zona', 'castillo',
  'corp', 'templo', 'inca', 'grecia', 'bagdad', 'china', 'rusia', 'gin-rummy', 'poker',
  'truco', 'parchis',
] as const

export type GameId = (typeof GAME_IDS)[number]

// Tope de cordura: ningún juego legítimo se acerca; frena envíos manipulados
// (las Server Actions se pueden llamar con cualquier argumento).
export const MAX_POINTS = 10_000_000

export function isGameId(game: unknown): game is GameId {
  return typeof game === 'string' && (GAME_IDS as readonly string[]).includes(game)
}

export async function getLeaderboard(game: GameId) {
  if (!isGameId(game)) return []
  return prisma.score.findMany({
    where: { game },
    orderBy: { points: 'desc' },
    take: 10,
    include: { user: { select: { name: true } } },
  })
}

export async function getUserScores(userId: string) {
  const best = await prisma.score.groupBy({
    by: ['game'],
    where: { userId },
    _max: { points: true },
  })
  const results: Record<string, number> = Object.fromEntries(GAME_IDS.map(g => [g, 0]))
  for (const row of best) results[row.game] = row._max.points ?? 0
  return results
}
