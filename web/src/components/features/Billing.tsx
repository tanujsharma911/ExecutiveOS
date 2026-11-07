/** Auto-renewing program (PayPal subscription) status for coaches and clients. */
import { AlertTriangle, CreditCard, ExternalLink, FlaskConical, PauseCircle, Play, RefreshCw, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/misc'
import { api, useApi } from '@/lib/api'
import { usd } from '@/lib/discovery'
import { cn, fmtDate } from '@/lib/utils'

export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED'
export interface Subscription {
  id: string
  status: SubscriptionStatus
  amountCents: number
  intervalWeeks: number
  failedPayments: number
  lastPaymentAt: string | null
  nextBillingAt: string | null
  lastFailureAt: string | null
}
export const MAX_FAILURES = 3

const STATUS: Record<SubscriptionStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'outline'; hint: string }> = {
  ACTIVE: { label: 'Auto-renew on', variant: 'success', hint: 'PayPal renews the program at the end of each term' },
  PAST_DUE: { label: 'Payment failed', variant: 'warning', hint: 'The last renewal failed; PayPal is retrying' },
  SUSPENDED: { label: 'Paused', variant: 'danger', hint: 'All retries failed; the client is inactive (read-only)' },
  CANCELLED: { label: 'Cancelled', variant: 'outline', hint: 'Will not renew' },
  EXPIRED: { label: 'Ended', variant: 'outline', hint: 'Will not renew' },
}

export function BillingBadge({ status, failed }: { status: SubscriptionStatus; failed?: number }) {
  const s = STATUS[status]
  return (
    <Tooltip content={s.hint}>
      <span className="inline-flex">
        <Badge variant={s.variant}>
          {status === 'PAST_DUE' ? <AlertTriangle /> : status === 'SUSPENDED' ? <PauseCircle /> : <RefreshCw />}
          {s.label}
          {status === 'PAST_DUE' && failed ? ` (${failed}/${MAX_FAILURES})` : ''}
        </Badge>
      </span>
    </Tooltip>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  )
}

