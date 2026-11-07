import { CalendarPlus, Check, ChevronRight, ExternalLink, Link2, Plus, Sparkles, Video, Wand2 } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { EvidenceQuote } from '@/components/common/Insight'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { Avatar, Skeleton } from '@/components/ui/misc'
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

const SessionCalendar = lazy(() => import('./SessionCalendar'))

const STATUS_LABEL: Record<Session['status'], string> = { SCHEDULED: 'Scheduled', COMPLETED: 'Completed', CANCELLED: 'Cancelled' }
const STATUS_DOT: Record<Session['status'], string> = { SCHEDULED: 'bg-ai', COMPLETED: 'bg-success', CANCELLED: 'bg-muted-foreground/50' }

/** Everything about one session, shown when it's clicked in the calendar. */
function SessionDetails({ s, role, showClient }: { s: Session; role: 'COACH' | 'CLIENT'; showClient: boolean }) {
  return (
    <div className="grid gap-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        {showClient && s.client ? (
          <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <Avatar name={s.client.user.name} color={s.client.user.avatarColor} size={18} /> {s.client.user.name}
          </span>
        ) : null}
        <Badge variant={s.status === 'COMPLETED' ? 'success' : s.status === 'SCHEDULED' ? 'ai' : 'outline'}>{STATUS_LABEL[s.status]}</Badge>
        <span className="text-[12px] text-muted-foreground">{s.durationMin} min</span>
      </div>
      {s.meetingLink ? (
        <a href={s.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-[12.5px] text-ai hover:underline">
          <Video className="size-3.5 shrink-0" />
          <span className="truncate">{meetingHost(s.meetingLink)}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      ) : null}
      {s.summary ? <p className="leading-relaxed text-foreground/80">{s.summary}</p> : null}
      {s.topics.length ? (
        <div className="flex flex-wrap gap-1.5">
          {s.topics.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      ) : null}
      {s.status === 'COMPLETED' ? (
        <div className="grid gap-3 text-[12.5px] sm:grid-cols-2">
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
  )
}

/** Session calendar (Bryntum) for the coach, a single client's tab, or the client's own app. */
export function SessionsPanel({ clientId, role = 'COACH' }: { clientId?: string; role?: 'COACH' | 'CLIENT' }) {
  const { data, loading, setData } = useApi<Session[]>(`/sessions${clientId && role === 'COACH' ? `?clientId=${clientId}` : ''}`, [clientId])
  const [move, setMove] = useState<{ session: Session; start: Date; end: Date; resolve: (ok: boolean) => void } | null>(null)
  const [notify, setNotify] = useState(true)
  const [moving, setMoving] = useState(false)
  const clients = useApi<ClientRow[]>(role === 'COACH' && !clientId ? '/coach/clients' : null)
  const [editing, setEditing] = useState<{ session?: Session } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const navigate = useNavigate()
  const showClient = role === 'COACH' && !clientId
  const sessions = useMemo(() => data ?? [], [data])
  // Look the session up by id so the details stay current after "Record outcome" refreshes the data.
  const selected = sessions.find((s) => s.id === selectedId) ?? null
  const calendarSkeleton = <Skeleton className="h-[680px] w-full rounded-xl" />

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          {(Object.keys(STATUS_LABEL) as Session['status'][]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${STATUS_DOT[k]}`} /> {STATUS_LABEL[k]}
            </span>
          ))}
          <span>· Click a session for details{role === 'COACH' ? '; drag an upcoming one to reschedule' : ''}</span>
        </div>
        {role === 'COACH' ? (
          <Button className="sm:ml-auto" onClick={() => setEditing({})}>
            <Plus /> New session record
          </Button>
        ) : null}
      </div>

      {loading && !data ? (
        calendarSkeleton
      ) : (
        <Suspense fallback={calendarSkeleton}>
          <SessionCalendar
            sessions={sessions}
            showClient={showClient}
            onSelect={(s) => setSelectedId(s.id)}
            onReschedule={role === 'COACH' ? (session, start, end) => new Promise<boolean>((resolve) => setMove({ session, start, end, resolve })) : undefined}
          />
        </Suspense>
      )}

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelectedId(null)}>
        {selected ? (
          <DialogContent>
            <DialogHeader title={selected.topic} description={`${fmtDate(selected.scheduledAt, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${fmtTime(selected.scheduledAt)}`} />
            <DialogBody>
              <SessionDetails s={selected} role={role} showClient={showClient} />
            </DialogBody>
            {role === 'COACH' ? (
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing({ session: selected })
                    setSelectedId(null)
                  }}
                >
                  {selected.status === 'SCHEDULED' ? 'Record outcome' : 'Edit'}
                </Button>
                {selected.status === 'SCHEDULED' ? (
                  <Button variant="ai" onClick={() => navigate(`/coach/sessions/${selected.id}/prep`)}>
                    <Sparkles /> AI brief <ChevronRight />
                  </Button>
                ) : null}
              </DialogFooter>
            ) : null}
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={!!move}
        onOpenChange={(v) => {
          if (!v && move && !moving) {
            move.resolve(false)
            setMove(null)
          }
        }}
      >
        {move ? (
          <DialogContent>
            <DialogHeader title="Reschedule this session?" description={move.session.topic} />
            <DialogBody className="grid gap-3 text-[13px]">
              <div className="grid grid-cols-[80px_1fr] gap-y-1.5">
                <span className="text-muted-foreground">From</span>
                <span className="text-muted-foreground line-through">
                  {fmtDate(move.session.scheduledAt, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtTime(move.session.scheduledAt)} ({move.session.durationMin} min)
                </span>
                <span className="text-muted-foreground">To</span>
                <span className="font-medium">
                  {fmtDate(move.start, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtTime(move.start)} ({Math.round((move.end.getTime() - move.start.getTime()) / 60_000)} min) UTC
                </span>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                Email {move.session.client?.user.name.split(' ')[0] ?? 'the client'} the new time
              </label>
            </DialogBody>
            <DialogFooter>
              <Button
                variant="ghost"
                disabled={moving}
                onClick={() => {
                  move.resolve(false)
                  setMove(null)
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={moving}
                onClick={async () => {
                  setMoving(true)
                  const durationMin = Math.max(15, Math.round((move.end.getTime() - move.start.getTime()) / 60_000))
                  try {
                    const r = await api<{ session: Session; emailed: boolean | null }>(`/sessions/${move.session.id}/reschedule`, { method: 'POST', json: { scheduledAt: move.start.toISOString(), durationMin, notify } })
                    setData((xs) => (xs ?? []).map((x) => (x.id === move.session.id ? { ...x, scheduledAt: r.session.scheduledAt, durationMin: r.session.durationMin } : x)))
                    toast.success(r.emailed === false ? 'Session moved (the email could not be sent)' : r.emailed ? 'Session moved and client emailed' : 'Session moved')
                    move.resolve(true)
                  } catch (e) {
                    toast.error((e as Error).message)
                    move.resolve(false)
                  } finally {
                    setMoving(false)
                    setMove(null)
                  }
                }}
              >
                Move session
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

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
