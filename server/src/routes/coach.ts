import { Router } from 'express'
import { z } from 'zod'
import { buildAlerts, engagementOf } from '../ai/alerts.js'
import { refreshFormSuggestions } from '../ai/assist.js'
import { buildSeries } from '../ai/analyzers.js'
import { getCorpus } from '../ai/corpus.js'
import { runAnalysis, runIntelligence, tryRunIntelligence } from '../ai/intelligence.js'
import { AiUnavailableError } from '../ai/model.js'
import { assertCoachOwnsClient, HttpError, requireRole } from '../auth.js'
import { paypalEnv } from '../lib/paypal.js'
import { prisma } from '../db.js'
import { growthJourney, reflectionActivity } from '../lib/growth.js'
import { addDays, startOfWeek } from '../lib/periods.js'

/** Raw emotion counts (earlier half vs recent half of weekly reflections) — data, not AI. */
function emotionTally(metrics: { frequency: string; emotion?: string }[]) {
  const weekly = metrics.filter((m) => m.frequency === 'WEEKLY')
  const half = Math.floor(weekly.length / 2)
  const tally = (ms: typeof weekly) => ms.reduce<Record<string, number>>((acc, m) => (m.emotion ? { ...acc, [m.emotion]: (acc[m.emotion] ?? 0) + 1 } : acc), {})
  return { early: tally(weekly.slice(0, half)), recent: tally(weekly.slice(half)) }
}

export const coach = Router()
coach.use(requireRole('COACH'))

async function clientRows(coachId: string) {
  const clients = await prisma.clientProfile.findMany({
    where: { coachId },
    include: { user: true, program: true, subscription: { select: { status: true, nextBillingAt: true, failedPayments: true } }, commitments: { select: { status: true, dueDate: true } } },
    orderBy: { user: { name: 'asc' } },
  })
  return Promise.all(
    clients.map(async (c) => {
      const corpus = await getCorpus(c.id)
      const eng = engagementOf(corpus.lastWeeklyAt)
      const conf = buildSeries(corpus.metrics, 'confidence')
      const goal = buildSeries(corpus.metrics, 'goalProgress')
      const done = c.commitments.filter((x) => x.status === 'COMPLETED').length
      return {
        id: c.id,
        name: c.user.name,
        email: c.user.email,
        avatarColor: c.user.avatarColor,
        company: c.company,
        designation: c.designation,
        industry: c.industry,
        location: c.location,
        program: c.program?.name ?? '—',
        programId: c.programId,
        startDate: c.startDate,
        active: c.active,
        billing: c.subscription ? { status: c.subscription.status, nextBillingAt: c.subscription.nextBillingAt, failedPayments: c.subscription.failedPayments } : null,
        lastReflectionAt: corpus.submissions[corpus.submissions.length - 1]?.date ?? null,
        lastWeeklyAt: corpus.lastWeeklyAt,
        engagement: eng.status,
        daysSinceWeekly: eng.daysSince,
        confidence: conf.last,
        confidenceDelta: conf.delta,
        confidenceTrend: conf.points.map((p) => p.value),
        goalProgress: goal.last,
        commitmentRate: c.commitments.length ? Math.round((done / c.commitments.length) * 100) : 0,
        openCommitments: c.commitments.length - done,
        reflections: corpus.submissions.length,
      }
    }),
  )
}

