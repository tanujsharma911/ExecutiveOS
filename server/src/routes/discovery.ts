/**
 * Coach-only: prospects, discovery calls, the Discovery Call Book and the coach's intake link.
 * Mounted at /api/discovery.
 */
import bcrypt from 'bcryptjs'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { Router } from 'express'
import { z } from 'zod'
import { assistBook, docToMarkdown, fitSignals, templateDoc, toDoc, type DocNode, type ProspectInput } from '../ai/discoveryBook.js'
import { HttpError, requireRole } from '../auth.js'
import { prisma } from '../db.js'
import { emailConfigured, escapeHtml, layout, sendEmail } from '../lib/email.js'
import { coachIntakeToken, intakeUrl, newClientPassword, sendWelcomeEmail } from '../lib/intake.js'
import { createLogger } from '../lib/logger.js'
import { cancelSubscription, getSubscription, paypalConfigured, paypalEnv } from '../lib/paypal.js'
import { applySubscriptionState, reactivate as reactivateSubscription, syncSubscription } from '../lib/subscriptions.js'

const log = createLogger('discovery')
export const discovery = Router()
discovery.use(requireRole('COACH'))

const id = (v: unknown) => String(v)
const Link = z.object({ label: z.string().trim().min(1).max(60), url: z.string().trim().max(500).regex(/^https?:\/\/[^\s.]+\.[^\s]+$/i, 'Links must start with http:// or https://') })
const optionalText = (max: number) => z.string().trim().max(max)

async function ownProspect(coachId: string, prospectId: string) {
  const p = await prisma.prospect.findFirst({ where: { id: prospectId, coachId } })
  if (!p) throw new HttpError(404, 'Prospect not found')
  return p
}
const toInput = (p: { name: string; company: string; role: string; industry: string; companySize: string; location: string; notes: string; links: unknown }): ProspectInput => ({ ...p, links: (p.links as ProspectInput['links']) ?? [] })

// ── Prospects ─────────────────────────────────────────────────────────────────

const ProspectFields = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  email: z.string().trim().toLowerCase().email().or(z.literal('')).transform((v) => v || null),
  company: optionalText(120),
  role: optionalText(120),
  industry: optionalText(120),
  companySize: optionalText(60),
  location: optionalText(120),
  phone: optionalText(40).transform((v) => v || null),
  links: z.array(Link).max(10),
  notes: optionalText(4000),
})

discovery.get('/prospects', async (req, res) => {
  const rows = await prisma.prospect.findMany({
    where: { coachId: req.user!.id },
    orderBy: { updatedAt: 'desc' },
    include: { calls: { select: { scheduledAt: true, outcome: true }, orderBy: { scheduledAt: 'desc' } }, _count: { select: { books: true } } },
  })
  const now = Date.now()
  res.json(
    rows.map(({ calls, _count, ...p }) => ({
      ...p,
      books: _count.books,
      calls: calls.length,
      lastCallAt: calls.find((c) => c.scheduledAt.getTime() <= now)?.scheduledAt ?? null,
      nextCallAt: [...calls].reverse().find((c) => c.scheduledAt.getTime() > now)?.scheduledAt ?? null,
    })),
  )
})

discovery.post('/prospects', async (req, res) => {
  const body = ProspectFields.partial({ email: true, company: true, role: true, industry: true, companySize: true, location: true, phone: true, links: true, notes: true }).parse(req.body)
  const p = await prisma.prospect.create({ data: { ...body, coachId: req.user!.id } })
  log.info('Prospect created', { prospectId: p.id })
  res.status(201).json(p)
})

