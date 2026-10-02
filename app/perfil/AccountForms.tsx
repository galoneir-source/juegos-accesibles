'use client'

import { useActionState, useEffect, useRef } from 'react'
import { changePassword, deleteAccount } from '@/app/actions/account'
import { announceAssertive, announcePolite } from '@/lib/announce'

const INPUT =
  'w-full px-4 py-2.5 rounded bg-[#1a1a1a] border border-[#444] text-[#f0f0f0] text-base focus:outline-none focus:ring-2 focus:ring-[#ffd700]'
const ERROR = 'mb-4 p-3 rounded bg-[#3a1a1a] border border-[#ef4444] text-[#ef4444] text-sm'
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#ffd700] focus-visible:ring-offset-2 focus-visible:ring-offset-black'

export default function AccountForms() {
  const [pwState, pwAction, pwPending] = useActionState(changePassword, undefined)
  const [delState, delAction, delPending] = useActionState(deleteAccount, undefined)
  const pwForm = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (pwState?.error) announceAssertive(`Error: ${pwState.error}`)
    if (pwState?.success) {
      announcePolite('Contraseña cambiada.')
      pwForm.current?.reset()
    }
  }, [pwState])

  useEffect(() => {
    if (delState?.error) announceAssertive(`Error: ${delState.error}`)
  }, [delState])

  return (
    <>
      <section aria-labelledby="cambiar-contrasena" className="mt-12">
        <h3 id="cambiar-contrasena" className="text-base font-bold text-[#ffd700] mb-4">
          Cambiar contraseña
        </h3>

        {pwState?.error && <p role="alert" className={ERROR}>{pwState.error}</p>}
        {pwState?.success && (
          <p role="status" className="mb-4 p-3 rounded bg-[#1a3a1a] border border-[#22c55e] text-[#22c55e] text-sm">
            Contraseña cambiada.
          </p>
        )}

        <form ref={pwForm} action={pwAction} className="space-y-5">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium mb-1">
              Contraseña actual
            </label>
            <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required className={INPUT} />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium mb-1">
              Contraseña nueva
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              className={INPUT}
              aria-describedby="newPassword-hint"
            />
            <span id="newPassword-hint" className="text-xs text-[#999] mt-1 block">
              Mínimo 6 caracteres
            </span>
          </div>
          <button
            type="submit"
            disabled={pwPending}
            aria-busy={pwPending}
            className={`px-5 py-2.5 rounded bg-[#ffd700] text-black font-bold text-base hover:bg-[#ffec6e] disabled:opacity-50 cursor-pointer transition-colors ${FOCUS_RING}`}
          >
            {pwPending ? 'Cambiando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </section>

      <section aria-labelledby="eliminar-cuenta" className="mt-12">
        <h3 id="eliminar-cuenta" className="text-base font-bold text-[#ffd700] mb-4">
          Eliminar cuenta
        </h3>
        <p id="eliminar-aviso" className="text-sm text-[#999] mb-4">
          Se borrarán tu nombre, tu correo, tu contraseña y todas tus puntuaciones. No se puede deshacer.
        </p>

        {delState?.error && <p role="alert" className={ERROR}>{delState.error}</p>}

        <form action={delAction} className="space-y-5">
          <div>
            <label htmlFor="deletePassword" className="block text-sm font-medium mb-1">
              Contraseña, para confirmar
            </label>
            <input id="deletePassword" name="password" type="password" autoComplete="current-password" required className={INPUT} />
          </div>
          <button
            type="submit"
            disabled={delPending}
            aria-busy={delPending}
            aria-describedby="eliminar-aviso"
            className={`px-5 py-2.5 rounded bg-[#ef4444] text-white font-bold text-base hover:bg-[#dc2626] disabled:opacity-50 cursor-pointer transition-colors ${FOCUS_RING}`}
          >
            {delPending ? 'Eliminando...' : 'Eliminar mi cuenta'}
          </button>
        </form>
      </section>
    </>
  )
}
