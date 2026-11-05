import type { Frequency } from '../generated/prisma/enums.js'

const DAY = 86_400_000

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  const dow = (x.getUTCDay() + 6) % 7 // Monday = 0
  return new Date(x.getTime() - dow * DAY)
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY)
}

/** Returns the current period window for a form frequency. */
export function currentPeriod(freq: Frequency, now: Date, assignedAt?: Date): { start: Date; due: Date } {
  switch (freq) {
    case 'DAILY': {
      const s = startOfDay(now)
      return { start: s, due: new Date(s.getTime() + DAY - 60_000) }
    }
    case 'WEEKLY': {
      const s = startOfWeek(now)
      return { start: s, due: new Date(s.getTime() + 7 * DAY - 60_000) }
    }
    case 'MONTHLY': {
      const s = startOfMonth(now)
      const next = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1))
      return { start: s, due: new Date(next.getTime() - 60_000) }
    }
    case 'QUARTERLY': {
      const q = Math.floor(now.getUTCMonth() / 3) * 3
      const s = new Date(Date.UTC(now.getUTCFullYear(), q, 1))
      const next = new Date(Date.UTC(now.getUTCFullYear(), q + 3, 1))
      return { start: s, due: new Date(next.getTime() - 60_000) }
    }
    case 'ANNUALLY': {
      const s = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
      return { start: s, due: new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1) - 60_000) }
    }
    case 'ONE_TIME':
    default: {
      const s = startOfDay(assignedAt ?? now)
      return { start: s, due: addDays(s, 7) }
    }
  }
}

export const DAY_MS = DAY
