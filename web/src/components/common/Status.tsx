import { AlertTriangle, CheckCircle2, CircleDashed, CircleDot, PauseCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/misc'
import type { CommitmentStatus, Confidence, Priority } from '@/lib/types'
import { cn } from '@/lib/utils'

export const COMMITMENT_STATUSES: { value: CommitmentStatus; label: string }[] = [
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'PARTIALLY_COMPLETED', label: 'Partially completed' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'BLOCKED', label: 'Blocked' },
]

export function CommitmentStatusBadge({ status }: { status: CommitmentStatus }) {
  const map = {
    NOT_STARTED: { v: 'outline', icon: CircleDashed, l: 'Not started' },
    IN_PROGRESS: { v: 'ai', icon: CircleDot, l: 'In progress' },
    PARTIALLY_COMPLETED: { v: 'warning', icon: CircleDot, l: 'Partially completed' },
    COMPLETED: { v: 'success', icon: CheckCircle2, l: 'Completed' },
    BLOCKED: { v: 'danger', icon: PauseCircle, l: 'Blocked' },
  } as const
  const m = map[status]
  return (
    <Badge variant={m.v}>
      <m.icon /> {m.l}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge variant={priority === 'HIGH' ? 'dark' : 'outline'}>{priority === 'HIGH' ? 'High' : priority === 'MEDIUM' ? 'Medium' : 'Low'}</Badge>
}

type Engagement = 'Active' | 'Slipping' | 'At risk'

/** Mirrors engagementOf() in server/src/ai/alerts.ts — based on days since the last weekly reflection. */
const ENGAGEMENT_STAGES: { status: Engagement; dot: string; meaning: string }[] = [
  { status: 'Active', dot: 'bg-success', meaning: 'Weekly reflection submitted in the last 8 days' },
  { status: 'Slipping', dot: 'bg-warning', meaning: 'No weekly reflection for 9–13 days' },
  { status: 'At risk', dot: 'bg-danger', meaning: 'No weekly reflection for 14+ days, or none yet' },
]

function EngagementLegend({ current }: { current: Engagement }) {
  return (
    <div className="grid gap-1.5 py-0.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Engagement</div>
      {ENGAGEMENT_STAGES.map((s) => (
        <div key={s.status} className={cn('flex items-start gap-2', s.status !== current && 'opacity-60')}>
          <span className={cn('mt-[5px] size-1.5 shrink-0 rounded-full', s.dot)} />
          <span>
            <span className="font-medium">{s.status}</span> — {s.meaning}
          </span>
        </div>
      ))}
    </div>
  )
}

export function EngagementBadge({ status }: { status: Engagement }) {
  const v = status === 'Active' ? 'success' : status === 'Slipping' ? 'warning' : 'danger'
  return (
    <Tooltip content={<EngagementLegend current={status} />}>
      <span className="inline-flex cursor-help">
        <Badge variant={v}>
          <span className={cn('size-1.5 rounded-full', status === 'Active' ? 'bg-success' : status === 'Slipping' ? 'bg-warning' : 'bg-danger')} />
          {status}
        </Badge>
      </span>
    </Tooltip>
  )
}

export function ConfidencePill({ level, score }: { level: Confidence; score?: number }) {
  const bars = level === 'High' ? 3 : level === 'Medium' ? 2 : 1
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground" title={score !== undefined ? `Model confidence score ${Math.round(score * 100)}%` : undefined}>
      <span className="flex items-end gap-[2px]">
        {[1, 2, 3].map((b) => (
          <span key={b} className={cn('w-[3px] rounded-sm', b <= bars ? 'bg-ai' : 'bg-border')} style={{ height: 4 + b * 2.5 }} />
        ))}
      </span>
      {level} confidence
    </span>
  )
}

export function OverdueFlag() {
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-danger">
      <AlertTriangle className="size-3" /> Overdue
    </span>
  )
}
