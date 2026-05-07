'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export type GameId = 'hangman' | 'memory' | 'aventura' | 'mastermind' | 'wordle' | 'mates-rapidas' | 'laberinto' | 'anagramas'

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
  const games: GameId[] = ['hangman', 'memory', 'aventura', 'mastermind', 'wordle', 'mates-rapidas', 'laberinto', 'anagramas']
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
