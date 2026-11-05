/** Small chart helpers. Charts themselves are AG Charts (see AgLineChart.tsx); the table sparkline is plain SVG. */

export function Sparkline({ values, width = 72, height = 22, color = 'var(--ai)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <span className="text-muted-foreground">—</span>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`)
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r={2.2} fill={color} />
    </svg>
  )
}


export interface LineSpec {
  key: string
  label: string
  color: string
  dashed?: boolean
}

/** Merge several metric series into chart rows keyed by date */
export function mergeSeries(series: { key: string; points: { date: string; value: number }[] }[]) {
  const rows = new Map<string, Record<string, unknown>>()
  for (const s of series) for (const p of s.points) rows.set(p.date, { ...(rows.get(p.date) ?? { date: p.date }), [s.key]: p.value })
  return [...rows.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
}
