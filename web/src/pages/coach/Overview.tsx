import type { ColDef } from 'ag-grid-community'
import { BookOpenCheck, BrainCircuit, CalendarClock, ChevronRight, Inbox, Sparkles, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { AgLineChart } from '@/components/common/AgLineChart'
import { Sparkline } from '@/components/common/Charts'
import { DataGrid } from '@/components/common/DataGrid'
import { ErrorState, SectionTitle, StatCard } from '@/components/common/Page'
import { EngagementBadge } from '@/components/common/Status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, Progress, Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/store/auth'
import { useApi } from '@/lib/api'
import type { ClientRow } from '@/lib/types'
import { fmtDate, fmtDateTime, relative } from '@/lib/utils'

interface Dashboard {
  coach: { name: string }
  stats: { activeClients: number; activePrograms: number; pendingReflections: number; upcomingSessions: number }
  clients: ClientRow[]
  upcoming: { id: string; clientId: string; clientName: string; avatarColor: string; scheduledAt: string; durationMin: number; topic: string; prepStatus: string }[]
  performance: {
    trend: { week: string; submissionRate: number; avgConfidence: number | null; avgEnergy: number | null; avgGoal: number | null }[]
    reflectionRate: number
    commitmentCompletion: number
    overdueCommitments: number
    avgGoalProgress: number
    byClient: { id: string; name: string; commitmentRate: number; goalProgress: number | null; confidence: number | null }[]
  }
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}


/** Mirrors the real layout so nothing jumps when data arrives. */
function OverviewSkeleton() {
  const name = useAuth((s) => s.user?.name ?? '')
  const firstName = name.replace(/^Dr\.\s*/, '').split(' ')[0]
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading overview">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[12.5px] text-muted-foreground">{fmtDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="mt-0.5 text-[24px] font-semibold tracking-tight">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}.
          </h1>
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="grid gap-2.5 px-4 py-3.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-10" />
            <Skeleton className="h-3 w-28" />
          </Card>
        ))}
      </div>
      <section>
        <SectionTitle>Client activity</SectionTitle>
        <Card className="divide-y">
          <div className="flex gap-6 px-4 py-3">
            {[24, 20, 16, 28, 16].map((w, i) => (
              <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
            ))}
          </div>
          {[0, 1, 2].map((r) => (
            <div key={r} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="size-7 rounded-full" />
              <div className="grid flex-1 gap-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="hidden h-5 w-16 rounded-full sm:block" />
              <Skeleton className="hidden h-3.5 w-24 md:block" />
            </div>
          ))}
        </Card>
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle>Upcoming sessions</SectionTitle>
          <Card className="divide-y">
            {[0, 1, 2].map((r) => (
              <div key={r} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="size-8 rounded-full" />
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-52" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            ))}
          </Card>
        </section>
        <section>
          <SectionTitle>Coaching performance</SectionTitle>
          <Card className="grid gap-4 p-5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-[170px] w-full" />
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}

export default function Overview() {
  const { data, loading, error } = useApi<Dashboard>('/coach/dashboard')
  const navigate = useNavigate()
  if (loading && !data) return <OverviewSkeleton />
  if (error) return <ErrorState message={error} />
  if (!data) return null

  const firstName = data.coach.name.replace(/^Dr\.\s*/, '').split(' ')[0]
  const columns: ColDef<ClientRow>[] = [
    {
      headerName: 'Client',
      field: 'name',
      minWidth: 210,
      flex: 1.4,
      cellRenderer: (p: { data: ClientRow }) => (
        <div className="flex h-full items-center gap-2.5">
          <Avatar name={p.data.name} color={p.data.avatarColor} size={28} />
          <div className="leading-tight">
            <div className="font-medium">{p.data.name}</div>
            <div className="text-[11.5px] text-muted-foreground">
              {p.data.designation}, {p.data.company}
            </div>
          </div>
        </div>
      ),
    },
    { headerName: 'Program', field: 'program', minWidth: 160 },
    { headerName: 'Last reflection', field: 'lastReflectionAt', minWidth: 130, valueFormatter: (p) => relative(p.value) },
    { headerName: 'Engagement', field: 'engagement', minWidth: 120, cellRenderer: (p: { value: ClientRow['engagement'] }) => <div className="flex h-full items-center"><EngagementBadge status={p.value} /></div> },
    {
      headerName: 'Confidence',
      field: 'confidence',
      minWidth: 140,
      cellRenderer: (p: { data: ClientRow }) => (
        <div className="flex h-full items-center gap-2 tabular-nums">
          <span className="w-7">{p.data.confidence ?? '—'}</span>
          <Sparkline values={p.data.confidenceTrend} color={(p.data.confidenceDelta ?? 0) < 0 ? '#b45309' : '#15803d'} />
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[12.5px] text-muted-foreground">{fmtDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="mt-0.5 text-[24px] font-semibold tracking-tight">
            {greeting()}, {firstName}.
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {data.stats.upcomingSessions} session{data.stats.upcomingSessions === 1 ? '' : 's'} in the next two weeks · {data.stats.pendingReflections} weekly reflection{data.stats.pendingReflections === 1 ? '' : 's'} still due
          </p>
        </div>
        <Button variant="ai" onClick={() => navigate('/coach/intelligence')}>
          <BrainCircuit /> Open AI Intelligence
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active clients" value={data.stats.activeClients} icon={Users} hint={`${data.clients.filter((c) => c.engagement === 'Active').length} engaged this week`} />
        <StatCard label="Active programs" value={data.stats.activePrograms} icon={BookOpenCheck} hint="With enrolled clients" />
        <StatCard label="Pending reflections" value={data.stats.pendingReflections} icon={Inbox} tone="warning" hint="Weekly reviews due this week" />
        <StatCard label="Upcoming sessions" value={data.stats.upcomingSessions} icon={CalendarClock} hint="Next 14 days" />
      </div>

      <section>
        <SectionTitle right={<Link to="/coach/clients" className="text-[12.5px] text-muted-foreground hover:text-foreground">All clients →</Link>}>Client activity</SectionTitle>
        <DataGrid rows={data.clients} columns={columns} autoHeight movableColumns onRowClick={(r) => navigate(`/coach/clients/${r.id}`)} />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
          <section>
            <SectionTitle right={<Link to="/coach/sessions" className="text-[12.5px] text-muted-foreground hover:text-foreground">History →</Link>}>Upcoming sessions</SectionTitle>
            <Card className="divide-y">
              {data.upcoming.map((s) => (
                <button key={s.id} onClick={() => navigate(`/coach/sessions/${s.id}/prep`)} className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 cursor-pointer first:rounded-t-xl last:rounded-b-xl">
                  <Avatar name={s.clientName} color={s.avatarColor} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{s.clientName}</span>
                      <Badge variant={s.prepStatus === 'Reviewed' ? 'success' : s.prepStatus === 'Brief ready' ? 'ai' : 'warning'}>
                        {s.prepStatus === 'Brief ready' ? <Sparkles /> : null}
                        {s.prepStatus}
                      </Badge>
                    </div>
                    <div className="truncate text-[12.5px] text-muted-foreground">{s.topic}</div>
                    <div className="text-[12px] text-muted-foreground/90">
                      {fmtDateTime(s.scheduledAt)} · {s.durationMin} min
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                </button>
              ))}
              {!data.upcoming.length ? <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">No upcoming sessions.</div> : null}
            </Card>
          </section>

          <section>
            <SectionTitle>Coaching performance</SectionTitle>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Client confidence & energy</CardTitle>
                  <CardDescription>Average self-reported confidence and energy across clients, by week</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-3">
                <AgLineChart
                  height={170}
                  data={data.performance.trend.map((t) => ({ date: t.week, energy: t.avgEnergy, conf: t.avgConfidence }))}
                  lines={[
                    { key: 'conf', label: 'Avg confidence', color: 'var(--ai)' },
                    { key: 'energy', label: 'Avg energy', color: '#ca8a04', dashed: true },
                  ]}
                  domain={[0, 10]}
                />
              </CardContent>
              <div className="grid grid-cols-3 divide-x border-t">
                {[
                  { l: 'Reflection rate', v: `${data.performance.reflectionRate}%`, h: 'last 4 weeks' },
                  { l: 'Commitments done', v: `${data.performance.commitmentCompletion}%`, h: `${data.performance.overdueCommitments} overdue` },
                  { l: 'Goal progress', v: `${data.performance.avgGoalProgress}%`, h: 'avg, self-reported' },
                ].map((k) => (
                  <div key={k.l} className="px-3 py-3">
                    <div className="text-[11.5px] text-muted-foreground">{k.l}</div>
                    <div className="text-[18px] font-semibold tabular-nums">{k.v}</div>
                    <div className="text-[11px] text-muted-foreground">{k.h}</div>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 border-t px-5 py-4">
                {data.performance.byClient.map((c) => (
                  <div key={c.id} className="grid gap-1">
                    <div className="flex justify-between text-[12.5px]">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground tabular-nums">goal {c.goalProgress ?? 0}% · commitments {c.commitmentRate}%</span>
                    </div>
                    <Progress value={c.goalProgress ?? 0} tone="ai" />
                  </div>
                ))}
              </div>
            </Card>
          </section>
      </div>
    </div>
  )
}
