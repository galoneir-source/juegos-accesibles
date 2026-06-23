'use server'

import bcrypt from 'bcryptjs'
import { AuthError } from 'next-auth'
import { prisma } from '@/lib/db'
import { signIn } from '@/lib/auth'

export async function registerUser(_state: unknown, formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string

  if (!name || !email || !password || password.length < 6) {
    return { error: 'Por favor completa todos los campos. La contraseña debe tener al menos 6 caracteres.' }
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
    if (error instanceof AuthError) {
      return { error: 'Correo o contraseña incorrectos.' }
    }
    throw error
  }
}
