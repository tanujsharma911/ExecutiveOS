/**
 * Auto-renewing programs (PayPal Subscriptions).
 *
 * PayPal bills the program price up front and again every `durationWeeks`. When a renewal fails, PayPal retries;
 * after PAYMENT_FAILURE_THRESHOLD failures in a row it suspends the subscription. We mirror that here:
 *   failed renewal  → coach + client notified and emailed ("attempt n of 3")
 *   suspended       → client inactive (read-only), both notified
 *   paid / reactivated → client active again
 *
 * PayPal tells us through webhooks (needs a public URL + PAYPAL_WEBHOOK_ID). For local development, where PayPal
 * can't reach the API, `startSubscriptionSync` polls PayPal on a timer and runs the same `applySubscriptionState`.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from '../db.js'
import { escapeHtml, layout, sendEmail } from './email.js'
import { completeIntakePayment, usd } from './intake.js'
import { createLogger } from './logger.js'
import { activateSubscription, cancelSubscription, createPlan, createProduct, getSubscription, PAYMENT_FAILURE_THRESHOLD, paypalConfigured, paypalEnv, sameAmount, type PaypalSubscription } from './paypal.js'

const log = createLogger('subscriptions')

/** PayPal's page where a payer changes the card or bank behind an automatic payment. */
export const paypalAutopayUrl = () => `https://www.${paypalEnv() === 'sandbox' ? 'sandbox.' : ''}paypal.com/myaccount/autopay/`

/** Max term PayPal allows for a weekly billing cycle. */
export const MAX_SUBSCRIPTION_WEEKS = 52

/** Returns the program's PayPal plan, creating the product/plan when missing or when price/term changed. */
export async function ensurePlan(programId: string) {
  const p = await prisma.program.findUniqueOrThrow({ where: { id: programId }, include: { coach: { select: { name: true } } } })
  const key = `${p.priceCents}:${p.durationWeeks}`
  if (p.paypalPlanId && p.paypalPlanKey === key) return p.paypalPlanId
  const productId = p.paypalProductId ?? (await createProduct({ name: `${p.name} (${p.coach.name})`, description: p.description, requestId: `product-${p.id}` })).id
  const plan = await createPlan({ productId, name: `${p.name}: ${usd(p.priceCents)} every ${p.durationWeeks} weeks`, amountCents: p.priceCents, intervalWeeks: p.durationWeeks, requestId: `plan-${p.id}-${key}` })
  await prisma.program.update({ where: { id: p.id }, data: { paypalProductId: productId, paypalPlanId: plan.id, paypalPlanKey: key } })
  log.info('PayPal plan created', { programId: p.id, planId: plan.id, key })
  return plan.id
}

const date = (s?: string) => (s ? new Date(s) : null)

/** A brand-new subscription the payer just approved: create the client once its first payment went through. */
export async function startFromIntake(sub: PaypalSubscription) {
  const payment = await prisma.intakePayment.findUnique({ where: { paypalSubscriptionId: sub.id }, include: { program: true } })
  if (!payment) return { found: false as const }
  if (payment.status !== 'CREATED') return { found: true as const, ready: true, clientId: payment.clientId, email: payment.email }
  if (sub.custom_id && sub.custom_id !== payment.id) throw new Error('Subscription does not belong to this intake payment')
  if (sub.status !== 'ACTIVE' || !sub.billing_info?.last_payment) return { found: true as const, ready: false, email: payment.email }
  if (!sameAmount(sub.billing_info.last_payment.amount, payment.amountCents)) {
    // Shouldn't happen (the plan sets the price), but never create a client for a different amount.
    const claimed = await prisma.intakePayment.updateMany({ where: { id: payment.id, status: 'CREATED' }, data: { status: 'FAILED' } })
    if (claimed.count) {
      log.error('Subscription first payment does not match', { subscriptionId: sub.id, expected: payment.amountCents, got: sub.billing_info.last_payment.amount })
      await cancelSubscription(sub.id, 'Amount did not match the program price').catch((e) => log.error('Could not cancel mismatched subscription', { error: (e as Error).message }))
      const got = sub.billing_info.last_payment.amount
      await prisma.notification.create({
        data: { userId: payment.coachId, title: `Payment amount mismatch for ${payment.email}`, body: `PayPal collected ${got.value} ${got.currency_code} for ${payment.program.name}, but the price is ${usd(payment.amountCents)}. No client was created and the subscription was cancelled; refund or follow up in PayPal.`, kind: 'alert' },
      })
    }
    return { found: true as const, ready: false, mismatch: true, email: payment.email }
  }
  const r = await completeIntakePayment(payment.id, {
    subscription: { paypalSubscriptionId: sub.id, paypalPlanId: sub.plan_id, lastPaymentAt: date(sub.billing_info.last_payment.time), nextBillingAt: date(sub.billing_info.next_billing_time) },
  })
  return { found: true as const, ready: true, clientId: r.clientId, email: payment.email }
}

type Change = 'paid' | 'failed' | 'suspended' | 'reactivated' | 'cancelled' | null

