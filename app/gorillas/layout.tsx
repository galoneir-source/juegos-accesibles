import { gameMetadata } from '@/lib/games'

export const metadata = gameMetadata('gorillas')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