discovery.get('/prospects/:id', async (req, res) => {
  const p = await ownProspect(req.user!.id, id(req.params.id))
  const [calls, books, payments, chats] = await Promise.all([
    prisma.discoveryCall.findMany({ where: { prospectId: p.id }, orderBy: { scheduledAt: 'desc' } }),
    prisma.prospectBook.findMany({ where: { prospectId: p.id }, orderBy: { attachedAt: 'desc' }, include: { book: { select: { id: true, title: true, updatedAt: true, version: true } } } }),
    prisma.intakePayment.findMany({ where: { prospectId: p.id }, orderBy: { createdAt: 'desc' }, include: { program: { select: { name: true } } } }),
    prisma.intakeChat.findMany({ where: { prospectId: p.id }, orderBy: { updatedAt: 'desc' }, take: 5, include: { payments: { select: { id: true, status: true } } } }),
  ])
  res.json({ ...p, calls, books: books.map((b) => b.book), payments: payments.map((x) => ({ id: x.id, status: x.status, amountCents: x.amountCents, program: x.program.name, createdAt: x.createdAt, completedAt: x.completedAt, chatId: x.chatId })),
    chats: chats.map((c) => ({ id: c.id, updatedAt: c.updatedAt, messages: c.messages, paid: c.payments.some((x) => x.status === 'COMPLETED') })),
  })
})

discovery.patch('/prospects/:id', async (req, res) => {
  const p = await ownProspect(req.user!.id, id(req.params.id))
  const body = ProspectFields.partial()
    .extend({ status: z.enum(['NEW', 'IN_DISCUSSION', 'NOT_A_FIT', 'INVITED']).optional(), notFitReason: optionalText(500).nullable().optional() })
    .parse(req.body)
  if (p.status === 'CONVERTED' && body.status) throw new HttpError(400, 'This prospect is already a client')
  res.json(await prisma.prospect.update({ where: { id: p.id }, data: body }))
})

discovery.delete('/prospects/:id', async (req, res) => {
  const p = await ownProspect(req.user!.id, id(req.params.id))
  if (p.status === 'CONVERTED') throw new HttpError(400, 'Converted prospects are kept with the client record')
  await prisma.prospect.delete({ where: { id: p.id } })
  res.json({ ok: true })
})

// ── Discovery calls ───────────────────────────────────────────────────────────

