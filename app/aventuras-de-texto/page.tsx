import CategoryPage from '@/components/games/CategoryPage'
import { categoryMetadata } from '@/lib/games'

export const metadata = categoryMetadata('aventuras')

export default function Page() {
  return <CategoryPage id="aventuras" />
}
