import Link from 'next/link'
import { getLeaderboard, type GameId } from '@/app/actions/scores'

const GAMES: { id: GameId; label: string }[] = [
  { id: 'hangman',       label: 'Ahorcado' },
  { id: 'memory',        label: 'Memory de Sonidos' },
  { id: 'aventura',      label: 'Aventura de Texto' },
  { id: 'mastermind',    label: 'Mastermind de Números' },
  { id: 'wordle',        label: 'Wordle' },
  { id: 'mates-rapidas', label: 'Matemáticas Rápidas' },
]

export default async function TablaLideresPage() {
  const boards = await Promise.all(
    GAMES.map(async g => ({ ...g, entries: await getLeaderboard(g.id) }))
  )

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
        <h1 className="text-xl font-bold text-[#ffd700]">Tabla de Líderes</h1>
        <Link href="/" className="text-[#ffd700] underline hover:text-white text-sm">← Lobby</Link>
      </header>

      <main id="main-content" className="flex-1 max-w-2xl mx-auto w-full px-6 py-10 space-y-12">
        {boards.map(({ id, label, entries }) => (
          <section key={id} aria-labelledby={`title-${id}`}>
            <h2 id={`title-${id}`} className="text-lg font-bold text-[#ffd700] mb-4">{label}</h2>
            {entries.length === 0 ? (
              <p className="text-[#555] text-sm">Aún no hay puntuaciones registradas.</p>
            ) : (
              <table className="w-full border-collapse" aria-label={`Tabla de líderes de ${label}`}>
                <thead>
                  <tr className="border-b border-[#333]">
                    <th scope="col" className="text-left py-2 text-sm text-[#888] font-normal w-8">#</th>
                    <th scope="col" className="text-left py-2 text-sm text-[#888] font-normal">Jugador</th>
                    <th scope="col" className="text-right py-2 text-sm text-[#888] font-normal">Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.id} className="border-b border-[#222]">
                      <td className="py-2.5 text-[#555] text-sm">{i + 1}</td>
                      <td className="py-2.5">{e.user.name}</td>
                      <td className="py-2.5 text-right font-mono text-[#ffd700] font-bold">{e.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </main>
    </div>
  )
}
