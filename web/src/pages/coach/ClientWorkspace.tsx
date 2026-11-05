import { AreaChart, ArrowLeft, BarChart3, BrainCircuit, CalendarClock, LayoutDashboard, LineChart, ListChecks, NotebookPen, Plus, Route, Save, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AgLineChart, type TrendChartType } from '@/components/common/AgLineChart'
import { AiGenerating } from '@/components/common/AiGenerating'
import { mergeSeries } from '@/components/common/Charts'
import { InsightCard } from '@/components/common/Insight'
import { ErrorState, SectionTitle } from '@/components/common/Page'
import { EngagementBadge } from '@/components/common/Status'
import { CommitmentDialog, CommitmentsPanel, emptyCommitment } from '@/components/features/Commitments'
import { GrowthView } from '@/components/features/Growth'
import { IntelligenceView } from '@/components/features/IntelligenceView'
import { ReflectionsList } from '@/components/features/Reflections'
import { SessionsPanel } from '@/components/features/Sessions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Avatar, Skeleton } from '@/components/ui/misc'
import { Segmented, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, useApi } from '@/lib/api'
import type { Commitment, Insight, MetricSeries, Session, Submission } from '@/lib/types'
import { cn, fmtDate, relative } from '@/lib/utils'

interface ClientDetail {
  profile: {
    id: string
    company: string
    designation: string
    industry: string
    companySize: string
    location: string
    phone: string | null
    startDate: string
    coachNotes: string
    user: { name: string; email: string; avatarColor: string }
    program: { name: string; durationWeeks: number } | null
    commitments: Commitment[]
    sessions: Session[]
  }
  engagement: { status: 'Active' | 'Slipping' | 'At risk'; daysSince: number | null }
  series: MetricSeries[]
  emotions: { early: Record<string, number>; recent: Record<string, number> }
  patterns: Insight[]
  recentReflections: Submission[]
  activity: { date: string; kind: string; text: string }[]
}

function HeaderSkeleton() {
  return (
    <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center" aria-busy="true" aria-label="Loading client">
      <Skeleton className="size-14 shrink-0 rounded-full" />
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-72 max-w-full" />
        <Skeleton className="h-3 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-40" />
      </div>
    </div>
  )
}

/** Mirrors the Overview tab: AI summary, trends, patterns, recent reflections | notes, activity. */
function OverviewSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]" aria-busy="true">
      <div className="grid min-w-0 content-start gap-6">
        <Card className="border-ai/20 bg-ai-soft/30">
          <CardContent className="grid gap-2 pt-5">
            <Skeleton className="mb-1 h-3 w-24" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="mt-1 h-3 w-28" />
          </CardContent>
        </Card>
        <section>
          <SectionTitle>Emotional & confidence trends</SectionTitle>
          <Card className="grid gap-3 p-4">
            <Skeleton className="h-[220px] w-full" />
            <div className="flex gap-2">
              {[20, 16, 24, 18].map((w, i) => (
                <Skeleton key={i} className="h-5 rounded-full" style={{ width: `${w * 4}px` }} />
              ))}
            </div>
          </Card>
        </section>
        <section>
          <SectionTitle>Emerging behavioral patterns</SectionTitle>
          <div className="grid gap-2.5">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="grid gap-2 p-4">
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-36 rounded-full" />
                  <Skeleton className="h-5 w-28 rounded-full" />
                </div>
                <Skeleton className="h-4 w-60" />
                <Skeleton className="h-3 w-80 max-w-full" />
              </Card>
            ))}
          </div>
        </section>
        <section>
          <SectionTitle>Recent reflections</SectionTitle>
          <Card className="divide-y">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 px-4 py-3">
                <Skeleton className="h-3 w-12 shrink-0" />
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              </div>
            ))}
          </Card>
        </section>
      </div>
      <div className="grid min-w-0 content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Coach notes</CardTitle>
            <span className="text-[11px] text-muted-foreground">Private</span>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Skeleton className="h-[132px] w-full" />
            <Skeleton className="h-8 w-28 justify-self-end" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-2.5">
                <Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const CHART_TYPE_KEY = 'eos.trendChartType'