const MeetingLink = z.string().trim().max(500).regex(/^https?:\/\//i, 'Meeting link must start with http:// or https://').or(z.literal('')).transform((v) => v || null)
const CallFields = z.object({
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().min(10).max(240),
  mode: z.enum(['ONLINE', 'OFFLINE']),
  meetingLink: MeetingLink,
  notes: optionalText(8000),
  fitCheck: z.array(z.object({ label: z.string().max(200), flagged: z.boolean() })).max(12),
  outcome: z.enum(['PENDING', 'GOOD_FIT', 'NOT_A_FIT', 'UNDECIDED']),
})

async function emailMeetingLink(coachId: string, prospect: { name: string; email: string | null }, call: { scheduledAt: Date; durationMin: number; mode: string; meetingLink: string | null }) {
  if (!prospect.email) return { sent: false, error: 'This prospect has no email address' }
  const coach = await prisma.user.findUniqueOrThrow({ where: { id: coachId }, select: { name: true, email: true, title: true } })
  const when = call.scheduledAt.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' UTC'
  const where = call.mode === 'ONLINE' && call.meetingLink ? call.meetingLink : 'In person (details to follow)'
  return sendEmail({
    to: prospect.email,
    replyTo: coach.email,
    subject: `Discovery call with ${coach.name} — ${when}`,
    text: `Hi ${prospect.name},\n\nLooking forward to our conversation.\n\nWhen: ${when} (${call.durationMin} min)\nWhere: ${where}\n\n— ${coach.name}${coach.title ? `, ${coach.title}` : ''}`,
    html: layout({
      heading: 'Your discovery call',
      paragraphs: [`Hi ${escapeHtml(prospect.name)}, looking forward to our conversation.`, `<b>When:</b> ${escapeHtml(when)} (${call.durationMin} min)<br/><b>Where:</b> ${call.mode === 'ONLINE' && call.meetingLink ? `<a href="${escapeHtml(call.meetingLink)}">${escapeHtml(call.meetingLink)}</a>` : 'In person (details to follow)'}`],
      ...(call.mode === 'ONLINE' && call.meetingLink ? { button: { label: 'Join the call', url: call.meetingLink } } : {}),
      footer: `${escapeHtml(coach.name)}${coach.title ? `, ${escapeHtml(coach.title)}` : ''}. Reply to this email to reschedule.`,
    }),
  })
}

discovery.post('/prospects/:id/calls', async (req, res) => {
  const p = await ownProspect(req.user!.id, id(req.params.id))
  const body = CallFields.pick({ scheduledAt: true, durationMin: true, mode: true, meetingLink: true })
    .partial({ durationMin: true, meetingLink: true })
    .extend({ sendInvite: z.boolean().default(false) })
    .parse(req.body)
  const { sendInvite, ...data } = body
  // Pre-fill the fit check from the prospect's newest book, so the coach can tick it during the call.
  const book = await prisma.prospectBook.findFirst({ where: { prospectId: p.id, book: { isTemplate: false } }, orderBy: { attachedAt: 'desc' }, include: { book: true } })
  const fit = fitSignals(toDoc(book?.book.content ?? (await templateBook(req.user!.id)).content)).map((label) => ({ label, flagged: false }))
  const call = await prisma.discoveryCall.create({ data: { ...data, mode: data.mode, meetingLink: data.mode === 'ONLINE' ? data.meetingLink ?? null : null, prospectId: p.id, fitCheck: fit } })
  if (p.status === 'NEW') await prisma.prospect.update({ where: { id: p.id }, data: { status: 'IN_DISCUSSION' } })
  const invite = sendInvite ? await emailMeetingLink(req.user!.id, p, call) : null
  res.status(201).json({ call, invite })
})

async function ownCall(coachId: string, callId: string) {
  const c = await prisma.discoveryCall.findFirst({ where: { id: callId, prospect: { coachId } }, include: { prospect: true } })
  if (!c) throw new HttpError(404, 'Call not found')
  return c
}

discovery.patch('/calls/:id', async (req, res) => {
  const c = await ownCall(req.user!.id, id(req.params.id))
  const body = CallFields.partial().parse(req.body)
  const call = await prisma.discoveryCall.update({ where: { id: c.id }, data: body })
  if (body.outcome === 'NOT_A_FIT' && c.prospect.status !== 'CONVERTED') await prisma.prospect.update({ where: { id: c.prospectId }, data: { status: 'NOT_A_FIT' } })
  res.json(call)
})

discovery.post('/calls/:id/send-invite', async (req, res) => {
  const c = await ownCall(req.user!.id, id(req.params.id))
  res.json(await emailMeetingLink(req.user!.id, c.prospect, c))
})

discovery.delete('/calls/:id', async (req, res) => {
  const c = await ownCall(req.user!.id, id(req.params.id))
  await prisma.discoveryCall.delete({ where: { id: c.id } })
  res.json({ ok: true })
})

// ── Intake link ───────────────────────────────────────────────────────────────

/** Payment policies the intake assistant may quote. */
discovery.get('/policies', async (req, res) => {
  res.json(await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { refundPolicy: true, paymentContact: true } }))
})
discovery.patch('/policies', async (req, res) => {
  const body = z.object({ refundPolicy: optionalText(600).optional(), paymentContact: optionalText(300).optional() }).parse(req.body)
  res.json(await prisma.user.update({ where: { id: req.user!.id }, data: body, select: { refundPolicy: true, paymentContact: true } }))
})

discovery.get('/intake', async (req, res) => {
  const token = await coachIntakeToken(req.user!.id)
  const programs = await prisma.program.findMany({ where: { coachId: req.user!.id, status: 'ACTIVE' }, select: { id: true, name: true, priceCents: true, billingType: true } })
  res.json({ token, url: intakeUrl(token), programs, paypal: { configured: paypalConfigured(), env: paypalEnv() }, emailConfigured: emailConfigured() })
})

discovery.post('/intake/rotate', async (req, res) => {
  await prisma.user.update({ where: { id: req.user!.id }, data: { intakeToken: null } })
  const token = await coachIntakeToken(req.user!.id)
  log.info('Intake link rotated', { coachId: req.user!.id })
  res.json({ token, url: intakeUrl(token) })
})