coach.get('/dashboard', async (req, res) => {
  const coachId = req.user!.id
  const rows = await clientRows(coachId)
  const now = new Date()
  const programs = await prisma.program.count({ where: { coachId, status: 'ACTIVE', clients: { some: {} } } })

  // Pending reflections: assigned weekly forms without a submission this week
  const thisWeek = startOfWeek(now)
  const pending = await prisma.formAssignment.findMany({
    where: { client: { coachId }, form: { status: 'PUBLISHED', frequency: 'WEEKLY' } },
    include: { form: { include: { submissions: { where: { periodStart: thisWeek, status: 'SUBMITTED' }, select: { clientId: true } } } } },
  })
  const pendingCount = pending.filter((a) => !a.form.submissions.some((s) => s.clientId === a.clientId)).length

  const upcoming = await prisma.session.findMany({
    where: { client: { coachId }, status: 'SCHEDULED', scheduledAt: { gte: addDays(now, -1) } },
    include: { client: { include: { user: true } }, feedback: { select: { id: true } } },
    orderBy: { scheduledAt: 'asc' },
    take: 6,
  })

  // AI alerts live on each client's profile and the AI Intelligence screen, so the Overview never waits on an LLM.

  // Performance over the last 8 weeks
  const weeks = [...Array(8)].map((_, i) => addDays(thisWeek, -7 * (8 - i)))
  const weekly = await prisma.submission.findMany({
    where: { client: { coachId }, status: 'SUBMITTED', form: { frequency: 'WEEKLY' }, periodStart: { gte: weeks[0] } },
    select: { periodStart: true, clientId: true, answers: true },
  })
  const trend = weeks.map((w) => {
    const subs = weekly.filter((s) => s.periodStart.getTime() === w.getTime())
    const vals = (key: string) =>
      subs
        .map((s) => (s.answers as { metricKey: string | null; value: unknown }[]).find((a) => a.metricKey === key)?.value)
        .filter((v): v is number => typeof v === 'number')
    const avg = (xs: number[]) => (xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)) : null)
    return {
      week: w.toISOString(),
      submissionRate: rows.length ? Math.round((new Set(subs.map((s) => s.clientId)).size / rows.length) * 100) : 0,
      avgConfidence: avg(vals('confidence')),
      avgEnergy: avg(vals('energy')),
      avgGoal: avg(vals('goalProgress')),
    }
  })
  const last4 = trend.slice(-4)
  const allCms = await prisma.commitment.findMany({ where: { client: { coachId } }, select: { status: true, dueDate: true } })

  res.json({
    coach: { name: req.user!.name },
    stats: {
      activeClients: rows.length,
      activePrograms: programs,
      pendingReflections: pendingCount,
      upcomingSessions: upcoming.filter((s) => s.scheduledAt.getTime() - now.getTime() < 14 * 86_400_000).length,
    },
    clients: rows,
    upcoming: upcoming.map((s) => {
      const r = rows.find((x) => x.id === s.clientId)
      return {
        id: s.id,
        clientId: s.clientId,
        clientName: s.client.user.name,
        avatarColor: s.client.user.avatarColor,
        scheduledAt: s.scheduledAt,
        durationMin: s.durationMin,
        topic: s.topic,
        prepStatus: s.feedback.length ? 'Reviewed' : r && r.daysSinceWeekly !== null && r.daysSinceWeekly > 13 ? 'Limited data' : 'Brief ready',
      }
    }),
    performance: {
      trend,
      reflectionRate: Math.round(last4.reduce((a, t) => a + t.submissionRate, 0) / Math.max(1, last4.length)),
      commitmentCompletion: allCms.length ? Math.round((allCms.filter((c) => c.status === 'COMPLETED').length / allCms.length) * 100) : 0,
      overdueCommitments: allCms.filter((c) => c.status !== 'COMPLETED' && c.dueDate < now).length,
      avgGoalProgress: Math.round(rows.reduce((a, r) => a + (r.goalProgress ?? 0), 0) / Math.max(1, rows.length)),
      byClient: rows.map((r) => ({ id: r.id, name: r.name, commitmentRate: r.commitmentRate, goalProgress: r.goalProgress, confidence: r.confidence })),
    },
  })
})

coach.get('/clients', async (req, res) => {
  res.json(await clientRows(req.user!.id))
})

/** Light rows for the expandable detail in My Clients: latest reflections and open commitments. */
coach.get('/clients/:id/recent', async (req, res) => {
  const id = String(req.params.id)
  await assertCoachOwnsClient(req.user!.id, id)
  const [reflections, commitments] = await Promise.all([
    prisma.submission.findMany({ where: { clientId: id, status: 'SUBMITTED' }, orderBy: { submittedAt: 'desc' }, take: 4, select: { id: true, submittedAt: true, form: { select: { title: true } } } }),
    prisma.commitment.findMany({ where: { clientId: id, status: { not: 'COMPLETED' } }, orderBy: { dueDate: 'asc' }, take: 6, select: { id: true, title: true, dueDate: true, status: true } }),
  ])
  res.json([
    ...commitments.map((c) => ({ id: c.id, type: 'Commitment', title: c.title, date: c.dueDate, status: c.status })),
    ...reflections.map((r) => ({ id: r.id, type: 'Reflection', title: r.form.title, date: r.submittedAt, status: 'SUBMITTED' })),
  ])
})

