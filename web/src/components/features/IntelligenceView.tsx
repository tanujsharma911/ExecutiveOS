import { BrainCircuit, CalendarPlus, Check, ChevronDown, Cpu, Database, Info, Lightbulb, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AiGenerating } from '@/components/common/AiGenerating'
import { AgLineChart } from '@/components/common/AgLineChart'
import { mergeSeries } from '@/components/common/Charts'
import { CATEGORY_META, InsightCard } from '@/components/common/Insight'
import { EmptyState, ErrorState } from '@/components/common/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { api, useApi } from '@/lib/api'
import type { Insight, InsightCategory, IntelligenceReport, Session } from '@/lib/types'
import { cn, fmtDate, fmtDateTime, relative } from '@/lib/utils'

const SECTIONS: { key: string; label: string; blurb: string }[] = [
  { key: 'opportunities', label: 'Coaching opportunities', blurb: 'Questions worth exploring in the next session, ranked by evidence strength.' },
  { key: 'recurring', label: 'Recurring patterns', blurb: 'Themes that keep returning across reflections.' },
  { key: 'emerging', label: 'Emerging', blurb: 'Subjects becoming more frequent in the last 3 weeks.' },
  { key: 'disappearing', label: 'Fading', blurb: 'Previously recurring issues that are appearing less often.' },
  { key: 'contradictions', label: 'Contradictions', blurb: 'Where stated intentions and later behaviour diverge.' },
  { key: 'emotional', label: 'Emotional trends', blurb: 'Self-reported confidence, energy, stress and emotions over time.' },
  { key: 'unresolved', label: 'Unresolved', blurb: 'Problems raised repeatedly with no sign of resolution.' },
  { key: 'commitment', label: 'Commitments', blurb: 'Patterns across coaching commitments.' },
]

