import type { MetadataRoute } from 'next'

const BASE_URL = 'https://juegos.dvillalon.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Las páginas de cuenta (/login, /register, /perfil, /tabla-lideres) no
      // se bloquean aquí: llevan `noindex` en su metadata, y un buscador solo
      // puede leerlo si se le permite rastrearlas. Bloqueadas, la URL podía
      // acabar indexada sin contenido.
      disallow: ['/api/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
