import GameExtras from '@/components/games/GameExtras'
import { gameMetadata } from '@/lib/games'

export const metadata = gameMetadata('castillo')

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <GameExtras slug="castillo" />
    </>
  )
}
