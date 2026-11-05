import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const tz = 'UTC'
export const fmtDate = (d?: string | Date | null, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  d ? new Date(d).toLocaleDateString('en-US', { timeZone: tz, ...opts }) : '—'
export const fmtDateLong = (d?: string | Date | null) => fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
export const fmtTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }) : '')
export const fmtDateTime = (d?: string | Date | null) => (d ? `${fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(d)}` : '—')

export function relative(d?: string | Date | null): string {
  if (!d) return 'never'
  const diff = Date.now() - new Date(d).getTime()
  const abs = Math.abs(diff)
  const day = 86_400_000
  const future = diff < 0
  if (abs < 3_600_000) return future ? 'within the hour' : 'just now'
  if (abs < day) {
    const h = Math.round(abs / 3_600_000)
    return future ? `in ${h}h` : `${h}h ago`
  }
  const days = Math.round(abs / day)
  if (days === 1) return future ? 'tomorrow' : 'yesterday'
  if (days < 14) return future ? `in ${days} days` : `${days} days ago`
  const w = Math.round(days / 7)
  return future ? `in ${w} weeks` : `${w} weeks ago`
}

export const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
export const initials = (name: string) => name.replace(/^Dr\.\s*/, '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
