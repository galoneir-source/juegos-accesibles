'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { resetPassword } from '@/app/actions/password-reset'
import { announceAssertive, announcePolite } from '@/lib/announce'

export default function ResetForm({ token }: { token: string }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(resetPassword, undefined)

  useEffect(() => {
    if (state?.error) announceAssertive(`Error: ${state.error}`)
    if (state?.success) {
      announcePolite('Contraseña cambiada. Redirigiendo al inicio de sesión.')
      router.push('/login?reset=1')
    }
  }, [state, router])

  if (state?.success) {
    return (
      <p role="status" className="mb-4 p-3 rounded bg-[#1a3a1a] border border-[#22c55e] text-[#22c55e] text-sm">
        Contraseña cambiada.{' '}
        <Link href="/login?reset=1" className="underline">
          Inicia sesión
        </Link>
        .
      </p>
    )
  }

  return (
    <>
      {state?.error && (
        <p role="alert" className="mb-4 p-3 rounded bg-[#3a1a1a] border border-[#ef4444] text-[#ef4444] text-sm">
          {state.error}
        </p>
      )}

      <form action={action} className="space-y-5">
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">
            Contraseña nueva
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            aria-describedby="password-hint"
            className="w-full px-4 py-2.5 rounded bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] text-base focus:outline-none focus:ring-2 focus:ring-[#ffd700]"
          />
          <span id="password-hint" className="text-xs text-[#999] mt-1 block">
            Mínimo 6 caracteres
          </span>
        </div>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="w-full py-3 rounded bg-[#ffd700] text-black font-bold text-base hover:bg-[#ffec6e] disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#ffd700] focus-visible:ring-offset-2 focus-visible:ring-offset-black transition-colors"
        >
          {pending ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </form>
    </>
  )
}
