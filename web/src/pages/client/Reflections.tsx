import { CalendarCheck2, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState, Loading, PageHeader, SectionTitle } from '@/components/common/Page'
import { ConsistencyPanel } from '@/components/features/Activity'
import { SubmissionAnswers } from '@/components/features/Reflections'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/misc'
import { useApi } from '@/lib/api'
import type { Activity, Submission } from '@/lib/types'
import { cn, fmtDate } from '@/lib/utils'
import { PendingFormCard, type PendingForm } from './Dashboard'

const META: Record<string, { title: string; description: string; unit: string }> = {
  daily: { title: 'Daily Reflection', description: 'A two-minute pulse on how you are showing up today.', unit: 'day' },
  weekly: { title: 'Weekly Review', description: 'Step back at the end of each week: wins, challenges, energy and confidence.', unit: 'week' },
  monthly: { title: 'Monthly Review', description: 'Look at the month as a whole and choose what to focus on next.', unit: 'month' },
}

export default function Reflections() {
  const { freq = 'weekly' } = useParams()
  const meta = META[freq] ?? META.weekly
  const { data } = useApi<{ current: PendingForm[]; history: Submission[] }>(`/client/forms?frequency=${freq.toUpperCase()}`, [freq])
  const [open, setOpen] = useState<string | null>(null)
  const activity = useApi<Activity>(freq === 'daily' ? '/client/activity' : null, [freq])

  // Completion history strip — aligned to calendar periods (weeks start Monday, like the forms).
  const DAY = 86_400_000
  const weekStart = (d: Date) => {
    const x = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    return x - ((new Date(x).getUTCDay() + 6) % 7) * DAY
  }
  const slots = freq === 'monthly' ? 6 : 12
  const done = new Set(
    (data?.history ?? []).map((s) => {
      const d = new Date(s.periodStart)
      return freq === 'monthly' ? `${d.getUTCFullYear()}-${d.getUTCMonth()}` : String(weekStart(d))
    }),
  )
  const now = new Date()
  const strip = Array.from({ length: slots }, (_, i) => {
    const back = slots - 1 - i
    if (freq === 'monthly') {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
      return { label: fmtDate(d, { month: 'short' }), tip: fmtDate(d, { month: 'long', year: 'numeric' }), done: done.has(`${d.getUTCFullYear()}-${d.getUTCMonth()}`), current: back === 0 }
    }
    const start = weekStart(now) - back * 7 * DAY
    const end = start + 6 * DAY
    return { label: fmtDate(new Date(start)), tip: `Week of ${fmtDate(new Date(start))} – ${fmtDate(new Date(end))}`, done: done.has(String(start)), current: back === 0 }
  })

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={meta.title} description={meta.description} />
      {!data ? <Loading /> : null}
      {data ? (
        <div className="grid gap-7">
          <section>
            <SectionTitle>This {meta.unit}</SectionTitle>
            <div className="grid gap-2">
              {data.current.map((f) => (
                <PendingFormCard key={f.formId} f={f} />
              ))}
              {!data.current.length ? <EmptyState icon={CalendarCheck2} title="No forms assigned" description="Your coach hasn't assigned a form at this frequency yet." /> : null}
            </div>
          </section>
          {freq === 'daily' ? (
            <section>
              <SectionTitle right={<span className="text-[12px] text-muted-foreground">{data.history.length} submitted</span>}>Streak & history</SectionTitle>
              <ConsistencyPanel activity={activity.data} only="DAILY" />
            </section>
          ) : (
          <section>
            <SectionTitle right={<span className="text-[12px] text-muted-foreground">{data.history.length} submitted</span>}>Completion history</SectionTitle>
            <Card className="p-4">
              <div className="flex gap-1">
                {strip.map((s, i) => (
                  <Tooltip key={i} content={`${s.tip} · ${s.done ? 'submitted' : s.current ? 'not submitted yet' : 'not submitted'}`}>
                    <span className={cn('h-8 flex-1 rounded-md', s.done ? 'bg-foreground' : 'bg-muted', s.current && !s.done && 'border border-dashed border-foreground/30')} />
                  </Tooltip>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                <span>{strip[0]?.label}</span>
                <span>{freq === 'monthly' ? 'This month' : 'This week'}</span>
              </div>
            </Card>
          </section>
          )}
          <section>
            <SectionTitle>Previously submitted</SectionTitle>
            <div className="grid gap-2">
              {data.history.map((s) => {
                const isOpen = open === s.id
                const emotion = s.answers.find((a) => a.metricKey === 'emotion')?.value as string | undefined
                return (
                  <Card key={s.id}>
                    <button className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(isOpen ? null : s.id)}>
                      <span className="w-24 text-[13px] font-medium">{fmtDate(s.periodStart, freq === 'monthly' ? { month: 'long', year: 'numeric' } : { month: 'short', day: 'numeric' })}</span>
                      <span className="flex-1 truncate text-[13px] text-muted-foreground">{s.form.title}</span>
                      {emotion ? <Badge variant="ai">{emotion}</Badge> : null}
                      <ChevronDown className={cn('size-4 text-muted-foreground transition', isOpen && 'rotate-180')} />
                    </button>
                    {isOpen ? (
                      <div className="border-t px-4 py-4">
                        <SubmissionAnswers s={s} />
                      </div>
                    ) : null}
                  </Card>
                )
              })}
              {!data.history.length ? <EmptyState title="Nothing submitted yet" /> : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
