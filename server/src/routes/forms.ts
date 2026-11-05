import { Router } from 'express'
import { z } from 'zod'
import { generateForm } from '../ai/assist.js'
import { HttpError, requireRole } from '../auth.js'
import { prisma } from '../db.js'

export const forms = Router()
forms.use(requireRole('COACH'))

const QUESTION_TYPES = ['SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'RATING', 'YES_NO', 'DATE', 'NUMBER', 'EMOTION', 'GOAL_PROGRESS'] as const
const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONE_TIME'] as const

const QuestionBody = z.object({
  id: z.string().optional(),
  type: z.enum(QUESTION_TYPES),
  label: z.string().min(1),
  helpText: z.string().nullish(),
  required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
  metricKey: z.string().nullish(),
})

const FormBody = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  frequency: z.enum(FREQUENCIES),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  aiGenerated: z.boolean().default(false),
  questions: z.array(QuestionBody).default([]),
  clientIds: z.array(z.string()).optional(),
})

async function ownForm(coachId: string, id: string) {
  const f = await prisma.form.findFirst({ where: { id, coachId } })
  if (!f) throw new HttpError(404, 'Form not found')
  return f
}

const include = {
  questions: { orderBy: { order: 'asc' as const } },
  assignments: { include: { client: { include: { user: { select: { name: true, avatarColor: true } } } } } },
  _count: { select: { submissions: { where: { status: 'SUBMITTED' as const } } } },
}

forms.get('/', async (req, res) => {
  res.json(await prisma.form.findMany({ where: { coachId: req.user!.id, status: { not: 'ARCHIVED' } }, include, orderBy: { updatedAt: 'desc' } }))
})

forms.get('/:id', async (req, res) => {
  await ownForm(req.user!.id, req.params.id)
  res.json(await prisma.form.findUnique({ where: { id: req.params.id }, include }))
})

async function setAssignments(coachId: string, formId: string, clientIds: string[]) {
  const valid = await prisma.clientProfile.findMany({ where: { coachId, id: { in: clientIds } }, select: { id: true } })
  const ids = valid.map((v) => v.id)
  await prisma.formAssignment.deleteMany({ where: { formId, clientId: { notIn: ids } } })
  for (const clientId of ids) {
    await prisma.formAssignment.upsert({ where: { formId_clientId: { formId, clientId } }, create: { formId, clientId }, update: {} })
  }
}

forms.post('/', async (req, res) => {
  const body = FormBody.parse(req.body)
  const form = await prisma.form.create({
    data: {
      coachId: req.user!.id,
      title: body.title,
      description: body.description,
      frequency: body.frequency,
      status: body.status,
      aiGenerated: body.aiGenerated,
      questions: { create: body.questions.map((q, i) => ({ order: i, type: q.type, label: q.label, helpText: q.helpText ?? null, required: q.required, options: q.options, metricKey: q.metricKey ?? null })) },
    },
  })
  if (body.clientIds) await setAssignments(req.user!.id, form.id, body.clientIds)
  res.status(201).json(await prisma.form.findUnique({ where: { id: form.id }, include }))
})

forms.put('/:id', async (req, res) => {
  await ownForm(req.user!.id, req.params.id)
  const body = FormBody.parse(req.body)
  const formId = req.params.id
  const keepIds = body.questions.map((q) => q.id).filter(Boolean) as string[]
  await prisma.$transaction(async (tx) => {
    await tx.form.update({ where: { id: formId }, data: { title: body.title, description: body.description, frequency: body.frequency, status: body.status } })
    await tx.question.deleteMany({ where: { formId, id: { notIn: keepIds } } })
    for (const [i, q] of body.questions.entries()) {
      const data = { order: i, type: q.type, label: q.label, helpText: q.helpText ?? null, required: q.required, options: q.options, metricKey: q.metricKey ?? null }
      if (q.id) await tx.question.update({ where: { id: q.id }, data })
      else await tx.question.create({ data: { ...data, formId } })
    }
  })
  if (body.clientIds) await setAssignments(req.user!.id, formId, body.clientIds)
  res.json(await prisma.form.findUnique({ where: { id: formId }, include }))
})

forms.post('/:id/assign', async (req, res) => {
  await ownForm(req.user!.id, req.params.id)
  const { clientIds } = z.object({ clientIds: z.array(z.string()) }).parse(req.body)
  await setAssignments(req.user!.id, req.params.id, clientIds)
  res.json(await prisma.form.findUnique({ where: { id: req.params.id }, include }))
})

forms.post('/:id/duplicate', async (req, res) => {
  await ownForm(req.user!.id, req.params.id)
  const src = await prisma.form.findUniqueOrThrow({ where: { id: req.params.id }, include: { questions: { orderBy: { order: 'asc' } } } })
  const copy = await prisma.form.create({
    data: {
      coachId: req.user!.id,
      title: `${src.title} (copy)`,
      description: src.description,
      frequency: src.frequency,
      status: 'DRAFT',
      questions: { create: src.questions.map(({ order, type, label, helpText, required, options, metricKey }) => ({ order, type, label, helpText, required, options, metricKey })) },
    },
  })
  res.status(201).json(await prisma.form.findUnique({ where: { id: copy.id }, include }))
})

forms.delete('/:id', async (req, res) => {
  await ownForm(req.user!.id, req.params.id)
  const subs = await prisma.submission.count({ where: { formId: req.params.id } })
  if (subs) await prisma.form.update({ where: { id: req.params.id }, data: { status: 'ARCHIVED' } })
  else await prisma.form.delete({ where: { id: req.params.id } })
  res.json({ ok: true, archived: subs > 0 })
})

forms.post('/ai/generate', async (req, res) => {
  const { prompt } = z.object({ prompt: z.string().min(5).max(1000) }).parse(req.body)
  res.json(await generateForm(prompt))
})
