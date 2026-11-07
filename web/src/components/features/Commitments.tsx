import type { ColDef } from 'ag-grid-community'
import { ListChecks, MessageCircleQuestion, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataGrid, DataGridSkeleton } from '@/components/common/DataGrid'
import { EmptyState } from '@/components/common/Page'
import { COMMITMENT_STATUSES, CommitmentStatusBadge, OverdueFlag, PriorityBadge } from '@/components/common/Status'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/misc'
import { api, useApi } from '@/lib/api'
import type { ClientRow, Commitment, CommitmentStatus, Insight, IntelligenceReport, Priority } from '@/lib/types'
import { cn, fmtDate, relative, titleCase } from '@/lib/utils'
import { useUi } from '@/store/ui'

export interface CommitmentDraft {
  id?: string
  clientId: string
  sessionId?: string | null
  title: string
  description: string
  dueDate: string
  priority: Priority
  goal: string
  status: CommitmentStatus
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
export const emptyCommitment = (clientId = '', sessionId?: string | null): CommitmentDraft => ({ clientId, sessionId: sessionId ?? null, title: '', description: '', dueDate: isoDay(new Date(Date.now() + 14 * 86_400_000)), priority: 'MEDIUM', goal: '', status: 'NOT_STARTED' })

export function CommitmentDialog({ open, onOpenChange, initial, clients, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; initial: CommitmentDraft; clients?: { id: string; name: string }[]; onSaved?: () => void }) {
  const [d, setD] = useState<CommitmentDraft>(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => setD(initial), [initial, open])
  const set = <K extends keyof CommitmentDraft>(k: K, v: CommitmentDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const bump = useUi((s) => s.bump)

  async function save() {
    setBusy(true)
    try {
      const json = { ...d, dueDate: new Date(`${d.dueDate}T17:00:00Z`).toISOString() }
      if (d.id) await api(`/commitments/${d.id}`, { method: 'PATCH', json })
      else await api('/commitments', { method: 'POST', json })
      toast.success(d.id ? 'Commitment updated' : 'Commitment created — the client has been notified')
      onOpenChange(false)
      bump()
      onSaved?.()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={d.id ? 'Edit commitment' : 'New commitment'} description="A specific action the client agrees to take before an agreed date." />
        <DialogBody className="grid gap-3.5">
          {clients && !d.id ? (
            <div className="grid gap-1.5">
              <Label>Client</Label>
              <NativeSelect value={d.clientId} onChange={(e) => set('clientId', e.target.value)}>
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label>Title</Label>
            <Input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Delegate product roadmap ownership" />
          </div>
          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="What does done look like?" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={d.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <NativeSelect value={d.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Related coaching goal</Label>
              <Input value={d.goal} onChange={(e) => set('goal', e.target.value)} placeholder="e.g. Delegation" />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <NativeSelect value={d.status} onChange={(e) => set('status', e.target.value as CommitmentStatus)}>
                {COMMITMENT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !d.title || !d.clientId || !d.goal}>
            {d.id ? 'Save changes' : 'Create commitment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function StatusUpdateDialog({ commitment, open, onOpenChange, role }: { commitment: Commitment | null; open: boolean; onOpenChange: (v: boolean) => void; role: 'COACH' | 'CLIENT' }) {
  const [status, setStatus] = useState<CommitmentStatus>('IN_PROGRESS')
  const [note, setNote] = useState('')
  const bump = useUi((s) => s.bump)
  useEffect(() => {
    if (commitment) {
      setStatus(commitment.status)
      setNote('')
    }
  }, [commitment, open])
  if (!commitment) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={commitment.title} description={`Due ${fmtDate(commitment.dueDate, { month: 'long', day: 'numeric' })} · ${commitment.goal}`} />
        <DialogBody className="grid gap-4">
          {commitment.description ? <p className="text-[13px] text-muted-foreground">{commitment.description}</p> : null}
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {COMMITMENT_STATUSES.map((s) => (
                <button key={s.value} onClick={() => setStatus(s.value)} className={cn('rounded-lg border px-2.5 py-2 text-left text-[12.5px] font-medium transition cursor-pointer', status === s.value ? 'border-foreground bg-foreground text-white' : 'hover:bg-muted')}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{role === 'CLIENT' ? 'What happened? (shared with your coach)' : 'Note'}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={role === 'CLIENT' ? 'A sentence or two on progress or what got in the way…' : 'Optional note'} />
          </div>
          {commitment.updates?.length ? (
            <div>
              <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">History</div>
              <ol className="grid gap-2 border-l pl-4">
                {commitment.updates.map((u) => (
                  <li key={u.id} className="relative text-[12.5px]">
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full border-2 border-card bg-foreground/40" />
                    <span className="font-medium">{titleCase(u.status)}</span> <span className="text-muted-foreground">· {u.authorRole === 'COACH' ? 'Coach' : 'Client'} · {relative(u.createdAt)}</span>
                    <div className="text-muted-foreground">{u.note}</div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={role === 'CLIENT' && !note.trim()}
            onClick={async () => {
              try {
                await api(`/commitments/${commitment.id}`, { method: 'PATCH', json: { status, note: note.trim() || undefined } })
                toast.success(status === 'COMPLETED' ? 'Nice work — commitment completed' : 'Progress saved')
                onOpenChange(false)
                bump()
              } catch (e) {
                toast.error((e as Error).message)
              }
            }}
          >
            Save update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Coach-facing commitments table with AI pattern banner. */
export function CommitmentsPanel({ clientId }: { clientId?: string }) {
  const { data } = useApi<Commitment[]>(`/commitments${clientId ? `?clientId=${clientId}` : ''}`, [clientId])
  const clients = useApi<ClientRow[]>(clientId ? null : '/coach/clients')
  const [insights, setInsights] = useState<(Insight & { clientName: string })[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [dialog, setDialog] = useState<CommitmentDraft | null>(null)
  const [viewing, setViewing] = useState<Commitment | null>(null)
  const bump = useUi((s) => s.bump)
  const version = useUi((s) => s.version)

  useEffect(() => {
    const ids = clientId ? [clientId] : clients.data?.map((c) => c.id) ?? []
    // Commitment patterns come from the analysis tools (no LLM, fast); still cancelled on unmount / input change.
    const controller = new AbortController()
    Promise.all(ids.map((id) => api<IntelligenceReport>(`/coach/clients/${id}/analysis`, { signal: controller.signal }).then((r) => r.commitments.insights.map((i) => ({ ...i, clientName: r.clientName })))))
      .then((x) => setInsights(x.flat()))
      .catch(() => undefined) // aborted, or AI unavailable: simply show no banner
    return () => controller.abort()
  }, [clientId, clients.data, version])

  const rows = useMemo(() => (data ?? []).filter((c) => !status || (status === 'OVERDUE' ? c.status !== 'COMPLETED' && new Date(c.dueDate) < new Date() : c.status === status)), [data, status])

  const columns: ColDef<Commitment>[] = [
    {
      headerName: 'Commitment',
      field: 'title',
      minWidth: 260,
      flex: 2,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (p: { data: Commitment }) => (
        <div className="py-2.5 leading-snug">
          <div className="font-medium">{p.data.title}</div>
          <div className="text-[12px] text-muted-foreground">{p.data.goal}</div>
        </div>
      ),
    },
    ...(clientId
      ? []
      : [
          {
            headerName: 'Client',
            valueGetter: (p: { data?: Commitment }) => p.data?.client?.user.name,
            minWidth: 160,
            enableRowGroup: true,
            cellRenderer: (p: { data: Commitment }) => (
              <div className="flex h-full items-center gap-2">
                <Avatar name={p.data.client!.user.name} color={p.data.client!.user.avatarColor} size={22} /> {p.data.client!.user.name}
              </div>
            ),
          } as ColDef<Commitment>,
        ]),
    { headerName: 'Status', field: 'status', minWidth: 170, enableRowGroup: true, valueFormatter: (p) => COMMITMENT_STATUSES.find((x) => x.value === p.value)?.label ?? p.value, cellRenderer: (p: { data: Commitment }) => <div className="flex h-full items-center"><CommitmentStatusBadge status={p.data.status} /></div> },
    { headerName: 'Priority', field: 'priority', minWidth: 100, enableRowGroup: true, valueFormatter: (p) => (p.value ? titleCase(p.value) : ''), cellRenderer: (p: { data: Commitment }) => <div className="flex h-full items-center"><PriorityBadge priority={p.data.priority} /></div> },
    {
      headerName: 'Due',
      field: 'dueDate',
      minWidth: 140,
      sort: 'asc',
      valueFormatter: (p) => (p.value ? fmtDate(p.value, { month: 'short', day: 'numeric', year: 'numeric' }) : ''),
      cellRenderer: (p: { data: Commitment }) => (
        <div className="flex h-full flex-col justify-center leading-tight">
          <span>{fmtDate(p.data.dueDate)}</span>
          {p.data.status !== 'COMPLETED' && new Date(p.data.dueDate) < new Date() ? <OverdueFlag /> : null}
        </div>
      ),
    },
    { headerName: 'Last update', valueGetter: (p) => p.data?.updates?.[0]?.note ?? '', minWidth: 220, flex: 1.5, wrapText: true, autoHeight: true, cellClass: 'text-muted-foreground py-2 leading-snug' },
  ]

  return (
    <div className="grid gap-4">
      {insights.length ? (
        <div className="grid gap-2">
          {insights.map((i) => (
            <div key={i.id + i.clientName} className="flex flex-col gap-3 rounded-xl border border-ai/20 bg-ai-soft/50 p-4 sm:flex-row sm:items-center">
              <Sparkles className="size-4 shrink-0 text-ai" />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium">
                  {clientId ? '' : `${i.clientName}: `}
                  {i.summary}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <MessageCircleQuestion className="size-3.5" /> Suggested question: <span className="font-serif text-[14px] text-foreground">“{i.suggestedQuestion}”</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search commitments…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-52">
          <option value="">All statuses</option>
          <option value="OVERDUE">Overdue</option>
          {COMMITMENT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        <Button className="sm:ml-auto" onClick={() => setDialog(emptyCommitment(clientId ?? ''))}>
          <Plus /> New commitment
        </Button>
      </div>
      {!data ? <DataGridSkeleton cols={clientId ? [34, 15, 12, 12, 27] : [26, 14, 13, 10, 11, 26]} rows={5} /> : null}
      {data && !data.length ? <EmptyState icon={ListChecks} title="No commitments yet" description="Create one during or after a session." /> : null}
      {data?.length ? <DataGrid rows={rows} columns={columns} quickFilter={q} autoHeight groupable exportName={clientId ? 'client-commitments' : 'commitments'} onRowClick={(c) => setViewing(c)} /> : null}

      <CommitmentDialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)} initial={dialog ?? emptyCommitment()} clients={clients.data?.map((c) => ({ id: c.id, name: c.name }))} />
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        {viewing ? (
          <DialogContent>
            <DialogHeader title={viewing.title} description={`${viewing.client?.user.name ?? ''} · due ${fmtDate(viewing.dueDate, { month: 'long', day: 'numeric' })}`} />
            <DialogBody className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <CommitmentStatusBadge status={viewing.status} />
                <PriorityBadge priority={viewing.priority} />
              </div>
              {viewing.description ? <p className="text-[13px]">{viewing.description}</p> : null}
              {viewing.session ? <p className="text-[12.5px] text-muted-foreground">From session: {viewing.session.topic}</p> : null}
              <ol className="grid gap-2 border-l pl-4">
                {viewing.updates?.map((u) => (
                  <li key={u.id} className="relative text-[12.5px]">
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full border-2 border-card bg-foreground/40" />
                    <span className="font-medium">{titleCase(u.status)}</span> <span className="text-muted-foreground">· {u.authorRole === 'COACH' ? 'Coach' : 'Client'} · {relative(u.createdAt)}</span>
                    <div className="text-muted-foreground">{u.note}</div>
                  </li>
                ))}
              </ol>
            </DialogBody>
            <DialogFooter>
              <Button
                variant="ghost"
                className="mr-auto text-danger"
                onClick={async () => {
                  await api(`/commitments/${viewing.id}`, { method: 'DELETE' })
                  setViewing(null)
                  bump()
                  toast.success('Commitment deleted')
                }}
              >
                <Trash2 /> Delete
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDialog({ id: viewing.id, clientId: viewing.clientId, title: viewing.title, description: viewing.description, dueDate: viewing.dueDate.slice(0, 10), priority: viewing.priority, goal: viewing.goal, status: viewing.status })
                  setViewing(null)
                }}
              >
                Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}
