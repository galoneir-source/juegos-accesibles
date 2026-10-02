import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getLeaderboards } from '@/lib/scores'

export const metadata: Metadata = {
  title: 'Tabla de líderes',
  robots: { index: false, follow: true },
}

export default async function TablaLideresPage() {
  // proxy.ts ya protege esta ruta; se comprueba también aquí por si el
  // middleware se salta (Next.js ha tenido varios fallos de ese tipo).
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const boards = await getLeaderboards()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
        <h1 className="text-xl font-bold text-[#ffd700]">Tabla de Líderes</h1>
        <Link href="/" className="text-[#ffd700] underline hover:text-white text-sm">← Lobby</Link>
      </header>

      <main id="main-content" className="flex-1 max-w-2xl mx-auto w-full px-6 py-10 space-y-12">
        {boards.length === 0 && (
          <p className="text-[#999] text-sm">Aún no hay puntuaciones registradas.</p>
        )}
        {boards.map(({ id, label, entries }) => (
          <section key={id} aria-labelledby={`title-${id}`}>
            <h2 id={`title-${id}`} className="text-lg font-bold text-[#ffd700] mb-4">{label}</h2>
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
                  <tr key={e.userId} className="border-b border-[#222]">
                    <td className="py-2.5 text-[#999] text-sm">{i + 1}</td>
                    <td className="py-2.5">{e.name}</td>
                    <td className="py-2.5 text-right font-mono text-[#ffd700] font-bold">{e.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </main>
    </div>
  )
}
