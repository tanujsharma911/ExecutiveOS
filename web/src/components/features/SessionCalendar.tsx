/**
 * Coaching sessions on a Bryntum Calendar 8 (month / week / day / list).
 * Loaded lazily (it's a large library) from SessionsPanel. Sessions are created and edited through our own
 * dialogs, so clicking an event hands the session back via `onSelect`. With `onReschedule` (coach only), upcoming
 * scheduled sessions can be dragged to a new time or resized; the move is applied only after `onReschedule`
 * resolves true (confirmed and saved), otherwise Bryntum snaps the event back.
 */
import '@/lib/bryntumLicense' // must come before any @bryntum import
// Bryntum 8 (Enterprise tier). Every @bryntum package must stay on the same version and tier.
import '@bryntum/core-enterprise/fontawesome/css/fontawesome.css'
import '@bryntum/core-enterprise/fontawesome/css/solid.css'
import '@bryntum/calendar-enterprise/calendar.css'
import '@bryntum/calendar-enterprise/stockholm-light.css'
import type { EventModelConfig } from '@bryntum/calendar-enterprise'
import { BryntumCalendar } from '@bryntum/calendar-react-enterprise'
import { Component, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@/lib/types'

/** Event colours by status — the same meaning as the status badges elsewhere in the app. */
export const SESSION_STATUS_COLORS: Record<Session['status'], string> = {
  SCHEDULED: '#5b5bd6', // AI / indigo
  COMPLETED: '#15803d', // success
  CANCELLED: '#a1a1aa', // muted
}

/**
 * Static calendar settings. These must be the *same objects* on every render: the React wrapper
 * re-applies any prop whose reference changes, and re-applying `modes` rebuilds the List view's
 * columns, which Bryntum rejects ("Replacing ColumnStore is not supported").
 */
const MODES = { year: false, agenda: false, list: { title: 'List', columns: { resources: { hidden: true } } } } as const
/** Move and resize existing sessions only; new sessions come from our own dialog. */
const DRAG = { creatable: false, draggable: true, resizable: true } as const

/** Keeps a Bryntum failure inside the calendar box instead of blanking the whole page. */
class CalendarErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('[SessionCalendar]', error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-muted-foreground">
        <div className="font-medium text-foreground">The calendar couldn't be displayed.</div>
        <div>{this.state.error.message}</div>
        <button className="mt-1 cursor-pointer rounded-md border px-3 py-1.5 text-foreground hover:bg-muted" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    )
  }
}

export type RescheduleHandler = (s: Session, start: Date, end: Date) => Promise<boolean>

export default function SessionCalendar({ sessions, showClient, onSelect, onReschedule, height = 680 }: { sessions: Session[]; showClient: boolean; onSelect: (s: Session) => void; onReschedule?: RescheduleHandler; height?: number }) {
  const byId = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions])
  // Initial date only — passing a new Date() on every render would jump the calendar back to today.
  const [initialDate] = useState(() => new Date())
  // Stable click handler that always sees the latest sessions and callback.
  const latest = useRef({ byId, onSelect, onReschedule })
  latest.current = { byId, onSelect, onReschedule }
  const [onEventClick] = useState(() => ({ eventRecord }: { eventRecord: { id: string | number } }) => {
    const s = latest.current.byId.get(String(eventRecord.id))
    if (s) latest.current.onSelect(s)
  })
  // Stable drop handler (props passed to Bryntum must keep their identity). Returning a promise makes Bryntum
  // wait: true applies the new time, false reverts the drag.
  const [onBeforeDrop] = useState(() => ({ eventRecord, newStartDate, newEndDate }: { eventRecord: { id: string | number }; newStartDate: Date; newEndDate: Date }) => {
    const s = latest.current.byId.get(String(eventRecord.id))
    const handler = latest.current.onReschedule
    if (!s || !handler) return false
    return handler(s, newStartDate, newEndDate)
  })
  const editable = !!onReschedule
  const now = Date.now()
  const events = useMemo<EventModelConfig[]>(
    () =>
      sessions.map((s) => {
        const start = new Date(s.scheduledAt)
        return {
          id: s.id,
          name: showClient && s.client ? `${s.client.user.name} · ${s.topic}` : s.topic,
          startDate: start,
          endDate: new Date(start.getTime() + s.durationMin * 60_000),
          eventColor: SESSION_STATUS_COLORS[s.status],
          cls: s.status === 'CANCELLED' ? 'eos-session-cancelled' : undefined,
          // Only upcoming, scheduled sessions can move.
          draggable: editable && s.status === 'SCHEDULED' && start.getTime() > now,
          resizable: editable && s.status === 'SCHEDULED' && start.getTime() > now,
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, showClient, editable],
  )

  return (
    <div className="eos-calendar overflow-hidden rounded-xl border bg-card" style={{ height }}>
      <CalendarErrorBoundary>
      <BryntumCalendar
        date={initialDate}
        mode="month"
        // The rest of the app shows session times in UTC; keep the calendar consistent with it.
        timeZone="UTC"
        modes={MODES}
        events={events}
        readOnly={!editable}
        autoCreate={false}
        enableDeleteKey={false}
        dragFeature={editable ? DRAG : false}
        onBeforeDragMoveEnd={onBeforeDrop}
        onBeforeDragResizeEnd={onBeforeDrop}
        sidebar={false}
        weekStartDay={1}
        eventEditFeature={false}
        eventMenuFeature={false}
        scheduleMenuFeature={false}
        eventTooltipFeature={false}
        onEventClick={onEventClick}
      />
      </CalendarErrorBoundary>
    </div>
  )
}
