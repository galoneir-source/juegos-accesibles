import type { Metadata } from 'next'
import './globals.css'
import SkipLink from '@/components/accessibility/SkipLink'
import Announcer from '@/components/accessibility/Announcer'

export const metadata: Metadata = {
  title: 'Juegos Accesibles',
  description: 'Sitio de juegos completamente accesible para personas con discapacidad visual. Navegación por teclado y compatible con lectores de pantalla.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full flex flex-col bg-[#0a0a0a] text-[#f0f0f0]">
        <SkipLink />
        <Announcer />
        {children}
      </body>
    </html>
  )
}
