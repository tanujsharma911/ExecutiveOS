import { ArrowRight, CalendarClock, CheckCircle2, ChevronRight, Clock, FileText, Target } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ErrorState, Loading, SectionTitle } from '@/components/common/Page'
import { CommitmentStatusBadge, OverdueFlag } from '@/components/common/Status'
import { StatusUpdateDialog } from '@/components/features/Commitments'
import { StreakFlame } from '@/components/features/Growth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/ui/misc'
import { useApi } from '@/lib/api'
import type { Commitment, Session, Submission } from '@/lib/types'
import { cn, fmtDate, fmtDateTime, relative } from '@/lib/utils'
import { useAuth } from '@/store/auth'

export interface PendingForm {
  formId: string
  title: string
  description: string
  frequency: string
  questionCount: number
  periodStart: string
  dueAt: string
  status: 'PENDING' | 'DRAFT' | 'SUBMITTED'
  submissionId: string | null
  updatedAt: string | null
}

interface Dash {
  profile: { program: { name: string } | null; coach: { name: string; title: string; avatarColor: string } }
  pending: PendingForm[]
  weeklyStreak: { current: number; best: number; total: number }
  dailyStreak: { current: number; best: number; total: number; doneToday: boolean; graceUsed: boolean; last14: boolean[] }
  commitments: Commitment[]
  nextSession: Session | null
  recent: Submission[]
}

export function PendingFormCard({ f }: { f: PendingForm }) {
  const navigate = useNavigate()
  const done = f.status === 'SUBMITTED'
  const hoursLeft = (new Date(f.dueAt).getTime() - Date.now()) / 3_600_000
  return (
    <button
      disabled={done}
      onClick={() => navigate(`/client/forms/${f.formId}`)}
      className={cn('group flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition', done ? 'opacity-70' : 'hover:border-foreground/25 hover:shadow-sm cursor-pointer')}
    >
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', done ? 'bg-success-soft text-success' : 'bg-muted')}>{done ? <CheckCircle2 className="size-5" /> : <FileText className="size-[18px]" />}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium">{f.title}</span>
          {f.status === 'DRAFT' ? <Badge variant="warning">Draft saved</Badge> : null}
          {done ? <Badge variant="success">Submitted</Badge> : null}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Clock className="size-3" />
          {done ? `Done for this ${f.frequency === 'DAILY' ? 'day' : f.frequency === 'WEEKLY' ? 'week' : 'period'}` : `Due ${hoursLeft < 30 ? relative(f.dueAt) : fmtDate(f.dueAt, { weekday: 'short', month: 'short', day: 'numeric' })}`} · {f.questionCount} questions
        </div>
      </div>
      {!done ? (
        <span className="hidden items-center gap-1 text-[13px] font-medium sm:flex">
          {f.status === 'DRAFT' ? 'Continue' : 'Start'} <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      ) : null}
    </button>
  )
}

export default function ClientDashboard() {
  const { data, error } = useApi<Dash>('/client/dashboard')
  const user = useAuth((s) => s.user)!
  const [updating, setUpdating] = useState<Commitment | null>(null)
  if (error) return <ErrorState message={error} />
  if (!data) return <Loading />
  const open = data.pending.filter((p) => p.status !== 'SUBMITTED')

  return (
    <div className="grid gap-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[12.5px] text-muted-foreground">{fmtDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="mt-0.5 text-[24px] font-semibold tracking-tight">Welcome back, {user.name.split(' ')[0]}.</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {open.length ? `You have ${open.length} reflection${open.length === 1 ? '' : 's'} waiting.` : 'You are all caught up — nice work.'}
          </p>
        </div>
        <Card className="px-4 py-3">
          <StreakFlame days={data.dailyStreak.current} graceUsed={data.dailyStreak.graceUsed} />
        </Card>
      </div>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 content-start gap-7">
          <section>
            <SectionTitle>Reflections</SectionTitle>
            <div className="grid gap-2">
              {data.pending.map((f) => (
                <PendingFormCard key={f.formId} f={f} />
              ))}
            </div>
          </section>

          <section>
            <SectionTitle right={<Link to="/client/commitments" className="text-[12.5px] text-muted-foreground hover:text-foreground">All →</Link>}>My commitments</SectionTitle>
            <Card className="divide-y">
              {data.commitments.slice(0, 5).map((c) => (
                <button key={c.id} onClick={() => setUpdating(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 cursor-pointer">
                  <Target className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium">{c.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                      <CommitmentStatusBadge status={c.status} /> due {fmtDate(c.dueDate)} {new Date(c.dueDate) < new Date() ? <OverdueFlag /> : null}
                    </div>
                  </div>
                  <span className="text-[12.5px] text-muted-foreground">Update</span>
                </button>
              ))}
              {!data.commitments.length ? <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">No open commitments.</div> : null}
            </Card>
          </section>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          {data.nextSession ? (
            <Card className="overflow-hidden">
              <div className="bg-[#141416] px-4 py-4 text-white">
                <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-white/60">
                  <CalendarClock className="size-3.5" /> Next coaching session
                </div>
                <div className="mt-1.5 text-[16px] font-semibold">{data.nextSession.topic}</div>
                <div className="text-[13px] text-white/70">{fmtDateTime(data.nextSession.scheduledAt)}</div>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-3">
                <Avatar name={data.profile.coach.name} color={data.profile.coach.avatarColor} size={28} />
                <div className="text-[12.5px]">
                  <div className="font-medium">{data.profile.coach.name}</div>
                  <div className="text-muted-foreground">{data.profile.coach.title}</div>
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Recently submitted</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {data.recent.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-[12.5px]">
                  <span>{s.form.title}</span>
                  <span className="text-muted-foreground">{fmtDate(s.submittedAt)}</span>
                </div>
              ))}
              <Button asChild variant="ghost" size="sm" className="justify-self-start px-1">
                <Link to="/client/reflections/weekly">
                  History <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <p className="text-center text-[11.5px] text-muted-foreground">{data.profile.program?.name}</p>
        </div>
      </div>
      <StatusUpdateDialog commitment={updating} open={!!updating} onOpenChange={(v) => !v && setUpdating(null)} role="CLIENT" />
    </div>
  )
}