const CHART_TYPES: { value: TrendChartType; label: React.ReactNode }[] = [
  { value: 'line', label: <span className="flex items-center gap-1"><LineChart className="size-3.5" /> Line</span> },
  { value: 'area', label: <span className="flex items-center gap-1"><AreaChart className="size-3.5" /> Area</span> },
  { value: 'bar', label: <span className="flex items-center gap-1"><BarChart3 className="size-3.5" /> Bar</span> },
]

/** Chart type for the trends graph, remembered in this browser (falls back to Line if storage is unavailable). */
function useChartType(): [TrendChartType, (t: TrendChartType) => void] {
  const [type, setType] = useState<TrendChartType>(() => {
    try {
      const v = localStorage.getItem(CHART_TYPE_KEY)
      return v === 'area' || v === 'bar' ? v : 'line'
    } catch {
      return 'line'
    }
  })
  const update = (t: TrendChartType) => {
    setType(t)
    try {
      localStorage.setItem(CHART_TYPE_KEY, t)
    } catch {
      /* private mode etc. — keep it for this visit only */
    }
  }
  return [type, update]
}

export default function ClientWorkspace() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'overview'
  const { data, error, reload } = useApi<ClientDetail>(`/coach/clients/${id}`, [id])
  // The only LLM-written part of the Overview; loads on its own so the rest of the page doesn't wait.
  const summary = useApi<{ narrative: string }>(`/coach/clients/${id}/intelligence`, [id])
  const [notes, setNotes] = useState('')
  const [newCommitment, setNewCommitment] = useState(false)
  const [chartType, setChartType] = useChartType()
  const navigate = useNavigate()
  useEffect(() => setNotes(data?.profile.coachNotes ?? ''), [data?.profile.coachNotes])

  if (error) return <ErrorState message={error} />
  // The header and Overview wait for this request; the other tabs load their own data straight away.
  const clientId = id!
  const p = data?.profile
  const week = !p ? 1 : Math.max(1, Math.ceil((Date.now() - new Date(p.startDate).getTime()) / (7 * 86_400_000)))
  const next = (p?.sessions ?? []).filter((s) => s.status === 'SCHEDULED' && new Date(s.scheduledAt) > new Date()).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]
  const chart = mergeSeries((data?.series ?? []).filter((s) => ['confidence', 'energy', 'stress'].includes(s.key)))

  return (
    <div>
      <Link to="/coach/clients" className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> My Clients
      </Link>
      {data && p ? (
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center">
        <Avatar name={p.user.name} color={p.user.avatarColor} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight">{p.user.name}</h1>
            <EngagementBadge status={data.engagement.status} />
          </div>
          <div className="text-[13.5px] text-muted-foreground">
            {p.designation}, {p.company} · {p.industry}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[12.5px] text-muted-foreground">
            <span>{p.program?.name}</span>
            <span>·</span>
            <span>
              Week {week} of {p.program?.durationWeeks ?? '—'}
            </span>
            <span>·</span>
            <span>Started {fmtDate(p.startDate, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setNewCommitment(true)}>
            <Plus /> Commitment
          </Button>
          {next ? (
            <Button variant="ai" onClick={() => navigate(`/coach/sessions/${next.id}/prep`)}>
              <Sparkles /> Prep {fmtDate(next.scheduledAt)} session
            </Button>
          ) : null}
        </div>
      </div>
      ) : (
        <HeaderSkeleton />
      )}

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutDashboard /> Overview
          </TabsTrigger>
          <TabsTrigger value="reflections">
            <NotebookPen /> Reflections
          </TabsTrigger>
          <TabsTrigger value="insights">
            <BrainCircuit /> AI Insights
          </TabsTrigger>
          <TabsTrigger value="commitments">
            <ListChecks /> Commitments
          </TabsTrigger>
          <TabsTrigger value="growth">
            <Route /> Growth Journey
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <CalendarClock /> Session History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {data && p ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="grid min-w-0 content-start gap-6">
              <Card className="border-ai/20 bg-ai-soft/30">
                <CardContent className="pt-5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ai">
                    <Sparkles className="size-3" /> AI summary
                  </div>
                  {summary.data ? (
                    <p className="animate-rise text-[13.5px] leading-relaxed text-foreground/85">{summary.data.narrative}</p>
                  ) : summary.error ? (
                    <p className="text-[13px] text-muted-foreground">{summary.error}</p>
                  ) : (
                    <AiGenerating className="py-1" lines={4} />
                  )}
                  <Button size="sm" variant="link" className="mt-1 h-auto px-0 text-ai" onClick={() => setParams({ tab: 'insights' })}>
                    Open full analysis →
                  </Button>
                </CardContent>
              </Card>

              <section>
                <SectionTitle right={<Segmented value={chartType} onChange={setChartType} options={CHART_TYPES} />}>Emotional & confidence trends</SectionTitle>
                <Card className="p-4">
                  <AgLineChart
                    type={chartType}
                    data={chart}
                    domain={[0, 10]}
                    lines={[
                      { key: 'confidence', label: 'Leadership confidence', color: 'var(--ai)' },
                      { key: 'energy', label: 'Energy', color: '#ca8a04' },
                      { key: 'stress', label: 'Stress', color: '#dc2626', dashed: true },
                    ]}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                    Recent emotions:
                    {Object.entries(data.emotions.recent).map(([e, n]) => (
                      <Badge key={e} variant="outline">
                        {e} ×{n}
                      </Badge>
                    ))}
                    <span className="ml-auto">Self-reported in weekly reflections</span>
                  </div>
                </Card>
              </section>

              <section>
                <SectionTitle right={<button className="text-[12.5px] text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => setParams({ tab: 'insights' })}>All insights →</button>}>Emerging behavioral patterns</SectionTitle>
                <div className="grid gap-2.5">
                  {data.patterns.map((i) => (
                    <InsightCard key={i.id} insight={i} />
                  ))}
                </div>
              </section>

              <section>
                <SectionTitle right={<button className="text-[12.5px] text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => setParams({ tab: 'reflections' })}>All reflections →</button>}>Recent reflections</SectionTitle>
                <Card className="divide-y">
                  {data.recentReflections.map((s) => {
                    const lead = s.answers.find((a) => a.type === 'LONG_TEXT' && a.value)
                    const emotion = s.answers.find((a) => a.metricKey === 'emotion')?.value as string | undefined
                    return (
                      <div key={s.id} className="flex gap-3 px-4 py-3">
                        <div className="w-14 shrink-0 text-[12px] font-medium text-muted-foreground">{fmtDate(s.submittedAt)}</div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[12.5px]">
                            <span className="font-medium">{s.form.title}</span>
                            {emotion ? <Badge variant="ai">{emotion}</Badge> : null}
                          </div>
                          {lead ? <p className="mt-0.5 font-serif text-[15px] leading-snug text-foreground/85">“{String(lead.value)}”</p> : null}
                        </div>
                      </div>
                    )
                  })}
                </Card>
              </section>
            </div>

            <div className="grid min-w-0 content-start gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Coach notes</CardTitle>
                  <span className="text-[11px] text-muted-foreground">Private</span>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="justify-self-end"
                    disabled={notes === p.coachNotes}
                    onClick={async () => {
                      await api(`/coach/clients/${p.id}`, { method: 'PATCH', json: { coachNotes: notes } })
                      toast.success('Notes saved')
                      reload()
                    }}
                  >
                    <Save /> Save notes
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="grid gap-2.5 border-l pl-4">
                    {data.activity.map((a, i) => (
                      <li key={i} className="relative text-[12.5px]">
                        <span className={cn('absolute -left-[21px] top-1.5 size-2 rounded-full ring-2 ring-card', a.kind === 'reflection' ? 'bg-ai' : a.kind === 'session' ? 'bg-foreground' : 'bg-warning')} />
                        <div>{a.text}</div>
                        <div className="text-[11px] text-muted-foreground">{relative(a.date)}</div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </div>
          </div>
          ) : (
            <OverviewSkeleton />
          )}
        </TabsContent>

        <TabsContent value="reflections">
          <ReflectionsList clientId={clientId} />
        </TabsContent>
        <TabsContent value="insights">
          <IntelligenceView clientId={clientId} compact />
        </TabsContent>
        <TabsContent value="commitments">
          <CommitmentsPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="growth">
          <GrowthView path={`/coach/clients/${clientId}/growth`} activityPath={`/coach/clients/${clientId}/activity`} />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsPanel clientId={clientId} />
        </TabsContent>
      </Tabs>

      <CommitmentDialog open={newCommitment} onOpenChange={setNewCommitment} initial={emptyCommitment(clientId, null)} onSaved={reload} />
    </div>
  )
}
