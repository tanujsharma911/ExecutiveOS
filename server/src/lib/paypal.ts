/**
 * PayPal REST client (Orders v2) for intake payments.
 *
 * PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET — from developer.paypal.com → Apps & Credentials (sandbox app).
 * PAYPAL_ENV        — "sandbox" (default) or "live".
 * PAYPAL_WEBHOOK_ID — optional; enables POST /api/public/paypal/webhook (signature-verified backup for captures).
 */
import { HttpError } from '../auth.js'
import { createLogger } from './logger.js'

const log = createLogger('paypal')

export const paypalConfigured = () => !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
export const paypalEnv = () => ((process.env.PAYPAL_ENV ?? 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox')
const base = () => (paypalEnv() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')

let cached: { token: string; expiresAt: number } | null = null

async function accessToken(): Promise<string> {
  if (!paypalConfigured()) throw new HttpError(503, 'PayPal is not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing)')
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string }
  if (!res.ok || !body.access_token) {
    log.error('PayPal auth failed', { status: res.status, error: body.error_description })
    throw new HttpError(502, 'Could not connect to PayPal. Check the PayPal credentials.')
  }
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 }
  return cached.token
}

async function call<T>(path: string, init: { method: string; body?: unknown; requestId?: string }): Promise<T> {
  const t0 = Date.now()
  const res = await fetch(`${base()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const body = (await res.json().catch(() => ({}))) as T & { name?: string; message?: string; details?: { issue?: string; description?: string }[] }
  log.info('PayPal API', { method: init.method, path, status: res.status, ms: Date.now() - t0, debugId: res.headers.get('paypal-debug-id') ?? undefined })
  if (!res.ok) {
    const issue = body.details?.[0]
    throw new HttpError(res.status === 422 ? 422 : 502, `PayPal: ${issue?.description ?? body.message ?? body.name ?? res.statusText}`)
  }
  return body
}

export const centsToValue = (cents: number) => (cents / 100).toFixed(2)
/**
 * Compares a PayPal amount with our price in cents. Compare numbers, not strings: Orders return "2500.00"
 * but Subscriptions return "2500.0".
 */
export const sameAmount = (a: { currency_code: string; value: string } | undefined, cents: number) => !!a && a.currency_code === 'USD' && Math.round(Number(a.value) * 100) === cents

export interface PaypalOrder {
  id: string
  status: string
  purchase_units?: {
    reference_id?: string
    custom_id?: string
    amount?: { currency_code: string; value: string }
    payments?: { captures?: { id: string; status: string; amount: { currency_code: string; value: string } }[] }
  }[]
}

/** Creates a CAPTURE order for a fixed amount. `requestId` makes retries idempotent on PayPal's side. */
export function createOrder(o: { amountCents: number; description: string; referenceId: string; requestId: string }) {
  return call<PaypalOrder>('/v2/checkout/orders', {
    method: 'POST',
    requestId: o.requestId,
    body: {
      intent: 'CAPTURE',
      // Coaching is a service: don't ask the payer for a shipping address.
      application_context: { shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', brand_name: 'ExecutiveOS' },
      purchase_units: [
        {
          reference_id: o.referenceId,
          custom_id: o.referenceId,
          description: o.description.slice(0, 127),
          amount: { currency_code: 'USD', value: centsToValue(o.amountCents) },
        },
      ],
    },
  })
}

export const captureOrder = (orderId: string) => call<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', requestId: `capture-${orderId}`, body: {} })
export const getOrder = (orderId: string) => call<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: 'GET' })

/** The completed capture in an order, if any. */
export function completedCapture(order: PaypalOrder) {
  return order.purchase_units?.[0]?.payments?.captures?.find((c) => c.status === 'COMPLETED')
}

/** Verifies a webhook with PayPal (POST /v1/notifications/verify-webhook-signature). */
export async function verifyWebhook(headers: Record<string, string | string[] | undefined>, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) return false
  const h = (k: string) => String(headers[k] ?? '')
  const body = await call<{ verification_status?: string }>('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: {
      auth_algo: h('paypal-auth-algo'),
      cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: event,
    },
  })
  return body.verification_status === 'SUCCESS'
}

// ── Subscriptions (auto-renewing programs) ────────────────────────────────────

export interface PaypalSubscription {
  id: string
  /** APPROVAL_PENDING | APPROVED | ACTIVE | SUSPENDED | CANCELLED | EXPIRED */
  status: string
  plan_id: string
  custom_id?: string
  billing_info?: {
    failed_payments_count?: number
    next_billing_time?: string
    last_payment?: { amount: { currency_code: string; value: string }; time: string }
    last_failed_payment?: { amount?: { currency_code: string; value: string }; time: string; reason_code?: string }
    outstanding_balance?: { currency_code: string; value: string }
  }
}

/** How many failed renewals PayPal retries before it suspends the subscription. */
export const PAYMENT_FAILURE_THRESHOLD = 3

export const createProduct = (o: { name: string; description: string; requestId: string }) =>
  call<{ id: string }>('/v1/catalogs/products', { method: 'POST', requestId: o.requestId, body: { name: o.name.slice(0, 127), description: o.description.slice(0, 256) || o.name, type: 'SERVICE' } })

/** A plan that bills `amountCents` up front and again every `intervalWeeks`, forever (until cancelled). */
export const createPlan = (o: { productId: string; name: string; amountCents: number; intervalWeeks: number; requestId: string }) =>
  call<{ id: string; status: string }>('/v1/billing/plans', {
    method: 'POST',
    requestId: o.requestId,
    body: {
      product_id: o.productId,
      name: o.name.slice(0, 127),
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: { interval_unit: 'WEEK', interval_count: o.intervalWeeks },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { currency_code: 'USD', value: centsToValue(o.amountCents) } },
        },
      ],
      payment_preferences: {
        // A failed renewal stays outstanding and is collected on the next attempt / reactivation.
        auto_bill_outstanding: true,
        payment_failure_threshold: PAYMENT_FAILURE_THRESHOLD,
      },
    },
  })

export const createSubscription = (o: { planId: string; customId: string; email: string; name: string; brand: string; requestId: string }) =>
  call<PaypalSubscription>('/v1/billing/subscriptions', {
    method: 'POST',
    requestId: o.requestId,
    body: {
      plan_id: o.planId,
      custom_id: o.customId,
      subscriber: { email_address: o.email, name: { given_name: o.name.split(' ')[0], surname: o.name.split(' ').slice(1).join(' ') || o.name } },
      application_context: { brand_name: o.brand.slice(0, 127), shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW' },
    },
  })

export const getSubscription = (id: string) => call<PaypalSubscription>(`/v1/billing/subscriptions/${encodeURIComponent(id)}`, { method: 'GET' })
const subscriptionAction = (id: string, action: 'activate' | 'cancel' | 'suspend', reason: string) =>
  call<unknown>(`/v1/billing/subscriptions/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: { reason: reason.slice(0, 128) } })
export const activateSubscription = (id: string, reason: string) => subscriptionAction(id, 'activate', reason)
export const cancelSubscription = (id: string, reason: string) => subscriptionAction(id, 'cancel', reason)
