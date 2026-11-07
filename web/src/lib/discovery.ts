/** Types and helpers for prospects, discovery calls, the Discovery Call Book and the intake form. */

export type ProspectStatus = 'NEW' | 'IN_DISCUSSION' | 'NOT_A_FIT' | 'INVITED' | 'CONVERTED'
export type CallOutcome = 'PENDING' | 'GOOD_FIT' | 'NOT_A_FIT' | 'UNDECIDED'
export type CallMode = 'ONLINE' | 'OFFLINE'

export interface Link {
  label: string
  url: string
}

export interface Prospect {
  id: string
  name: string
  email: string | null
  company: string
  role: string
  industry: string
  companySize: string
  location: string
  phone: string | null
  links: Link[]
  notes: string
  status: ProspectStatus
  notFitReason: string | null
  /** Coach-approved note the intake assistant may use (never the call notes) */
  intakeNote: string
  clientId: string | null
  createdAt: string
  updatedAt: string
}

export interface ProspectRow extends Prospect {
  books: number
  calls: number
  lastCallAt: string | null
  nextCallAt: string | null
}

export interface FitSignal {
  label: string
  flagged: boolean
}

export interface DiscoveryCall {
  id: string
  prospectId: string
  scheduledAt: string
  durationMin: number
  mode: CallMode
  meetingLink: string | null
  notes: string
  fitCheck: FitSignal[]
  outcome: CallOutcome
}

export interface ProspectDetail extends Prospect {
  calls: DiscoveryCall[]
  books: { id: string; title: string; updatedAt: string; version: number }[]
  payments: { id: string; status: 'CREATED' | 'COMPLETED' | 'FAILED'; amountCents: number; program: string; createdAt: string; completedAt: string | null; chatId: string | null }[]
  chats: { id: string; updatedAt: string; paid: boolean; messages: { role: 'user' | 'assistant'; text: string; at: string; topic?: string; unanswered?: boolean }[] }[]
}

export interface IntakeInfo {
  token: string
  url: string
  programs: { id: string; name: string; priceCents: number }[]
  paypal: { configured: boolean; env: 'sandbox' | 'live' }
  emailConfigured: boolean
}

export const PROSPECT_STATUS: Record<ProspectStatus, { label: string; variant: 'default' | 'outline' | 'ai' | 'success' | 'warning' | 'danger'; hint: string }> = {
  NEW: { label: 'New', variant: 'outline', hint: 'Added, no discovery call yet' },
  IN_DISCUSSION: { label: 'In discussion', variant: 'ai', hint: 'One or more discovery calls booked or held' },
  NOT_A_FIT: { label: 'Not a fit', variant: 'danger', hint: 'You decided not to work together; kept for your records' },
  INVITED: { label: 'Intake sent', variant: 'warning', hint: 'Intake form sent, waiting for payment' },
  CONVERTED: { label: 'Client', variant: 'success', hint: 'Paid through the intake form; client account created' },
}

export const OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: 'PENDING', label: 'Not recorded yet' },
  { value: 'GOOD_FIT', label: 'Good fit' },
  { value: 'UNDECIDED', label: 'Undecided: another call' },
  { value: 'NOT_A_FIT', label: 'Not a fit' },
]

export const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`

export const linkHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** `datetime-local` value (UTC, matching the rest of the app) ↔ ISO string. */
export const toLocalInput = (iso: string) => iso.slice(0, 16)
export const fromLocalInput = (v: string) => new Date(`${v}:00Z`).toISOString()
