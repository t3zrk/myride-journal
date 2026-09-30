import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'

export function NotFoundPage() {
  return (
    <EmptyState title="PAGE NOT FOUND">
      <p>The requested page could not be found.</p>
      <ButtonLink to="/trips" className="mt-5">Back to trips</ButtonLink>
    </EmptyState>
  )
}
