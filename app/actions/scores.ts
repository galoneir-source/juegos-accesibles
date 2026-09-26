'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isGameId, MAX_POINTS, type GameId } from '@/lib/scores'

export type { GameId }

export async function saveScore(game: GameId, points: number) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Debes iniciar sesión para guardar puntuaciones.' }
  if (!isGameId(game) || !Number.isSafeInteger(points) || points < 0 || points > MAX_POINTS) {
    return { error: 'Puntuación no válida.' }
  }

  await prisma.score.create({
    data: { userId: session.user.id, game, points },
  })

  revalidatePath('/perfil')
  revalidatePath('/tabla-lideres')
  return { ok: true }
}
