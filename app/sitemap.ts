import type { MetadataRoute } from 'next'
import { GAME_SLUGS } from '@/lib/games'

const BASE_URL = 'https://juegos.dvillalon.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const gameEntries: MetadataRoute.Sitemap = GAME_SLUGS.map((slug) => ({
    url: `${BASE_URL}/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    // /tabla-lideres requiere sesión (protegida por el middleware en
    // proxy.ts, redirige a /login sin ella) — no va en el sitemap público.
    ...gameEntries,
  ]
}
