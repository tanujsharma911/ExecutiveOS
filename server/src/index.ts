import './env.js'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { z, ZodError } from 'zod'
import { aiMode, aiModelName } from './ai/model.js'
import { createLogger } from './lib/logger.js'
import { requestLogger } from './lib/requestLogger.js'
import { HttpError, requireAuth, signToken } from './auth.js'
import { prisma } from './db.js'
import { client } from './routes/client.js'
import { coach } from './routes/coach.js'
import { forms } from './routes/forms.js'
import { work } from './routes/work.js'

const app = express()
const log = createLogger('server')
app.use(requestLogger)
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ ok: true, ai: { mode: aiMode(), model: aiModelName() } })
})

const publicUser = (u: { id: string; email: string; name: string; role: string; title: string | null; avatarColor: string; timezone: string; clientProfile?: { id: string } | null }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  title: u.title,
  avatarColor: u.avatarColor,
  timezone: u.timezone,
  clientId: u.clientProfile?.id ?? null,
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body)
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() }, include: { clientProfile: { select: { id: true } } } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Invalid email or password')
  res.json({ token: signToken(user.id), user: publicUser(user) })
})

app.get('/api/demo-accounts', async (_req, res) => {
  if (process.env.SHOW_DEMO_ACCOUNTS === 'false') return res.json([])
  const users = await prisma.user.findMany({ select: { email: true, name: true, role: true, title: true, avatarColor: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] })
  res.json(users)
})

app.use('/api', requireAuth)

app.get('/api/auth/me', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, include: { clientProfile: { select: { id: true } } } })
  res.json({ user: publicUser(user), ai: { mode: aiMode(), model: aiModelName() } })
})

app.patch('/api/auth/me', async (req, res) => {
  const body = z.object({ name: z.string().min(2).optional(), title: z.string().optional(), timezone: z.string().optional() }).parse(req.body)
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: body, include: { clientProfile: { select: { id: true } } } })
  res.json({ user: publicUser(user) })
})

app.post('/api/auth/password', async (req, res) => {
  const { current, next } = z.object({ current: z.string(), next: z.string().min(8) }).parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
  if (!(await bcrypt.compare(current, user.passwordHash))) throw new HttpError(400, 'Current password is incorrect')
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10) } })
  res.json({ ok: true })
})

app.get('/api/notifications', async (req, res) => {
  res.json(await prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 30 }))
})
app.post('/api/notifications/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, read: false }, data: { read: true } })
  res.json({ ok: true })
})
app.post('/api/notifications/:id/read', async (req, res) => {
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id }, data: { read: true } })
  res.json({ ok: true })
})

app.use('/api/coach', coach)
app.use('/api/forms', forms)
app.use('/api/client', client)
app.use('/api', work)

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.locals.errorMessage = err.message
    return res.status(err.status).json({ error: err.message })
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    res.locals.errorMessage = message
    return res.status(400).json({ error: message })
  }
  if ((err as { code?: string })?.code === 'P2025') {
    res.locals.errorMessage = 'Not found'
    return res.status(404).json({ error: 'Not found' })
  }
  res.locals.errorMessage = (err as Error)?.message
  log.error('Unhandled error', { route: `${req.method} ${req.originalUrl.split('?')[0]}`, error: err })
  res.status(500).json({ error: 'Something went wrong' })
})

const port = Number(process.env.PORT ?? 7461)
app.listen(port, () => log.info(`ExecutiveOS API listening on http://localhost:${port}`, { aiMode: aiMode(), aiModel: aiModelName(), logLevel: process.env.LOG_LEVEL ?? 'info' }))

process.on('unhandledRejection', (reason) => log.error('Unhandled promise rejection', { error: reason }))
