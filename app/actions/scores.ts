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

  // La sesión (JWT) sigue siendo válida en otros dispositivos después de
  // eliminar la cuenta; sin esta comprobación el create fallaría con un 500.
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } })
  if (!user) return { error: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.' }

  await prisma.score.create({
    data: { userId: user.id, game, points },
  })

  revalidatePath('/perfil')
  revalidatePath('/tabla-lideres')
  return { ok: true }
}
