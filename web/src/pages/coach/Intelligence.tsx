import { BrainCircuit } from 'lucide-react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loading, PageHeader } from '@/components/common/Page'
import { EngagementBadge } from '@/components/common/Status'
import { IntelligenceView } from '@/components/features/IntelligenceView'
import { Avatar } from '@/components/ui/misc'
import { useApi } from '@/lib/api'
import type { ClientRow } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function Intelligence() {
  const { data } = useApi<ClientRow[]>('/coach/clients')
  const [params, setParams] = useSearchParams()
  const clientId = params.get('client')

  useEffect(() => {
    if (!clientId && data?.length) setParams({ client: data[0].id }, { replace: true })
  }, [clientId, data, setParams])

  return (
    <div>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 text-ai">
            <BrainCircuit className="size-3.5" /> AI Coaching Intelligence
          </span>
        }
        title="Report Cards"
        description="An analyst that has read every reflection and commitment. Each insight shows its evidence, dates and confidence — you decide what matters."
      />
      {!data ? <Loading /> : null}
      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        {data?.map((c) => (
          <button
            key={c.id}
            onClick={() => setParams({ client: c.id })}
            className={cn('flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition hover:border-foreground/20', clientId === c.id && 'border-ai/50 ring-2 ring-ai/15')}
          >
            <Avatar name={c.name} color={c.avatarColor} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold">{c.name}</div>
              <div className="truncate text-[12px] text-muted-foreground">{c.company}</div>
            </div>
            <EngagementBadge status={c.engagement} />
          </button>
        ))}
      </div>
      {clientId ? <IntelligenceView key={clientId} clientId={clientId} /> : null}
    </div>
  )
}