/**
 * Brings our row in line with PayPal's view of the subscription and tells people what changed.
 * `simulateFailure` (sandbox demo tool) records one extra failed renewal without PayPal.
 */
export async function applySubscriptionState(paypal: PaypalSubscription, opts: { simulateFailure?: boolean; reactivatedByCoach?: boolean } = {}) {
  const sub = await prisma.subscription.findUnique({ where: { paypalSubscriptionId: paypal.id }, include: { client: { include: { user: true } }, program: true, coach: true } })
  if (!sub) {
    // Not a client yet: maybe the browser closed right after approval.
    await startFromIntake(paypal)
    return null
  }
  const lastPaymentAt = date(paypal.billing_info?.last_payment?.time)
  const newPayment = !!lastPaymentAt && (!sub.lastPaymentAt || lastPaymentAt.getTime() > sub.lastPaymentAt.getTime() + 1000)
  // Our failure count only goes down when money actually arrives (or the coach reactivates), so a simulated
  // failure isn't undone by the next sync.
  let failed = newPayment ? (paypal.billing_info?.failed_payments_count ?? 0) : Math.max(sub.failedPayments, paypal.billing_info?.failed_payments_count ?? 0)
  if (opts.simulateFailure) failed = sub.failedPayments + 1
  if (opts.reactivatedByCoach) failed = 0

  let status: typeof sub.status
  if (paypal.status === 'CANCELLED') status = 'CANCELLED'
  else if (paypal.status === 'EXPIRED') status = 'EXPIRED'
  else if (paypal.status === 'SUSPENDED' || failed >= PAYMENT_FAILURE_THRESHOLD) status = 'SUSPENDED'
  else status = failed > 0 ? 'PAST_DUE' : 'ACTIVE'

  let change: Change = null
  if (status === 'SUSPENDED' && sub.status !== 'SUSPENDED') change = 'suspended'
  else if (failed > sub.failedPayments) change = 'failed'
  else if ((status === 'CANCELLED' || status === 'EXPIRED') && sub.status !== status) change = 'cancelled'
  else if (sub.status === 'SUSPENDED' && status === 'ACTIVE') change = 'reactivated'
  else if (newPayment) change = 'paid'

  const failedAt = date(paypal.billing_info?.last_failed_payment?.time) ?? (failed > sub.failedPayments ? new Date() : sub.lastFailureAt)
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status, failedPayments: failed, lastPaymentAt: lastPaymentAt ?? sub.lastPaymentAt, nextBillingAt: date(paypal.billing_info?.next_billing_time) ?? sub.nextBillingAt, lastFailureAt: failedAt },
  })
  const inactive = status === 'SUSPENDED'
  if (inactive !== !sub.client.active) {
    await prisma.clientProfile.update({ where: { id: sub.clientId }, data: { active: !inactive, inactiveReason: inactive ? `Renewal payment for ${sub.program.name} failed ${failed} times` : null } })
  }
  if (change) {
    log.info('Subscription changed', { subscriptionId: sub.id, change, status, failed })
    await tell(change, { ...sub, failedPayments: failed, nextBillingAt: date(paypal.billing_info?.next_billing_time) ?? sub.nextBillingAt })
  }
  return { status, failedPayments: failed, change }
}