coach.get('/clients/:id', async (req, res) => {
  const id = req.params.id
  await assertCoachOwnsClient(req.user!.id, id)
  const c = await prisma.clientProfile.findUniqueOrThrow({
    where: { id },
    include: {
      user: { select: { name: true, email: true, avatarColor: true, title: true } },
      program: true,
      commitments: { orderBy: { dueDate: 'asc' }, include: { updates: { orderBy: { createdAt: 'desc' }, take: 1 } } },
      sessions: { orderBy: { scheduledAt: 'desc' } },
      subscription: true,
    },
  })
  // No LLM here: the AI summary is fetched separately (/intelligence) so this page loads instantly.
  const [analysis, corpus] = await Promise.all([runAnalysis(id), getCorpus(id)])
  const recent = await prisma.submission.findMany({
    where: { clientId: id, status: 'SUBMITTED' },
    orderBy: { submittedAt: 'desc' },
    take: 5,
    include: { form: { select: { title: true, frequency: true } } },
  })
  const activity = [
    ...recent.map((s) => ({ date: s.submittedAt!.toISOString(), kind: 'reflection', text: `Submitted ${s.form.title}` })),
    ...c.commitments.flatMap((cm) => [{ date: (cm.updates[0]?.createdAt ?? cm.createdAt).toISOString(), kind: 'commitment', text: `${cm.title} — ${cm.status.replace(/_/g, ' ').toLowerCase()}` }]),
    ...c.sessions.filter((s) => s.status === 'COMPLETED').map((s) => ({ date: s.scheduledAt.toISOString(), kind: 'session', text: `Session: ${s.topic}` })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
  res.json({
    profile: c,
    paypalEnv: paypalEnv(),
    engagement: engagementOf(corpus.lastWeeklyAt),
    // Charts are the client's raw self-reported numbers; patterns come from the analysis tools — neither needs the LLM.
    series: (['confidence', 'team', 'energy', 'stress', 'goalProgress'] as const).map((k) => buildSeries(corpus.metrics, k)),
    emotions: emotionTally(corpus.metrics),
    patterns: [...analysis.recurring.slice(0, 3), ...analysis.emerging.slice(0, 1)],
    recentReflections: recent,
    activity,
  })
})

const ProfilePatch = z.object({
  coachNotes: z.string().optional(),
  programId: z.string().nullable().optional(),
})

coach.patch('/clients/:id', async (req, res) => {
  await assertCoachOwnsClient(req.user!.id, req.params.id)
  const data = ProfilePatch.parse(req.body)
  res.json(await prisma.clientProfile.update({ where: { id: req.params.id }, data }))
})

coach.get('/clients/:id/reflections', async (req, res) => {
  await assertCoachOwnsClient(req.user!.id, req.params.id)
  const subs = await prisma.submission.findMany({
    where: { clientId: req.params.id, status: 'SUBMITTED' },
    orderBy: { submittedAt: 'desc' },
    include: { form: { select: { id: true, title: true, frequency: true } } },
  })
  res.json(subs)
})

/** Insights computed by the analysis tools only (no LLM) — returns in milliseconds. */
coach.get('/clients/:id/analysis', async (req, res) => {
  await assertCoachOwnsClient(req.user!.id, req.params.id)
  res.json(await runAnalysis(req.params.id))
})

/** Full report including the LLM-written briefing (saved and reused until the data changes). */
coach.get('/clients/:id/intelligence', async (req, res) => {
  await assertCoachOwnsClient(req.user!.id, req.params.id)
  const report = await runIntelligence(req.params.id, { fresh: req.query.fresh === '1' })
  res.json({ ...report, alerts: buildAlerts(report) })
})

coach.get('/clients/:id/activity', async (req, res) => {
  await assertCoachOwnsClient(req.user!.id, req.params.id)
  res.json(await reflectionActivity(req.params.id))
})

coach.get('/clients/:id/growth', async (req, res) => {
  await assertCoachOwnsClient(req.user!.id, req.params.id)
  res.json(await growthJourney(req.params.id))
})

coach.get('/programs', async (req, res) => {
  const programs = await prisma.program.findMany({
    where: { coachId: req.user!.id },
    include: { clients: { include: { user: { select: { name: true, avatarColor: true } } } } },
    orderBy: { createdAt: 'asc' },
  })
  res.json(programs)
})

const ProgramFields = z.object({
  name: z.string().min(2),
  description: z.string(),
  durationWeeks: z.number().int().min(1).max(104),
  focusAreas: z.array(z.string()),
  /** What's included (sessions, access, extras); the intake assistant quotes it. */
  included: z.string().max(1000),
  /** Fixed USD price in cents; 0 hides the program from the intake form. */
  priceCents: z.number().int().min(0).max(10_000_000),
  /** SUBSCRIPTION: PayPal charges priceCents again every durationWeeks (PayPal allows at most 52 weeks per cycle). */
  billingType: z.enum(['ONE_TIME', 'SUBSCRIPTION']),
})
const checkTerm = (b: { billingType?: string; durationWeeks?: number }, current?: { billingType: string; durationWeeks: number }) => {
  const type = b.billingType ?? current?.billingType
  const weeks = b.durationWeeks ?? current?.durationWeeks ?? 0
  if (type === 'SUBSCRIPTION' && weeks > 52) throw new HttpError(400, 'Auto-renewing programs can be at most 52 weeks long (a PayPal limit)')
}
const ProgramBody = ProgramFields.extend({ included: z.string().max(1000).default(''), description: z.string().default(''), focusAreas: z.array(z.string()).default([]), priceCents: ProgramFields.shape.priceCents.default(0), billingType: ProgramFields.shape.billingType.default('ONE_TIME') })
coach.post('/programs', async (req, res) => {
  const body = ProgramBody.parse(req.body)
  checkTerm(body)
  res.status(201).json(await prisma.program.create({ data: { ...body, coachId: req.user!.id } }))
})
coach.patch('/programs/:id', async (req, res) => {
  const p = await prisma.program.findFirst({ where: { id: req.params.id, coachId: req.user!.id } })
  if (!p) throw new HttpError(404, 'Program not found')
  const body = ProgramFields.partial().extend({ status: z.string().max(20).optional() }).parse(req.body)
  checkTerm(body, p)
  res.json(await prisma.program.update({ where: { id: p.id }, data: body }))
})

// Adaptive form suggestions
coach.get('/suggestions', async (req, res) => {
  const clients = await prisma.clientProfile.findMany({ where: { coachId: req.user!.id }, select: { id: true } })
  const ids = typeof req.query.clientId === 'string' ? [req.query.clientId] : clients.map((c) => c.id)
  for (const id of ids) {
    await assertCoachOwnsClient(req.user!.id, id)
    try {
      await refreshFormSuggestions(id)
    } catch (e) {
      // AI unavailable: keep showing already-saved suggestions instead of failing the page.
      if (!(e instanceof AiUnavailableError)) throw e
    }
  }
  const list = await prisma.formSuggestion.findMany({
    where: { clientId: { in: ids }, status: 'PENDING' },
    include: { client: { include: { user: { select: { name: true, avatarColor: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
  res.json(list)
})

coach.post('/suggestions/:id/approve', async (req, res) => {
  const { formId, addQuestion } = z.object({ formId: z.string(), addQuestion: z.boolean().default(true) }).parse(req.body)
  const s = await prisma.formSuggestion.findUniqueOrThrow({ where: { id: req.params.id } })
  await assertCoachOwnsClient(req.user!.id, s.clientId)
  const form = await prisma.form.findFirst({ where: { id: formId, coachId: req.user!.id }, include: { questions: true } })
  if (!form) throw new HttpError(404, 'Form not found')
  if (addQuestion) await prisma.question.create({ data: { formId, order: form.questions.length, type: s.type, label: s.question, helpText: null, options: [] } })
  res.json(await prisma.formSuggestion.update({ where: { id: s.id }, data: { status: 'APPROVED', formId } }))
})

coach.post('/suggestions/:id/dismiss', async (req, res) => {
  const s = await prisma.formSuggestion.findUniqueOrThrow({ where: { id: req.params.id } })
  await assertCoachOwnsClient(req.user!.id, s.clientId)
  res.json(await prisma.formSuggestion.update({ where: { id: s.id }, data: { status: 'DISMISSED' } }))
})
