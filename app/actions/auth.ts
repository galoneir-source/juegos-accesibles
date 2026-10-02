'use server'

import bcrypt from 'bcryptjs'
import { headers } from 'next/headers'
import { AuthError, CredentialsSignin } from 'next-auth'
import { prisma } from '@/lib/db'
import { signIn } from '@/lib/auth'
import { clientIp, hit } from '@/lib/rate-limit'

const MAX_NAME = 50
const MAX_EMAIL = 254
const MAX_PASSWORD = 72 // bcrypt ignora lo que pase de 72 bytes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function registerUser(_state: unknown, formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string

  if (!name || !email || !password || password.length < 6) {
    return { error: 'Por favor completa todos los campos. La contraseña debe tener al menos 6 caracteres.' }
  }
  // La política de privacidad fija la edad mínima en 14 años (la edad a la
  // que se puede consentir el tratamiento de datos en España).
  if (formData.get('age') !== 'on') {
    return { error: 'Para crear una cuenta debes confirmar que tienes 14 años o más.' }
  }
  if (name.length > MAX_NAME) {
    return { error: `El nombre no puede tener más de ${MAX_NAME} caracteres.` }
  }
  if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
    return { error: 'Introduce un correo electrónico válido.' }
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) {
    return { error: 'La contraseña es demasiado larga.' }
  }
  if (!hit(`register:${clientIp(await headers())}`, 5, 60 * 60 * 1000)) {
    return { error: 'Demasiados registros desde esta conexión. Inténtalo de nuevo en una hora.' }
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return { error: 'Ya existe una cuenta con ese correo electrónico.' }
  }

  const hashed = await bcrypt.hash(password, 10)
  await prisma.user.create({ data: { name, email, password: hashed } })

  return { success: true }
}

export async function loginUser(_state: unknown, formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string
  const raw = formData.get('callbackUrl') as string | null
  const redirectTo = raw && raw.startsWith('/') ? raw : '/'

  try {
    await signIn('credentials', { email, password, redirectTo })
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === 'too_many_attempts') {
      return { error: 'Demasiados intentos. Espera 15 minutos y vuelve a probar.' }
    }
    if (error instanceof AuthError) {
      return { error: 'Correo o contraseña incorrectos.' }
    }
    throw error
  }
}
