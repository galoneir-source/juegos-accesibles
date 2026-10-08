'use client'

import { useActionState, useEffect } from 'react'
import Link from 'next/link'
import { loginUser } from '@/app/actions/auth'
import { announceAssertive, announcePolite } from '@/lib/announce'

type Props = {
  registered: boolean
  deleted: boolean
  reset: boolean
  callbackUrl: string
}

export default function LoginForm({ registered, deleted, reset, callbackUrl }: Props) {
  const [state, action, pending] = useActionState(loginUser, undefined)

  useEffect(() => {
    if (registered) announcePolite('Cuenta creada con éxito. Por favor inicia sesión.')
  }, [registered])

  useEffect(() => {
    if (deleted) announcePolite('Tu cuenta y tus puntuaciones se han eliminado.')
  }, [deleted])

  useEffect(() => {
    if (reset) announcePolite('Contraseña cambiada. Ya puedes iniciar sesión.')
  }, [reset])

  useEffect(() => {
    if (state?.error) announceAssertive(`Error: ${state.error}`)
  }, [state])

  return (
    <>
      {registered && (
        <p role="status" className="mb-4 p-3 rounded bg-[#1a3a1a] border border-[#22c55e] text-[#22c55e] text-sm">
          Cuenta creada con éxito. Por favor inicia sesión.
        </p>
      )}

      {deleted && (
        <p role="status" className="mb-4 p-3 rounded bg-[#1a3a1a] border border-[#22c55e] text-[#22c55e] text-sm">
          Tu cuenta y tus puntuaciones se han eliminado.
        </p>
      )}

      {reset && (
        <p role="status" className="mb-4 p-3 rounded bg-[#1a3a1a] border border-[#22c55e] text-[#22c55e] text-sm">
          Contraseña cambiada. Ya puedes iniciar sesión.
        </p>
      )}

      {state?.error && (
        <p role="alert" className="mb-4 p-3 rounded bg-[#3a1a1a] border border-[#ef4444] text-[#ef4444] text-sm">
          {state.error}
        </p>
      )}

      <form action={action} className="space-y-5">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
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
            aria-describedby="email-hint"
          />
          <span id="email-hint" className="sr-only">Ingresa tu correo electrónico</span>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full px-4 py-2.5 rounded bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] text-base focus:outline-none focus:ring-2 focus:ring-[#ffd700]"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 rounded bg-[#ffd700] text-black font-bold text-base hover:bg-[#ffec6e] disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#ffd700] focus-visible:ring-offset-2 focus-visible:ring-offset-black transition-colors"
          aria-busy={pending}
        >
          {pending ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </button>
      </form>

      <p className="mt-6 text-sm text-center">
        <Link href="/recuperar" className="text-[#ffd700] underline hover:text-white">
          ¿Has olvidado tu contraseña?
        </Link>
      </p>

      <p className="mt-3 text-sm text-[#888] text-center">
        ¿No tienes cuenta?{' '}
        <Link href="/register" className="text-[#ffd700] underline hover:text-white">
          Regístrate
        </Link>
      </p>

      <p className="mt-3 text-sm text-center">
        <Link href="/" className="text-[#888] hover:text-white underline">
          ← Volver al lobby
        </Link>
      </p>
    </>
  )
}
