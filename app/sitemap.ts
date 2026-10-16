import type { MetadataRoute } from 'next'
import { CATEGORIES, GAME_SLUGS } from '@/lib/games'

const BASE_URL = 'https://juegos.dvillalon.com'

// Sin lastModified: el sitemap se genera en cada compilación y la fecha sería
// siempre la del despliegue, no la del último cambio real de cada página, y
// Google deja de fiarse de un lastmod que no cambia con el contenido.
export default function sitemap(): MetadataRoute.Sitemap {
  const gameEntries: MetadataRoute.Sitemap = GAME_SLUGS.map((slug) => ({
    url: `${BASE_URL}/${slug}`,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const categoryEntries: MetadataRoute.Sitemap = CATEGORIES.map((category) => ({
    url: `${BASE_URL}/${category.slug}`,
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  return [
    {
      url: BASE_URL,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/privacidad`,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    // /tabla-lideres requiere sesión (protegida por el middleware en
    // proxy.ts, redirige a /login sin ella) — no va en el sitemap público.
    ...categoryEntries,
    ...gameEntries,
  ]
}
