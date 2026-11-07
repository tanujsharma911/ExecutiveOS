import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from './db.js'
import { attachUserToLogContext } from './lib/requestLogger.js'

export interface AuthUser {
  id: string
  role: 'COACH' | 'CLIENT'
  name: string
  email: string
  clientId?: string
  mustChangePassword?: boolean
  /** false: client's auto-renewal failed; read-only until the coach reactivates. */
  clientActive?: boolean
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const secret = () => process.env.JWT_SECRET ?? 'dev-secret-change-me'

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, secret(), { expiresIn: '7d' })
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Not authenticated')
  let sub: string
  try {
    sub = (jwt.verify(header.slice(7), secret()) as { sub: string }).sub
  } catch {
    throw new HttpError(401, 'Session expired')
  }
  const user = await prisma.user.findUnique({ where: { id: sub }, include: { clientProfile: { select: { id: true, active: true } } } })
  if (!user) throw new HttpError(401, 'User not found')
  req.user = { id: user.id, role: user.role, name: user.name, email: user.email, clientId: user.clientProfile?.id, mustChangePassword: user.mustChangePassword, clientActive: user.clientProfile?.active ?? true }
  attachUserToLogContext(req)
  // Clients created from an intake payment must replace their emailed temporary password first.
  if (user.mustChangePassword && !/^\/api\/auth\/(me|password)(\/|\?|$)/.test(req.originalUrl)) throw new HttpError(403, 'Please change your temporary password first')
  // Inactive clients (renewal failed after PayPal's retries) can read but not change anything.
  if (user.role === 'CLIENT' && user.clientProfile && !user.clientProfile.active && req.method !== 'GET' && !/^\/api\/(auth|notifications)\//.test(req.originalUrl))
    throw new HttpError(402, 'Your program is paused because the renewal payment failed. Update your payment method in PayPal and contact your coach.')
  next()
}

export const requireRole = (role: 'COACH' | 'CLIENT') => (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== role) throw new HttpError(403, 'Forbidden')
  next()
}

/** Ensures a client belongs to the authenticated coach (coach-only visibility). */
export async function assertCoachOwnsClient(coachId: string, clientId: string) {
  const c = await prisma.clientProfile.findFirst({ where: { id: clientId, coachId }, select: { id: true } })
  if (!c) throw new HttpError(404, 'Client not found')
}

/** Resolves which client a request may act on (coach → param, client → self). */
export async function resolveClientId(req: Request, clientId?: string): Promise<string> {
  if (req.user!.role === 'CLIENT') return req.user!.clientId!
  if (!clientId) throw new HttpError(400, 'clientId required')
  await assertCoachOwnsClient(req.user!.id, clientId)
  return clientId
}
