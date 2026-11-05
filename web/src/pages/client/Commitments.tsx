import { ClipboardList, MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, Loading, PageHeader, SectionTitle } from '@/components/common/Page'
import { CommitmentStatusBadge, OverdueFlag, PriorityBadge } from '@/components/common/Status'
import { StatusUpdateDialog } from '@/components/features/Commitments'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { useApi } from '@/lib/api'
import type { Commitment } from '@/lib/types'
import { fmtDate, relative } from '@/lib/utils'

function CommitmentCard({ c, onUpdate }: { c: Commitment; onUpdate: () => void }) {
  const overdue = c.status !== 'COMPLETED' && new Date(c.dueDate) < new Date()
  const last = c.updates?.[0]
  return (
    <Card className="flex flex-col p-4">
      <div className="flex flex-wrap items-center gap-2">
        <CommitmentStatusBadge status={c.status} />
        <PriorityBadge priority={c.priority} />
        <span className="ml-auto text-[12px] text-muted-foreground">{c.goal}</span>
      </div>
      <h3 className="mt-2.5 text-[14.5px] font-semibold leading-snug">{c.title}</h3>
      {c.description ? <p className="mt-1 text-[13px] text-muted-foreground">{c.description}</p> : null}
      {last ? (
        <div className="mt-3 flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12.5px]">
          <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span>
            {last.note} <span className="text-muted-foreground">· {last.authorRole === 'CLIENT' ? 'you' : 'coach'}, {relative(last.createdAt)}</span>
          </span>
        </div>
      ) : null}
      <div className="mt-auto flex items-center gap-2 pt-4 text-[12.5px] text-muted-foreground">
        Due {fmtDate(c.dueDate, { weekday: 'short', month: 'short', day: 'numeric' })} {overdue ? <OverdueFlag /> : null}
        {c.status !== 'COMPLETED' ? (
          <Button size="sm" variant="outline" className="ml-auto" onClick={onUpdate}>
            Update progress
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

export default function ClientCommitments() {
  const { data } = useApi<Commitment[]>('/commitments')
  const [updating, setUpdating] = useState<Commitment | null>(null)
  if (!data) return <Loading />
  const active = data.filter((c) => c.status !== 'COMPLETED')
  const done = data.filter((c) => c.status === 'COMPLETED')
  return (
    <div>
      <PageHeader title="My Commitments" description="What you agreed to do with your coach. Update the status and add a short note on what happened — honesty here is more useful than progress." />
      <Card className="mb-7 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="text-[13px]">
          <span className="text-[22px] font-semibold tabular-nums">{done.length}</span> <span className="text-muted-foreground">of {data.length} commitments completed</span>
        </div>
        <Progress value={(done.length / Math.max(1, data.length)) * 100} tone="success" className="sm:ml-6 sm:max-w-sm" />
      </Card>
      <section className="mb-8">
        <SectionTitle>Active</SectionTitle>
        {!active.length ? <EmptyState icon={ClipboardList} title="No active commitments" /> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((c) => (
            <CommitmentCard key={c.id} c={c} onUpdate={() => setUpdating(c)} />
          ))}
        </div>
      </section>
      <section>
        <SectionTitle>Completed</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {done.map((c) => (
            <CommitmentCard key={c.id} c={c} onUpdate={() => setUpdating(c)} />
          ))}
        </div>
      </section>
      <StatusUpdateDialog commitment={updating} open={!!updating} onOpenChange={(v) => !v && setUpdating(null)} role="CLIENT" />
    </div>
  )
}
