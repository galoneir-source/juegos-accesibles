'use server'

import bcrypt from 'bcryptjs'
import { auth, signOut } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hit } from '@/lib/rate-limit'

type Result = { error?: string; success?: boolean }

const MIN_PASSWORD = 6
const MAX_PASSWORD = 72 // bcrypt ignora lo que pase de 72 bytes
const ATTEMPTS = 10
const ATTEMPTS_WINDOW_MS = 15 * 60 * 1000

// Las dos acciones piden la contraseña actual: una sesión abierta en un equipo
// compartido no basta para cambiar la contraseña ni para borrar la cuenta.
async function checkPassword(userId: string, password: unknown): Promise<Result | null> {
  if (typeof password !== 'string' || !password) {
    return { error: 'Escribe tu contraseña actual.' }
  }
  if (!hit(`account:${userId}`, ATTEMPTS, ATTEMPTS_WINDOW_MS)) {
    return { error: 'Demasiados intentos. Espera 15 minutos y vuelve a probar.' }
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return { error: 'La contraseña actual no es correcta.' }
  }
  return null
}

export async function changePassword(_state: unknown, formData: FormData): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Debes iniciar sesión.' }

  const next = formData.get('newPassword')
  if (typeof next !== 'string' || next.length < MIN_PASSWORD) {
    return { error: `La contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres.` }
  }
  if (new TextEncoder().encode(next).length > MAX_PASSWORD) {
    return { error: 'La contraseña nueva es demasiado larga.' }
  }

  const failed = await checkPassword(session.user.id, formData.get('currentPassword'))
  if (failed) return failed

  await prisma.user.update({
    where: { id: session.user.id },
    data: { password: await bcrypt.hash(next, 10) },
  })
  return { success: true }
}

export async function deleteAccount(_state: unknown, formData: FormData): Promise<Result | undefined> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Debes iniciar sesión.' }
  const userId = session.user.id

  const failed = await checkPassword(userId, formData.get('password'))
  if (failed) return failed

  // Score no tiene borrado en cascada: primero las puntuaciones.
  await prisma.$transaction([
    prisma.score.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ])

  await signOut({ redirectTo: '/login?deleted=1' })
}
