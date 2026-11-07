/** Commitments and sessions — shared by coach and client with role-based scoping. */
import { Router, type Request } from 'express'
import { z } from 'zod'
import { assistSession } from '../ai/assist.js'
import { buildSessionBrief } from '../ai/brief.js'
import { invalidateCorpus } from '../ai/corpus.js'
import { invalidateReport } from '../ai/intelligence.js'
import { detectThemes } from '../ai/lexicon.js'
import { assertCoachOwnsClient, HttpError, requireRole } from '../auth.js'
import { prisma } from '../db.js'
import { escapeHtml, layout, sendEmail } from '../lib/email.js'

export const work = Router()

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PARTIALLY_COMPLETED', 'BLOCKED'] as const

function scope(req: Request) {
  return req.user!.role === 'CLIENT' ? { clientId: req.user!.clientId! } : { client: { coachId: req.user!.id } }
}

// ── Commitments ────────────────────────────────────────────────
work.get('/commitments', async (req, res) => {
  const where: Record<string, unknown> = { ...scope(req) }
  if (typeof req.query.clientId === 'string' && req.user!.role === 'COACH') where.clientId = req.query.clientId
  res.json(
    await prisma.commitment.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }],
      include: { client: { include: { user: { select: { name: true, avatarColor: true } } } }, updates: { orderBy: { createdAt: 'desc' } }, session: { select: { id: true, topic: true, scheduledAt: true } } },
    }),
  )
})

// Fields without defaults are used for PATCH, so a partial update never resets other fields.
const CommitmentFields = z.object({
  clientId: z.string(),
  sessionId: z.string().nullish(),
  title: z.string().min(2),
  description: z.string(),
  dueDate: z.coerce.date(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  goal: z.string().min(1),
  status: z.enum(STATUSES),
})
const CommitmentBody = CommitmentFields.extend({
  description: CommitmentFields.shape.description.default(''),
  priority: CommitmentFields.shape.priority.default('MEDIUM'),
  status: CommitmentFields.shape.status.default('NOT_STARTED'),
})

work.post('/commitments', requireRole('COACH'), async (req, res) => {
  const body = CommitmentBody.parse(req.body)
  await assertCoachOwnsClient(req.user!.id, body.clientId)
  const theme = detectThemes(`${body.title} ${body.description} ${body.goal}`)[0] ?? null
  const c = await prisma.commitment.create({
    data: { ...body, sessionId: body.sessionId ?? null, theme, updates: { create: { status: body.status, note: 'Commitment created by coach.', authorRole: 'COACH' } } },
  })
  invalidateCorpus(body.clientId)
  invalidateReport(body.clientId)
  const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { id: body.clientId } })
  await prisma.notification.create({ data: { userId: profile.userId, title: 'New commitment from your coach', body: c.title, link: '/client/commitments', kind: 'commitment' } })
  res.status(201).json(c)
})

work.patch('/commitments/:id', async (req, res) => {
  const c = await prisma.commitment.findFirst({ where: { id: String(req.params.id), ...scope(req) }, include: { client: true } })
  if (!c) throw new HttpError(404, 'Commitment not found')
  const isClient = req.user!.role === 'CLIENT'
  const body = (isClient ? z.object({ status: z.enum(STATUSES), note: z.string().min(1, 'Please add a short explanation') }) : CommitmentFields.partial().extend({ note: z.string().optional() })).parse(req.body) as z.infer<typeof CommitmentBody> & { note?: string }
  const { note, clientId: _ignore, ...rest } = body as Record<string, unknown> & { note?: string }
  void _ignore
  const updated = await prisma.commitment.update({ where: { id: c.id }, data: rest })
  if (body.status && (body.status !== c.status || note)) {
    await prisma.commitmentUpdate.create({ data: { commitmentId: c.id, status: body.status, note: note || `Status changed to ${body.status.replace(/_/g, ' ').toLowerCase()}.`, authorRole: req.user!.role } })
    const target = isClient ? c.client.coachId : c.client.userId
    await prisma.notification.create({
      data: {
        userId: target,
        title: isClient ? `${req.user!.name} updated “${c.title}”` : `Your coach updated “${c.title}”`,
        body: `${body.status.replace(/_/g, ' ').toLowerCase()}${note ? ` — ${note}` : ''}`,
        link: isClient ? `/coach/commitments` : '/client/commitments',
        kind: 'commitment',
      },
    })
  }
  invalidateCorpus(c.clientId)
  invalidateReport(c.clientId)
  res.json(updated)
})

