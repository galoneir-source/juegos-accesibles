'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { auth, signIn, signOut } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hit } from '@/lib/rate-limit'

type Result = { error?: string; success?: boolean }

const MAX_NAME = 50
const MAX_EMAIL = 254
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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

// Cambia el nombre y el correo. El correo es el identificador de inicio de
// sesión, así que cambiarlo exige la contraseña actual; el nombre solo, no.
// El sitio no envía correos: el nuevo no se verifica, igual que en el registro.
export async function updateProfile(_state: unknown, formData: FormData): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Debes iniciar sesión.' }
  const userId = session.user.id

  const name = (formData.get('name') as string | null)?.trim()
  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  if (!name || !email) return { error: 'El nombre y el correo no pueden quedar vacíos.' }
  if (name.length > MAX_NAME) {
    return { error: `El nombre no puede tener más de ${MAX_NAME} caracteres.` }
  }
  if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
    return { error: 'Introduce un correo electrónico válido.' }
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!user) return { error: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.' }

  if (email !== user.email) {
    const failed = await checkPassword(userId, formData.get('currentPassword'))
    if (failed) return failed
    const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (taken) return { error: 'Ya existe una cuenta con ese correo electrónico.' }
  }

  await prisma.user.update({ where: { id: userId }, data: { name, email } })
  revalidatePath('/')
  revalidatePath('/perfil')
  revalidatePath('/tabla-lideres')
  return { success: true }
}

export async function changePassword(_state: unknown, formData: FormData): Promise<Result | undefined> {
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

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { password: await bcrypt.hash(next, 10) },
  })
  // El cambio invalida todas las sesiones de la cuenta (ver jwt en lib/auth.ts),
  // también esta: se vuelve a iniciar aquí para que solo se cierren las demás.
  // Termina en una redirección (signIn no retorna) porque esta petición llegó
  // con la cookie antigua y ya no podría volver a pintar el perfil.
  await signIn('credentials', { email: user.email, password: next, redirectTo: '/perfil?cambiada=1' })
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
