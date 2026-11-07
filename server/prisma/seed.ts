import bcrypt from 'bcryptjs'
import { prisma } from '../src/db.js'
import { addDays, startOfDay, startOfMonth, startOfWeek, DAY_MS } from '../src/lib/periods.js'
import { DAILY_CHECKIN, MONTHLY_REVIEW, WEEKLY_REFLECTION, type QuestionTemplate } from '../src/lib/formTemplates.js'
import { sectionsToDoc, type BookContent } from '../src/ai/discoveryBook.js'
import { CLIENTS, COACH, INTAKE_TOKEN, PROGRAMS, PROSPECTS, SEED_BOOK } from './seed-data.js'

const COACH_PASSWORD = process.env.SEED_COACH_PASSWORD ?? 'Coach@2026'
const CLIENT_PASSWORD = process.env.SEED_CLIENT_PASSWORD ?? 'Client@2026'

async function reset() {
  await prisma.subscription.deleteMany()
  await prisma.intakePayment.deleteMany()
  await prisma.discoveryCall.deleteMany()
  await prisma.prospectBook.deleteMany()
  await prisma.discoveryBook.deleteMany()
  await prisma.prospect.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.formSuggestion.deleteMany()
  await prisma.insightFeedback.deleteMany()
  await prisma.commitmentUpdate.deleteMany()
  await prisma.commitment.deleteMany()
  await prisma.session.deleteMany()
  await prisma.submission.deleteMany()
  await prisma.formAssignment.deleteMany()
  await prisma.question.deleteMany()
  await prisma.form.deleteMany()
  await prisma.clientProfile.deleteMany()
  await prisma.program.deleteMany()
  await prisma.user.deleteMany()
}

async function createForm(coachId: string, title: string, description: string, frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY', qs: QuestionTemplate[]) {
  const form = await prisma.form.create({
    data: {
      coachId,
      title,
      description,
      frequency,
      status: 'PUBLISHED',
      questions: {
        create: qs.map((q, i) => ({
          order: i,
          type: q.type,
          label: q.label,
          helpText: q.helpText,
          required: q.required ?? false,
          options: q.options ?? [],
          metricKey: q.metricKey,
        })),
      },
    },
    include: { questions: { orderBy: { order: 'asc' } } },
  })
  // key lookup by template order
  const byKey = new Map(qs.map((q, i) => [q.key, form.questions[i]]))
  return { form, byKey }
}

function answersFrom(byKey: Map<string, { id: string; label: string; type: string; metricKey: string | null }>, values: Record<string, unknown>) {
  return [...byKey.entries()].map(([key, q]) => ({
    questionId: q.id,
    label: q.label,
    type: q.type,
    metricKey: q.metricKey,
    value: values[key] ?? null,
  }))
}

