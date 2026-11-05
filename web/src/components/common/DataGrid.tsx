import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type RowClickedEvent } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { useMemo } from 'react'
import { Skeleton } from '@/components/ui/misc'

ModuleRegistry.registerModules([AllCommunityModule])

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

export function DataGrid<T>({ rows, columns, onRowClick, quickFilter, height, autoHeight, movableColumns = false }: { rows: T[]; columns: ColDef<T>[]; onRowClick?: (row: T) => void; quickFilter?: string; height?: number; autoHeight?: boolean; /** AG Grid's built-in drag-to-reorder column headers */ movableColumns?: boolean }) {
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true, suppressMovable: !movableColumns, flex: 1, minWidth: 110 }), [movableColumns])
  return (
    <div className="overflow-hidden rounded-xl border bg-card" style={autoHeight ? undefined : { height: height ?? 440 }}>
      <AgGridReact<T>
        theme={gridTheme}
        rowData={rows}
        columnDefs={columns}
        defaultColDef={defaultColDef}
        quickFilterText={quickFilter}
        domLayout={autoHeight ? 'autoHeight' : 'normal'}
        onRowClicked={onRowClick ? (e: RowClickedEvent<T>) => e.data && onRowClick(e.data) : undefined}
        rowClass={onRowClick ? 'cursor-pointer' : undefined}
        suppressCellFocus
        suppressDragLeaveHidesColumns
        animateRows
      />
    </div>
  )
}
