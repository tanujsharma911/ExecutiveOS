import { ArrowLeft, Bookmark, Check, CircleCheck, Clock, History, ListChecks, MessageCircleQuestion, NotebookPen, Save, Sparkles, ThumbsDown, ThumbsUp, User, Workflow } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EvidenceQuote, HypothesisBox } from '@/components/common/Insight'
import { ErrorState, Loading } from '@/components/common/Page'
import { CommitmentStatusBadge, ConfidencePill } from '@/components/common/Status'
import { CommitmentDialog, emptyCommitment } from '@/components/features/Commitments'
import { SessionRecordDialog } from '@/components/features/Sessions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/misc'
import { api, useApi } from '@/lib/api'
import type { Commitment, Confidence, Evidence, Session } from '@/lib/types'
import { cn, fmtDate, fmtDateTime } from '@/lib/utils'

type FeedbackStatus = 'RELEVANT' | 'NOT_RELEVANT' | 'DISCUSSED' | 'FOLLOW_UP'
interface BriefItem {
  key: string
  text: string
  detail?: string
  evidence: Evidence[]
  confidence?: Confidence
  insightId?: string
}
interface BriefResponse {
  session: Session & { client: { user: { name: string; avatarColor: string } } }
  brief: {
    generatedAt: string
    model: string
    snapshot: { emotionalState: string; progress: string[]; lastSessionAt: string | null }
    explore: BriefItem[]
    questions: BriefItem[]
    commitments: { completed: Commitment[]; incomplete: Commitment[]; overdue: Commitment[] }
    context: BriefItem[]
    graph: string[]
  }
  feedback: { insightKey: string; status: FeedbackStatus }[]
}

const FEEDBACK: { value: FeedbackStatus; label: string; icon: React.ElementType; on: string }[] = [
  { value: 'RELEVANT', label: 'Relevant', icon: ThumbsUp, on: 'bg-ai text-white border-ai' },
  { value: 'NOT_RELEVANT', label: 'Not relevant', icon: ThumbsDown, on: 'bg-zinc-700 text-white border-zinc-700' },
  { value: 'DISCUSSED', label: 'Discussed', icon: Check, on: 'bg-success text-white border-success' },
  { value: 'FOLLOW_UP', label: 'Follow up later', icon: Bookmark, on: 'bg-warning text-white border-warning' },
]

function FeedbackBar({ value, onChange }: { value?: FeedbackStatus; onChange: (v: FeedbackStatus | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {FEEDBACK.map((f) => (
        <button key={f.value} onClick={() => onChange(value === f.value ? null : f.value)} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium transition cursor-pointer', value === f.value ? f.on : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground')}>
          <f.icon className="size-3" /> {f.label}
        </button>
      ))}
    </div>
  )
}

function Section({ n, title, icon: Icon, children, right }: { n: number; title: string; icon: React.ElementType; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="animate-rise">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-[11.5px] font-semibold text-white">{n}</span>
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  )
}

