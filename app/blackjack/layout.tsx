import { gameMetadata } from '@/lib/games'

export const metadata = gameMetadata('blackjack')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
