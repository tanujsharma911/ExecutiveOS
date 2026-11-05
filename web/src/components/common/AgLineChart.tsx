/**
 * Multi-series trend chart built on AG Charts (the charting library from the AG Grid team).
 * Draws one or more series as lines, areas or bars (`type`).
 * `AgAreaTrend` (below) is the single-series area version used for small indicator cards.
 */
import { AreaSeriesModule, BarSeriesModule, CategoryAxisModule, LegendModule, LineSeriesModule, ModuleRegistry, NumberAxisModule, type AgCartesianChartOptions, type AgCartesianSeriesOptions } from 'ag-charts-community'
import { AgCharts } from 'ag-charts-react'
import { useMemo } from 'react'
import { fmtDate } from '@/lib/utils'
import type { LineSpec } from './Charts'

// Only the pieces this chart uses, to keep the bundle small.
ModuleRegistry.registerModules([LineSeriesModule, AreaSeriesModule, BarSeriesModule, CategoryAxisModule, NumberAxisModule, LegendModule])

export type TrendChartType = 'line' | 'area' | 'bar'

/** AG Charts draws on a canvas, which can't read CSS variables — resolve `var(--x)` to a real colour. */
function resolveColor(color: string) {
  const m = color.match(/^var\((--[\w-]+)\)$/)
  if (!m || typeof document === 'undefined') return color
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || color
}

export function AgLineChart({ data, lines, height = 220, domain, type = 'line', unit }: { data: Record<string, unknown>[]; lines: LineSpec[]; height?: number; domain?: [number, number]; type?: TrendChartType; unit?: string }) {
  // Callers usually pass freshly built arrays; key on the content so the chart only updates when the data really changes
  // (otherwise typing anywhere on the page would redraw and re-animate it).
  const key = JSON.stringify([data, lines, height, domain, type, unit])
  const options = useMemo<AgCartesianChartOptions>(() => {
    const muted = resolveColor('var(--muted-foreground)')
    const border = resolveColor('var(--border)')
    const single = lines.length === 1
    const withUnit = (v: unknown) => (v === undefined || v === null ? '—' : `${v}${unit ?? ''}`)
    return {
      data,
      height,
      background: { visible: false },
      // Leave room for the last date label (area series run edge to edge, so they need a bit more).
      padding: { top: 8, right: type === 'area' ? 22 : 18, bottom: 0, left: 0 },
      theme: { params: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: 11 } },
      series: lines.map((l): AgCartesianSeriesOptions => {
        const color = resolveColor(l.color)
        const tooltip = {
          renderer: ({ datum, yKey }: { datum: Record<string, unknown>; yKey: string }) => ({
            heading: fmtDate(String(datum.date), { month: 'long', day: 'numeric' }),
            data: [{ label: l.label, value: withUnit(datum[yKey]) }],
          }),
        }
        const base = { xKey: 'date', yKey: l.key, yName: l.label, tooltip }
        if (type === 'bar') {
          // Grouped (side by side), not stacked — the metrics are separate 0–10 scores.
          return { ...base, type: 'bar', fill: color, fillOpacity: l.dashed ? 0.55 : 0.9, strokeWidth: 0, cornerRadius: 3 }
        }
        const line = { stroke: color, strokeWidth: 2, lineDash: l.dashed ? [4, 4] : undefined, interpolation: { type: 'smooth' as const }, connectMissingData: true, marker: { size: single ? 4 : 5, fill: color, strokeWidth: 0 } }
        if (type === 'area') return { ...base, ...line, type: 'area', fill: color, fillOpacity: single ? 0.09 : 0.07 }
        return { ...base, ...line, type: 'line' }
      }),
      axes: {
        x: {
          type: 'category',
          position: 'bottom',
          label: { color: muted, autoRotate: false, avoidCollisions: true, minSpacing: 12, formatter: ({ value }: { value: unknown }) => fmtDate(String(value)) },
          line: { enabled: false },
          gridLine: { enabled: false },
        },
        y: {
          type: 'number',
          position: 'left',
          ...(domain ? { min: domain[0], max: domain[1] } : {}),
          label: { color: muted, formatter: ({ value }: { value: unknown }) => `${value}${unit ?? ''}` },
          line: { enabled: false },
          gridLine: { style: [{ stroke: border, lineDash: [3, 3] }] },
        },
      },
      legend: { enabled: lines.length > 1, position: 'bottom', item: { label: { color: muted, fontSize: 11.5 } } },
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return <AgCharts options={options} style={{ height }} />
}

/** Single-series area chart (AG Charts) — the small trend in each Growth Journey indicator card. */
export function AgAreaTrend({ data, label, color = 'var(--ai)', height = 160, domain, unit }: { data: { date: string; value: number }[]; label: string; color?: string; height?: number; domain?: [number, number]; unit?: string }) {
  return <AgLineChart type="area" data={data} lines={[{ key: 'value', label, color }]} height={height} domain={domain} unit={unit} />
}
