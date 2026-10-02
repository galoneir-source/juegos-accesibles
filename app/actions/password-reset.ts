'use server'

import bcrypt from 'bcryptjs'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { SITE_NAME, SITE_URL } from '@/lib/games'
import { sendMail } from '@/lib/mail'
import { createResetToken, RESET_MINUTES, verifyResetToken } from '@/lib/password-reset'
import { clientIp, hit } from '@/lib/rate-limit'

type Result = { error?: string; success?: boolean }

const HOUR = 60 * 60 * 1000
const MIN_PASSWORD = 6
const MAX_PASSWORD = 72 // bcrypt ignora lo que pase de 72 bytes

export async function requestPasswordReset(_state: unknown, formData: FormData): Promise<Result> {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  if (!email) return { error: 'Escribe tu correo electrónico.' }

  if (!hit(`reset:ip:${clientIp(await headers())}`, 5, HOUR)) {
    return { error: 'Demasiadas peticiones desde esta conexión. Inténtalo de nuevo en una hora.' }
  }

  // La respuesta es la misma exista o no la cuenta. El límite por correo (3 a
  // la hora) se aplica en silencio, para que nadie pueda llenar un buzón ajeno.
  const user = await prisma.user.findUnique({ where: { email } })
  if (user && hit(`reset:email:${email}`, 3, HOUR)) {
    const link = `${process.env.NEXTAUTH_URL || SITE_URL}/restablecer?token=${encodeURIComponent(createResetToken(user))}`
    // Sin await: el envío no retrasa la respuesta (ni delata si la cuenta existe).
    sendMail({
      to: user.email,
      subject: `Restablecer tu contraseña de ${SITE_NAME}`,
      text: [
        `Hola, ${user.name}:`,
        '',
        `Alguien ha pedido restablecer la contraseña de tu cuenta de ${SITE_NAME} (juegos.dvillalon.com).`,
        'Si has sido tú, abre este enlace y elige una contraseña nueva:',
        '',
        link,
        '',
        `El enlace caduca en ${RESET_MINUTES} minutos y solo se puede usar una vez.`,
        'Si no lo has pedido tú, no hagas nada: tu contraseña sigue siendo la misma.',
        '',
      ].join('\n'),
    }).catch((error) => console.error('No se pudo enviar el correo de recuperación:', error))
  }

  return { success: true }
}

export async function resetPassword(_state: unknown, formData: FormData): Promise<Result> {
  const password = formData.get('password')
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return { error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` }
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) {
    return { error: 'La contraseña es demasiado larga.' }
  }
  if (!hit(`reset:use:${clientIp(await headers())}`, 10, 15 * 60 * 1000)) {
    return { error: 'Demasiados intentos. Espera 15 minutos y vuelve a probar.' }
  }

  const userId = await verifyResetToken(formData.get('token'))
  if (!userId) {
    return { error: 'El enlace no es válido o ha caducado. Pide uno nuevo.' }
  }

  await prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(password, 10) } })
  return { success: true }
}
