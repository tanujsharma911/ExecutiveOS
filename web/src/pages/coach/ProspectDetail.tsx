import { ArrowLeft, BookOpenText, MessageCircle, CalendarPlus, Check, ExternalLink, Mail, MapPin, MoreHorizontal, Pencil, Phone, Plus, Send, Sparkles, Trash2, UserCheck, Video, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common/Page'
import { ProspectDialog, ProspectStatusBadge, useCopy } from '@/components/features/Prospects'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { Avatar, Popover, PopoverContent, PopoverTrigger, Skeleton } from '@/components/ui/misc'
import { Segmented } from '@/components/ui/tabs'
import { api, useApi } from '@/lib/api'
import { fromLocalInput, linkHost, OUTCOMES, toLocalInput, usd, type CallMode, type CallOutcome, type DiscoveryCall, type ProspectDetail as Detail } from '@/lib/discovery'
import { cn, fmtDate, fmtDateTime } from '@/lib/utils'

const STAGES = ['Added', 'Discovery call', 'Good fit', 'Intake sent', 'Client'] as const
function stageIndex(p: Detail) {
  if (p.status === 'CONVERTED') return 4
  if (p.status === 'INVITED') return 3
  if (p.calls.some((c) => c.outcome === 'GOOD_FIT')) return 2
  if (p.calls.length) return 1
  return 0
}

function Stages({ p }: { p: Detail }) {
  const at = stageIndex(p)
  const notFit = p.status === 'NOT_A_FIT'
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-2 text-[12px]">
      {STAGES.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1', i <= at && !notFit ? 'border-transparent bg-success-soft text-success' : 'text-muted-foreground', i === at && !notFit && 'font-semibold')}>
            {i < at && !notFit ? <Check className="size-3" /> : <span className="tabular-nums">{i + 1}</span>}
            {s}
          </span>
          {i < STAGES.length - 1 ? <span className="h-px w-4 bg-border" /> : null}
        </li>
      ))}
      {notFit ? (
        <li className="ml-2">
          <Badge variant="danger">
            <XCircle /> Not a fit{p.notFitReason ? `: ${p.notFitReason}` : ''}
          </Badge>
        </li>
      ) : null}
    </ol>
  )
}

