import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getUserScores } from '@/app/actions/scores'

const GAME_LABELS: Record<string, string> = {
  hangman: 'Ahorcado',
  memory: 'Memory de Sonidos',
  aventura: 'Aventura de Texto',
}

export default async function PerfilPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const scores = await getUserScores(session.user.id)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
        <h1 className="text-xl font-bold text-[#ffd700]">Mi Perfil</h1>
        <Link href="/" className="text-[#ffd700] underline hover:text-white text-sm">← Lobby</Link>
      </header>

      <main id="main-content" className="flex-1 max-w-xl mx-auto w-full px-6 py-10">
        <h2 className="text-lg font-semibold mb-1">{session.user.name}</h2>
        <p className="text-sm text-[#888] mb-8">{session.user.email}</p>

        <h3 className="text-base font-bold text-[#ffd700] mb-4">Mejores puntuaciones</h3>
        <table className="w-full border-collapse" aria-label="Tabla de mejores puntuaciones personales">
          <thead>
            <tr className="border-b border-[#333]">
              <th scope="col" className="text-left py-2 text-sm text-[#888] font-normal">Juego</th>
              <th scope="col" className="text-right py-2 text-sm text-[#888] font-normal">Mejor puntuación</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(GAME_LABELS).map(([id, label]) => (
              <tr key={id} className="border-b border-[#222]">
                <td className="py-3 text-base">{label}</td>
                <td className="py-3 text-right font-mono text-[#ffd700] text-lg">
                  {scores[id] > 0 ? scores[id] : <span className="text-[#555] text-sm">Sin jugar</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-6 text-sm text-center">
          <Link href="/tabla-lideres" className="text-[#ffd700] underline hover:text-white">
            Ver tabla de líderes global →
          </Link>
        </p>
      </main>
    </div>
  )
}
