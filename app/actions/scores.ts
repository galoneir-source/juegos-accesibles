'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export type GameId = 'hangman' | 'memory' | 'aventura' | 'aventura-espacio' | 'aventura-magica' | 'casa-encantada' | 'mastermind' | 'wordle' | 'mates-rapidas' | 'laberinto' | 'anagramas' | 'blackjack' | 'pong' | 'batalla-naval' | 'penaltis' | 'tres-en-raya' | 'gorillas' | 'misterio' | 'secuencias' | 'conecta4' | 'generala' | '2048' | 'bingo' | 'space-invaders' | 'tetris' | 'frogger' | 'asteroids' | 'buscaminas' | 'sokoban' | 'tragaperras' | 'quince' | 'solitario' | 'pirata' | 'egipto' | 'samurai' | 'vikingos' | 'abismo' | 'zona' | 'castillo' | 'corp' | 'templo' | 'inca' | 'grecia' | 'bagdad' | 'china' | 'rusia' | 'gin-rummy' | 'poker' | 'truco' | 'parchis'

export async function saveScore(game: GameId, points: number) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Debes iniciar sesión para guardar puntuaciones.' }

  await prisma.score.create({
    data: { userId: session.user.id, game, points },
  })

  revalidatePath('/perfil')
  revalidatePath('/tabla-lideres')
  return { ok: true }
}

export async function getLeaderboard(game: GameId) {
  return prisma.score.findMany({
    where: { game },
    orderBy: { points: 'desc' },
    take: 10,
    include: { user: { select: { name: true } } },
  })
}

export async function getUserScores(userId: string) {
  const games: GameId[] = ['hangman', 'memory', 'aventura', 'aventura-espacio', 'aventura-magica', 'casa-encantada', 'mastermind', 'wordle', 'mates-rapidas', 'laberinto', 'anagramas', 'blackjack', 'pong', 'batalla-naval', 'penaltis', 'tres-en-raya', 'gorillas', 'misterio', 'secuencias', 'conecta4', 'generala', '2048', 'bingo', 'space-invaders', 'tetris', 'frogger', 'asteroids', 'buscaminas', 'sokoban', 'tragaperras', 'quince', 'solitario', 'pirata', 'egipto', 'samurai', 'vikingos', 'abismo', 'zona', 'castillo', 'corp', 'templo', 'inca', 'grecia', 'bagdad', 'china', 'rusia', 'gin-rummy', 'poker', 'truco', 'parchis']
  const results: Record<string, number> = {}
  for (const game of games) {
    const best = await prisma.score.findFirst({
      where: { userId, game },
      orderBy: { points: 'desc' },
    })
    results[game] = best?.points ?? 0
  }
  return results
}
