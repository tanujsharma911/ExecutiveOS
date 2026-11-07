import '@/lib/agGridLicense' // before the grid renders
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GetDetailRowDataParams, type ICellRendererParams, type RowClickedEvent, type ValueFormatterParams, type ValueGetterParams } from 'ag-grid-community'
import { ColumnMenuModule, ExcelExportModule, MasterDetailModule, RowGroupingModule, RowGroupingPanelModule } from 'ag-grid-enterprise'
import { AgGridReact } from 'ag-grid-react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger, Skeleton } from '@/components/ui/misc'

ModuleRegistry.registerModules([AllCommunityModule, RowGroupingModule, RowGroupingPanelModule, MasterDetailModule, ExcelExportModule, ColumnMenuModule])

export const gridTheme = themeQuartz.withParams({
  fontFamily: 'Inter, ui-sans-serif, system-ui',
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 500,
  headerTextColor: '#6b6b73',
  headerBackgroundColor: '#fbfbfa',
  backgroundColor: '#ffffff',
  foregroundColor: '#18181b',
  borderColor: '#ecebe8',
  rowBorder: { color: '#f0efec' },
  wrapperBorder: false,
  wrapperBorderRadius: 12,
  rowHoverColor: '#f7f7f5',
  selectedRowBackgroundColor: '#f1f0fb',
  accentColor: '#5b5bd6',
  spacing: 7,
  cellHorizontalPadding: 14,
  rowHeight: 52,
  headerHeight: 40,
})
/** Compact rows for the tables inside an expanded row. */
const detailTheme = gridTheme.withParams({ rowHeight: 40, headerHeight: 34, backgroundColor: '#fcfcfb', wrapperBorder: true, wrapperBorderRadius: 8 })

