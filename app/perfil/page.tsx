import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getUserScores, SCORE_GAMES } from '@/lib/scores'
import AccountForms from './AccountForms'

export const metadata: Metadata = {
  title: 'Mi perfil',
  robots: { index: false, follow: true },
}

export default async function PerfilPage({ searchParams }: { searchParams: Promise<{ cambiada?: string }> }) {
  const { cambiada } = await searchParams
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // La sesión (JWT) sobrevive en otros dispositivos a la eliminación de la
  // cuenta: si el usuario ya no existe, no se muestra el perfil. El nombre y el
  // correo se leen de la base de datos, no del token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  })
  if (!user) redirect('/login')

  const scores = await getUserScores(session.user.id)
  const played = SCORE_GAMES.filter((game) => scores[game.id] > 0)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
        <h1 className="text-xl font-bold text-[#ffd700]">Mi Perfil</h1>
        <Link href="/" className="text-[#ffd700] underline hover:text-white text-sm">← Lobby</Link>
      </header>

      <main id="main-content" className="flex-1 max-w-xl mx-auto w-full px-6 py-10">
        <h2 className="text-lg font-semibold mb-1">{user.name}</h2>
        <p className="text-sm text-[#888] mb-8">{user.email}</p>

        <h3 className="text-base font-bold text-[#ffd700] mb-4">Mejores puntuaciones</h3>
        {played.length === 0 ? (
          <p className="text-[#999] text-sm">
            Aún no has guardado ninguna puntuación. Al terminar una partida, pulsa «Guardar puntuación» para que aparezca aquí.
          </p>
        ) : (
          <table className="w-full border-collapse" aria-label="Tabla de mejores puntuaciones personales">
            <thead>
              <tr className="border-b border-[#333]">
                <th scope="col" className="text-left py-2 text-sm text-[#888] font-normal">Juego</th>
                <th scope="col" className="text-right py-2 text-sm text-[#888] font-normal">Mejor puntuación</th>
              </tr>
            </thead>
            <tbody>
              {played.map(({ id, label }) => (
                <tr key={id} className="border-b border-[#222]">
                  <td className="py-3 text-base">{label}</td>
                  <td className="py-3 text-right font-mono text-[#ffd700] text-lg">{scores[id]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-6 text-sm text-center">
          <Link href="/tabla-lideres" className="text-[#ffd700] underline hover:text-white">
            Ver tabla de líderes global →
          </Link>
        </p>

        <AccountForms name={user.name} email={user.email} passwordChanged={Boolean(cambiada)} />

        <p className="mt-12 text-sm text-center">
          <Link href="/privacidad" className="text-[#ffd700] underline hover:text-white">
            Política de privacidad
          </Link>
        </p>
      </main>
    </div>
  )
}