/** Emails the coach's intake link to a prospect (with their id so the form is pre-filled). */
discovery.post('/prospects/:id/send-intake', async (req, res) => {
  const p = await ownProspect(req.user!.id, id(req.params.id))
  if (!p.email) throw new HttpError(400, 'Add an email address for this prospect first')
  if (p.status === 'CONVERTED') throw new HttpError(400, 'This prospect is already a client')
  const { message, note } = z.object({ message: optionalText(1500).optional(), note: optionalText(500).optional() }).parse(req.body ?? {})
  // The only thing about this prospect the public intake assistant sees (never the call notes).
  if (note !== undefined) await prisma.prospect.update({ where: { id: p.id }, data: { intakeNote: note } })
  const coach = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { name: true, email: true, title: true } })
  const url = intakeUrl(await coachIntakeToken(req.user!.id), p.id)
  const mail = await sendEmail({
    to: p.email,
    replyTo: coach.email,
    subject: `${coach.name}: next step — choose your coaching program`,
    text: `Hi ${p.name},\n\n${message || 'Thank you for our conversation. As a next step, please fill in a short form and choose the program that fits you best.'}\n\n${url}\n\n— ${coach.name}`,
    html: layout({
      heading: 'Your next step',
      paragraphs: [`Hi ${escapeHtml(p.name)},`, escapeHtml(message || 'Thank you for our conversation. As a next step, please fill in a short form and choose the program that fits you best.').replace(/\n/g, '<br/>')],
      button: { label: 'Open the intake form', url },
      footer: `${escapeHtml(coach.name)}${coach.title ? `, ${escapeHtml(coach.title)}` : ''}`,
    }),
  })
  await prisma.prospect.update({ where: { id: p.id }, data: { status: 'INVITED' } })
  res.json({ url, emailSent: mail.sent, error: mail.error })
})

/** New temporary password + sign-in email for a client (e.g. when the welcome email didn't arrive). */
discovery.post('/clients/:id/resend-sign-in', async (req, res) => {
  const c = await prisma.clientProfile.findFirst({ where: { id: id(req.params.id), coachId: req.user!.id }, include: { user: true, program: true } })
  if (!c) throw new HttpError(404, 'Client not found')
  const { password, mustChange } = newClientPassword()
  await prisma.user.update({ where: { id: c.userId }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: mustChange } })
  const mail = await sendWelcomeEmail({ coachId: req.user!.id, name: c.user.name, email: c.user.email, password, mustChange, programName: c.program?.name, resend: true })
  // Without email configured (local dev), the coach gets the password to pass on by hand.
  res.json({ emailSent: mail.sent, error: mail.error, ...(mail.sent ? {} : { tempPassword: password }) })
})

// ── Client subscriptions (auto-renewing programs) ────────────────────────────

async function ownSubscription(coachId: string, clientId: string) {
  const s = await prisma.subscription.findFirst({ where: { clientId, coachId } })
  if (!s) throw new HttpError(404, 'This client has no auto-renewing subscription')
  return s
}
const subscriptionView = async (id: string) => prisma.subscription.findUniqueOrThrow({ where: { id } })

/** Pull the latest state from PayPal now (webhooks do this automatically when PayPal can reach the API). */
discovery.post('/clients/:id/subscription/sync', async (req, res) => {
  const s = await ownSubscription(req.user!.id, id(req.params.id))
  await syncSubscription(s.paypalSubscriptionId)
  res.json(await subscriptionView(s.id))
})

/** Resume after the client fixed their payment method; PayPal then collects what's outstanding. */
discovery.post('/clients/:id/subscription/reactivate', async (req, res) => {
  const s = await ownSubscription(req.user!.id, id(req.params.id))
  await reactivateSubscription(s.paypalSubscriptionId)
  res.json(await subscriptionView(s.id))
})

/** Stop future renewals. The client keeps access; mark them inactive yourself if needed. */
discovery.post('/clients/:id/subscription/cancel', async (req, res) => {
  const s = await ownSubscription(req.user!.id, id(req.params.id))
  await cancelSubscription(s.paypalSubscriptionId, 'Cancelled by coach')
  await syncSubscription(s.paypalSubscriptionId)
  res.json(await subscriptionView(s.id))
})

