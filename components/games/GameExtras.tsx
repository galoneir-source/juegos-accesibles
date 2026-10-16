import Link from 'next/link'
import { GAMES, gameJsonLd, relatedGames } from '@/lib/games'
import { GAME_GUIDES } from '@/lib/game-guides'

// Lo que el layout de cada juego añade a su página, renderizado en el
// servidor: los datos estructurados VideoGame, el texto sobre cómo se juega
// sin ver la pantalla (lib/game-guides.ts) y el bloque «Juegos similares», con
// otros juegos de la misma categoría.
export default function GameExtras({ slug }: { slug: string }) {
  const label = GAMES.find((g) => g.href === `/${slug}`)?.label
  const guide = GAME_GUIDES[slug]
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: gameJsonLd(slug) }} />
      {guide && (
        <section aria-labelledby="como-se-juega" className="px-6 py-8 border-t border-[#333]">
          <div className="max-w-2xl mx-auto space-y-4 leading-relaxed">
            <h2 id="como-se-juega" className="text-xl font-bold">
              {label}: cómo se juega sin ver la pantalla
            </h2>
            <p>{guide.como}</p>
            <h2 className="text-xl font-bold pt-2">Controles</h2>
            <p>{guide.controles}</p>
            {guide.progreso && (
              <>
                <h2 className="text-xl font-bold pt-2">Niveles y puntuación</h2>
                <p>{guide.progreso}</p>
              </>
            )}
          </div>
        </section>
      )}
      <nav aria-labelledby="juegos-similares" className="px-6 py-8 border-t border-[#333]">
        <div className="max-w-2xl mx-auto">
          <h2 id="juegos-similares" className="text-xl font-bold mb-4">
            Juegos similares
          </h2>
          <ul className="space-y-3" role="list">
            {relatedGames(slug).map((game) => (
              <li key={game.id}>
                <Link href={game.href} className="text-[#ffd700] underline hover:text-white">
                  {game.label}
                </Link>
                <span className="block text-sm text-[#999] mt-1">{game.desc}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <Link href="/" className="text-[#ffd700] underline hover:text-white">
              Ver todos los juegos
            </Link>
          </p>
        </div>
      </nav>
    </>
  )
}