/** Placeholder with the same frame, header and row height as DataGrid. `cols` are relative widths (%). */
export function DataGridSkeleton({ cols, rows = 4 }: { cols: number[]; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card" aria-busy="true">
      <div className="flex h-10 items-center gap-6 border-b bg-[#fbfbfa] px-3.5">
        {cols.map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-[52px] items-center gap-6 border-b px-3.5 last:border-b-0">
          {cols.map((w, i) => (
            <div key={i} className="grid gap-1.5" style={{ width: `${w}%` }}>
              <Skeleton className={i === 0 ? 'h-3 w-11/12' : 'h-3 w-3/4'} />
              {i === 0 ? <Skeleton className="h-2.5 w-1/2" /> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Rows shown in a small table when a row is expanded (AG Grid master/detail). */
export interface DetailConfig<T> {
  columns: ColDef[]
  load: (row: T) => Promise<unknown[]>
  /** Shown when the detail table has no rows */
  empty?: string
}

const today = () => new Date().toISOString().slice(0, 10)
/** Open group rows by default, but keep detail (master) rows collapsed. */
const GROUPS_OPEN = (p: { rowNode: { group?: boolean } }) => !!p.rowNode.group
/** The Group column shows groups only; a client row's own expand arrow stays in its first column. */
const EmptyCell = () => null
const GROUP_CELL = (p: ICellRendererParams) => (p.node.group ? { component: 'agGroupCellRenderer' } : { component: EmptyCell })

export function DataGrid<T>({
  rows,
  columns,
  onRowClick,
  quickFilter,
  height,
  autoHeight,
  movableColumns = false,
  groupable = false,
  exportName,
  detail,
}: {
  rows: T[]
  columns: ColDef<T>[]
  onRowClick?: (row: T) => void
  quickFilter?: string
  height?: number
  autoHeight?: boolean
  /** AG Grid's built-in drag-to-reorder column headers */
  movableColumns?: boolean
  /** Drag columns marked `enableRowGroup` into the group bar (AG Grid row grouping) */
  groupable?: boolean
  /** Shows an Export menu (CSV and Excel); used in the file name */
  exportName?: string
  /** Expandable rows with a nested table (AG Grid master/detail) */
  detail?: DetailConfig<T>
}) {
  const ref = useRef<AgGridReact<T>>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true, suppressMovable: !movableColumns && !groupable, flex: 1, minWidth: 110 }), [movableColumns, groupable])

  // Group rows have no `data`: page renderers expect a row, so show the group's (aggregated) value instead.
  const columnDefs = useMemo<ColDef<T>[]>(
    () =>
      columns.map((c, i) => {
        const r = c.cellRenderer
        const vg = c.valueGetter
        const vf = c.valueFormatter
        let col: ColDef<T> = {
          ...c,
          // Group rows: only grouped and aggregated columns have a value; leave the other cells empty.
          ...(typeof vg === 'function' ? { valueGetter: (p: ValueGetterParams<T>) => (p.node?.group ? undefined : vg(p)) } : {}),
          ...(typeof vf === 'function' ? { valueFormatter: (p: ValueFormatterParams<T>) => (p.node?.group && !c.aggFunc && p.node.rowGroupColumn?.getColId() !== p.column.getColId() ? '' : vf(p)) } : {}),
          ...(typeof r === 'function' ? { cellRenderer: (p: ICellRendererParams<T>) => (p.node.group || !p.data ? (p.valueFormatted ?? p.value ?? null) : r(p)) } : {}),
        }
        // The first column gets the expand chevron for detail rows.
        if (detail && i === 0) col = { ...col, cellRenderer: 'agGroupCellRenderer', cellRendererParams: { innerRenderer: col.cellRenderer } }
        return col
      }),
    [columns, detail],
  )

  const detailParams = useMemo(
    () =>
      detail
        ? {
            detailGridOptions: {
              theme: detailTheme,
              columnDefs: detail.columns,
              defaultColDef: { flex: 1, minWidth: 100, sortable: true, resizable: true },
              domLayout: 'autoHeight' as const,
              suppressCellFocus: true,
              overlayNoRowsTemplate: `<span class="text-[12.5px] text-muted-foreground">${detail.empty ?? 'Nothing to show yet.'}</span>`,
            },
            getDetailRowData: (p: GetDetailRowDataParams<T>) => {
              detail.load(p.data).then(p.successCallback, () => p.successCallback([]))
            },
          }
        : undefined,
    [detail],
  )

  const file = (ext: string) => `executiveos-${exportName}-${today()}.${ext}`
  return (
    <div className="grid gap-2">
      {exportName ? (
        <div className="flex justify-end">
          <Popover open={exportOpen} onOpenChange={setExportOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">
                <Download /> Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="grid w-44 gap-0.5 p-1" align="end">
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => {
                  ref.current?.api.exportDataAsExcel({ fileName: file('xlsx'), sheetName: exportName })
                  setExportOpen(false)
                }}>
                <FileSpreadsheet /> Excel (.xlsx)
              </Button>
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => {
                  ref.current?.api.exportDataAsCsv({ fileName: file('csv') })
                  setExportOpen(false)
                }}>
                <FileText /> CSV (.csv)
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border bg-card" style={autoHeight ? undefined : { height: height ?? 440 }}>
        <AgGridReact<T>
          ref={ref}
          theme={gridTheme}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilter}
          domLayout={autoHeight ? 'autoHeight' : 'normal'}
          onRowClicked={
            onRowClick
              ? (e: RowClickedEvent<T>) => {
                  // Ignore group rows, detail rows and clicks on the expand/collapse chevrons.
                  const target = e.event?.target as HTMLElement | null
                  if (!e.data || e.node.group || e.node.detail || target?.closest('.ag-group-contracted, .ag-group-expanded, .ag-details-row')) return
                  onRowClick(e.data)
                }
              : undefined
          }
          rowClass={onRowClick ? 'cursor-pointer' : undefined}
          suppressCellFocus
          suppressDragLeaveHidesColumns
          animateRows
          {...(groupable
            ? { rowGroupPanelShow: 'always' as const, groupDisplayType: 'singleColumn' as const, isGroupOpenByDefault: GROUPS_OPEN, autoGroupColumnDef: { headerName: 'Group', minWidth: 220, cellRendererSelector: GROUP_CELL }, suppressAggFuncInHeader: true }
            : {})}
          {...(detail ? { masterDetail: true, detailRowAutoHeight: true, detailCellRendererParams: detailParams } : {})}
        />
      </div>
    </div>
  )
}
