import { Router } from 'express'
import { z } from 'zod'
import { invalidateCorpus, getCorpus } from '../ai/corpus.js'
import { invalidateReport, tryRunIntelligence } from '../ai/intelligence.js'
import { HttpError, requireRole } from '../auth.js'
import { prisma } from '../db.js'
import { PAYMENT_FAILURE_THRESHOLD } from '../lib/paypal.js'
import { paypalAutopayUrl } from '../lib/subscriptions.js'
import { createLogger } from '../lib/logger.js'
import { dailyStreak, growthJourney, reflectionActivity, weeklyStreak } from '../lib/growth.js'
import { currentPeriod } from '../lib/periods.js'

const log = createLogger('client')

export const client = Router()
client.use(requireRole('CLIENT'))

type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'ONE_TIME'

async function formsFor(clientId: string, frequency?: Frequency) {
  const now = new Date()
  const assignments = await prisma.formAssignment.findMany({
    where: { clientId, form: { status: 'PUBLISHED', ...(frequency ? { frequency } : {}) } },
    include: { form: { include: { _count: { select: { questions: true } } } } },
  })
  const out = []
  for (const a of assignments) {
    const p = currentPeriod(a.form.frequency, now, a.assignedAt)
    const sub = await prisma.submission.findUnique({ where: { formId_clientId_periodStart: { formId: a.formId, clientId, periodStart: p.start } } })
    out.push({
      formId: a.formId,
      title: a.form.title,
      description: a.form.description,
      frequency: a.form.frequency,
      questionCount: a.form._count.questions,
      periodStart: p.start,
      dueAt: p.due,
      status: sub?.status === 'SUBMITTED' ? 'SUBMITTED' : sub ? 'DRAFT' : 'PENDING',
      submissionId: sub?.id ?? null,
      updatedAt: sub?.updatedAt ?? null,
    })
  }
  const order: Record<string, number> = { DRAFT: 0, PENDING: 1, SUBMITTED: 2 }
  return out.sort((a, b) => order[a.status] - order[b.status] || a.dueAt.getTime() - b.dueAt.getTime())
}

client.get('/dashboard', async (req, res) => {
  const clientId = req.user!.clientId!
  const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { id: clientId }, include: { program: true, coach: { select: { name: true, title: true, avatarColor: true } } } })
  const now = new Date()
  const [pending, ws, ds, commitments, nextSession, recent] = await Promise.all([
    formsFor(clientId),
    weeklyStreak(clientId),
    dailyStreak(clientId),
    prisma.commitment.findMany({ where: { clientId, status: { not: 'COMPLETED' } }, orderBy: { dueDate: 'asc' } }),
    prisma.session.findFirst({ where: { clientId, status: 'SCHEDULED', scheduledAt: { gte: now } }, orderBy: { scheduledAt: 'asc' } }),
    prisma.submission.findMany({ where: { clientId, status: 'SUBMITTED' }, orderBy: { submittedAt: 'desc' }, take: 5, include: { form: { select: { title: true, frequency: true } } } }),
  ])
  res.json({
    profile,
    pending,
    weeklyStreak: ws,
    dailyStreak: ds,
    commitments,
    nextSession,
    recent,
  })
})

client.get('/forms', async (req, res) => {
  const freq = typeof req.query.frequency === 'string' ? (req.query.frequency.toUpperCase() as Frequency) : undefined
  const clientId = req.user!.clientId!
  const current = await formsFor(clientId, freq)
  const history = await prisma.submission.findMany({
    where: { clientId, status: 'SUBMITTED', ...(freq ? { form: { frequency: freq } } : {}) },
    orderBy: { periodStart: 'desc' },
    include: { form: { select: { title: true, frequency: true } } },
  })
  res.json({ current, history })
})

client.get('/forms/:formId/current', async (req, res) => {
  const clientId = req.user!.clientId!
  const a = await prisma.formAssignment.findUnique({ where: { formId_clientId: { formId: req.params.formId, clientId } }, include: { form: { include: { questions: { orderBy: { order: 'asc' } } } } } })
  if (!a || a.form.status !== 'PUBLISHED') throw new HttpError(404, 'Form not assigned')
  const p = currentPeriod(a.form.frequency, new Date(), a.assignedAt)
  const sub = await prisma.submission.findUnique({ where: { formId_clientId_periodStart: { formId: a.formId, clientId, periodStart: p.start } } })
  res.json({ form: a.form, periodStart: p.start, dueAt: p.due, submission: sub })
})

const AnswersBody = z.object({ answers: z.record(z.string(), z.unknown()) })

async function saveSubmission(clientId: string, formId: string, values: Record<string, unknown>, submit: boolean) {
  const a = await prisma.formAssignment.findUnique({ where: { formId_clientId: { formId, clientId } }, include: { form: { include: { questions: { orderBy: { order: 'asc' } } } } } })
  if (!a || a.form.status !== 'PUBLISHED') throw new HttpError(404, 'Form not assigned')
  const p = currentPeriod(a.form.frequency, new Date(), a.assignedAt)
  const existing = await prisma.submission.findUnique({ where: { formId_clientId_periodStart: { formId, clientId, periodStart: p.start } } })
  if (existing?.status === 'SUBMITTED') throw new HttpError(409, 'Already submitted for this period')
  if (submit) {
    const missing = a.form.questions.filter((q) => q.required && (values[q.id] === undefined || values[q.id] === null || values[q.id] === '' || (Array.isArray(values[q.id]) && (values[q.id] as unknown[]).length === 0)))
    if (missing.length) throw new HttpError(422, `Please answer: ${missing.map((q) => q.label).join('; ')}`)
  }
  const answers = a.form.questions.map((q) => ({ questionId: q.id, label: q.label, type: q.type, metricKey: q.metricKey, value: values[q.id] ?? null }))
  const data = { answers, status: submit ? ('SUBMITTED' as const) : ('DRAFT' as const), submittedAt: submit ? new Date() : null }
  return prisma.submission.upsert({
    where: { formId_clientId_periodStart: { formId, clientId, periodStart: p.start } },
    create: { formId, clientId, periodStart: p.start, dueAt: p.due, ...data },
    update: data,
    include: { form: { select: { title: true, frequency: true } } },
  })
}

