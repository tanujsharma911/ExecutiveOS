/** Express middleware: assigns a request id and logs every API request on completion. */
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { createLogger, logContext } from './logger.js'

const log = createLogger('api')

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || randomUUID().slice(0, 8)
  const ctx = { requestId } as { requestId: string; userId?: string; role?: string }
  res.setHeader('X-Request-Id', requestId)
  const start = process.hrtime.bigint()

  res.on('finish', () => {
    const durationMs = Number((process.hrtime.bigint() - start) / 1_000_000n)
    const fields = {
      reqId: requestId,
      status: res.statusCode,
      ms: durationMs,
      user: req.user ? `${req.user.role.toLowerCase()}:${req.user.id}` : undefined,
      // Bodies are never logged: reflections and notes are confidential.
      query: Object.keys(req.query).length ? Object.keys(req.query).join(',') : undefined,
      error: res.locals.errorMessage as string | undefined,
    }
    const line = `${req.method} ${req.originalUrl.split('?')[0]}`
    if (res.statusCode >= 500) log.error(line, fields)
    else if (res.statusCode >= 400) log.warn(line, fields)
    else log.info(line, fields)
  })

  logContext.run(ctx, next)
}

/** Call after authentication so later log lines include the user. */
export function attachUserToLogContext(req: Request) {
  const ctx = logContext.getStore()
  if (ctx && req.user) {
    ctx.userId = req.user.id
    ctx.role = req.user.role
  }
}
