import { prisma } from './db'
import { GAMES } from './games'

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

// En cuatro juegos el identificador con el que se guardan las puntuaciones no
// coincide con el `id` del catálogo (lib/games.ts).
const SCORE_ID_BY_CATALOG_ID: Record<string, GameId> = {
  'memory-sonidos': 'memory',
  'aventura-texto': 'aventura',
  'laberinto-audio': 'laberinto',
  'pong-audio': 'pong',
}

// Juegos que guardan puntuación, con su nombre y en el orden del catálogo.
// Lo usan el perfil y la tabla de líderes, para que un juego nuevo aparezca en
// ambos sin tener que añadirlo a mano. Breakout y Mazmorra Oscura (HTML
// estáticos) no guardan puntuación y quedan fuera.
export const SCORE_GAMES: { id: GameId; label: string }[] = GAMES.flatMap((game) => {
  const id = SCORE_ID_BY_CATALOG_ID[game.id] ?? game.id
  return isGameId(id) ? [{ id, label: game.label }] : []
})

const LEADERBOARD_SIZE = 10

// Tabla de líderes de todos los juegos que tienen alguna puntuación: los diez
// mejores jugadores de cada uno, contando solo la mejor marca de cada jugador.
export async function getLeaderboards() {
  const played = await prisma.score.groupBy({ by: ['game'] })
  const playedIds = new Set(played.map((row) => row.game))
  const games = SCORE_GAMES.filter((game) => playedIds.has(game.id))

  const tops = await Promise.all(
    games.map((game) =>
      prisma.score.groupBy({
        by: ['userId'],
        where: { game: game.id },
        _max: { points: true },
        orderBy: { _max: { points: 'desc' } },
        take: LEADERBOARD_SIZE,
      })
    )
  )

  const userIds = [...new Set(tops.flat().map((row) => row.userId))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  })
  const names = new Map(users.map((user) => [user.id, user.name]))

  return games.map((game, i) => ({
    ...game,
    entries: tops[i].map((row) => ({
      userId: row.userId,
      name: names.get(row.userId) ?? '',
      points: row._max.points ?? 0,
    })),
  }))
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
