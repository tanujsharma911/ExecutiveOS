/**
 * Public (no sign-in) routes, mounted at /api/public before requireAuth:
 * the coach's intake form and the PayPal webhook.
 */
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../auth.js'
import { prisma } from '../db.js'
import { answer, looksLikeCard, type Topic } from '../ai/intakeAssistant.js'
import { completeIntakePayment, IntakeDetails } from '../lib/intake.js'
import { createLogger } from '../lib/logger.js'
import { captureOrder, centsToValue, completedCapture, createOrder, createSubscription, getOrder, getSubscription, paypalConfigured, paypalEnv, sameAmount, verifyWebhook, type PaypalOrder } from '../lib/paypal.js'
import { ensurePlan, startFromIntake, syncSubscription } from '../lib/subscriptions.js'

const log = createLogger('public')
export const publicRoutes = Router()

async function coachByToken(token: string) {
  const coach = await prisma.user.findFirst({ where: { intakeToken: token, role: 'COACH' }, select: { id: true, name: true, title: true, avatarColor: true, email: true } })
  if (!coach) throw new HttpError(404, 'This intake link is not valid. Ask your coach for a new one.')
  return coach
}

const offeredPrograms = (coachId: string) =>
  prisma.program.findMany({
    where: { coachId, status: 'ACTIVE', priceCents: { gt: 0 } },
    select: { id: true, name: true, description: true, durationWeeks: true, focusAreas: true, included: true, priceCents: true, billingType: true },
    orderBy: { priceCents: 'asc' },
  })

publicRoutes.get('/intake/:token', async (req, res) => {
  const coach = await coachByToken(req.params.token)
  const programs = await offeredPrograms(coach.id)
  // Prefill when the coach sent the link to a specific prospect (?p=<prospectId>).
  const p = typeof req.query.p === 'string' ? await prisma.prospect.findFirst({ where: { id: req.query.p, coachId: coach.id, clientId: null } }) : null
  res.json({
    coach: { name: coach.name, title: coach.title, avatarColor: coach.avatarColor },
    programs,
    // Shown at the top of the chat: the coach can read the conversation.
    assistant: { enabled: true, coachName: coach.name },
    paypal: { configured: paypalConfigured(), env: paypalEnv(), clientId: paypalConfigured() ? process.env.PAYPAL_CLIENT_ID : null },
    prefill: p
      ? { prospectId: p.id, name: p.name, email: p.email ?? '', phone: p.phone ?? '', company: p.company, role: p.role, industry: p.industry, companySize: p.companySize, location: p.location, links: p.links ?? [] }
      : null,
  })
})

const OrderBody = z.object({ programId: z.string(), details: IntakeDetails, prospectId: z.string().optional(), chatId: z.string().optional() })

/** Shared checks for both payment types. */
async function prepare(token: string, raw: unknown, billingType: 'ONE_TIME' | 'SUBSCRIPTION') {
  const coach = await coachByToken(token)
  const body = OrderBody.parse(raw)
  const program = (await offeredPrograms(coach.id)).find((p) => p.id === body.programId)
  if (!program) throw new HttpError(400, 'Please choose one of the programs listed')
  if (program.billingType !== billingType) throw new HttpError(400, 'This program’s payment type changed. Please refresh the page.')
  if (await prisma.user.findUnique({ where: { email: body.details.email }, select: { id: true } }))
    throw new HttpError(409, 'An account with this email already exists. Sign in instead, or contact your coach.')
  const prospectId = body.prospectId && (await prisma.prospect.findFirst({ where: { id: body.prospectId, coachId: coach.id }, select: { id: true } })) ? body.prospectId : null
  const chatId = body.chatId && (await prisma.intakeChat.findFirst({ where: { id: body.chatId, coachId: coach.id }, select: { id: true } })) ? body.chatId : null
  return { coach, body, program, prospectId, chatId }
}

publicRoutes.post('/intake/:token/orders', async (req, res) => {
  const { coach, body, program, prospectId, chatId } = await prepare(req.params.token, req.body, 'ONE_TIME')

  const order = await createOrder({ amountCents: program.priceCents, description: `${program.name} with ${coach.name}`, referenceId: program.id, requestId: randomUUID() })
  await prisma.intakePayment.create({
    data: { coachId: coach.id, prospectId, programId: program.id, email: body.details.email, details: body.details, amountCents: program.priceCents, currency: 'USD', paypalOrderId: order.id, chatId },
  })
  log.info('Intake order created', { coachId: coach.id, programId: program.id, orderId: order.id })
  res.status(201).json({ orderId: order.id })
})

