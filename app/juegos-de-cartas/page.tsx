import CategoryPage from '@/components/games/CategoryPage'
import { categoryMetadata } from '@/lib/games'

export const metadata = categoryMetadata('cartas')

export default function Page() {
  return <CategoryPage id="cartas" />
}