/**
 * Sandbox only — PayPal can't be made to fail a renewal on demand, so this records one failed renewal exactly as a
 * real failure would (notifications, emails, and inactive after the third). Used to demo the flow.
 */
discovery.post('/clients/:id/subscription/simulate-failure', async (req, res) => {
  if (paypalEnv() !== 'sandbox') throw new HttpError(403, 'Only available with PAYPAL_ENV=sandbox')
  const s = await ownSubscription(req.user!.id, id(req.params.id))
  await applySubscriptionState(await getSubscription(s.paypalSubscriptionId), { simulateFailure: true })
  res.json(await subscriptionView(s.id))
})

// ── Discovery Call Book (rich text): one template per coach + one tailored copy per prospect ──────────────

const DocBody = z.object({ type: z.literal('doc'), content: z.array(z.unknown()).max(2000) }).passthrough()
const prospectTitle = (p: { name: string; company: string }) => `Discovery call: ${p.name}${p.company ? `, ${p.company}` : ''}`.slice(0, 120)

async function templateBook(coachId: string) {
  const existing = await prisma.discoveryBook.findFirst({ where: { coachId, isTemplate: true } })
  if (existing) return existing
  return prisma.discoveryBook.create({ data: { coachId, isTemplate: true, title: 'Discovery Call Book', content: templateDoc() as object, model: 'template' } })
}
async function prospectBook(prospectId: string) {
  const link = await prisma.prospectBook.findFirst({ where: { prospectId, book: { isTemplate: false } }, orderBy: { attachedAt: 'desc' }, include: { book: true } })
  return link?.book ?? null
}
const view = (b: { id: string; title: string; content: unknown; sources: unknown; version: number; updatedAt: Date; model: string }, extra: Record<string, unknown> = {}) => ({
  id: b.id,
  title: b.title,
  content: toDoc(b.content),
  sources: b.sources,
  version: b.version,
  updatedAt: b.updatedAt,
  model: b.model,
  saved: true,
  ...extra,
})

/** ?prospectId= → that prospect's copy (or the template, unsaved, to start from); none → the template. */
discovery.get('/book', async (req, res) => {
  const coachId = req.user!.id
  const template = await templateBook(coachId)
  if (typeof req.query.prospectId !== 'string' || !req.query.prospectId) return res.json(view(template, { kind: 'template' }))
  const p = await ownProspect(coachId, req.query.prospectId)
  const own = await prospectBook(p.id)
  if (own) return res.json(view(own, { kind: 'prospect' }))
  res.json({ ...view(template, { kind: 'prospect' }), id: null, title: prospectTitle(p), saved: false, version: 0 })
})

discovery.put('/book', async (req, res) => {
  const coachId = req.user!.id
  const body = z
    .object({ prospectId: z.string().optional(), title: z.string().trim().min(1).max(120), content: DocBody, sources: z.array(z.object({ url: z.string().max(500), title: z.string().max(200) })).max(10).optional() })
    .parse(req.body)
  if (JSON.stringify(body.content).length > 400_000) throw new HttpError(413, 'This book is too long to save')
  const data = { title: body.title, content: body.content as object, ...(body.sources ? { sources: body.sources } : {}) }
  if (!body.prospectId) {
    const t = await templateBook(coachId)
    return res.json(view(await prisma.discoveryBook.update({ where: { id: t.id }, data: { ...data, version: { increment: 1 } } }), { kind: 'template' }))
  }
  const p = await ownProspect(coachId, body.prospectId)
  const own = await prospectBook(p.id)
  const book = own
    ? await prisma.discoveryBook.update({ where: { id: own.id }, data: { ...data, version: { increment: 1 } } })
    : await prisma.discoveryBook.create({ data: { ...data, coachId, model: 'coach', prospects: { create: { prospectId: p.id } } } })
  log.info('Discovery Call Book saved', { bookId: book.id, prospectId: p.id })
  res.json(view(book, { kind: 'prospect' }))
})

