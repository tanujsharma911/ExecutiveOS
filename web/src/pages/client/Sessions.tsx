import { PageHeader } from '@/components/common/Page'
import { SessionsPanel } from '@/components/features/Sessions'

export default function ClientSessions() {
  return (
    <div>
      <PageHeader title="Session History" description="Your coaching conversations — topics, decisions and follow-ups." />
      <SessionsPanel role="CLIENT" />
    </div>
  )
}
