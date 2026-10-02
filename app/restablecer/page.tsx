import Link from 'next/link'
import ResetForm from './ResetForm'

export default async function RestablecerPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <main id="main-content" className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[#ffd700] mb-6">Restablecer contraseña</h1>

        {typeof token === 'string' && token ? (
          <ResetForm token={token} />
        ) : (
          <p role="alert" className="mb-4 p-3 rounded bg-[#3a1a1a] border border-[#ef4444] text-[#ef4444] text-sm">
            Falta el enlace de recuperación. Ábrelo desde el correo que te enviamos o pide uno nuevo.
          </p>
        )}

        <p className="mt-6 text-sm text-center">
          <Link href="/recuperar" className="text-[#ffd700] underline hover:text-white">
            Pedir un enlace nuevo
          </Link>
        </p>
      </main>
    </div>
  )
}