client.put('/forms/:formId/draft', async (req, res) => {
  const { answers } = AnswersBody.parse(req.body)
  res.json(await saveSubmission(req.user!.clientId!, req.params.formId, answers, false))
})

client.post('/forms/:formId/submit', async (req, res) => {
  const clientId = req.user!.clientId!
  const { answers } = AnswersBody.parse(req.body)
  const sub = await saveSubmission(clientId, req.params.formId, answers, true)

  invalidateCorpus(clientId)
  invalidateReport(clientId)

  const nextSession = await prisma.session.findFirst({ where: { clientId, status: 'SCHEDULED', scheduledAt: { gte: new Date() } }, orderBy: { scheduledAt: 'asc' } })
  res.json({ submission: sub, weeklyStreak: await weeklyStreak(clientId), dailyStreak: await dailyStreak(clientId), nextSession })

  // After replying: re-analyze with the AI and notify the coach (never the client) about new evidence.
  // Running this in the background keeps Submit fast even when the LLM takes a minute.
  void notifyCoachAfterSubmission(clientId, sub).catch((e) => log.error('Post-submission analysis failed', { clientId, error: e }))
})

async function notifyCoachAfterSubmission(clientId: string, sub: { id: string; form: { title: string } }) {
  const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { id: clientId }, include: { user: true } })
  // The reflection is already saved; if AI is unavailable the coach still gets a plain notification.
  const { report, error: aiError } = await tryRunIntelligence(clientId) // the new reflection changes the data fingerprint, so this re-analyzes
  const corpus = await getCorpus(clientId)
  const newThemes = new Set(corpus.snippets.filter((s) => s.submissionId === sub.id).flatMap((s) => s.themes))
  const matched = (report?.recurring ?? []).filter((p) => p.themeKey && newThemes.has(p.themeKey)).slice(0, 2)
  await prisma.notification.create({
    data: {
      userId: profile.coachId,
      kind: matched.length ? 'insight' : 'info',
      title: matched.length ? `New evidence: ${matched[0].title.replace(' pattern detected', '')} pattern — ${profile.user.name}` : `${profile.user.name} submitted ${sub.form.title}`,
      body: matched.length
        ? `${profile.user.name.split(' ')[0]}'s new ${sub.form.title.toLowerCase()} mentions ${matched.map((m) => m.title.replace(' pattern detected', '')).join(' and ')} again. ${matched[0].summary}`
        : aiError
          ? 'AI analysis was unavailable for this submission.'
          : 'No new recurring patterns detected in this submission.',
      link: `/coach/intelligence?client=${clientId}`,
    },
  })
}

client.get('/submissions/:id', async (req, res) => {
  const s = await prisma.submission.findFirst({ where: { id: req.params.id, clientId: req.user!.clientId! }, include: { form: { select: { title: true, frequency: true } } } })
  if (!s) throw new HttpError(404, 'Not found')
  res.json(s)
})

client.get('/activity', async (req, res) => {
  res.json(await reflectionActivity(req.user!.clientId!))
})

client.get('/growth', async (req, res) => {
  res.json(await growthJourney(req.user!.clientId!))
})

const profileInclude = { program: true, coach: { select: { name: true, title: true, email: true } } } as const

client.get('/profile', async (req, res) => {
  res.json(await prisma.clientProfile.findUniqueOrThrow({ where: { id: req.user!.clientId! }, include: profileInclude }))
})

/** The client's auto-renewal (null for one-time programs) and whether they're paused. */
client.get('/subscription', async (req, res) => {
  const c = await prisma.clientProfile.findUniqueOrThrow({ where: { id: req.user!.clientId! }, select: { active: true, inactiveReason: true, subscription: { include: { program: { select: { name: true } } } } } })
  const s = c.subscription
  res.json({
    active: c.active,
    inactiveReason: c.inactiveReason,
    manageUrl: paypalAutopayUrl(),
    subscription: s ? { status: s.status, program: s.program.name, amountCents: s.amountCents, intervalWeeks: s.intervalWeeks, nextBillingAt: s.nextBillingAt, lastPaymentAt: s.lastPaymentAt, failedPayments: s.failedPayments, maxFailures: PAYMENT_FAILURE_THRESHOLD } : null,
  })
})

const ProfileLink = z.object({
  label: z.string().trim().min(1, 'Give each link a name').max(60),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((u) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(u), 'Links must be a full web address starting with http:// or https://'),
})

const ProfileUpdate = z.object({
  phone: z.string().trim().max(40).transform((v) => v || null).optional(),
  location: z.string().trim().min(1, 'Location is required').max(120).optional(),
  links: z.array(ProfileLink).max(10, 'You can add up to 10 links').optional(),
})

/** The client edits their own contact details and links (Settings → Contact & links). */
client.patch('/profile', async (req, res) => {
  const data = ProfileUpdate.parse(req.body)
  const updated = await prisma.clientProfile.update({ where: { id: req.user!.clientId! }, data, include: profileInclude })
  log.info('Client profile updated', { fields: Object.keys(data).join(','), links: data.links?.length })
  res.json(updated)
})
