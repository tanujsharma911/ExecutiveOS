import { CalendarClock, CalendarPlus, Check, ChevronRight, ExternalLink, Link2, Plus, Sparkles, Video, Wand2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { EvidenceQuote } from '@/components/common/Insight'
import { EmptyState } from '@/components/common/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { Avatar, Skeleton } from '@/components/ui/misc'
import { Segmented } from '@/components/ui/tabs'
import { api, isAbortError, useAbortScope, useApi } from '@/lib/api'
import type { ClientRow, Evidence, Priority, Session } from '@/lib/types'
import { fmtDate, fmtTime } from '@/lib/utils'
import { useUi } from '@/store/ui'
import { CommitmentDialog, emptyCommitment, type CommitmentDraft } from './Commitments'

interface Draft {
  id?: string
  clientId: string
  date: string
  time: string
  durationMin: number
  topic: string
  status: Session['status']
  summary: string
  topics: string
  observations: string
  decisions: string
  followUps: string
  meetingLink: string
}

const isValidLink = (v: string) => v.trim() === '' || /^https?:\/\/\S+$/i.test(v.trim())

/** Short, readable label for a meeting URL, e.g. "meet.google.com". */
export function meetingHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

interface AssistResult {
  themes: { key: string; label: string }[]
  commitments: { title: string; description: string; goal: string; priority: Priority }[]
  relevantReflections: Evidence[]
  followUpQuestions: string[]
  mode: string
}

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

function toDraft(s?: Session, clientId = ''): Draft {
  const d = s ? new Date(s.scheduledAt) : new Date()
  return {
    id: s?.id,
    clientId: s?.clientId ?? clientId,
    date: d.toISOString().slice(0, 10),
    time: d.toISOString().slice(11, 16),
    durationMin: s?.durationMin ?? 60,
    topic: s?.topic ?? '',
    status: s?.status ?? 'COMPLETED',
    summary: s?.summary ?? '',
    topics: s?.topics.join(', ') ?? '',
    observations: s?.observations ?? '',
    decisions: s?.decisions.join('\n') ?? '',
    followUps: s?.followUps.join('\n') ?? '',
    meetingLink: s?.meetingLink ?? '',
  }
}

export function SessionRecordDialog({ open, onOpenChange, session, clientId, clients }: { open: boolean; onOpenChange: (v: boolean) => void; session?: Session; clientId?: string; clients?: { id: string; name: string }[] }) {
  const [d, setD] = useState<Draft>(toDraft(session, clientId))
  const [assist, setAssist] = useState<AssistResult | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [commitmentDraft, setCommitmentDraft] = useState<CommitmentDraft | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const bump = useUi((s) => s.bump)
  const scope = useAbortScope()
  useEffect(() => {
    if (open) {
      setD(toDraft(session, clientId))
      setAssist(null)
      setSavedId(null)
      setAccepted(new Set())
    } else {
      scope.abortAll() // dialog closed: stop waiting for AI suggestions
    }
  }, [open, session, clientId, scope])
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))

  async function save() {
    setBusy(true)
    try {
      const json = {
        clientId: d.clientId,
        scheduledAt: new Date(`${d.date}T${d.time}:00Z`).toISOString(),
        durationMin: Number(d.durationMin),
        topic: d.topic,
        status: d.status,
        summary: d.summary,
        topics: d.topics.split(',').map((t) => t.trim()).filter(Boolean),
        observations: d.observations,
        decisions: lines(d.decisions),
        followUps: lines(d.followUps),
        meetingLink: d.meetingLink.trim(),
      }
      const s = d.id ? await api<Session>(`/sessions/${d.id}`, { method: 'PATCH', json }) : await api<Session>('/sessions', { method: 'POST', json })
      setSavedId(s.id)
      bump()
      if (d.status === 'COMPLETED') {
        toast.success('Session saved — generating AI suggestions')
        setAssist(await api<AssistResult>(`/sessions/${s.id}/assist`, { method: 'POST', signal: scope.next() }))
      } else {
        toast.success('Session scheduled')
        onOpenChange(false)
      }
    } catch (e) {
      if (isAbortError(e)) return // dialog closed or component unmounted
      toast.error((e as Error).message)
    }
    setBusy(false)
  }

  async function addFollowUp(q: string) {
    if (!savedId) return
    const next = [...lines(d.followUps), q]
    set('followUps', next.join('\n'))
    await api(`/sessions/${savedId}`, { method: 'PATCH', json: { followUps: next } })
    setAccepted((s) => new Set(s).add(q))
    toast.success('Added to follow-up items')
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent wide>
          <DialogHeader title={assist ? 'AI suggestions for review' : d.id ? 'Edit session record' : 'New session'} description={assist ? 'Nothing is saved until you approve it.' : 'Record what happened so the AI can connect it with reflections.'} />
          {!assist ? (
            <DialogBody className="grid gap-3.5">
              <div className="grid gap-3 sm:grid-cols-4">
                {clients && !d.id ? (
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label>Client</Label>
                    <NativeSelect value={d.clientId} onChange={(e) => set('clientId', e.target.value)}>
                      <option value="">Select…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={d.date} onChange={(e) => set('date', e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Time (UTC)</Label>
                  <Input type="time" value={d.time} onChange={(e) => set('time', e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Duration (min)</Label>
                  <Input type="number" min={10} value={d.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <NativeSelect value={d.status} onChange={(e) => set('status', e.target.value as Session['status'])}>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </NativeSelect>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Topic</Label>
                <Input value={d.topic} onChange={(e) => set('topic', e.target.value)} placeholder="e.g. Delegation and the CTO relationship" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="meeting-link">Meeting link</Label>
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="meeting-link" type="url" inputMode="url" value={d.meetingLink} onChange={(e) => set('meetingLink', e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" className="pl-9" aria-invalid={!isValidLink(d.meetingLink)} />
                </div>
                {!isValidLink(d.meetingLink) ? <p className="text-[12px] text-danger">Enter a full link starting with https://</p> : <p className="text-[12px] text-muted-foreground">Zoom, Google Meet, Teams or any video call link. Shared with the client.</p>}
              </div>
              {d.status === 'COMPLETED' ? (
                <>
                  <div className="grid gap-1.5">
                    <Label>Session summary</Label>
                    <Textarea value={d.summary} onChange={(e) => set('summary', e.target.value)} rows={3} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label>Topics discussed (comma separated)</Label>
                      <Input value={d.topics} onChange={(e) => set('topics', e.target.value)} placeholder="Delegation, Trust, Board" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Coach observations (private)</Label>
                      <Input value={d.observations} onChange={(e) => set('observations', e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Decisions made (one per line)</Label>
                      <Textarea value={d.decisions} onChange={(e) => set('decisions', e.target.value)} rows={3} placeholder="Hand roadmap ownership back to Marcus by Friday" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Follow-up items (one per line)</Label>
                      <Textarea value={d.followUps} onChange={(e) => set('followUps', e.target.value)} rows={3} />
                    </div>
                  </div>
                </>
              ) : null}
            </DialogBody>
          ) : (
            <DialogBody className="grid gap-5">
              <div>
                <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Themes discussed</div>
                <div className="flex flex-wrap gap-1.5">
                  {assist.themes.map((t) => (
                    <Badge key={t.key} variant="ai">
                      {t.label}
                    </Badge>
                  ))}
                  {!assist.themes.length ? <span className="text-[13px] text-muted-foreground">No known themes detected.</span> : null}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Commitments to create</div>
                <div className="grid gap-2">
                  {assist.commitments.map((c) => (
                    <div key={c.title} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium">{c.title}</div>
                        <div className="text-[12px] text-muted-foreground">{c.goal}</div>
                      </div>
                      <Button
                        size="sm"
                        variant={accepted.has(c.title) ? 'secondary' : 'outline'}
                        disabled={accepted.has(c.title)}
                        onClick={() => setCommitmentDraft({ ...emptyCommitment(d.clientId, savedId), title: c.title, description: c.description, goal: c.goal, priority: c.priority })}
                      >
                        {accepted.has(c.title) ? <Check /> : <Plus />} {accepted.has(c.title) ? 'Created' : 'Review & create'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Relevant previous reflections</div>
                <div className="grid gap-2">
                  {assist.relevantReflections.map((e, i) => (
                    <EvidenceQuote key={i} e={e} compact />
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Potential follow-up questions</div>
                <div className="grid gap-2">
                  {assist.followUpQuestions.map((q) => (
                    <div key={q} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                      <p className="flex-1 font-serif text-[15px]">{q}</p>
                      <Button size="sm" variant="ghost" disabled={accepted.has(q)} onClick={() => addFollowUp(q)}>
                        {accepted.has(q) ? <Check /> : <Plus />} {accepted.has(q) ? 'Added' : 'Add'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </DialogBody>
          )}
          <DialogFooter>
            {assist ? (
              <>
                <span className="mr-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Sparkles className="size-3.5 text-ai" /> Generated by the {assist.mode.startsWith('llm') ? `live model (${assist.mode.slice(4)})` : 'deterministic analyst'} — review before acting
                </span>
                <Button onClick={() => onOpenChange(false)}>Done</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={busy || !d.topic || !d.clientId || !isValidLink(d.meetingLink)}>
                  {d.status === 'COMPLETED' ? <Wand2 /> : <CalendarPlus />} {d.status === 'COMPLETED' ? 'Save & get AI suggestions' : 'Save'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CommitmentDialog
        open={!!commitmentDraft}
        onOpenChange={(v) => !v && setCommitmentDraft(null)}
        initial={commitmentDraft ?? emptyCommitment()}
        onSaved={() => commitmentDraft && setAccepted((s) => new Set(s).add(commitmentDraft.title))}
      />
    </>
  )
}

function SessionCardsSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading sessions">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
          <Skeleton className="h-[66px] w-16 shrink-0 rounded-lg" />
          <div className="grid flex-1 gap-2 pt-0.5">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="grid gap-2 sm:w-32">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export function SessionsPanel({ clientId, role = 'COACH' }: { clientId?: string; role?: 'COACH' | 'CLIENT' }) {
  const { data, loading } = useApi<Session[]>(`/sessions${clientId && role === 'COACH' ? `?clientId=${clientId}` : ''}`, [clientId])
  const clients = useApi<ClientRow[]>(role === 'COACH' && !clientId ? '/coach/clients' : null)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [editing, setEditing] = useState<{ session?: Session } | null>(null)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  const list = useMemo(() => {
    const now = Date.now() - 3_600_000
    const s = (data ?? []).filter((x) => (tab === 'upcoming' ? x.status === 'SCHEDULED' && new Date(x.scheduledAt).getTime() >= now : x.status !== 'SCHEDULED' || new Date(x.scheduledAt).getTime() < now))
    const f = s.filter((x) => !q || `${x.topic} ${x.summary} ${x.topics.join(' ')} ${x.client?.user.name}`.toLowerCase().includes(q.toLowerCase()))
    return tab === 'upcoming' ? f.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)) : f
  }, [data, tab, q])

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'History' }]} />
        <Input placeholder="Search sessions…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        {role === 'COACH' ? (
          <Button className="sm:ml-auto" onClick={() => setEditing({})}>
            <Plus /> New session record
          </Button>
        ) : null}
      </div>
      {loading && !data ? <SessionCardsSkeleton /> : null}
      {data && !list.length ? <EmptyState icon={CalendarClock} title={tab === 'upcoming' ? 'No upcoming sessions' : 'No past sessions'} /> : null}
      <div className="grid gap-3">
        {list.map((s) => (
          <Card key={s.id} className="p-0">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
              <div className="flex w-16 shrink-0 flex-col items-center rounded-lg border bg-muted/40 py-1.5 text-center">
                <span className="text-[11px] font-medium uppercase text-muted-foreground">{fmtDate(s.scheduledAt, { month: 'short' })}</span>
                <span className="text-[20px] font-semibold leading-none">{fmtDate(s.scheduledAt, { day: 'numeric' })}</span>
                <span className="text-[10.5px] text-muted-foreground">{fmtTime(s.scheduledAt)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {role === 'COACH' && !clientId && s.client ? (
                    <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                      <Avatar name={s.client.user.name} color={s.client.user.avatarColor} size={18} /> {s.client.user.name}
                    </span>
                  ) : null}
                  <Badge variant={s.status === 'COMPLETED' ? 'success' : s.status === 'SCHEDULED' ? 'ai' : 'outline'}>{s.status === 'COMPLETED' ? 'Completed' : s.status === 'SCHEDULED' ? 'Scheduled' : 'Cancelled'}</Badge>
                  <span className="text-[12px] text-muted-foreground">{s.durationMin} min</span>
                </div>
                <div className="mt-1 text-[14px] font-semibold">{s.topic}</div>
                {s.meetingLink ? (
                  <a href={s.meetingLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1.5 text-[12.5px] text-ai hover:underline">
                    <Video className="size-3.5 shrink-0" />
                    <span className="truncate">{meetingHost(s.meetingLink)}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                ) : null}
                {s.summary ? <p className="mt-1 text-[13px] leading-relaxed text-foreground/80">{s.summary}</p> : null}
                {s.topics.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.topics.map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {s.status === 'COMPLETED' ? (
                  <div className="mt-3 grid gap-3 text-[12.5px] sm:grid-cols-3">
                    {role === 'COACH' && s.observations ? (
                      <div>
                        <div className="font-medium text-muted-foreground">Observations (private)</div>
                        <div>{s.observations}</div>
                      </div>
                    ) : null}
                    {s.decisions.length ? (
                      <div>
                        <div className="font-medium text-muted-foreground">Decisions</div>
                        <ul className="list-disc pl-4">{s.decisions.map((x) => <li key={x}>{x}</li>)}</ul>
                      </div>
                    ) : null}
                    {s.followUps.length ? (
                      <div>
                        <div className="font-medium text-muted-foreground">Follow-ups</div>
                        <ul className="list-disc pl-4">{s.followUps.map((x) => <li key={x}>{x}</li>)}</ul>
                      </div>
                    ) : null}
                    {s.commitments?.length ? (
                      <div>
                        <div className="font-medium text-muted-foreground">New commitments</div>
                        <ul className="list-disc pl-4">{s.commitments.map((x) => <li key={x.id}>{x.title}</li>)}</ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {role === 'COACH' ? (
                <div className="flex shrink-0 gap-2 sm:flex-col">
                  {s.status === 'SCHEDULED' ? (
                    <Button size="sm" variant="ai" onClick={() => navigate(`/coach/sessions/${s.id}/prep`)}>
                      <Sparkles /> AI brief <ChevronRight />
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => setEditing({ session: s })}>
                    {s.status === 'SCHEDULED' ? 'Record outcome' : 'Edit'}
                  </Button>
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
      {role === 'COACH' ? (
        <SessionRecordDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          session={editing?.session ? { ...editing.session, status: editing.session.status === 'SCHEDULED' ? 'COMPLETED' : editing.session.status } : undefined}
          clientId={clientId}
          clients={clients.data?.map((c) => ({ id: c.id, name: c.name }))}
        />
      ) : null}
    </div>
  )
}

