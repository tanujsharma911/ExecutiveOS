import { PageHeader } from '@/components/common/Page'
import { GrowthView } from '@/components/features/Growth'

export default function ClientGrowth() {
  return (
    <div>
      <PageHeader title="My Growth Journey" description="How your leadership focus, energy and follow-through have evolved since you started coaching." />
      <GrowthView path="/client/growth" activityPath="/client/activity" />
    </div>
  )
}
