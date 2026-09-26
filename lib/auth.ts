import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './db'
import { authConfig } from './auth.config'
import { clientIp, hit } from './rate-limit'

const LOGIN_WINDOW_MS = 15 * 60 * 1000

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
    jwt({ token, user }) {
      if (user) token.id = user.id
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