/** Back to the template: removes the prospect's own copy. */
discovery.delete('/book', async (req, res) => {
  const p = await ownProspect(req.user!.id, z.string().parse(req.query.prospectId))
  const own = await prospectBook(p.id)
  if (own) await prisma.discoveryBook.delete({ where: { id: own.id } })
  res.json({ ok: true })
})

/** AI beside the editor. Returns a suggestion the coach applies (or not) in the editor. */
discovery.post('/book/assist', async (req, res) => {
  const body = z
    .object({ prospectId: z.string().optional(), html: z.string().max(200_000), selection: z.string().max(6000).optional(), instruction: z.string().trim().min(1).max(1000), research: z.boolean().default(false) })
    .parse(req.body)
  const prospect = body.prospectId ? await ownProspect(req.user!.id, body.prospectId) : null
  const t0 = Date.now()
  const r = await assistBook({ bookHtml: body.html, selection: body.selection, instruction: body.instruction, prospect: prospect ? toInput(prospect) : null, research: body.research })
  log.info('Discovery Call Book assist', { model: r.model, apply: r.apply, sources: r.sources.length, ms: Date.now() - t0 })
  res.json(r)
})

const fileName = (title: string, ext: string) => `${title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'discovery-call-book'}.${ext}`

function runs(nodes: DocNode[] = []): TextRun[] {
  return nodes.map((n) =>
    n.type === 'hardBreak'
      ? new TextRun({ text: '', break: 1 })
      : new TextRun({ text: n.text ?? '', bold: n.marks?.some((m) => m.type === 'bold'), italics: n.marks?.some((m) => m.type === 'italic'), underline: n.marks?.some((m) => m.type === 'underline') ? {} : undefined }),
  )
}
function docxBlocks(nodes: DocNode[] = [], level = 0): Paragraph[] {
  const out: Paragraph[] = []
  for (const n of nodes) {
    if (n.type === 'heading') out.push(new Paragraph({ children: runs(n.content), heading: Number(n.attrs?.level) === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } }))
    else if (n.type === 'paragraph') out.push(new Paragraph({ children: runs(n.content), ...(level ? { indent: { left: 360 * level } } : {}) }))
    else if (n.type === 'blockquote') out.push(...docxBlocks(n.content, level + 1))
    else if (['bulletList', 'orderedList', 'taskList'].includes(n.type)) {
      ;(n.content ?? []).forEach((li, i) => {
        const [first, ...rest] = li.content ?? []
        const prefix = n.type === 'orderedList' ? `${i + 1}. ` : n.type === 'taskList' ? (li.attrs?.checked ? '☑ ' : '☐ ') : ''
        out.push(new Paragraph({ children: [new TextRun(prefix), ...runs(first?.content)], ...(n.type === 'bulletList' ? { bullet: { level } } : { indent: { left: 360 * (level + 1) } }) }))
        out.push(...docxBlocks(rest, level + 1))
      })
    }
  }
  return out
}

/** Saved version as Markdown or Word (PDF is printed from the editor). */
discovery.get('/book/export', async (req, res) => {
  const coachId = req.user!.id
  const format = z.enum(['md', 'docx']).parse(req.query.format ?? 'md')
  const prospectId = typeof req.query.prospectId === 'string' && req.query.prospectId ? req.query.prospectId : null
  const book = prospectId ? ((await ownProspect(coachId, prospectId)) && (await prospectBook(prospectId))) : await templateBook(coachId)
  if (!book) throw new HttpError(404, 'Save this book first')
  const doc = toDoc(book.content)
  if (format === 'md') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName(book.title, 'md')}"`)
    return res.send(`# ${book.title}\n\n${docToMarkdown(doc)}`)
  }
  const children = [new Paragraph({ text: book.title, heading: HeadingLevel.TITLE }), ...docxBlocks(doc.content)]
  const buf = await Packer.toBuffer(new Document({ creator: 'ExecutiveOS', title: book.title, sections: [{ children }] }))
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(book.title, 'docx')}"`)
  res.send(buf)
})
