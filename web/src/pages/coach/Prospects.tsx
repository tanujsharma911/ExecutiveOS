import type { ColDef } from 'ag-grid-community'
import { Plus, Search, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataGrid, DataGridSkeleton, type DetailConfig } from '@/components/common/DataGrid'
import { EmptyState, ErrorState, PageHeader } from '@/components/common/Page'
import { IntakeLinkCard, ProspectDialog, ProspectStatusBadge } from '@/components/features/Prospects'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/misc'
import { Segmented } from '@/components/ui/tabs'
import { api, useApi } from '@/lib/api'
import { OUTCOMES, PROSPECT_STATUS, type ProspectDetail, type ProspectRow, type ProspectStatus } from '@/lib/discovery'
import { fmtDateTime, relative } from '@/lib/utils'

type Filter = 'ALL' | ProspectStatus

/** Expanded row: the prospect's discovery calls (AG Grid master/detail). Module-level so it stays stable. */
const PROSPECT_DETAIL: DetailConfig<ProspectRow> = {
  load: (row) => api<ProspectDetail>(`/discovery/prospects/${row.id}`).then((p) => p.calls),
  empty: 'No discovery calls yet.',
  columns: [
    { headerName: 'When', field: 'scheduledAt', minWidth: 170, valueFormatter: (p) => fmtDateTime(p.value) },
    { headerName: 'How', field: 'mode', maxWidth: 120, valueFormatter: (p) => (p.value === 'ONLINE' ? 'Online' : 'In person') },
    { headerName: 'Outcome', field: 'outcome', maxWidth: 190, valueFormatter: (p) => OUTCOMES.find((o) => o.value === p.value)?.label ?? p.value },
    { headerName: 'Warning signs', valueGetter: (p) => (p.data?.fitCheck ?? []).filter((f: { flagged: boolean }) => f.flagged).length, maxWidth: 140, type: 'numericColumn' },
    { headerName: 'Notes', field: 'notes', flex: 2, tooltipField: 'notes' },
  ],
}

export default function Prospects() {
  const { data, loading, error } = useApi<ProspectRow[]>('/discovery/prospects')
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [adding, setAdding] = useState(false)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of data ?? []) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [data])
  const rows = useMemo(() => (data ?? []).filter((p) => filter === 'ALL' || p.status === filter), [data, filter])

  const columns: ColDef<ProspectRow>[] = [
    {
      headerName: 'Prospect',
      field: 'name',
      minWidth: 220,
      flex: 1.4,
      cellRenderer: (p: { data: ProspectRow }) => (
        <div className="flex h-full items-center gap-2.5">
          <Avatar name={p.data.name} size={28} color="#71717a" />
          <div className="leading-tight">
            <div className="font-medium">{p.data.name}</div>
            <div className="text-[11.5px] text-muted-foreground">{p.data.email ?? 'No email yet'}</div>
          </div>
        </div>
      ),
    },
    { headerName: 'Company', valueGetter: (p) => [p.data?.role, p.data?.company].filter(Boolean).join(', ') || '—', minWidth: 200, flex: 1.2 },
    { headerName: 'Status', field: 'status', minWidth: 130, enableRowGroup: true, valueFormatter: (p) => PROSPECT_STATUS[p.value as ProspectStatus]?.label ?? p.value, cellRenderer: (p: { value: ProspectStatus }) => <div className="flex h-full items-center"><ProspectStatusBadge status={p.value} /></div> },
    { headerName: 'Next call', field: 'nextCallAt', minWidth: 160, valueFormatter: (p) => (p.value ? fmtDateTime(p.value) : '—') },
    { headerName: 'Last call', field: 'lastCallAt', minWidth: 120, valueFormatter: (p) => (p.value ? relative(p.value) : '—') },
    { headerName: 'Calls', field: 'calls', minWidth: 80, maxWidth: 100, type: 'numericColumn' },
    { headerName: 'Book', field: 'books', minWidth: 90, maxWidth: 110, headerTooltip: 'Has their own Discovery Call Book', valueFormatter: (p) => (p.value ? 'Ready' : '—') },
    { headerName: 'Added', field: 'createdAt', minWidth: 110, valueFormatter: (p) => relative(p.value) },
  ]

  return (
    <div>
      <PageHeader
        title="Prospects"
        description="People you might coach: book discovery calls, record the fit check, then send the intake form."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add prospect
          </Button>
        }
      />
      <div className="mb-5">
        <IntakeLinkCard compact />
      </div>
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search prospects, companies…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Segmented
          className="overflow-x-auto lg:ml-auto"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'ALL' as Filter, label: `All ${data?.length ?? ''}` }, ...(Object.keys(PROSPECT_STATUS) as ProspectStatus[]).map((s) => ({ value: s as Filter, label: `${PROSPECT_STATUS[s].label} ${counts[s] ?? 0}` }))]}
        />
      </div>
      {loading && !data ? <DataGridSkeleton cols={[22, 20, 10, 14, 10, 6, 6, 8]} /> : null}
      {error ? <ErrorState message={error} /> : null}
      {data && !data.length ? (
        <EmptyState icon={UserPlus} title="No prospects yet" description="Add someone you are talking to, then prepare their Discovery Call Book for the call." action={<Button onClick={() => setAdding(true)}><Plus /> Add prospect</Button>} />
      ) : null}
      {data?.length ? <DataGrid rows={rows} columns={columns} quickFilter={q} autoHeight movableColumns groupable exportName="prospects" detail={PROSPECT_DETAIL} onRowClick={(r) => navigate(`/coach/prospects/${r.id}`)} /> : null}
      <ProspectDialog open={adding} onOpenChange={setAdding} onSaved={(p) => navigate(`/coach/prospects/${p.id}`)} />
    </div>
  )
}
