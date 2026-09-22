import type { MetadataRoute } from 'next'

const BASE_URL = 'https://juegos.dvillalon.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Páginas de cuenta (sin contenido indexable, /perfil redirige a
      // /login sin sesión) y endpoints de API.
      disallow: ['/login', '/register', '/perfil', '/api/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
