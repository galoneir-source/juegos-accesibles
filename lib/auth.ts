import { createHash } from 'node:crypto'
import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './db'
import { authConfig } from './auth.config'
import { clientIp, hit } from './rate-limit'

const LOGIN_WINDOW_MS = 15 * 60 * 1000

// Huella de la contraseña que se guarda en el token de sesión. Si la contraseña
// cambia (o la cuenta se elimina), los tokens emitidos antes dejan de valer:
// así cambiar la contraseña cierra las sesiones abiertas en otros dispositivos.
function passwordVersion(passwordHash: string) {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16)
}

export class TooManyAttempts extends CredentialsSignin {
  code = 'too_many_attempts'
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      // El límite va aquí y no en loginUser: el endpoint de Auth.js
      // (/api/auth/callback/credentials) también llama a authorize.
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null
        const email = String(credentials.email).trim().toLowerCase()
        const ip = clientIp(request.headers)
        if (!hit(`login:ip:${ip}`, 30, LOGIN_WINDOW_MS) || !hit(`login:email:${email}`, 10, LOGIN_WINDOW_MS)) {
          throw new TooManyAttempts()
        }
        const user = await prisma.user.findUnique({
          where: { email },
        })
        if (!user) return null
        const valid = await bcrypt.compare(credentials.password as string, user.password)
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    // Se ejecuta en cada comprobación de sesión: una consulta por clave
    // primaria a la base de datos local.
    async jwt({ token, user }) {
      if (user) token.id = user.id
      if (typeof token.id !== 'string') return token

      const current = await prisma.user.findUnique({ where: { id: token.id }, select: { password: true } })
      if (!current) return null // cuenta eliminada
      const version = passwordVersion(current.password)
      // Al iniciar sesión, y en los tokens anteriores a este cambio (sin
      // huella), se anota la actual; en el resto debe coincidir.
      if (user || token.pv === undefined) token.pv = version
      else if (token.pv !== version) return null
      return token
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})
