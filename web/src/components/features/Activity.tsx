/**
 * Reflection activity: day streak + month-by-month heat map.
 * Fed by the lightweight /activity endpoint (no AI), so it renders fast.
 */
import { Flame } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import type { Activity } from '@/lib/types'
import { cn, fmtDate } from '@/lib/utils'

export function StreakFlame({ days, size = 'md', graceUsed }: { days: number; size?: 'md' | 'lg'; graceUsed?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', size === 'lg' && 'gap-4')}>
      <div className={cn('relative flex items-center justify-center rounded-2xl bg-gradient-to-b from-orange-50 to-amber-50 ring-1 ring-orange-200/70', size === 'lg' ? 'size-16' : 'size-12')}>
        <Flame className={cn('text-orange-500', days > 0 && 'animate-flame', size === 'lg' ? 'size-9' : 'size-7')} fill={days > 0 ? '#fdba74' : 'none'} />
      </div>
      <div>
        <div className={cn('font-semibold leading-none tabular-nums', size === 'lg' ? 'text-[30px]' : 'text-[22px]')}>{days}</div>
        <div className="mt-1 text-[12px] text-muted-foreground">day reflection streak</div>
        {graceUsed ? <div className="mt-0.5 text-[11.5px] font-medium text-warning">Reflect today to keep it going</div> : null}
      </div>
    </div>
  )
}

/** Floating tooltip rendered in a portal so the scroll container can't clip it. */
function HeatTooltip({ cell, x, y, what, showKinds }: { cell: Cell; x: number; y: number; what: string; showKinds: boolean }) {
  const counts = cell.kinds.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {})
  const left = Math.min(Math.max(x, 110), window.innerWidth - 110)
  return createPortal(
    <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full animate-rise" style={{ left, top: y - 8 }}>
      <div className="whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-2 text-[12px] leading-snug text-white shadow-lg">
        <div className="font-semibold">{fmtDate(cell.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
        <div className="text-white/80">
          {cell.count ? `${cell.count} ${what}${cell.count === 1 ? '' : 's'} submitted` : `No ${what}s submitted`}
        </div>
        {showKinds && cell.count ? (
          <div className="mt-0.5 text-white/60">
            {Object.entries(counts)
              .map(([k, n]) => `${n} ${KIND_LABEL[k] ?? k}`)
              .join(' · ')}
          </div>
        ) : null}
      </div>
      <div className="mx-auto size-0 border-x-[5px] border-t-[5px] border-x-transparent border-t-zinc-900" style={{ marginLeft: `calc(50% - 5px + ${x - left}px)` }} />
    </div>,
    document.body,
  )
}

const HEAT = ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127']
const level = (n: number) => Math.min(4, Math.max(0, n))
const KIND_LABEL: Record<string, string> = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', QUARTERLY: 'quarterly', ANNUALLY: 'annual', ONE_TIME: 'one-time' }
const DAY = 86_400_000

interface Cell {
  key: string
  date: Date
  count: number
  kinds: string[]
  col: number
  row: number
}

/**
 * One block per month with a gap between months. Inside a block, columns are
 * weeks and rows are weekdays (Sunday at the top). `only` limits the count to
 * one form frequency, e.g. 'DAILY'.
 */
export function ReflectionHeatmap({ heatmap, only, months = 12 }: { heatmap: Activity['heatmap']; only?: string; months?: number }) {
  const [hover, setHover] = useState<{ cell: Cell; x: number; y: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // Start scrolled to the most recent months — once per data set, so the user can scroll back freely.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [heatmap.end, only])
  // Hide the tooltip whenever anything scrolls (it's positioned in viewport coordinates).
  useEffect(() => {
    const hide = () => setHover(null)
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [])
  const end = new Date(`${heatmap.end}T00:00:00Z`)

  const blocks = Array.from({ length: months }, (_, i) => {
    const first = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (months - 1 - i), 1))
    const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    const offset = first.getUTCDay()
    const cells: Cell[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(first.getTime() + (d - 1) * DAY)
      if (date > end) break
      const key = date.toISOString().slice(0, 10)
      const entry = heatmap.days[key]
      const kinds = (entry?.kinds ?? []).filter((k) => !only || k === only)
      cells.push({ key, date, count: kinds.length, kinds, col: Math.floor((d - 1 + offset) / 7), row: date.getUTCDay() })
    }
    // Only reserve columns for days that exist so far (the current month is partial).
    const cols = cells.length ? Math.max(...cells.map((c) => c.col)) + 1 : 1
    return { label: fmtDate(first, { month: 'short' }), cells, cols }
  })

  const what = only === 'DAILY' ? 'daily reflection' : 'reflection'

  return (
    <div ref={scroller} className="max-w-full overflow-x-auto">
      <div className="w-max">
        <div className="flex gap-[7px]">
          {blocks.map((b) => (
            <div key={b.label + b.cols} className="flex flex-col items-center gap-1.5">
              <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${b.cols}, 10px)`, gridTemplateRows: 'repeat(7, 10px)' }}>
                {b.cells.map((c) => (
                  <span
                    key={c.key}
                    onMouseEnter={(e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      setHover({ cell: c, x: r.left + r.width / 2, y: r.top })
                    }}
                    onMouseLeave={() => setHover(null)}
                    aria-label={`${c.count || 'No'} ${what}${c.count === 1 ? '' : 's'} on ${fmtDate(c.date, { weekday: 'long', month: 'long', day: 'numeric' })}`}
                    className={cn('rounded-[2.5px] transition-transform hover:scale-[1.35]', c.key === heatmap.end && 'outline outline-1 outline-offset-1 outline-foreground/50')}
                    style={{ gridColumn: c.col + 1, gridRow: c.row + 1, background: HEAT[level(c.count)] }}
                  />
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
      {hover ? <HeatTooltip {...hover} what={what} showKinds={!only} /> : null}
    </div>
  )
}

/** Streak + heat map side by side (stacked on small screens). */
export function ConsistencyPanel({ activity, only }: { activity: Activity | null; only?: string }) {
  if (!activity) return <ConsistencySkeleton />
  const s = activity.dailyStreak
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 md:min-w-[200px] md:flex-1 md:flex-col md:items-start md:justify-center">
          <StreakFlame days={s.current} graceUsed={s.graceUsed} />
          <div className="grid gap-0.5 text-[12px] text-muted-foreground">
            <div>
              Best streak <span className="font-medium text-foreground">{s.best} days</span> · {s.total} check-ins
            </div>
            <div>One missed day is forgiven</div>
            {s.doneToday ? <div className="font-medium text-success">Today's reflection is done</div> : null}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full items-center md:self-stretch md:border-l md:pl-6">
          <ReflectionHeatmap heatmap={activity.heatmap} only={only} />
        </div>
      </div>
    </Card>
  )
}

export function ConsistencySkeleton() {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-6">
        <div className="grid shrink-0 gap-3 md:w-[210px]">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-2xl" />
            <div className="grid gap-2">
              <Skeleton className="h-5 w-10" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="min-w-0 flex-1 md:border-l md:pl-6">
          <Skeleton className="h-[96px] w-full max-w-[640px]" />
        </div>
      </div>
    </Card>
  )
}