/** Checks the capture matches what we charged, then creates the client (once). */
async function finishOrder(order: PaypalOrder) {
  const payment = await prisma.intakePayment.findUnique({ where: { paypalOrderId: order.id } })
  if (!payment) throw new HttpError(404, 'Payment not found')
  const capture = completedCapture(order)
  if (!capture) {
    await prisma.intakePayment.updateMany({ where: { id: payment.id, status: 'CREATED' }, data: { status: 'FAILED' } })
    throw new HttpError(402, 'The payment was not completed. Please try again.')
  }
  if (!sameAmount(capture.amount, payment.amountCents)) {
    log.error('Captured amount does not match', { orderId: order.id, expected: centsToValue(payment.amountCents), got: capture.amount })
    const claimed = await prisma.intakePayment.updateMany({ where: { id: payment.id, status: 'CREATED' }, data: { status: 'FAILED' } })
    if (claimed.count)
      await prisma.notification.create({ data: { userId: payment.coachId, title: `Payment amount mismatch for ${payment.email}`, body: `PayPal captured ${capture.amount.value} ${capture.amount.currency_code}, but the price is $${centsToValue(payment.amountCents)}. No client was created; refund or follow up in PayPal.`, kind: 'alert' } })
    throw new HttpError(400, 'Payment amount mismatch. Your coach has been notified.')
  }
  return completeIntakePayment(payment.id, { captureId: capture.id })
}

publicRoutes.post('/intake/:token/orders/:orderId/capture', async (req, res) => {
  const coach = await coachByToken(req.params.token)
  const payment = await prisma.intakePayment.findFirst({ where: { paypalOrderId: req.params.orderId, coachId: coach.id } })
  if (!payment) throw new HttpError(404, 'Payment not found')
  let order: PaypalOrder
  try {
    order = await captureOrder(req.params.orderId)
  } catch (e) {
    // Already captured (e.g. a retry, or the webhook got there first): read the order instead.
    order = await getOrder(req.params.orderId)
    if (!completedCapture(order)) throw e
  }
  const result = await finishOrder(order)
  res.json({ ok: true, created: result.created, email: payment.email })
})

/** PayPal webhook (optional backup): PAYMENT.CAPTURE.COMPLETED → create the client if the browser never came back. */
publicRoutes.post('/paypal/webhook', async (req, res) => {
  const event = req.body as { event_type?: string; resource?: { id?: string; billing_agreement_id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } }
  if (!(await verifyWebhook(req.headers, event))) {
    log.warn('PayPal webhook rejected (not verified or PAYPAL_WEBHOOK_ID missing)', { type: event.event_type })
    return res.status(400).json({ error: 'Invalid webhook' })
  }
  const orderId = event.resource?.supplementary_data?.related_ids?.order_id
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && orderId && (await prisma.intakePayment.findUnique({ where: { paypalOrderId: orderId }, select: { id: true } }))) {
    await finishOrder(await getOrder(orderId))
  }
  // Subscriptions: renewals (PAYMENT.SALE.*) carry billing_agreement_id; BILLING.SUBSCRIPTION.* carry the subscription itself.
  const subId = event.resource?.billing_agreement_id ?? (event.event_type?.startsWith('BILLING.SUBSCRIPTION.') ? event.resource?.id : undefined)
  if (subId) {
    const known = (await prisma.subscription.findUnique({ where: { paypalSubscriptionId: subId }, select: { id: true } })) || (await prisma.intakePayment.findUnique({ where: { paypalSubscriptionId: subId }, select: { id: true } }))
    if (known) await syncSubscription(subId)
  }
  res.json({ ok: true })
})

// ── Auto-renewing programs (PayPal Subscriptions) ─────────────────────────────

publicRoutes.post('/intake/:token/subscriptions', async (req, res) => {
  const { coach, body, program, prospectId, chatId } = await prepare(req.params.token, req.body, 'SUBSCRIPTION')
  const planId = await ensurePlan(program.id)
  const payment = await prisma.intakePayment.create({
    data: { coachId: coach.id, prospectId, programId: program.id, email: body.details.email, details: body.details, amountCents: program.priceCents, currency: 'USD', kind: 'SUBSCRIPTION', chatId },
  })
  const sub = await createSubscription({ planId, customId: payment.id, email: body.details.email, name: body.details.name, brand: `${program.name} with ${coach.name}`, requestId: `sub-${payment.id}` })
  await prisma.intakePayment.update({ where: { id: payment.id }, data: { paypalSubscriptionId: sub.id } })
  log.info('Intake subscription created', { coachId: coach.id, programId: program.id, subscriptionId: sub.id })
  res.status(201).json({ subscriptionId: sub.id })
})