function ScheduleDialog({ prospect, open, onOpenChange, onDone }: { prospect: Detail; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const tomorrow = new Date(Date.now() + 86_400_000)
  tomorrow.setUTCHours(15, 0, 0, 0)
  const [f, setF] = useState({ when: toLocalInput(tomorrow.toISOString()), durationMin: 30, mode: 'ONLINE' as CallMode, meetingLink: '', sendInvite: !!prospect.email })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      const r = await api<{ invite: { sent: boolean; error?: string } | null }>(`/discovery/prospects/${prospect.id}/calls`, { method: 'POST', json: { scheduledAt: fromLocalInput(f.when), durationMin: f.durationMin, mode: f.mode, meetingLink: f.meetingLink, sendInvite: f.sendInvite } })
      if (r.invite && !r.invite.sent) toast.warning(`Call booked, but the invite was not emailed: ${r.invite.error}`)
      else toast.success(r.invite ? 'Call booked and invite emailed' : 'Call booked')
      onOpenChange(false)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Book a discovery call" description={`With ${prospect.name}. Times are in UTC.`} />
        <DialogBody className="grid gap-3">
          <Segmented value={f.mode} onChange={(mode) => setF({ ...f, mode })} options={[{ value: 'ONLINE', label: 'Online (Zoom / Meet)' }, { value: 'OFFLINE', label: 'In person' }]} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Date and time (UTC)</Label>
              <Input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Length</Label>
              <NativeSelect value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })}>
                {[20, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          {f.mode === 'ONLINE' ? (
            <div className="grid gap-1.5">
              <Label>Meeting link (optional)</Label>
              <Input placeholder="https://zoom.us/j/… or https://meet.google.com/…" value={f.meetingLink} onChange={(e) => setF({ ...f, meetingLink: e.target.value })} />
            </div>
          ) : null}
          <label className={cn('flex items-center gap-2 text-[13px]', !prospect.email && 'opacity-50')}>
            <input type="checkbox" disabled={!prospect.email} checked={f.sendInvite} onChange={(e) => setF({ ...f, sendInvite: e.target.checked })} />
            Email the time{f.mode === 'ONLINE' ? ' and link' : ''} to {prospect.email ?? 'the prospect (add an email first)'}
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !f.when} onClick={save}>
            Book call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const OUTCOME_BADGE: Record<CallOutcome, 'outline' | 'success' | 'warning' | 'danger'> = { PENDING: 'outline', GOOD_FIT: 'success', UNDECIDED: 'warning', NOT_A_FIT: 'danger' }

function CallCard({ call, prospect, onChanged, onNext }: { call: DiscoveryCall; prospect: Detail; onChanged: () => void; onNext: (step: 'call' | 'intake') => void }) {
  const upcoming = new Date(call.scheduledAt).getTime() > Date.now()
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ notes: call.notes, fitCheck: call.fitCheck, outcome: call.outcome })
  const [newSignal, setNewSignal] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await api(`/discovery/calls/${call.id}`, { method: 'PATCH', json: f })
      toast.success('Call recorded')
      setEditing(false)
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const flagged = call.fitCheck.filter((s) => s.flagged).length
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        {call.mode === 'ONLINE' ? <Video className="size-4 text-muted-foreground" /> : <MapPin className="size-4 text-muted-foreground" />}
        <span className="font-medium">{fmtDateTime(call.scheduledAt)}</span>
        <span className="text-[12px] text-muted-foreground">
          {call.durationMin} min · {call.mode === 'ONLINE' ? 'Online' : 'In person'}
        </span>
        {upcoming && call.outcome === 'PENDING' ? <Badge variant="ai">Upcoming</Badge> : <Badge variant={OUTCOME_BADGE[call.outcome]}>{OUTCOMES.find((o) => o.value === call.outcome)?.label}</Badge>}
        <div className="ml-auto flex items-center gap-1">
          {call.meetingLink ? (
            <Button asChild size="sm" variant="outline">
              <a href={call.meetingLink} target="_blank" rel="noreferrer">
                <ExternalLink /> Join
              </a>
            </Button>
          ) : null}
          {!editing ? (
            <Button size="sm" variant={call.outcome === 'PENDING' && !upcoming ? 'default' : 'outline'} onClick={() => setEditing(true)}>
              <Pencil /> {call.outcome === 'PENDING' ? 'Record call' : 'Edit'}
            </Button>
          ) : null}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="More">
                <MoreHorizontal />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="grid w-48 gap-0.5 p-1">
              {prospect.email ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={async () => {
                    const r = await api<{ sent: boolean; error?: string }>(`/discovery/calls/${call.id}/send-invite`, { method: 'POST' }).catch((e) => ({ sent: false, error: (e as Error).message }))
                    if (r.sent) toast.success('Invite emailed')
                    else toast.error(r.error ?? 'Invite not sent')
                  }}
                >
                  <Send /> Email the invite
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-danger"
                onClick={async () => {
                  await api(`/discovery/calls/${call.id}`, { method: 'DELETE' })
                  toast.success('Call removed')
                  onChanged()
                }}
              >
                <Trash2 /> Remove call
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {!editing ? (
        <>
          {call.notes ? <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{call.notes}</p> : null}
          {call.outcome !== 'PENDING' && call.fitCheck.length ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Fit check: {flagged ? `${flagged} warning sign${flagged > 1 ? 's' : ''} ticked (${call.fitCheck.filter((s) => s.flagged).map((s) => s.label).join('; ')})` : 'no warning signs'}
            </p>
          ) : null}
          {call.outcome === 'GOOD_FIT' && prospect.status !== 'CONVERTED' && prospect.status !== 'INVITED' ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-success-soft/60 px-3 py-2 text-[12.5px]">
              <UserCheck className="size-4 text-success" /> Good fit. Next step:
              <Button size="sm" variant="outline" onClick={() => onNext('call')}>
                <CalendarPlus /> Another discovery call
              </Button>
              <Button size="sm" onClick={() => onNext('intake')}>
                <Send /> Send intake form
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-1.5">
            <Label>Call notes</Label>
            <Textarea rows={4} value={f.notes} placeholder="What you learned: pains, problems, what is going well, budget and timing" onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Fit check: tick any warning sign you noticed</Label>
            <div className="grid gap-1 rounded-lg border p-2">
              {f.fitCheck.map((s, i) => (
                <label key={i} className="flex items-start gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-muted">
                  <input type="checkbox" className="mt-0.5" checked={s.flagged} onChange={(e) => setF({ ...f, fitCheck: f.fitCheck.map((x, j) => (j === i ? { ...x, flagged: e.target.checked } : x)) })} />
                  <span className={cn(s.flagged && 'text-danger')}>{s.label}</span>
                </label>
              ))}
              {!f.fitCheck.length ? <p className="px-1.5 py-1 text-[12.5px] text-muted-foreground">No signals yet. Add a “Fit check” section to the Discovery Call Book to pre-fill them, or add your own.</p> : null}
              <div className="flex gap-2 pt-1">
                <Input className="h-8" placeholder="Add a warning sign" value={newSignal} onChange={(e) => setNewSignal(e.target.value)} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!newSignal.trim()}
                  onClick={() => {
                    setF({ ...f, fitCheck: [...f.fitCheck, { label: newSignal.trim(), flagged: false }] })
                    setNewSignal('')
                  }}
                >
                  <Plus /> Add
                </Button>
              </div>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Outcome</Label>
            <Segmented value={f.outcome} onChange={(outcome) => setF({ ...f, outcome })} options={OUTCOMES.map((o) => ({ value: o.value, label: o.label }))} />
            {f.outcome === 'NOT_A_FIT' ? <p className="text-[12px] text-muted-foreground">The prospect will be marked “Not a fit” and kept in your list.</p> : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function SendIntakeDialog({ prospect, open, onOpenChange, onDone }: { prospect: Detail; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [message, setMessage] = useState('')
  const [note, setNote] = useState(prospect.intakeNote ?? '')
  const [result, setResult] = useState<{ url: string; emailSent: boolean; error?: string } | null>(null)
  const [sending, setSending] = useState(false)
  const { copy } = useCopy()
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) setResult(null)
      }}
    >
      <DialogContent>
        <DialogHeader title="Send the intake form" description={`${prospect.name} chooses a program, confirms their details and pays with PayPal. Their client account is then created automatically.`} />
        <DialogBody className="grid gap-3">
          {!result ? (
            <>
              <div className="grid gap-1.5">
                <Label>To</Label>
                <Input readOnly value={prospect.email ?? ''} placeholder="Add an email address to this prospect first" />
              </div>
              <div className="grid gap-1.5">
                <Label>Message (optional)</Label>
                <Textarea rows={4} value={message} placeholder="Thank you for our conversation. As a next step, please fill in a short form and choose the program that fits you best." onChange={(e) => setMessage(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-ai" /> Note for the intake assistant (optional)
                </Label>
                <Textarea rows={2} maxLength={500} value={note} placeholder="e.g. Wants to step back from daily operations; Leadership Independence is likely the best fit." onChange={(e) => setNote(e.target.value)} />
                <p className="text-[11.5px] text-muted-foreground">The AI chat on the intake form uses this to help {prospect.name.split(' ')[0]} choose. It never sees your call notes, so don't write anything here you wouldn't say to them.</p>
              </div>
            </>
          ) : (
            <div className="grid gap-2 text-[13px]">
              <p>{result.emailSent ? `Sent to ${prospect.email}.` : `The email was not sent (${result.error}). Copy the link and send it yourself:`}</p>
              <div className="flex gap-2">
                <Input readOnly value={result.url} className="font-mono text-[12px]" onFocus={(e) => e.target.select()} />
                <Button variant="outline" onClick={() => copy(result.url, 'Link copied')}>
                  Copy
                </Button>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {!result ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={!prospect.email || sending}
                onClick={async () => {
                  setSending(true)
                  try {
                    const r = await api<{ url: string; emailSent: boolean; error?: string }>(`/discovery/prospects/${prospect.id}/send-intake`, { method: 'POST', json: { message, note } })
                    setResult(r)
                    if (r.emailSent) toast.success('Intake form sent')
                    onDone()
                  } catch (e) {
                    toast.error((e as Error).message)
                  } finally {
                    setSending(false)
                  }
                }}
              >
                <Send /> Send
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BookCard({ prospect }: { prospect: Detail }) {
  const book = prospect.books[0]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpenText className="size-4" /> Discovery Call Book
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {book ? (
          <RouterLink to={`/coach/book?prospect=${prospect.id}`} className="rounded-lg border px-3 py-2 hover:bg-muted">
            <div className="truncate text-[13px] font-medium">{book.title}</div>
            <div className="text-[11.5px] text-muted-foreground">
              Updated {fmtDate(book.updatedAt)} · v{book.version}
            </div>
          </RouterLink>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">No book yet. Open the editor to start from your template, and let the AI tailor it to {prospect.name.split(' ')[0]}.</p>
        )}
        <Button asChild size="sm" variant={book ? 'outline' : 'ai'} className="justify-self-start">
          <RouterLink to={`/coach/book?prospect=${prospect.id}`}>
            {book ? <Pencil /> : <Sparkles />} {book ? 'Open book' : 'Prepare the book'}
          </RouterLink>
        </Button>
      </CardContent>
    </Card>
  )
}

const TOPIC_LABEL: Record<string, string> = {
  program_fit: 'which program fits',
  program_details: 'program details',
  pricing: 'price',
  auto_renew: 'auto-renew',
  failed_payment: 'failed payments',
  payment_method: 'how to pay',
  cancel: 'cancelling',
  refund: 'refunds',
  security: 'payment security',
  after_payment: 'after paying',
}

/** What the prospect asked the intake assistant (they're told the coach can read it). */
function ChatCard({ prospect }: { prospect: Detail }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!prospect.chats.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4" /> Questions they asked
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {prospect.chats.map((c) => {
          const asked = c.messages.filter((m) => m.role === 'user')
          const topics = Object.entries(asked.reduce<Record<string, number>>((acc, m) => (m.topic && TOPIC_LABEL[m.topic] ? { ...acc, [m.topic]: (acc[m.topic] ?? 0) + 1 } : acc), {}))
            .sort((x, y) => y[1] - x[1])
            .map(([t, n]) => `${TOPIC_LABEL[t]}${n > 1 ? ` (${n})` : ''}`)
          const missed = c.messages.filter((m) => m.unanswered).length
          return (
            <div key={c.id} className="rounded-lg border px-3 py-2 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">
                  {asked.length} question{asked.length === 1 ? '' : 's'}
                </span>
                <span className="text-muted-foreground">· {fmtDate(c.updatedAt)}</span>
                {c.paid ? <Badge variant="success">Paid after chatting</Badge> : null}
                {missed ? <Badge variant="warning">{missed} to follow up</Badge> : null}
              </div>
              {topics.length ? <p className="mt-1 text-muted-foreground">Asked about {topics.join(', ')}.</p> : null}
              <button className="mt-1 text-[12px] font-medium text-ai hover:underline cursor-pointer" onClick={() => setOpen(open === c.id ? null : c.id)}>
                {open === c.id ? 'Hide conversation' : 'Read conversation'}
              </button>
              {open === c.id ? (
                <div className="mt-2 grid max-h-80 gap-1.5 overflow-y-auto">
                  {c.messages.map((m, i) => (
                    <div key={i} className={cn('rounded-lg px-2.5 py-1.5 whitespace-pre-line', m.role === 'user' ? 'bg-primary/5 font-medium' : 'bg-muted text-muted-foreground', m.unanswered && 'border border-warning/40')}>
                      <span className="mr-1 text-[10.5px] uppercase tracking-wide opacity-70">{m.role === 'user' ? prospect.name.split(' ')[0] : 'Assistant'}</span>
                      {m.text}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-3 h-4 w-24" />
      <div className="mb-5 flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="grid gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-64" />
        </div>
      </div>
      <Skeleton className="mb-5 h-7 w-[520px] max-w-full rounded-full" />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}

export default function ProspectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: p, error, reload } = useApi<Detail>(`/discovery/prospects/${id}`)
  const [dialog, setDialog] = useState<null | 'edit' | 'call' | 'intake' | 'notfit'>(null)
  const [reason, setReason] = useState('')

  if (error) return <ErrorState message={error} />
  if (!p) return <DetailSkeleton />
  const converted = p.status === 'CONVERTED'

  return (
    <div>
      <RouterLink to="/coach/prospects" className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Prospects
      </RouterLink>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <Avatar name={p.name} size={48} color="#71717a" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{p.name}</h1>
            <ProspectStatusBadge status={p.status} />
          </div>
          <p className="text-[13px] text-muted-foreground">{[p.role, p.company].filter(Boolean).join(', ') || 'No company yet'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {converted && p.clientId ? (
            <Button onClick={() => navigate(`/coach/clients/${p.clientId}`)}>
              <UserCheck /> Open client
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setDialog('call')}>
                <CalendarPlus /> Book call
              </Button>
              <Button onClick={() => setDialog('intake')}>
                <Send /> Send intake form
              </Button>
            </>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="grid w-52 gap-0.5 p-1">
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => setDialog('edit')}>
                <Pencil /> Edit details
              </Button>
              {!converted && p.status !== 'NOT_A_FIT' ? (
                <Button variant="ghost" size="sm" className="justify-start" onClick={() => setDialog('notfit')}>
                  <XCircle /> Mark not a fit
                </Button>
              ) : null}
              {p.status === 'NOT_A_FIT' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={async () => {
                    await api(`/discovery/prospects/${p.id}`, { method: 'PATCH', json: { status: 'IN_DISCUSSION', notFitReason: null } })
                    reload()
                  }}
                >
                  <UserCheck /> Reopen
                </Button>
              ) : null}
              {!converted ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-danger"
                  onClick={async () => {
                    if (!confirm(`Delete ${p.name} and their discovery calls?`)) return
                    await api(`/discovery/prospects/${p.id}`, { method: 'DELETE' })
                    toast.success('Prospect deleted')
                    navigate('/coach/prospects')
                  }}
                >
                  <Trash2 /> Delete
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <Stages p={p} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Discovery calls</h2>
            {!converted ? (
              <Button size="sm" variant="outline" onClick={() => setDialog('call')}>
                <CalendarPlus /> Book call
              </Button>
            ) : null}
          </div>
          {p.calls.map((c) => (
            <CallCard key={`${c.id}-${c.outcome}-${c.notes.length}`} call={c} prospect={p} onChanged={reload} onNext={(s) => setDialog(s)} />
          ))}
          {!p.calls.length ? (
            <Card className="p-6 text-center text-[13px] text-muted-foreground">
              No calls yet. Book a discovery call (online or in person), then record your notes and the fit check here.
            </Card>
          ) : null}
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-[13px]">
              {p.email ? (
                <a href={`mailto:${p.email}`} className="flex items-center gap-2 hover:underline">
                  <Mail className="size-3.5 text-muted-foreground" /> {p.email}
                </a>
              ) : null}
              {p.phone ? (
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 text-muted-foreground" /> {p.phone}
                </div>
              ) : null}
              {p.location ? (
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 text-muted-foreground" /> {p.location}
                </div>
              ) : null}
              {p.industry || p.companySize ? <div className="text-muted-foreground">{[p.industry, p.companySize].filter(Boolean).join(' · ')}</div> : null}
              {p.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">
                  <ExternalLink className="size-3.5 text-muted-foreground" /> {l.label} <span className="text-muted-foreground">{linkHost(l.url)}</span>
                </a>
              ))}
              {p.notes ? <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-[12.5px] leading-relaxed">{p.notes}</p> : null}
              <Button size="sm" variant="outline" className="mt-1 justify-self-start" onClick={() => setDialog('edit')}>
                <Pencil /> Edit
              </Button>
            </CardContent>
          </Card>
          <BookCard prospect={p} />
          <ChatCard prospect={p} />
          {p.payments.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-[13px]">
                {p.payments.map((x) => (
                  <div key={x.id} className="flex items-center gap-2">
                    <span className="flex-1">{x.program}</span>
                    <span className="tabular-nums">{usd(x.amountCents)}</span>
                    <Badge variant={x.status === 'COMPLETED' ? 'success' : x.status === 'FAILED' ? 'danger' : 'outline'}>{x.status === 'COMPLETED' ? `Paid ${fmtDate(x.completedAt)}` : x.status === 'FAILED' ? 'Failed' : 'Started'}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <ProspectDialog open={dialog === 'edit'} onOpenChange={(v) => setDialog(v ? 'edit' : null)} prospect={p} onSaved={reload} />
      <ScheduleDialog key={p.calls.length} prospect={p} open={dialog === 'call'} onOpenChange={(v) => setDialog(v ? 'call' : null)} onDone={reload} />
      <SendIntakeDialog prospect={p} open={dialog === 'intake'} onOpenChange={(v) => setDialog(v ? 'intake' : null)} onDone={reload} />
      <Dialog open={dialog === 'notfit'} onOpenChange={(v) => setDialog(v ? 'notfit' : null)}>
        <DialogContent>
          <DialogHeader title={`Mark ${p.name} as not a fit`} description="They stay in your prospect list so you keep the history." />
          <DialogBody className="grid gap-1.5">
            <Label>Reason (optional, only you see it)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wants a quick fix, not ready to change" />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await api(`/discovery/prospects/${p.id}`, { method: 'PATCH', json: { status: 'NOT_A_FIT', notFitReason: reason || null } })
                toast.success('Marked as not a fit')
                setDialog(null)
                reload()
              }}
            >
              Mark not a fit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
