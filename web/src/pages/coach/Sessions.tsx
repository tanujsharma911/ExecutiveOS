import { PageHeader } from '@/components/common/Page'
import { SessionsPanel } from '@/components/features/Sessions'

export default function Sessions() {
  return (
    <div>
      <PageHeader title="Session History" description="Upcoming sessions with AI briefs, and the record of every past conversation." />
      <SessionsPanel />
    </div>
  )
}