/** After the payer approves in PayPal: wait briefly for the first payment, then create the client. */
publicRoutes.post('/intake/:token/subscriptions/:id/activate', async (req, res) => {
  const coach = await coachByToken(req.params.token)
  const payment = await prisma.intakePayment.findFirst({ where: { paypalSubscriptionId: req.params.id, coachId: coach.id } })
  if (!payment) throw new HttpError(404, 'Subscription not found')
  for (let attempt = 0; attempt < 6; attempt++) {
    const sub = await getSubscription(req.params.id)
    if (['CANCELLED', 'EXPIRED', 'SUSPENDED'].includes(sub.status)) throw new HttpError(402, 'PayPal did not start the subscription. No payment was taken. Please try again.')
    const r = await startFromIntake(sub)
    if (r.found && 'mismatch' in r && r.mismatch) throw new HttpError(400, 'Payment amount mismatch. Your coach has been notified.')
    if (r.found && r.ready) return res.json({ ok: true, email: payment.email, pending: false })
    await new Promise((ok) => setTimeout(ok, 2000))
  }
  // PayPal can take a little longer to collect the first payment; the webhook / periodic sync finishes the sign-up.
  res.json({ ok: true, email: payment.email, pending: true })
})

// ── Intake assistant (chat about programs and PayPal payments) ────────────────

const MAX_PER_HOUR = 30
const MAX_PER_CHAT = 20
const hits = new Map<string, number[]>()
function rateLimited(key: string) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 3_600_000)
  if (recent.length >= MAX_PER_HOUR) return true
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 3_600_000)) hits.delete(k)
  return false
}

type ChatMessage = { role: 'user' | 'assistant'; text: string; at: string; topic?: Topic; actions?: unknown[]; unanswered?: boolean }

publicRoutes.post('/intake/:token/chat', async (req, res) => {
  const coach = await prisma.user.findFirst({ where: { intakeToken: req.params.token, role: 'COACH' }, select: { id: true, name: true, title: true, refundPolicy: true, paymentContact: true } })
  if (!coach) throw new HttpError(404, 'This intake link is not valid.')
  const body = z.object({ chatId: z.string().optional(), message: z.string().trim().min(1).max(1000), selectedProgramId: z.string().nullable().optional(), prospectId: z.string().optional() }).parse(req.body)
  if (rateLimited(`${req.ip}:${coach.id}`)) throw new HttpError(429, 'You have sent a lot of messages. Please wait a while, or contact your coach directly.')

  // Card numbers never reach the AI or the transcript.
  if (looksLikeCard(body.message))
    return res.json({ chatId: body.chatId ?? null, reply: 'Please don’t type card numbers here. For your security, card and bank details go only into PayPal’s own window when you click the PayPal button.', actions: [{ type: 'go_to_payment' }], suggestions: ['Is my payment secure?', 'Can I pay by card?'], schedules: [], blocked: true })

  let chat = body.chatId ? await prisma.intakeChat.findFirst({ where: { id: body.chatId, coachId: coach.id } }) : null
  const prospect = body.prospectId ? await prisma.prospect.findFirst({ where: { id: body.prospectId, coachId: coach.id, clientId: null }, select: { id: true, name: true, intakeNote: true } }) : null
  if (!chat) chat = await prisma.intakeChat.create({ data: { coachId: coach.id, prospectId: prospect?.id ?? null } })
  const history = (chat.messages as unknown as ChatMessage[]) ?? []
  if (history.filter((m) => m.role === 'user').length >= MAX_PER_CHAT) throw new HttpError(429, `This conversation has reached its limit. Please contact ${coach.name} with any other questions.`)

  const programs = await offeredPrograms(coach.id)
  const selected = body.selectedProgramId && programs.some((p) => p.id === body.selectedProgramId) ? body.selectedProgramId : null
  const t0 = Date.now()
  const r = await answer(
    {
      coach: { name: coach.name, title: coach.title, refundPolicy: coach.refundPolicy, paymentContact: coach.paymentContact },
      programs,
      sandbox: paypalEnv() === 'sandbox',
      prospect: prospect ? { firstName: prospect.name.split(' ')[0], note: prospect.intakeNote } : null,
      selectedProgramId: selected,
      history: history.map((m) => ({ role: m.role, text: m.text })),
    },
    body.message,
  )
  const now = new Date().toISOString()
  const messages: ChatMessage[] = [...history, { role: 'user', text: body.message, at: now, topic: r.topic }, { role: 'assistant', text: r.reply, at: now, actions: r.actions, unanswered: r.unanswered }]
  const notify = r.unanswered && !chat.notifiedUnanswered
  await prisma.intakeChat.update({ where: { id: chat.id }, data: { messages: messages as object[], selectedProgramId: selected ?? chat.selectedProgramId, ...(notify ? { notifiedUnanswered: true } : {}) } })
  if (notify) {
    const who = prospect?.name ?? 'A visitor'
    await prisma.notification.create({
      data: { userId: coach.id, title: `${who} asked something the intake assistant couldn't answer`, body: `“${body.message.slice(0, 160)}”`, link: prospect ? `/coach/prospects/${prospect.id}` : '/coach/prospects', kind: 'info' },
    })
  }
  log.info('Intake assistant replied', { chatId: chat.id, topic: r.topic, model: r.model, unanswered: r.unanswered, ms: Date.now() - t0 })
  res.json({ chatId: chat.id, reply: r.reply, actions: r.actions, suggestions: r.suggestions })
})
