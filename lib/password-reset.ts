import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from './db'

// Enlaces para restablecer la contraseña, sin tabla en la base de datos: el
// token lleva el id del usuario y la caducidad, firmados con una clave derivada
// del secreto de la sesión. La firma incluye el hash actual de la contraseña,
// así que el enlace deja de valer en cuanto se usa (o si la contraseña cambia
// por cualquier otra vía).
export const RESET_MINUTES = 60

function key() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('Falta AUTH_SECRET / NEXTAUTH_SECRET')
  return createHmac('sha256', secret).update('password-reset').digest()
}

function sign(userId: string, expires: number, passwordHash: string) {
  return createHmac('sha256', key()).update(`${userId}.${expires}.${passwordHash}`).digest('base64url')
}

export function createResetToken(user: { id: string; password: string }) {
  const expires = Date.now() + RESET_MINUTES * 60 * 1000
  return `${user.id}.${expires}.${sign(user.id, expires, user.password)}`
}

/** Devuelve el id del usuario si el token es válido y no ha caducado. */
export async function verifyResetToken(token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || token.length > 300) return null
  const [userId, expiresRaw, signature, ...rest] = token.split('.')
  const expires = Number(expiresRaw)
  if (!userId || !signature || rest.length || !Number.isSafeInteger(expires) || expires < Date.now()) return null

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, password: true } })
  if (!user) return null

  const expected = Buffer.from(sign(user.id, expires, user.password))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return user.id
}