/** Coach's card on the client page. */
export function SubscriptionCard({ clientId, subscription, sandbox, onChanged }: { clientId: string; subscription: Subscription; sandbox: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const s = subscription
  const act = async (action: 'sync' | 'reactivate' | 'cancel' | 'simulate-failure', done: string) => {
    if (action === 'cancel' && !confirm('Stop automatic renewals? The client keeps access until you change it.')) return
    setBusy(action)
    try {
      await api(`/discovery/clients/${clientId}/subscription/${action}`, { method: 'POST' })
      toast.success(done)
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const live = s.status === 'ACTIVE' || s.status === 'PAST_DUE' || s.status === 'SUSPENDED'
  return (
    <Card className={cn(s.status === 'SUSPENDED' && 'border-danger/40', s.status === 'PAST_DUE' && 'border-warning/40')}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-4" /> Billing
        </CardTitle>
        <BillingBadge status={s.status} failed={s.failedPayments} />
      </CardHeader>
      <CardContent className="grid gap-2 text-[13px]">
        <Row label="Renews">
          {usd(s.amountCents)} every {s.intervalWeeks} weeks
        </Row>
        <Row label="Last payment">{s.lastPaymentAt ? fmtDate(s.lastPaymentAt, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</Row>
        <Row label="Next renewal">{live && s.nextBillingAt ? fmtDate(s.nextBillingAt, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</Row>
        {s.failedPayments ? (
          <Row label="Failed attempts">
            <span className="text-danger">
              {s.failedPayments} of {MAX_FAILURES}
            </span>
          </Row>
        ) : null}
        {s.status === 'SUSPENDED' ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">The client is inactive: they can sign in and read, but can’t submit reflections or updates. Reactivate once they’ve updated their payment method in PayPal.</p> : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {s.status === 'SUSPENDED' ? (
            <Button size="sm" disabled={!!busy} onClick={() => act('reactivate', 'Subscription reactivated')}>
              <Play /> Reactivate
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act('sync', 'Synced with PayPal')}>
            <RefreshCw className={cn(busy === 'sync' && 'animate-spin')} /> Sync with PayPal
          </Button>
          {live ? (
            <Button size="sm" variant="ghost" className="text-danger" disabled={!!busy} onClick={() => act('cancel', 'Auto-renew cancelled')}>
              <XCircle /> Cancel auto-renew
            </Button>
          ) : null}
        </div>
        {sandbox && live && s.status !== 'SUSPENDED' ? (
          <div className="mt-1 rounded-lg border border-dashed px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              <FlaskConical className="size-3.5" /> Sandbox test
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">PayPal can’t fail a renewal on demand. This records one failed renewal, with the same notifications and emails as a real one.</p>
            <Button size="sm" variant="outline" className="mt-2" disabled={!!busy} onClick={() => act('simulate-failure', 'Failed renewal recorded')}>
              <AlertTriangle /> Simulate failed renewal
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

interface ClientBilling {
  active: boolean
  inactiveReason: string | null
  manageUrl: string
  subscription: { status: SubscriptionStatus; program: string; amountCents: number; intervalWeeks: number; nextBillingAt: string | null; lastPaymentAt: string | null; failedPayments: number; maxFailures: number } | null
}

/** Client's view (Settings). */
export function ClientBillingCard() {
  const { data } = useApi<ClientBilling>('/client/subscription')
  const s = data?.subscription
  if (!data || !s) return null
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4" /> Subscription
          </CardTitle>
          <CardDescription>
            {s.program} renews automatically through PayPal every {s.intervalWeeks} weeks.
          </CardDescription>
        </div>
        <BillingBadge status={s.status} failed={s.failedPayments} />
      </CardHeader>
      <CardContent className="grid gap-2 text-[13px]">
        <Row label="Amount">{usd(s.amountCents)}</Row>
        <Row label="Last payment">{s.lastPaymentAt ? fmtDate(s.lastPaymentAt, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</Row>
        <Row label="Next renewal">{s.nextBillingAt && s.status !== 'CANCELLED' && s.status !== 'EXPIRED' ? fmtDate(s.nextBillingAt, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</Row>
        <Button asChild size="sm" variant="outline" className="mt-1 justify-self-start">
          <a href={data.manageUrl} target="_blank" rel="noreferrer">
            <ExternalLink /> Manage payment method in PayPal
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}

/** Banner across the client app while a renewal is failing or the account is paused. */
export function ClientBillingBanner() {
  const { data } = useApi<ClientBilling>('/client/subscription')
  if (!data) return null
  const s = data.subscription
  if (data.active && s?.status !== 'PAST_DUE') return null
  const paused = !data.active
  return (
    <div className={cn('mb-5 flex flex-col gap-2 rounded-xl border px-4 py-3 text-[13px] sm:flex-row sm:items-center', paused ? 'border-danger/30 bg-danger-soft text-danger' : 'border-warning/30 bg-warning-soft text-warning')} role="alert">
      {paused ? <PauseCircle className="size-5 shrink-0" /> : <AlertTriangle className="size-5 shrink-0" />}
      <div className="flex-1">
        <b>{paused ? 'Your program is paused.' : 'Your renewal payment failed.'}</b>{' '}
        {paused
          ? 'The renewal could not be collected after several attempts. You can still view your work, but new reflections and updates are on hold. Update your payment method in PayPal, then let your coach know.'
          : `PayPal will try again soon (attempt ${s?.failedPayments} of ${s?.maxFailures}). Please check the card or bank linked to this automatic payment.`}
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0">
        <a href={data.manageUrl} target="_blank" rel="noreferrer">
          <ExternalLink /> Update in PayPal
        </a>
      </Button>
    </div>
  )
}