export default function SessionPrep() {
  const { id } = useParams()
  const { data, error } = useApi<BriefResponse>(`/sessions/${id}/brief`, [id])
  const [fb, setFb] = useState<Record<string, FeedbackStatus>>({})
  const [prepNotes, setPrepNotes] = useState('')
  const [observations, setObservations] = useState('')
  const [record, setRecord] = useState(false)
  const [commitment, setCommitment] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!data) return
    setFb(Object.fromEntries(data.feedback.map((f) => [f.insightKey, f.status])))
    setPrepNotes(data.session.prepNotes ?? '')
    setObservations(data.session.observations ?? '')
  }, [data])

  if (error) return <ErrorState message={error} />
  if (!data)
    return (
      <div className="grid gap-3">
        <Loading label="Generating AI coaching brief…" />
      </div>
    )
  const { session, brief } = data

  async function mark(item: BriefItem, status: FeedbackStatus | null) {
    setFb((s) => {
      const n = { ...s }
      if (status) n[item.key] = status
      else delete n[item.key]
      return n
    })
    await api(`/sessions/${session.id}/feedback`, { method: 'PUT', json: { insightKey: item.key, label: item.text, status } })
  }

  const reviewed = Object.keys(fb).length
  const total = brief.explore.length + brief.questions.length

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/coach/sessions" className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Sessions
      </Link>

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start">
        <Avatar name={session.client.user.name} color={session.client.user.avatarColor} size={52} />
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ai">
            <Sparkles className="size-3.5" /> AI coaching brief
          </div>
          <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight">
            {session.client.user.name} — {session.topic}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> {fmtDateTime(session.scheduledAt)} · {session.durationMin} min
            </span>
            <span>
              Reviewed {reviewed}/{total} items
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(`/coach/clients/${session.clientId}?tab=insights`)}>
            Full analysis
          </Button>
          <Button variant="outline" onClick={() => setCommitment(true)}>
            <ListChecks /> Add commitment
          </Button>
          <Button onClick={() => setRecord(true)}>
            <NotebookPen /> Record outcome
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[11.5px] text-muted-foreground">
        <Workflow className="size-3.5" /> LangGraph pipeline:
        {brief.graph.map((g, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground/80">{g.replace('Node', '')}</span>
            {i < brief.graph.length - 1 ? <span>→</span> : null}
          </span>
        ))}
        <span className="ml-auto">{brief.model} · {fmtDate(brief.generatedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
      </div>

      <div className="grid gap-9">
        <Section n={1} title="Client snapshot" icon={User}>
          <Card className="grid gap-4 p-5 md:grid-cols-2">
            <div>
              <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Recent emotional state</div>
              <div className="mt-1 text-[13.5px] leading-relaxed">{brief.snapshot.emotionalState}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Self-reported</div>
            </div>
            <div>
              <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Progress since last session</div>
              <ul className="mt-1 grid gap-1.5">
                {brief.snapshot.progress.map((p) => (
                  <li key={p} className="flex gap-2 text-[13px] leading-snug">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-foreground/50" /> {p}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </Section>

        <Section n={2} title="Three things worth exploring" icon={Sparkles}>
          <div className="grid gap-3 md:grid-cols-3">
            {brief.explore.map((e) => (
              <Card key={e.key} className={cn('flex flex-col gap-3 p-4', fb[e.key] === 'NOT_RELEVANT' && 'opacity-60')}>
                <div className="flex items-center justify-between">{e.confidence ? <ConfidencePill level={e.confidence} /> : <span />}</div>
                <p className="text-[14.5px] font-semibold leading-snug">{e.text}</p>
                {e.detail ? <HypothesisBox className="text-[12.5px]">{e.detail}</HypothesisBox> : null}
                <div className="grid gap-2">
                  {e.evidence.slice(0, 2).map((ev, i) => (
                    <EvidenceQuote key={i} e={ev} compact />
                  ))}
                </div>
                <div className="mt-auto border-t pt-3">
                  <FeedbackBar value={fb[e.key]} onChange={(v) => mark(e, v)} />
                </div>
              </Card>
            ))}
          </div>
        </Section>

        <Section n={3} title="Suggested questions" icon={MessageCircleQuestion}>
          <Card className="divide-y">
            {brief.questions.map((q, i) => (
              <div key={q.key} className={cn('flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center', fb[q.key] === 'NOT_RELEVANT' && 'opacity-60')}>
                <span className="text-[12px] font-semibold tabular-nums text-muted-foreground">Q{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[17px] leading-snug">{q.text}</p>
                  {q.detail ? <p className="mt-0.5 text-[12px] text-muted-foreground">Based on: {q.detail}</p> : null}
                </div>
                <FeedbackBar value={fb[q.key]} onChange={(v) => mark(q, v)} />
              </div>
            ))}
          </Card>
        </Section>

        <Section n={4} title="Previous commitments" icon={ListChecks}>
          <div className="grid gap-3 md:grid-cols-3">
            {(
              [
                ['Overdue', brief.commitments.overdue, 'text-danger'],
                ['In flight', brief.commitments.incomplete, 'text-ai'],
                ['Completed', brief.commitments.completed, 'text-success'],
              ] as const
            ).map(([label, list, tone]) => (
              <Card key={label} className="p-4">
                <div className={cn('mb-2 flex items-center justify-between text-[12px] font-semibold uppercase tracking-wide', tone)}>
                  {label} <span className="tabular-nums">{list.length}</span>
                </div>
                <div className="grid gap-2.5">
                  {list.map((c) => (
                    <div key={c.id}>
                      <div className="text-[13px] font-medium leading-snug">{c.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                        <CommitmentStatusBadge status={c.status} /> due {fmtDate(c.dueDate)}
                      </div>
                      {(c as Commitment & { updates?: { note: string }[] }).updates?.[0]?.note ? <p className="mt-1 text-[12px] italic text-muted-foreground">“{(c as Commitment & { updates: { note: string }[] }).updates[0].note}”</p> : null}
                    </div>
                  ))}
                  {!list.length ? <p className="text-[12.5px] text-muted-foreground">None</p> : null}
                </div>
              </Card>
            ))}
          </div>
        </Section>

        <Section n={5} title="Important historical context" icon={History}>
          <div className="grid gap-3 md:grid-cols-2">
            {brief.context.map((c) => (
              <Card key={c.key} className="p-4">
                <div className="mb-2 text-[12.5px] font-semibold">{c.text}</div>
                {c.detail ? <p className="-mt-1 mb-2 text-[12px] text-muted-foreground">{c.detail}</p> : null}
                <div className="grid gap-2">
                  {c.evidence.map((e, i) => (
                    <EvidenceQuote key={i} e={e} compact />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </Section>

        <Section
          n={6}
          title="Coach notes"
          icon={NotebookPen}
          right={
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await api(`/sessions/${session.id}`, { method: 'PATCH', json: { prepNotes, observations } })
                toast.success('Notes saved')
              }}
            >
              <Save /> Save notes
            </Button>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-4">
              <div className="mb-1.5 text-[12.5px] font-medium">Preparation notes</div>
              <Textarea value={prepNotes} onChange={(e) => setPrepNotes(e.target.value)} rows={6} placeholder="What do you want to hold in mind going in?" />
            </Card>
            <Card className="p-4">
              <div className="mb-1.5 text-[12.5px] font-medium">Session observations</div>
              <Textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={6} placeholder="What you noticed during the session (private)" />
            </Card>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <CircleCheck className="size-3.5" /> Notes and AI feedback are private to you. Your ratings help the assistant prioritize future briefs.
          </p>
        </Section>
      </div>

      <SessionRecordDialog open={record} onOpenChange={setRecord} session={{ ...session, status: 'COMPLETED', observations }} />
      <CommitmentDialog open={commitment} onOpenChange={setCommitment} initial={emptyCommitment(session.clientId, session.id)} />
    </div>
  )
}