work.delete('/commitments/:id', requireRole('COACH'), async (req, res) => {
  const c = await prisma.commitment.findFirst({ where: { id: String(req.params.id), ...scope(req) } })
  if (!c) throw new HttpError(404, 'Commitment not found')
  await prisma.commitment.delete({ where: { id: c.id } })
  invalidateCorpus(c.clientId)
  invalidateReport(c.clientId)
  res.json({ ok: true })
})

// ── Sessions ───────────────────────────────────────────────────
work.get('/sessions', async (req, res) => {
  const where: Record<string, unknown> = { ...scope(req) }
  if (typeof req.query.clientId === 'string' && req.user!.role === 'COACH') where.clientId = req.query.clientId
  const sessions = await prisma.session.findMany({
    where,
    orderBy: { scheduledAt: 'desc' },
    include: { client: { include: { user: { select: { name: true, avatarColor: true } } } }, commitments: { select: { id: true, title: true, status: true } } },
  })
  // Clients never see private coach observations or prep notes.
  res.json(req.user!.role === 'CLIENT' ? sessions.map(({ observations: _o, prepNotes: _p, ...s }) => s) : sessions)
})

async function ownSession(req: Request, id: string) {
  const s = await prisma.session.findFirst({ where: { id, ...scope(req) }, include: { client: { include: { user: { select: { name: true, avatarColor: true } } } } } })
  if (!s) throw new HttpError(404, 'Session not found')
  return s
}

work.get('/sessions/:id', async (req, res) => {
  const s = await ownSession(req, String(req.params.id))
  const full = await prisma.session.findUnique({ where: { id: s.id }, include: { client: { include: { user: { select: { name: true, avatarColor: true } } } }, commitments: true, feedback: true } })
  if (req.user!.role === 'CLIENT' && full) {
    const { observations: _o, prepNotes: _p, feedback: _f, ...rest } = full
    return res.json(rest)
  }
  res.json(full)
})

/** Meeting link: an http(s) URL (Zoom, Google Meet, Teams…). Empty string clears it. */
const MeetingLink = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Meeting link must start with http:// or https://')
  .transform((v) => (v === '' ? null : v))
  .nullish()

// Fields without defaults are used for PATCH, so a partial update never resets other fields.
const SessionFields = z.object({
  clientId: z.string(),
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().min(10).max(480),
  topic: z.string().min(2),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']),
  summary: z.string(),
  topics: z.array(z.string()),
  observations: z.string(),
  decisions: z.array(z.string()),
  followUps: z.array(z.string()),
  prepNotes: z.string(),
  meetingLink: MeetingLink,
})
const SessionBody = SessionFields.extend({
  durationMin: SessionFields.shape.durationMin.default(60),
  status: SessionFields.shape.status.default('SCHEDULED'),
  summary: SessionFields.shape.summary.default(''),
  topics: SessionFields.shape.topics.default([]),
  observations: SessionFields.shape.observations.default(''),
  decisions: SessionFields.shape.decisions.default([]),
  followUps: SessionFields.shape.followUps.default([]),
  prepNotes: SessionFields.shape.prepNotes.default(''),
})

work.post('/sessions', requireRole('COACH'), async (req, res) => {
  const body = SessionBody.parse(req.body)
  await assertCoachOwnsClient(req.user!.id, body.clientId)
  const s = await prisma.session.create({ data: body })
  if (body.status === 'SCHEDULED') {
    const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { id: body.clientId } })
    await prisma.notification.create({ data: { userId: profile.userId, title: 'New coaching session scheduled', body: `${s.topic} · ${s.scheduledAt.toUTCString()}`, link: '/client/sessions', kind: 'session' } })
  }
  res.status(201).json(s)
})

