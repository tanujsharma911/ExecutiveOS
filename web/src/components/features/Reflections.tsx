import { ChevronDown, NotebookPen, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/common/Page'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/misc'
import { Segmented } from '@/components/ui/tabs'
import { useApi } from '@/lib/api'
import type { AnswerSnapshot, Submission } from '@/lib/types'
import { cn, fmtDate, titleCase } from '@/lib/utils'

export function formatAnswer(a: AnswerSnapshot): string {
  const v = a.value
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (a.type === 'RATING') return `${v} / 10`
  if (a.type === 'GOAL_PROGRESS') return `${v}%`
  return String(v)
}

function highlight(text: string, q: string) {
  if (!q) return text
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-ai-soft px-0.5 text-ai">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

export function SubmissionAnswers({ s, q = '' }: { s: Submission; q?: string }) {
  const metrics = s.answers.filter((a) => a.type === 'RATING' || a.type === 'GOAL_PROGRESS' || a.type === 'EMOTION' || a.type === 'YES_NO' || a.type === 'NUMBER')
  const text = s.answers.filter((a) => !metrics.includes(a))
  return (
    <div className="grid gap-4">
      {metrics.length ? (
        <div className="flex flex-wrap gap-2">
          {metrics.map((a) => (
            <div key={a.questionId} className="rounded-lg border bg-muted/40 px-2.5 py-1.5">
              <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{a.metricKey ? titleCase(a.metricKey === 'goalProgress' ? 'goal progress' : a.metricKey) : a.label}</div>
              <div className="text-[13.5px] font-semibold tabular-nums">{formatAnswer(a)}</div>
            </div>
          ))}
        </div>
      ) : null}
      <dl className="grid gap-3">
        {text.map((a) => (
          <div key={a.questionId}>
            <dt className="text-[12px] font-medium text-muted-foreground">{a.label}</dt>
            <dd className="mt-0.5 font-serif text-[15.5px] leading-snug">{highlight(formatAnswer(a), q)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function ReflectionsSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading reflections">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 sm:ml-auto sm:w-72" />
      </div>
      <Skeleton className="h-3 w-24" />
      <div className="grid gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="flex items-start gap-3 px-4 py-3">
            <div className="grid w-14 shrink-0 gap-1.5">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-2.5 w-7" />
            </div>
            <div className="grid flex-1 gap-1.5">
              <div className="flex gap-2">
                <Skeleton className="h-3.5 w-44" />
                <Skeleton className="h-4 w-14 rounded-full" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-3/5" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function ReflectionsList({ clientId }: { clientId: string }) {
  const { data, loading } = useApi<Submission[]>(`/coach/clients/${clientId}/reflections`, [clientId])
  const [freq, setFreq] = useState<'ALL' | 'WEEKLY' | 'DAILY' | 'MONTHLY'>('ALL')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const list = useMemo(
    () => (data ?? []).filter((s) => (freq === 'ALL' || s.form.frequency === freq) && (!q || s.answers.some((a) => String(a.value ?? '').toLowerCase().includes(q.toLowerCase())))),
    [data, freq, q],
  )
  if (loading && !data) return <ReflectionsSkeleton />
  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented
          value={freq}
          onChange={setFreq}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'WEEKLY', label: 'Weekly' },
            { value: 'DAILY', label: 'Daily' },
            { value: 'MONTHLY', label: 'Monthly' },
          ]}
        />
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search what they wrote… e.g. “trust”" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>
      <div className="text-[12px] text-muted-foreground">{list.length} reflections</div>
      {!list.length ? <EmptyState icon={NotebookPen} title="No reflections match" /> : null}
      <div className="grid gap-2">
        {list.map((s) => {
          const isOpen = open === s.id || (!!q && list.length <= 6)
          const lead = s.answers.find((a) => a.type === 'LONG_TEXT' && a.value)
          const emotion = s.answers.find((a) => a.metricKey === 'emotion')?.value as string | undefined
          return (
            <Card key={s.id}>
              <button className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left" onClick={() => setOpen(isOpen ? null : s.id)}>
                <div className="w-14 shrink-0 text-[12px] text-muted-foreground">
                  <div className="font-semibold text-foreground">{fmtDate(s.submittedAt, { month: 'short', day: 'numeric' })}</div>
                  {fmtDate(s.submittedAt, { weekday: 'short' })}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{s.form.title}</span>
                    <Badge variant="outline">{titleCase(s.form.frequency)}</Badge>
                    {emotion ? <Badge variant="ai">{emotion}</Badge> : null}
                  </div>
                  {!isOpen && lead ? <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{String(lead.value)}</p> : null}
                </div>
                <ChevronDown className={cn('mt-1 size-4 text-muted-foreground transition', isOpen && 'rotate-180')} />
              </button>
              {isOpen ? (
                <div className="border-t px-4 py-4 sm:pl-[88px]">
                  <SubmissionAnswers s={s} q={q} />
                </div>
              ) : null}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
