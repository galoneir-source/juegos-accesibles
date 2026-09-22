import type { MetadataRoute } from 'next'

const BASE_URL = 'https://juegos.dvillalon.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Páginas de cuenta (sin contenido indexable, /perfil y /tabla-lideres
      // requieren sesión — protegidas por el middleware en proxy.ts y
      // redirigen a /login sin ella) y endpoints de API.
      disallow: ['/login', '/register', '/perfil', '/tabla-lideres', '/api/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
