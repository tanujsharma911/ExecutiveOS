import { PageHeader } from '@/components/common/Page'
import { SessionsPanel } from '@/components/features/Sessions'

export default function ClientSessions() {
  return (
    <div>
      <PageHeader title="Session Calendar" description="Your coaching sessions — click one for the meeting link, topics, decisions and follow-ups." />
      <SessionsPanel role="CLIENT" />
    </div>
  )
}
