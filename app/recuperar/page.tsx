'use client'

import { useActionState, useEffect } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from '@/app/actions/password-reset'
import { announceAssertive, announcePolite } from '@/lib/announce'

const SENT = 'Si hay una cuenta con ese correo, te hemos enviado un enlace para elegir una contraseña nueva. Caduca en una hora; si no lo ves, mira en la carpeta de correo no deseado.'

export default function RecuperarPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined)

  useEffect(() => {
    if (state?.error) announceAssertive(`Error: ${state.error}`)
    if (state?.success) announcePolite(SENT)
  }, [state])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <main id="main-content" className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[#ffd700] mb-6">Recuperar contraseña</h1>

        {state?.error && (
          <p role="alert" className="mb-4 p-3 rounded bg-[#3a1a1a] border border-[#ef4444] text-[#ef4444] text-sm">
            {state.error}
          </p>
        )}

        {state?.success ? (
          <p role="status" className="mb-4 p-3 rounded bg-[#1a3a1a] border border-[#22c55e] text-[#22c55e] text-sm">
            {SENT}
          </p>
        ) : (
          <form action={action} className="space-y-5">
            <p id="recuperar-ayuda" className="text-sm text-[#999]">
              Escribe el correo con el que te registraste y te enviaremos un enlace para elegir una contraseña nueva.
            </p>
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
                maxLength={254}
                aria-describedby="recuperar-ayuda"
                className="w-full px-4 py-2.5 rounded bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] text-base focus:outline-none focus:ring-2 focus:ring-[#ffd700]"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="w-full py-3 rounded bg-[#ffd700] text-black font-bold text-base hover:bg-[#ffec6e] disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#ffd700] focus-visible:ring-offset-2 focus-visible:ring-offset-black transition-colors"
            >
              {pending ? 'Enviando...' : 'Enviar enlace'}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-center">
          <Link href="/login" className="text-[#ffd700] underline hover:text-white">
            Volver a iniciar sesión
          </Link>
        </p>
      </main>
    </div>
  )
}
