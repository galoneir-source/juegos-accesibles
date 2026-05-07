'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { registerUser } from '@/app/actions/auth'
import { announceAssertive, announcePolite } from '@/lib/announce'

export default function RegisterPage() {
  const router = useRouter()
  const [state, action, pending] = useActionState(registerUser, undefined)

  useEffect(() => {
    if (state?.error) announceAssertive(`Error: ${state.error}`)
    if (state?.success) {
      announcePolite('Cuenta creada. Redirigiendo al inicio de sesión.')
      router.push('/login?registered=1')
    }
  }, [state, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <main id="main-content" className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[#ffd700] mb-6">Crear cuenta</h1>

        {state?.error && (
          <p role="alert" className="mb-4 p-3 rounded bg-[#3a1a1a] border border-[#ef4444] text-[#ef4444] text-sm">
            {state.error}
          </p>
        )}

        <form action={action} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Nombre
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              className="w-full px-4 py-2.5 rounded bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] text-base focus:outline-none focus:ring-2 focus:ring-[#ffd700]"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full px-4 py-2.5 rounded bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] text-base focus:outline-none focus:ring-2 focus:ring-[#ffd700]"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              className="w-full px-4 py-2.5 rounded bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] text-base focus:outline-none focus:ring-2 focus:ring-[#ffd700]"
              aria-describedby="password-hint"
            />
            <span id="password-hint" className="text-xs text-[#888] mt-1 block">
              Mínimo 6 caracteres
            </span>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full py-3 rounded bg-[#ffd700] text-black font-bold text-base hover:bg-[#ffec6e] disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#ffd700] focus-visible:ring-offset-2 focus-visible:ring-offset-black transition-colors"
            aria-busy={pending}
          >
            {pending ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <p className="mt-6 text-sm text-[#888] text-center">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-[#ffd700] underline hover:text-white">
            Inicia sesión
          </Link>
        </p>

        <p className="mt-3 text-sm text-center">
          <Link href="/" className="text-[#888] hover:text-white underline">
            ← Volver al lobby
          </Link>
        </p>
      </main>
    </div>
  )
}
