import GameExtras from '@/components/games/GameExtras'
import { gameMetadata } from '@/lib/games'

export const metadata = gameMetadata('el-ultimo-bogatyr')

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <GameExtras slug="el-ultimo-bogatyr" />
    </>
  )
}