work.patch('/sessions/:id', requireRole('COACH'), async (req, res) => {
  const s = await ownSession(req, String(req.params.id))
  const body = SessionFields.partial().omit({ clientId: true }).parse(req.body)
  res.json(await prisma.session.update({ where: { id: s.id }, data: body }))
})

/** Drag-to-reschedule from the coach's Session Calendar. Only upcoming, scheduled sessions can move. */
work.post('/sessions/:id/reschedule', requireRole('COACH'), async (req, res) => {
  const s = await ownSession(req, String(req.params.id))
  const body = z.object({ scheduledAt: z.coerce.date(), durationMin: z.number().int().min(15).max(480), notify: z.boolean().default(false) }).parse(req.body)
  if (s.status !== 'SCHEDULED') throw new HttpError(400, 'Only scheduled sessions can be moved')
  if (body.scheduledAt.getTime() < Date.now() - 60_000) throw new HttpError(400, 'Pick a time in the future')
  const updated = await prisma.session.update({ where: { id: s.id }, data: { scheduledAt: body.scheduledAt, durationMin: body.durationMin } })
  let emailed: boolean | null = null
  if (body.notify) {
    const [client, coach] = await Promise.all([
      prisma.clientProfile.findUniqueOrThrow({ where: { id: s.clientId }, select: { user: { select: { id: true, name: true, email: true } } } }),
      prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { name: true, email: true } }),
    ])
    const when = body.scheduledAt.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' UTC'
    const text = `${coach.name} moved your session “${s.topic}” to ${when} (${body.durationMin} min).`
    await prisma.notification.create({ data: { userId: client.user.id, title: 'Session rescheduled', body: text, link: '/client/sessions', kind: 'info' } })
    const mail = await sendEmail({
      to: client.user.email,
      replyTo: coach.email,
      subject: `Session moved: ${when}`,
      text: `Hi ${client.user.name},\n\n${text}${s.meetingLink ? `\n\nJoin: ${s.meetingLink}` : ''}\n\n— ${coach.name}`,
      html: layout({ heading: 'Your session has moved', paragraphs: [`Hi ${escapeHtml(client.user.name)},`, escapeHtml(text)], ...(s.meetingLink ? { button: { label: 'Join the session', url: s.meetingLink } } : {}), footer: `Reply to this email to reach ${escapeHtml(coach.name)}.` }),
    })
    emailed = mail.sent
  }
  res.json({ session: updated, emailed })
})

work.get('/sessions/:id/brief', requireRole('COACH'), async (req, res) => {
  const s = await ownSession(req, String(req.params.id))
  const brief = await buildSessionBrief(s.id)
  const feedback = await prisma.insightFeedback.findMany({ where: { sessionId: s.id } })
  res.json({ session: s, brief, feedback })
})

work.put('/sessions/:id/feedback', requireRole('COACH'), async (req, res) => {
  const s = await ownSession(req, String(req.params.id))
  const body = z.object({ insightKey: z.string(), label: z.string(), status: z.enum(['RELEVANT', 'NOT_RELEVANT', 'DISCUSSED', 'FOLLOW_UP']).nullable() }).parse(req.body)
  if (body.status === null) {
    await prisma.insightFeedback.deleteMany({ where: { sessionId: s.id, insightKey: body.insightKey } })
    return res.json({ ok: true })
  }
  res.json(
    await prisma.insightFeedback.upsert({
      where: { clientId_sessionId_insightKey: { clientId: s.clientId, sessionId: s.id, insightKey: body.insightKey } },
      create: { clientId: s.clientId, sessionId: s.id, insightKey: body.insightKey, label: body.label, status: body.status },
      update: { status: body.status, label: body.label },
    }),
  )
})

work.post('/sessions/:id/assist', requireRole('COACH'), async (req, res) => {
  const s = await ownSession(req, String(req.params.id))
  res.json(await assistSession(s.id))
})

