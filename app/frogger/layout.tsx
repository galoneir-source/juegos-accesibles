import GameExtras from '@/components/games/GameExtras'
import { gameMetadata } from '@/lib/games'

export const metadata = gameMetadata('frogger')

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <GameExtras slug="frogger" />
    </>
  )
}