async function tell(change: Exclude<Change, null>, s: { clientId: string; coachId: string; amountCents: number; failedPayments: number; nextBillingAt: Date | null; program: { name: string }; client: { user: { name: string; email: string } }; coach: { name: string; email: string } }) {
  const client = s.client.user
  const amount = usd(s.amountCents)
  const left = PAYMENT_FAILURE_THRESHOLD - s.failedPayments
  const coachLink = `/coach/clients/${s.clientId}`
  const msg: Record<typeof change, { coach: [string, string]; client?: { subject: string; heading: string; body: string; button?: boolean } }> = {
    paid: { coach: [`Renewal received from ${client.name}`, `${amount} for ${s.program.name}. Next renewal ${fmt(s.nextBillingAt)}.`] },
    failed: {
      coach: [`Renewal payment failed for ${client.name}`, `${amount} for ${s.program.name} could not be collected (attempt ${s.failedPayments} of ${PAYMENT_FAILURE_THRESHOLD}). PayPal will retry automatically.`],
      client: {
        subject: `Action needed: your ${s.program.name} renewal didn't go through`,
        heading: 'Your renewal payment failed',
        body: `We couldn't collect ${amount} to renew ${s.program.name} with ${s.coach.name} (attempt ${s.failedPayments} of ${PAYMENT_FAILURE_THRESHOLD}). PayPal will try again in a few days. Please check the card or bank linked to this automatic payment in PayPal. If ${left === 1 ? 'the next attempt fails' : `${left} more attempts fail`}, your account will be paused.`,
        button: true,
      },
    },
    suspended: {
      coach: [`${client.name} is now inactive`, `The ${s.program.name} renewal (${amount}) failed ${s.failedPayments} times, so PayPal paused the subscription. ${client.name} can still sign in and read, but can't submit anything. Reactivate from their client page once they've updated their payment.`],
      client: {
        subject: `Your ${s.program.name} program is paused`,
        heading: 'Your program is paused',
        body: `After ${s.failedPayments} failed attempts to renew ${s.program.name} (${amount}), your subscription was paused. You can still sign in and view your past work, but new reflections and updates are on hold. Update your payment method in PayPal, then reply to this email so ${s.coach.name} can reactivate your program.`,
        button: true,
      },
    },
    reactivated: {
      coach: [`${client.name} is active again`, `The ${s.program.name} subscription is active. Next renewal ${fmt(s.nextBillingAt)}.`],
      client: { subject: `Your ${s.program.name} program is active again`, heading: 'Welcome back', body: `Your ${s.program.name} subscription is active again, and you have full access to ExecutiveOS.` },
    },
    cancelled: { coach: [`${client.name}'s subscription ended`, `${s.program.name} will no longer renew automatically.`] },
  }
  const m = msg[change]
  const kind = change === 'paid' || change === 'reactivated' ? 'payment' : change === 'cancelled' ? 'info' : 'alert'
  await prisma.notification.create({ data: { userId: s.coachId, title: m.coach[0], body: m.coach[1], link: coachLink, kind } })
  const coachMail = sendEmail({
    to: s.coach.email,
    subject: m.coach[0],
    text: `${m.coach[1]}\n\n— ExecutiveOS`,
    html: layout({ heading: m.coach[0], paragraphs: [escapeHtml(m.coach[1])] }),
  })
  if (!m.client) return void (await coachMail)
  const clientUser = await prisma.user.findFirst({ where: { clientProfile: { id: s.clientId } }, select: { id: true } })
  if (clientUser) await prisma.notification.create({ data: { userId: clientUser.id, title: m.client.heading, body: m.client.body, link: '/client/settings', kind } })
  await Promise.all([
    coachMail,
    sendEmail({
      to: client.email,
      replyTo: s.coach.email,
      subject: m.client.subject,
      text: `Hi ${client.name},\n\n${m.client.body}${m.client.button ? `\n\nUpdate your payment method: ${paypalAutopayUrl()}` : ''}\n\n— ${s.coach.name}`,
      html: layout({
        heading: m.client.heading,
        paragraphs: [`Hi ${escapeHtml(client.name)},`, escapeHtml(m.client.body)],
        ...(m.client.button ? { button: { label: 'Update payment in PayPal', url: paypalAutopayUrl() } } : {}),
        footer: `Questions? Reply to reach ${escapeHtml(s.coach.name)}.`,
      }),
    }),
  ])
}

const fmt = (d: Date | null) => (d ? d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : 'not scheduled')

/** Fetches the subscription from PayPal and applies it. */
export async function syncSubscription(paypalSubscriptionId: string, opts?: { reactivatedByCoach?: boolean }) {
  return applySubscriptionState(await getSubscription(paypalSubscriptionId), opts)
}

/** Coach action: resume a suspended subscription in PayPal (it then collects the outstanding balance). */
export async function reactivate(paypalSubscriptionId: string) {
  const current = await getSubscription(paypalSubscriptionId)
  if (current.status === 'SUSPENDED') await activateSubscription(paypalSubscriptionId, 'Payment method updated; reactivated by coach')
  return syncSubscription(paypalSubscriptionId, { reactivatedByCoach: true })
}

/** Polls PayPal for every live subscription (and approved-but-unfinished intake subscriptions). */
export async function syncAll() {
  if (!paypalConfigured()) return
  const [subs, pending] = await Promise.all([
    prisma.subscription.findMany({ where: { status: { in: ['ACTIVE', 'PAST_DUE', 'SUSPENDED'] } }, select: { paypalSubscriptionId: true } }),
    prisma.intakePayment.findMany({ where: { kind: 'SUBSCRIPTION', status: 'CREATED', paypalSubscriptionId: { not: null }, createdAt: { gt: new Date(Date.now() - 3 * 86_400_000) } }, select: { paypalSubscriptionId: true } }),
  ])
  for (const id of [...subs, ...pending].map((x) => x.paypalSubscriptionId!)) {
    try {
      await syncSubscription(id)
    } catch (e) {
      log.warn('Subscription sync failed', { paypalSubscriptionId: id, error: (e as Error).message })
    }
  }
}

/** Starts the periodic PayPal sync (SUBSCRIPTION_SYNC_MINUTES, default 60; 0 disables). */
export function startSubscriptionSync() {
  const minutes = Number(process.env.SUBSCRIPTION_SYNC_MINUTES ?? 60)
  if (!paypalConfigured() || !minutes) return
  const run = () => syncAll().catch((e) => log.error('Subscription sync crashed', { error: (e as Error).message }))
  setTimeout(run, 15_000).unref()
  setInterval(run, minutes * 60_000).unref()
  log.info('PayPal subscription sync scheduled', { everyMinutes: minutes })
}

export const newRequestId = () => randomUUID()
