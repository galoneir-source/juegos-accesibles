import Link from 'next/link'
import { CATEGORIES, GAMES, SITE_URL, categoryById } from '@/lib/games'

type Game = (typeof GAMES)[number]
type Category = ReturnType<typeof categoryById>

// Reparte los juegos de la categoría en sus grupos (p. ej. las aventuras por
// ambientación). Falla si un juego no está en ningún grupo o está en dos, para
// que una aventura nueva sin grupo no desaparezca de la página sin avisar.
function groupGames(category: Category, games: Game[]) {
  if (!('groups' in category) || !category.groups) return null
  const listed = category.groups.flatMap((group) => group.ids)
  for (const game of games) {
    const times = listed.filter((id) => id === game.id).length
    if (times !== 1) throw new Error(`${game.id} está en ${times} grupos de ${category.id}`)
  }
  const byId = new Map(games.map((game) => [game.id, game]))
  return category.groups.map((group) => ({
    ...group,
    games: group.ids.map((id) => {
      const game = byId.get(id)
      if (!game) throw new Error(`Grupo ${group.id}: ${id} no es un juego de ${category.id}`)
      return game
    }),
  }))
}

function GameList({ games }: { games: Game[] }) {
  return (
    <ul className="space-y-4" role="list">
      {games.map((game) => (
        <li key={game.id}>
          <Link
            href={game.href}
            className="block p-5 rounded-lg border border-[#333] bg-[#111] hover:border-[#ffd700] hover:bg-[#1a1a1a] transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#ffd700] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            aria-describedby={`desc-${game.id}`}
          >
            <span className="block text-lg font-bold text-[#ffd700]">{game.label}</span>
            <span id={`desc-${game.id}`} className="block text-sm text-[#888] mt-1">
              {game.desc}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// Página de una categoría de juegos (/aventuras-de-texto, /juegos-de-cartas…):
// introducción propia, la lista de sus juegos y enlaces a las demás categorías.
export default function CategoryPage({ id }: { id: string }) {
  const category = categoryById(id)
  const games = GAMES.filter((game) => game.category === id)
  const url = `${SITE_URL}/${category.slug}`
  const groups = groupGames(category, games)

  // Datos estructurados: la lista de juegos y la ruta de migas. No es un script
  // ejecutable; se escapa "<" para que ningún texto pueda cerrar la etiqueta.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: category.title,
        description: category.meta,
        inLanguage: 'es',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: games.length,
          itemListElement: games.map((game, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: game.label,
            url: `${SITE_URL}${game.href}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Juegos Accesibles', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: category.label, item: url },
        ],
      },
    ],
  }).replace(/</g, '\\u003c')

  return (
    <div className="min-h-screen flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <header className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 px-6 py-4 border-b border-[#333]">
        <h1 className="text-xl sm:text-2xl font-bold text-[#ffd700]">{category.title}</h1>
        <Link href="/" className="text-[#ffd700] underline hover:text-white text-sm shrink-0">
          ← Todos los juegos
        </Link>
      </header>

      <main id="main-content" className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
        {category.intro.map((paragraph) => (
          <p key={paragraph} className="text-base mb-4 leading-relaxed">
            {paragraph}
          </p>
        ))}

        <section aria-labelledby="lista-juegos" className="mt-10">
          <h2 id="lista-juegos" className="text-xl font-bold mb-4">
            Los {games.length} juegos
          </h2>
          {groups ? (
            <>
              <nav aria-labelledby="ambientaciones" className="mb-8">
                <h3 id="ambientaciones" className="text-lg font-bold mb-2">
                  Por ambientación
                </h3>
                <ul className="space-y-2" role="list">
                  {groups.map((group) => (
                    <li key={group.id}>
                      <a href={`#${group.id}`} className="text-[#ffd700] underline hover:text-white">
                        {group.label} ({group.games.length})
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              {groups.map((group) => (
                <section key={group.id} aria-labelledby={group.id} className="mb-8">
                  <h3 id={group.id} tabIndex={-1} className="text-lg font-bold mb-4 scroll-mt-4">
                    {group.label}
                  </h3>
                  <GameList games={group.games} />
                </section>
              ))}
            </>
          ) : (
            <GameList games={games} />
          )}
        </section>

        <nav aria-labelledby="otras-categorias" className="mt-10">
          <h2 id="otras-categorias" className="text-xl font-bold mb-4">
            Otras categorías
          </h2>
          <ul className="space-y-2" role="list">
            {CATEGORIES.filter((c) => c.id !== id).map((c) => (
              <li key={c.id}>
                <Link href={`/${c.slug}`} className="text-[#ffd700] underline hover:text-white">
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>

      <footer className="px-6 py-4 border-t border-[#333] text-center text-sm text-[#999]">
        <p>
          Un proyecto de{' '}
          <a href="https://dvillalon.com/" className="text-[#ffd700] underline hover:text-white">
            Daniel Villalón
          </a>
          {' · '}
          <Link href="/privacidad" className="text-[#ffd700] underline hover:text-white">
            Política de privacidad
          </Link>
        </p>
      </footer>
    </div>
  )
}
