import { Flag, GitBranch, MessagesSquare, Repeat, Sparkles, Trophy } from 'lucide-react'
import { useState } from 'react'
import { AgAreaTrend } from '@/components/common/AgLineChart'
import { SectionTitle } from '@/components/common/Page'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { Segmented } from '@/components/ui/tabs'
import { useApi } from '@/lib/api'
import type { Activity, Growth } from '@/lib/types'
import { ConsistencyPanel } from './Activity'
import { cn, fmtDate } from '@/lib/utils'

export { StreakFlame } from './Activity'

const TIMELINE_META = {
  breakthrough: { icon: Sparkles, label: 'Breakthrough', color: 'bg-success text-white' },
  challenge: { icon: Repeat, label: 'Recurring challenge', color: 'bg-warning text-white' },
  session: { icon: MessagesSquare, label: 'Coaching conversation', color: 'bg-foreground text-white' },
  goal: { icon: Trophy, label: 'Completed goal', color: 'bg-ai text-white' },
  pattern: { icon: GitBranch, label: 'New pattern', color: 'bg-pink-600 text-white' },
}

const METRICS = [
  { key: 'confidence', label: 'Leadership confidence', color: 'var(--ai)', domain: [0, 10] as [number, number] },
  { key: 'energy', label: 'Energy', color: '#ca8a04', domain: [0, 10] as [number, number] },
  { key: 'stress', label: 'Stress', color: '#dc2626', domain: [0, 10] as [number, number], invert: true },
  { key: 'team', label: 'Team relationship', color: '#0f766e', domain: [0, 10] as [number, number] },
  { key: 'goalProgress', label: 'Goal progress', color: '#18181b', domain: [0, 100] as [number, number], unit: '%' },
]

const DISCLAIMER = 'Scores are self-reported by the client in reflections, or coach-defined. They are indicators for conversation, not validated measurements.'

function IndicatorsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="grid gap-2 p-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-[110px] w-full" />
        </Card>
      ))}
    </div>
  )
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="grid gap-4 p-5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      ))}
    </Card>
  )
}

/**
 * Growth journey. Streak + heat map come from the fast `activityPath` and appear first;
 * the AI-backed sections show skeletons until `path` resolves.
 */
export function GrowthView({ path, activityPath }: { path: string; activityPath: string }) {
  const { data } = useApi<Growth>(path, [path])
  const activity = useApi<Activity>(activityPath, [activityPath])
  const [filter, setFilter] = useState<'all' | keyof typeof TIMELINE_META>('all')

  return (
    <div className="grid gap-7">
      <div className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-2.5 text-[12px] text-muted-foreground">
        <Flag className="mt-0.5 size-3.5 shrink-0" /> {DISCLAIMER}
      </div>

      <section>
        <SectionTitle>Consistency</SectionTitle>
        <ConsistencyPanel activity={activity.data} />
      </section>

      <section>
        <SectionTitle>Indicators over time</SectionTitle>
        {!data ? (
          <IndicatorsSkeleton />
        ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {METRICS.map((m) => {
            const s = data.series.find((x) => x.key === m.key)
            if (!s || !s.points.length) return null
            const good = m.invert ? (s.delta ?? 0) < 0 : (s.delta ?? 0) > 0
            return (
              <Card key={m.key} className="p-4 pb-2">
                <div className="flex items-baseline justify-between">
                  <div className="text-[12.5px] text-muted-foreground">{m.label}</div>
                  {s.delta !== null ? (
                    <span className={cn('text-[12px] font-medium tabular-nums', s.direction === 'flat' ? 'text-muted-foreground' : good ? 'text-success' : 'text-warning')}>
                      {s.delta > 0 ? '+' : ''}
                      {s.delta}
                      {m.unit ?? ''}
                    </span>
                  ) : null}
                </div>
                <div className="text-[22px] font-semibold tabular-nums">
                  {s.last}
                  {m.unit ?? <span className="text-[13px] font-normal text-muted-foreground">/10</span>}
                </div>
                <AgAreaTrend data={s.points} label={m.label} color={m.color} height={110} domain={m.domain} unit={m.unit} />
                <div className="pb-1 text-[10.5px] text-muted-foreground">Self-reported</div>
              </Card>
            )
          })}
          <Card className="p-4 pb-2">
            <div className="text-[12.5px] text-muted-foreground">Commitment completion</div>
            <div className="text-[22px] font-semibold tabular-nums">{data.completionSeries[data.completionSeries.length - 1]?.value ?? 0}%</div>
            <AgAreaTrend data={data.completionSeries} label="Commitment completion" color="#52525b" height={110} domain={[0, 100]} unit="%" />
            <div className="pb-1 text-[10.5px] text-muted-foreground">Share of commitments completed to date · coach-defined</div>
          </Card>
        </div>
        )}
      </section>

      <div className="grid gap-7">
        <section>
          <SectionTitle
            right={
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'breakthrough', label: 'Wins' },
                  { value: 'session', label: 'Sessions' },
                  { value: 'goal', label: 'Goals' },
                ]}
              />
            }
          >
            Timeline
          </SectionTitle>
          {!data ? (
            <ListSkeleton />
          ) : (
          <Card className="p-5">
            <ol className="relative grid gap-4 border-l pl-6">
              {data.timeline
                .filter((t) => filter === 'all' || t.kind === filter)
                .map((t, i) => {
                  const m = TIMELINE_META[t.kind]
                  return (
                    <li key={i} className="relative animate-rise" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                      <span className={cn('absolute -left-[37px] top-0 flex size-6 items-center justify-center rounded-full ring-4 ring-card', m.color)}>
                        <m.icon className="size-3" />
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                        <span className="font-medium">{fmtDate(t.date, { month: 'short', day: 'numeric' })}</span>
                        <Badge variant="outline">{m.label}</Badge>
                      </div>
                      <div className="mt-0.5 text-[13.5px] font-medium leading-snug">{t.title}</div>
                      {t.detail ? <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{t.detail}</p> : null}
                    </li>
                  )
                })}
            </ol>
          </Card>
          )}
        </section>
      </div>
    </div>
  )
}
