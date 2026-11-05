import { PageHeader } from '@/components/common/Page'
import { CommitmentsPanel } from '@/components/features/Commitments'

export default function CoachCommitments() {
  return (
    <div>
      <PageHeader title="Commitments" description="What each client agreed to do — and where the same kind of commitment keeps stalling." />
      <CommitmentsPanel />
    </div>
  )
}
