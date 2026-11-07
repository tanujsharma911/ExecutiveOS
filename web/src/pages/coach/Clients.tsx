import type { ColDef } from 'ag-grid-community'
import { LayoutGrid, Rows3, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkline } from '@/components/common/Charts'
import { DataGrid, type DetailConfig } from '@/components/common/DataGrid'
import { ErrorState, PageHeader } from '@/components/common/Page'
import { EngagementBadge } from '@/components/common/Status'
import { BillingBadge } from '@/components/features/Billing'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Avatar, Progress, Skeleton } from '@/components/ui/misc'
import { Segmented } from '@/components/ui/tabs'
import { api, useApi } from '@/lib/api'
import type { ClientRow } from '@/lib/types'
import { fmtDate, relative } from '@/lib/utils'

const SKELETON_ROWS = 3

const BILLING_LABEL: Record<string, string> = { ACTIVE: 'Auto-renew on', PAST_DUE: 'Payment failed', SUSPENDED: 'Paused', CANCELLED: 'Cancelled', EXPIRED: 'Ended', 'One-time': 'One-time' }
const ITEM_STATUS: Record<string, string> = { NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', PARTIALLY_COMPLETED: 'Partly done', BLOCKED: 'Blocked', SUBMITTED: 'Submitted' }

/** Expanded row: open commitments and the latest reflections (AG Grid master/detail). Module-level so it stays stable. */
const CLIENT_DETAIL: DetailConfig<ClientRow> = {
  load: (row) => api<unknown[]>(`/coach/clients/${row.id}/recent`),
  empty: 'No open commitments or reflections yet.',
  columns: [
    { headerName: 'Type', field: 'type', maxWidth: 140 },
    { headerName: 'Item', field: 'title', flex: 2.5 },
    { headerName: 'Date', field: 'date', maxWidth: 170, valueFormatter: (p) => (p.value ? `${p.data?.type === 'Commitment' ? 'Due ' : ''}${fmtDate(p.value, { month: 'short', day: 'numeric', year: 'numeric' })}` : '') },
    { headerName: 'Status', field: 'status', maxWidth: 160, valueFormatter: (p) => ITEM_STATUS[p.value as string] ?? p.value },
  ],
}

/** Mirrors the AG Grid table (header + rows) so nothing jumps when data arrives. */
function TableSkeleton() {
  const cols = [22, 18, 14, 8, 10, 10, 10, 8]
  return (
    <div className="overflow-hidden rounded-xl border bg-card" aria-busy="true" aria-label="Loading clients">
      <div className="flex h-10 items-center gap-6 border-b bg-[#fbfbfa] px-3.5">
        {cols.map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>
      {Array.from({ length: SKELETON_ROWS }, (_, r) => (
        <div key={r} className="flex h-[52px] items-center gap-6 border-b px-3.5 last:border-b-0">
          <div className="flex items-center gap-2.5" style={{ width: `${cols[0]}%` }}>
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          </div>
          <Skeleton className="h-3" style={{ width: `${cols[1]}%` }} />
          <Skeleton className="h-3" style={{ width: `${cols[2]}%` }} />
          <Skeleton className="h-3" style={{ width: `${cols[3]}%` }} />
          <Skeleton className="h-5 rounded-full" style={{ width: `${cols[4]}%` }} />
          <Skeleton className="h-3" style={{ width: `${cols[5]}%` }} />
          <Skeleton className="h-3" style={{ width: `${cols[6]}%` }} />
          <Skeleton className="h-3" style={{ width: `${cols[7]}%` }} />
        </div>
      ))}
    </div>
  )
}

/** Mirrors a client card in the cards view. */
function CardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading clients">
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <Card key={i} className="p-5">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-1.5 pt-0.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="mt-4 grid gap-2">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
          <div className="mt-4 flex justify-between">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-32" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export default function Clients() {
  const { data, loading, error } = useApi<ClientRow[]>('/coach/clients')
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [program, setProgram] = useState('')
  const [engagement, setEngagement] = useState('')
  const [view, setView] = useState<'table' | 'cards'>('table')

  const rows = useMemo(() => (data ?? []).filter((r) => (!program || r.program === program) && (!engagement || r.engagement === engagement)), [data, program, engagement])
  const filtered = useMemo(() => rows.filter((r) => !q || `${r.name} ${r.company} ${r.program}`.toLowerCase().includes(q.toLowerCase())), [rows, q])
  const programs = [...new Set((data ?? []).map((r) => r.program))]

  const columns: ColDef<ClientRow>[] = [
    {
      headerName: 'Client',
      field: 'name',
      minWidth: 230,
      flex: 1.4,
      cellRenderer: (p: { data: ClientRow }) => (
        <div className="flex h-full items-center gap-2.5">
          <Avatar name={p.data.name} color={p.data.avatarColor} size={28} />
          <div className="leading-tight">
            <div className="font-medium">{p.data.name}</div>
            <div className="text-[11.5px] text-muted-foreground">{p.data.email}</div>
          </div>
        </div>
      ),
    },
    { headerName: 'Company', valueGetter: (p) => `${p.data?.designation}, ${p.data?.company}`, minWidth: 220, flex: 1.2 },
    { headerName: 'Program', field: 'program', minWidth: 180, enableRowGroup: true },
    { headerName: 'Started', field: 'startDate', minWidth: 110, valueFormatter: (p) => fmtDate(p.value) },
    {
      headerName: 'Billing',
      field: 'billing',
      minWidth: 150,
      enableRowGroup: true,
      valueGetter: (p) => (p.data?.billing ? p.data.billing.status : 'One-time'),
      valueFormatter: (p) => BILLING_LABEL[p.value as string] ?? p.value,
      cellRenderer: (p: { data: ClientRow }) => (
        <div className="flex h-full items-center gap-1.5">
          {p.data.billing ? <BillingBadge status={p.data.billing.status} failed={p.data.billing.failedPayments} /> : <span className="text-[12.5px] text-muted-foreground">One-time</span>}
        </div>
      ),
    },
    { headerName: 'Engagement', field: 'engagement', minWidth: 120, enableRowGroup: true, cellRenderer: (p: { value: ClientRow['engagement'] }) => <div className="flex h-full items-center"><EngagementBadge status={p.value} /></div> },
    { headerName: 'Last reflection', field: 'lastReflectionAt', minWidth: 130, valueFormatter: (p) => relative(p.value) },
    {
      headerName: 'Confidence',
      aggFunc: 'avg',
      valueFormatter: (p) => (p.value == null ? '—' : String(Math.round(Number(p.value) * 10) / 10)),
      field: 'confidence',
      minWidth: 140,
      cellRenderer: (p: { data: ClientRow }) => (
        <div className="flex h-full items-center gap-2 tabular-nums">
          <span className="w-7">{p.data.confidence ?? '—'}</span>
          <Sparkline values={p.data.confidenceTrend} color={(p.data.confidenceDelta ?? 0) < 0 ? '#b45309' : '#15803d'} />
        </div>
      ),
    },
    { headerName: 'Open commitments', field: 'openCommitments', minWidth: 130, type: 'numericColumn', aggFunc: 'sum' },
  ]

  return (
    <div>
      <PageHeader title="My Clients" description="Everyone you coach, their programs and how engaged they are right now." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search clients, companies, programs…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <NativeSelect value={program} onChange={(e) => setProgram(e.target.value)} className="sm:w-56">
          <option value="">All programs</option>
          {programs.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </NativeSelect>
        <NativeSelect value={engagement} onChange={(e) => setEngagement(e.target.value)} className="sm:w-44">
          <option value="">Any engagement</option>
          <option>Active</option>
          <option>Slipping</option>
          <option>At risk</option>
        </NativeSelect>
        <Segmented
          className="sm:ml-auto"
          value={view}
          onChange={setView}
          options={[
            { value: 'table', label: <Rows3 className="size-4" /> },
            { value: 'cards', label: <LayoutGrid className="size-4" /> },
          ]}
        />
      </div>
      {loading && !data ? view === 'table' ? <TableSkeleton /> : <CardsSkeleton /> : null}
      {error ? <ErrorState message={error} /> : null}
      {data && view === 'table' ? <DataGrid rows={rows} columns={columns} quickFilter={q} autoHeight movableColumns groupable exportName="clients" detail={CLIENT_DETAIL} onRowClick={(r) => navigate(`/coach/clients/${r.id}`)} /> : null}
      {data && view === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="cursor-pointer p-5 transition hover:border-foreground/20" onClick={() => navigate(`/coach/clients/${c.id}`)}>
              <div className="flex items-start gap-3">
                <Avatar name={c.name} color={c.avatarColor} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-[12.5px] text-muted-foreground">
                    {c.designation}, {c.company}
                  </div>
                </div>
                <EngagementBadge status={c.engagement} />
              </div>
              <div className="mt-4 grid gap-1">
                <div className="flex justify-between text-[12px] text-muted-foreground">
                  <span>Goal progress (self-reported)</span>
                  <span className="tabular-nums">{c.goalProgress ?? 0}%</span>
                </div>
                <Progress value={c.goalProgress ?? 0} tone="ai" />
              </div>
              <div className="mt-4 flex items-center justify-between text-[12px] text-muted-foreground">
                <span>{c.program}</span>
                <span>Last reflection {relative(c.lastReflectionAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
