/**
 * Minimal structured logger (no dependencies).
 *
 * LOG_LEVEL  = debug | info | warn | error   (default: info)
 * LOG_FORMAT = pretty | json                 (default: pretty in dev, json when NODE_ENV=production)
 *
 * Every line carries the current request id (via AsyncLocalStorage) so API
 * requests and the LLM / tool calls they trigger can be correlated.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LogContext {
  requestId: string
  userId?: string
  role?: string
}

export const logContext = new AsyncLocalStorage<LogContext>()

const minLevel = (): number => ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? ORDER.info
const json = () => (process.env.LOG_FORMAT ?? (process.env.NODE_ENV === 'production' ? 'json' : 'pretty')) === 'json'

const COLORS: Record<Level, string> = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' }
const SCOPE_COLOR = '\x1b[35m'
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
/** Bold bright green — used for values passed through highlight(), e.g. LLM response times. */
const HIGHLIGHT = '\x1b[1;92m'

/**
 * A log field value that pretty logs print in the highlight colour.
 * JSON logs get the raw `value`; pretty logs show `text`.
 */
export class Highlight {
  constructor(
    readonly value: unknown,
    readonly text: string,
  ) {}
  toJSON() {
    return this.value
  }
}
export const highlight = (value: unknown, text = String(value)) => new Highlight(value, text)

/** 842 → "842ms", 2410 → "2.41s" */
export const fmtDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`)

function fmtValue(v: unknown): string {
  if (v === undefined) return ''
  if (typeof v === 'string') return /\s/.test(v) ? JSON.stringify(v) : v
  return JSON.stringify(v)
}

function write(level: Level, scope: string, msg: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < minLevel()) return
  const ctx = logContext.getStore()
  const entry: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(ctx?.requestId ? { reqId: ctx.requestId } : {}),
    ...fields,
  }
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout
  if (json()) {
    out.write(JSON.stringify(entry, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v)) + '\n')
    return
  }
  const { time, level: _l, scope: _s, msg: _m, ...rest } = entry
  const err = Object.values(rest).find((v): v is Error => v instanceof Error)
  const kv = Object.entries(rest)
    .filter(([, v]) => v !== undefined && !(v instanceof Error))
    .map(([k, v]) => (v instanceof Highlight ? `${HIGHLIGHT}${k}=${v.text}${RESET}` : `${DIM}${k}=${RESET}${fmtValue(v)}`))
    .join(' ')
  out.write(`${DIM}${String(time).slice(11, 23)}${RESET} ${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET} ${SCOPE_COLOR}[${scope}]${RESET} ${msg}${kv ? ' ' + kv : ''}\n`)
  if (err?.stack && level === 'error') out.write(`${DIM}${err.stack}${RESET}\n`)
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, fields?: Record<string, unknown>) => write('debug', scope, msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) => write('info', scope, msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => write('warn', scope, msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => write('error', scope, msg, fields),
  }
}

export type Logger = ReturnType<typeof createLogger>
