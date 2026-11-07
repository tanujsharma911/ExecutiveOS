import { PageHeader } from '@/components/common/Page'
import { SessionsPanel } from '@/components/features/Sessions'

export default function Sessions() {
  return (
    <div>
      <PageHeader title="Session Calendar" description="Every coaching session on one calendar — open one for its AI brief, meeting link or recorded outcome." />
      <SessionsPanel />
    </div>
  )
}