async function main() {
  await reset()
  const now = new Date()
  const thisWeek = startOfWeek(now)
  const today = startOfDay(now)

  const coach = await prisma.user.create({
    data: {
      email: COACH.email,
      name: COACH.name,
      role: 'COACH',
      title: COACH.title,
      avatarColor: COACH.avatarColor,
      passwordHash: await bcrypt.hash(COACH_PASSWORD, 10),
      intakeToken: INTAKE_TOKEN,
      refundPolicy: 'There are no refunds: all payments are final.',
    },
  })

  const programs = new Map<string, string>()
  for (const p of PROGRAMS) {
    const created = await prisma.program.create({
      data: { coachId: coach.id, name: p.name, description: p.description, durationWeeks: p.durationWeeks, focusAreas: p.focusAreas, included: p.included, priceCents: p.priceCents, billingType: 'billingType' in p ? p.billingType : 'ONE_TIME' },
    })
    programs.set(p.key, created.id)
  }

  const weekly = await createForm(coach.id, 'Weekly Leadership Reflection', 'A structured end-of-week reflection on wins, challenges, energy and leadership confidence.', 'WEEKLY', WEEKLY_REFLECTION)
  const daily = await createForm(coach.id, 'Daily Check-in', 'A two-minute pulse on how you are showing up today.', 'DAILY', DAILY_CHECKIN)
  const monthly = await createForm(coach.id, 'Monthly Leadership Review', 'Step back and look at the month as a whole.', 'MONTHLY', MONTHLY_REVIEW)

  // A draft form to show the builder in a work-in-progress state
  await prisma.form.create({
    data: {
      coachId: coach.id,
      title: 'Quarterly 360 Self-Assessment',
      description: 'Draft — self-assessment against the leadership competency model.',
      frequency: 'QUARTERLY',
      status: 'DRAFT',
      questions: {
        create: [
          { order: 0, type: 'RATING', label: 'How effectively did you set direction for your leadership team this quarter?', required: true, options: [] },
          { order: 1, type: 'MULTIPLE_CHOICE', label: 'Which leadership capabilities grew most this quarter?', options: ['Delegation', 'Strategic thinking', 'Communication', 'Giving feedback', 'Decision-making'] },
          { order: 2, type: 'LONG_TEXT', label: 'What feedback have you received that surprised you?', options: [] },
        ],
      },
    },
  })

  for (const c of CLIENTS) {
    const user = await prisma.user.create({
      data: {
        email: c.email,
        name: c.name,
        role: 'CLIENT',
        title: `${c.designation}, ${c.company}`,
        avatarColor: c.avatarColor,
        passwordHash: await bcrypt.hash(CLIENT_PASSWORD, 10),
      },
    })
    const profile = await prisma.clientProfile.create({
      data: {
        userId: user.id,
        coachId: coach.id,
        programId: programs.get(c.programKey),
        company: c.company,
        designation: c.designation,
        industry: c.industry,
        companySize: c.companySize,
        location: c.location,
        phone: c.phone,
        links: c.links,
        startDate: addDays(thisWeek, -7 * c.startWeeksAgo),
        coachNotes: c.coachNotes,
      },
    })

    for (const f of [weekly, daily, monthly]) {
      await prisma.formAssignment.create({ data: { formId: f.form.id, clientId: profile.id, assignedAt: addDays(thisWeek, -7 * c.startWeeksAgo) } })
    }

    // Weekly reflections — week i covers [thisWeek - (9 - i) weeks]
    const n = c.weekly.length
    for (let i = 0; i < n; i++) {
      const w = c.weekly[i]
      if (!w) continue
      const periodStart = addDays(thisWeek, -7 * (n - i))
      const submittedAt = new Date(periodStart.getTime() + 6 * DAY_MS + (17 + (i % 4)) * 3_600_000 + i * 7 * 60_000)
      await prisma.submission.create({
        data: {
          formId: weekly.form.id,
          clientId: profile.id,
          status: 'SUBMITTED',
          periodStart,
          dueAt: new Date(periodStart.getTime() + 7 * DAY_MS - 60_000),
          submittedAt,
          answers: answersFrom(weekly.byKey, w as unknown as Record<string, unknown>),
        },
      })
    }

    for (const d of c.daily) {
      const periodStart = addDays(today, -d.daysAgo)
      await prisma.submission.create({
        data: {
          formId: daily.form.id,
          clientId: profile.id,
          status: 'SUBMITTED',
          periodStart,
          dueAt: new Date(periodStart.getTime() + DAY_MS - 60_000),
          submittedAt: new Date(periodStart.getTime() + 20 * 3_600_000),
          answers: answersFrom(daily.byKey, { emotion: d.emotion, energy: d.energy, note: d.note, protectedTime: d.protectedTime }),
        },
      })
    }

    for (const m of c.monthly) {
      const ref = startOfMonth(now)
      const periodStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - m.monthsAgo, 1))
      const next = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - m.monthsAgo + 1, 1))
      await prisma.submission.create({
        data: {
          formId: monthly.form.id,
          clientId: profile.id,
          status: 'SUBMITTED',
          periodStart,
          dueAt: new Date(next.getTime() - 60_000),
          submittedAt: new Date(next.getTime() - 2 * DAY_MS),
          answers: answersFrom(monthly.byKey, m as unknown as Record<string, unknown>),
        },
      })
    }

    const sessionIds: string[] = []
    for (const s of c.sessions) {
      const at = new Date(today.getTime() + s.dayOffset * DAY_MS + s.hour * 3_600_000)
      const created = await prisma.session.create({
        data: {
          clientId: profile.id,
          scheduledAt: at,
          durationMin: s.durationMin,
          topic: s.topic,
          status: s.dayOffset < 0 ? 'COMPLETED' : 'SCHEDULED',
          // Demo video links for upcoming sessions (placeholder rooms)
          meetingLink: s.dayOffset >= 0 ? `https://meet.google.com/${['xec', 'osm', 'pmd'][CLIENTS.indexOf(c) % 3]}-${String(1000 + s.dayOffset * 37).slice(-4)}-cch` : null,
          summary: s.summary ?? '',
          topics: s.topics ?? [],
          observations: s.observations ?? '',
          decisions: s.decisions ?? [],
          followUps: s.followUps ?? [],
        },
      })
      sessionIds.push(created.id)
    }

    for (const cm of c.commitments) {
      const createdAt = new Date(today.getTime() - cm.createdDaysAgo * DAY_MS + 16 * 3_600_000)
      // link the commitment to the nearest completed session before its creation
      const sessionIdx = c.sessions.findIndex((s) => s.dayOffset < 0 && Math.abs(s.dayOffset + cm.createdDaysAgo) <= 4)
      await prisma.commitment.create({
        data: {
          clientId: profile.id,
          sessionId: sessionIdx >= 0 ? sessionIds[sessionIdx] : null,
          title: cm.title,
          description: cm.description,
          dueDate: new Date(today.getTime() + cm.dueInDays * DAY_MS + 17 * 3_600_000),
          priority: cm.priority,
          goal: cm.goal,
          theme: cm.theme,
          status: cm.status,
          createdAt,
          updates: {
            create: [
              { status: 'NOT_STARTED', note: 'Commitment created during coaching session.', authorRole: 'COACH', createdAt },
              ...cm.updates.map((u) => ({ status: u.status, note: u.note, authorRole: u.by, createdAt: new Date(today.getTime() - u.daysAgo * DAY_MS + 19 * 3_600_000) })),
            ],
          },
        },
      })
    }
  }

  // Discovery pipeline: prospects at each stage, one Discovery Call Framework Book and its calls.
  const prospectIds = new Map<string, string>()
  for (const { key, daysAgo, ...p } of PROSPECTS) {
    const created = await prisma.prospect.create({ data: { ...p, coachId: coach.id, createdAt: new Date(now.getTime() - daysAgo * DAY_MS) } })
    prospectIds.set(key, created.id)
  }
  const book = await prisma.discoveryBook.create({ data: { coachId: coach.id, title: SEED_BOOK.title, prompt: SEED_BOOK.prompt, content: sectionsToDoc(SEED_BOOK.content as BookContent) as object, model: 'seed' } })
  const fitSignals = SEED_BOOK.content.sections.find((s) => s.key === 'fit')!.items.map((i) => ({ label: i.text, flagged: false }))
  await prisma.prospectBook.create({ data: { prospectId: prospectIds.get('marcus')!, bookId: book.id } })
  await prisma.discoveryCall.create({
    data: {
      prospectId: prospectIds.get('marcus')!,
      scheduledAt: new Date(today.getTime() - 5 * DAY_MS + 15 * 3_600_000),
      durationMin: 45,
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/abc-defg-hij',
      notes: 'Margins slip on change orders. His site lead Dana already runs two projects alone. Wants to talk it over with his daughter before committing.',
      fitCheck: fitSignals,
      outcome: 'UNDECIDED',
    },
  })
  await prisma.discoveryCall.create({
    data: { prospectId: prospectIds.get('marcus')!, scheduledAt: new Date(today.getTime() + 2 * DAY_MS + 16 * 3_600_000), durationMin: 30, mode: 'OFFLINE', fitCheck: fitSignals },
  })
  await prisma.discoveryCall.create({
    data: {
      prospectId: prospectIds.get('sofia')!,
      scheduledAt: new Date(today.getTime() - 15 * DAY_MS + 14 * 3_600_000),
      mode: 'ONLINE',
      notes: 'Wants staff turnover fixed in a month. Not interested in working on her own leadership.',
      fitCheck: fitSignals.map((f, i) => ({ ...f, flagged: i < 2 })),
      outcome: 'NOT_A_FIT',
    },
  })
  await prisma.discoveryCall.create({
    data: { prospectId: prospectIds.get('james')!, scheduledAt: new Date(today.getTime() - 6 * DAY_MS + 17 * 3_600_000), mode: 'ONLINE', notes: 'Clear goals, CEO sponsorship, ready to start. Sent the intake form.', fitCheck: fitSignals, outcome: 'GOOD_FIT' },
  })

  await prisma.notification.create({
    data: {
      userId: coach.id,
      title: 'David Miller has not submitted a weekly reflection in 2 weeks',
      body: 'His last reflection mentioned postponing the conversation with Tom again.',
      link: '/coach/clients',
      kind: 'alert',
    },
  })

  console.log('Seed complete.')
  console.log(`  Coach:   ${COACH.email} / ${COACH_PASSWORD}`)
  console.log(`  Intake:  /intake/${INTAKE_TOKEN}`)
  for (const c of CLIENTS) console.log(`  Client:  ${c.email} / ${CLIENT_PASSWORD}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