/** Mirrors the Report Card layout; the step label shows the analysis is running (it can take a few seconds with an LLM). */
function ThinkingState() {
  const steps = ['Reading reflections', 'Detecting recurring patterns', 'Comparing recent vs. earlier weeks', 'Checking for contradictions', 'Analyzing emotional trends', 'Reviewing commitments']
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 900)
    return () => clearInterval(t)
  }, [steps.length])
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Analysing reflections">
      <Card className="overflow-hidden">
        <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid min-w-0 gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ai">
                <BrainCircuit className="size-3.5 animate-pulse" /> {steps[i]}…
              </span>
              <Skeleton className="h-5 w-40 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="flex flex-row gap-2 md:flex-col md:items-end">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-36" />
          </div>
        </div>
        <div className="border-t bg-muted/40 px-5 py-2.5">
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>
      </Card>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex gap-1 overflow-hidden lg:flex-col">
          {Array.from({ length: 8 }, (_, k) => (
            <Skeleton key={k} className="h-8 w-36 shrink-0 lg:w-full" />
          ))}
        </div>
        <div className="grid content-start gap-3">
          <div className="mb-1 grid gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
          {[0, 1, 2].map((k) => (
            <Card key={k} className="grid gap-2 p-4">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-36 rounded-full" />
                <Skeleton className="h-5 w-28 rounded-full" />
              </div>
              <Skeleton className="h-4 w-60" />
              <Skeleton className="h-3 w-80 max-w-full" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

export function IntelligenceView({ clientId, compact }: { clientId: string; compact?: boolean }) {
  const [fresh, setFresh] = useState(0)
  // Insights come from the analysis tools (fast, no LLM); only the briefing paragraph waits for the AI.
  const analysis = useApi<IntelligenceReport>(`/coach/clients/${clientId}/analysis`, [clientId])
  const ai = useApi<IntelligenceReport>(`/coach/clients/${clientId}/intelligence${fresh ? `?fresh=1&t=${fresh}` : ''}`, [clientId])
  const data = ai.data ?? analysis.data
  const writing = ai.loading
  const error = !data ? (analysis.error ?? ai.error) : null
  const sessions = useApi<Session[]>(`/sessions?clientId=${clientId}`, [clientId])
  const nextSession = useMemo(() => sessions.data?.filter((s) => s.status === 'SCHEDULED' && new Date(s.scheduledAt).getTime() > Date.now() - 86_400_000).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0], [sessions.data])
  const [used, setUsed] = useState<Set<string>>(new Set())
  const [section, setSection] = useState<string>('recurring')
  const [showTrace, setShowTrace] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!nextSession) return
    // The brief can take a while (it runs the analysis); abort it if the coach leaves this view.
    const controller = new AbortController()
    api<{ feedback: { insightKey: string }[] }>(`/sessions/${nextSession.id}/brief`, { signal: controller.signal })
      .then((r) => setUsed(new Set(r.feedback.filter((f) => f.insightKey.startsWith('question:')).map((f) => f.insightKey.slice(9)))))
      .catch(() => undefined)
    return () => controller.abort()
  }, [nextSession])

  async function useQuestion(insightId: string, question: string) {
    if (!nextSession) {
      toast.error('No upcoming session scheduled for this client')
      return
    }
    const already = used.has(insightId)
    await api(`/sessions/${nextSession.id}/feedback`, { method: 'PUT', json: { insightKey: `question:${insightId}`, label: question, status: already ? null : 'RELEVANT' } })
    setUsed((s) => {
      const n = new Set(s)
      if (already) n.delete(insightId)
      else n.add(insightId)
      return n
    })
    if (!already) toast.success(`Added to the ${fmtDate(nextSession.scheduledAt)} session brief`)
  }

  if (error) return <ErrorState message={error} />
  if (!data) return <ThinkingState />
  if (!data) return null

  const byCat: Record<string, Insight[]> = {
    recurring: data.recurring,
    emerging: data.emerging,
    disappearing: data.disappearing,
    contradictions: data.contradictions,
    emotional: data.emotional.insights,
    unresolved: data.unresolved,
    commitment: data.commitments.insights,
  }
  const counts: Record<string, number> = { opportunities: data.opportunities.length, ...Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, v.length])) }
  const chartData = mergeSeries(data.emotional.series.filter((s) => ['confidence', 'team', 'energy', 'stress'].includes(s.key)))
  const active = SECTIONS.find((s) => s.key === section)!

  return (
    <div className="grid gap-5">
      {/* Report Card summary */}
      <Card className="overflow-hidden">
        <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ai">
                <Sparkles className="size-3.5" /> Report Card summary
              </span>
              <Badge variant="outline">
                <Database /> {data.overview.reflections} reflections · {data.overview.statements} statements
              </Badge>
              <Badge variant="outline">
                {fmtDate(data.overview.firstReflection)} – {fmtDate(data.overview.lastReflection)}
              </Badge>
            </div>
            {writing ? (
              <AiGenerating className="py-1" lines={compact ? 4 : 5} steps={['Reading the analysis', 'Weighing the evidence', 'Writing the briefing']} />
            ) : ai.data ? (
              <p key={ai.data.generatedAt} className={cn('animate-rise font-serif leading-relaxed text-foreground/90', compact ? 'text-[16px]' : 'text-[18px]')}>
                {ai.data.narrative}
              </p>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" /> {ai.error ?? 'The AI briefing is not available right now.'} The insights below are computed from the client's reflections and are still up to date.
              </div>
            )}
            {data.dataGap ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
                <Info className="mt-0.5 size-3.5 shrink-0" /> {data.dataGap}
              </div>
            ) : null}
          </div>
          <div className="flex flex-row items-start gap-2 md:flex-col md:items-end">
            <Button variant="outline" size="sm" onClick={() => setFresh(Date.now())} disabled={writing}>
              <RefreshCw className={cn(writing && 'animate-spin')} /> Re-run analysis
            </Button>
            {nextSession ? (
              <Button variant="ai-soft" size="sm" onClick={() => navigate(`/coach/sessions/${nextSession.id}/prep`)}>
                <CalendarPlus /> Prep {fmtDate(nextSession.scheduledAt)} session
              </Button>
            ) : null}
          </div>
        </div>
        <button onClick={() => setShowTrace((s) => !s)} className="flex w-full cursor-pointer items-center gap-2 border-t bg-muted/40 px-5 py-2 text-left text-[12px] text-muted-foreground hover:text-foreground">
          <Cpu className="size-3.5" /> {data.trace.length} analysis tools called · {ai.data ? `${ai.data.model} · generated ${relative(ai.data.generatedAt)}` : writing ? 'AI briefing in progress…' : 'AI briefing unavailable'}
          <ChevronDown className={cn('ml-auto size-3.5 transition', showTrace && 'rotate-180')} />
        </button>
        {showTrace ? (
          <div className="grid gap-1 border-t bg-muted/20 px-5 py-3 font-mono text-[11.5px] animate-rise">
            {data.trace.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="text-ai">→ {t.tool}</span>
                <span className="text-muted-foreground">({'{'} clientId {'}'})</span>
                <span className="text-foreground/80">{t.summary}</span>
                <span className="ml-auto text-muted-foreground">{t.durationMs} ms</span>
              </div>
            ))}
            <div className="mt-1 text-muted-foreground">Insights are computed from the client's own words by these tools; the narrative only summarizes them.</div>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-dashed px-4 py-2.5 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-ai" /> <b className="font-medium text-foreground/80">AI hypotheses</b> — possibilities to explore, never diagnoses
        </span>
        <span className="flex items-center gap-1.5">Confidence reflects evidence strength, not certainty.</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:flex-col lg:self-start">
          {SECTIONS.map((s) => {
            const meta = s.key === 'opportunities' ? { icon: Lightbulb } : CATEGORY_META[(s.key === 'contradictions' ? 'contradiction' : s.key) as InsightCategory]
            const Icon = meta.icon
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={cn('flex shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground', section === s.key && 'bg-card text-foreground shadow-sm ring-1 ring-border')}
              >
                <Icon className="size-3.5" />
                <span className="whitespace-nowrap">{s.label}</span>
                <span className={cn('ml-auto rounded-full px-1.5 text-[11px] tabular-nums', counts[s.key] ? 'bg-muted text-foreground' : 'text-muted-foreground/60')}>{counts[s.key] ?? 0}</span>
              </button>
            )
          })}
        </nav>

        <div className="grid min-w-0 content-start gap-3">
          <div className="mb-1">
            <h2 className="text-[15px] font-semibold">{active.label}</h2>
            <p className="text-[12.5px] text-muted-foreground">{active.blurb}</p>
          </div>

          {section === 'opportunities' ? (
            <div className="grid gap-2.5">
              {data.opportunities.map((o, i) => {
                const isUsed = used.has(o.insightId)
                return (
                  <Card key={i} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ai-soft text-[12px] font-semibold text-ai">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-[17px] leading-snug">{o.question}</p>
                      <p className="mt-1 text-[12.5px] text-muted-foreground">
                        <span className="font-medium text-foreground/70">Why:</span> {o.rationale}
                      </p>
                      <button className="mt-1 text-[12px] text-ai hover:underline cursor-pointer" onClick={() => setSection(o.category === 'contradiction' ? 'contradictions' : o.category)}>
                        See evidence in {CATEGORY_META[o.category].label.toLowerCase()} →
                      </button>
                    </div>
                    <Button size="sm" variant={isUsed ? 'secondary' : 'ai-soft'} onClick={() => useQuestion(o.insightId, o.question)}>
                      {isUsed ? <Check /> : <CalendarPlus />} {isUsed ? 'In session brief' : 'Use in next session'}
                    </Button>
                  </Card>
                )
              })}
              {nextSession ? <p className="text-[12px] text-muted-foreground">Next session: {fmtDateTime(nextSession.scheduledAt)} — {nextSession.topic}</p> : null}
            </div>
          ) : null}

          {section === 'emotional' ? (
            <Card className="p-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[13px] font-semibold">Self-reported indicators (weekly)</div>
                <span className="text-[11.5px] text-muted-foreground">Self-reported, 1–10 · not a validated measure</span>
              </div>
              <AgLineChart
                data={chartData}
                domain={[0, 10]}
                lines={[
                  { key: 'confidence', label: 'Leadership confidence', color: 'var(--ai)' },
                  { key: 'team', label: 'Team relationship', color: '#0f766e' },
                  { key: 'energy', label: 'Energy', color: '#ca8a04' },
                  { key: 'stress', label: 'Stress', color: '#dc2626', dashed: true },
                ]}
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(['early', 'recent'] as const).map((k) => (
                  <div key={k}>
                    <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{k === 'early' ? 'Earlier weeks' : 'Recent weeks'} · selected emotions</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(data.emotional.emotions[k]).map(([e, n]) => (
                        <Badge key={e} variant="outline">
                          {e} ×{n}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {section !== 'opportunities'
            ? (byCat[section] ?? []).map((i, idx) => (
                <InsightCard key={i.id} insight={i} defaultOpen={idx === 0} onUseQuestion={(x) => useQuestion(x.id, x.suggestedQuestion!)} usedQuestion={used.has(i.id)} />
              ))
            : null}
          {section !== 'opportunities' && !(byCat[section] ?? []).length ? (
            <EmptyState icon={Sparkles} title="Nothing detected here" description={section === 'emerging' || section === 'disappearing' ? data.dataGap ?? 'No significant shifts between recent and earlier reflections.' : 'The analysis found no evidence for this category.'} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

