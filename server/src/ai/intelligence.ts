/**
 * AI Coaching Intelligence — a LangChain agent (createAgent) that studies a
 * client's reflections by calling analysis tools, then writes a briefing.
 */
import { ToolMessage } from '@langchain/core/messages'
import { createAgent } from 'langchain'
import {
  generateCoachingQuestions,
  type CoachingOpportunity,
  type Insight,
  type MetricSeries,
  analyzeCommitments,
} from './analyzers.js'
import { createHash } from 'node:crypto'
import { prisma } from '../db.js'
import { getCorpus, invalidateCorpus } from './corpus.js'
import { AiUnavailableError, aiMode, aiModelName, deterministicFallback, DeterministicAnalystModel, getAgentModel, unavailable } from './model.js'
import { createLogger } from '../lib/logger.js'
import { llmCallbacks } from './llmLogger.js'
import { ANALYSIS_TOOL_NAMES, buildAnalysisTools, type TraceEntry } from './tools.js'

export interface IntelligenceReport {
  clientId: string
  clientName: string
  firstName: string
  generatedAt: string
  mode: string
  model: string
  narrative: string
  overview: { reflections: number; weekly: number; firstReflection: string | null; lastReflection: string | null; lastWeeklyAt: string | null; statements: number }
  recurring: Insight[]
  emerging: Insight[]
  disappearing: Insight[]
  contradictions: Insight[]
  emotional: { series: MetricSeries[]; emotions: { early: Record<string, number>; recent: Record<string, number> }; insights: Insight[] }
  unresolved: Insight[]
  commitments: ReturnType<typeof analyzeCommitments>
  opportunities: CoachingOpportunity[]
  dataGap?: string
  trace: TraceEntry[]
}

const SYSTEM_PROMPT = `You are a research assistant for an executive coach. You study a client's written reflections and commitments.
Always call every analysis tool for the given clientId before answering.
Then write a 4–6 sentence briefing for the coach:
- Lead with the strongest evidence-backed pattern.
- Distinguish observed facts (counts, dates, quotes) from hypotheses, and phrase hypotheses tentatively ("may", "might").
- Never present psychological diagnoses as facts. You assist the coach; you do not replace their judgement.`

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—')

function deterministicNarrative(results: Map<string, any>): string {
  const ov = results.get('get_reflection_overview')
  const rec: Insight[] = results.get('detect_recurring_patterns') ?? []
  const con: Insight[] = results.get('detect_contradictions') ?? []
  const emo = results.get('analyze_emotional_trends')
  const cm = results.get('analyze_commitments')
  const shifts = results.get('detect_trend_shifts')
  const parts: string[] = []
  parts.push(`I reviewed ${ov?.reflections ?? 0} reflections (${ov?.statements ?? 0} statements) submitted between ${fmt(ov?.firstReflection)} and ${fmt(ov?.lastReflection)}.`)
  if (rec[0]) parts.push(`The strongest signal is ${rec[0].title.replace(' pattern detected', '').toLowerCase()}: it appears in ${rec[0].stats?.mentions} reflections over ${rec[0].stats?.weeks} weeks.`)
  const conf = (emo?.series as MetricSeries[] | undefined)?.find((s) => s.key === 'confidence')
  if (conf && conf.direction !== 'flat' && conf.first !== null) parts.push(`Self-reported leadership confidence moved from ${conf.first} to ${conf.last}.`)
  if (con[0]) parts.push(`There may be a gap between a stated intention and recent behaviour (${con[0].title.split(': ')[1]}) — worth exploring rather than concluding.`)
  if (cm?.insights?.[0]) parts.push(cm.insights[0].summary)
  if (shifts?.dataGap) parts.push(shifts.dataGap)
  else if (shifts?.emerging?.[0]) parts.push(`${shifts.emerging[0].title}.`)
  return parts.join(' ')
}

const log = createLogger('ai')

/** In-memory copy of the saved report, keyed by client, valid while the fingerprint matches. */
const memoryCache = new Map<string, { fingerprint: string; report: IntelligenceReport }>()
/** Analyses currently running, keyed by `clientId:fingerprint`. Concurrent requests share one run. */
const inFlight = new Map<string, Promise<IntelligenceReport>>()

/** Drops the in-memory copy. The saved report is ignored automatically once the data changes. */
export function invalidateReport(clientId: string) {
  memoryCache.delete(clientId)
  analysisCache.delete(clientId)
}

/**
 * Everything the report depends on: submitted reflections, commitments and their updates,
 * the day (trend windows and "overdue" are date-relative) and the configured model chain.
 */
async function reportFingerprint(clientId: string): Promise<string> {
  const [subs, cms, updates] = await Promise.all([
    prisma.submission.aggregate({ where: { clientId, status: 'SUBMITTED' }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.commitment.aggregate({ where: { clientId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.commitmentUpdate.aggregate({ where: { commitment: { clientId } }, _count: { _all: true }, _max: { createdAt: true } }),
  ])
  const parts = [
    `s${subs._count._all}@${subs._max.updatedAt?.toISOString() ?? '-'}`,
    `c${cms._count._all}@${cms._max.updatedAt?.toISOString() ?? '-'}`,
    `u${updates._count._all}@${updates._max.createdAt?.toISOString() ?? '-'}`,
    new Date().toISOString().slice(0, 10),
    aiModelName(),
  ]
  return createHash('sha1').update(parts.join('|')).digest('hex')
}

/**
 * Like runIntelligence, but returns `{ report: null, error }` instead of throwing when AI is unavailable,
 * so pages that only *use* insights (dashboard alerts, growth timeline, suggestions) keep working.
 */
export async function tryRunIntelligence(clientId: string, opts: { fresh?: boolean } = {}): Promise<{ report: IntelligenceReport | null; error?: string }> {
  try {
    return { report: await runIntelligence(clientId, opts) }
  } catch (e) {
    if (e instanceof AiUnavailableError) return { report: null, error: e.message }
    throw e
  }
}

/**
 * Returns the client's intelligence report.
 * 1. Saved report (memory, then database) while the client's data is unchanged — no LLM call.
 * 2. If an identical analysis is already running, wait for it instead of starting another.
 * 3. Otherwise run the analysis and save it.
 * `fresh: true` skips step 1 (e.g. "Re-run analysis") but still joins a run in progress.
 */
export async function runIntelligence(clientId: string, opts: { fresh?: boolean } = {}): Promise<IntelligenceReport> {
  const fingerprint = await reportFingerprint(clientId)

  if (!opts.fresh) {
    const mem = memoryCache.get(clientId)
    if (mem?.fingerprint === fingerprint) return mem.report
    const saved = await prisma.aiReport.findUnique({ where: { clientId } })
    if (saved?.fingerprint === fingerprint) {
      const report = saved.report as unknown as IntelligenceReport
      memoryCache.set(clientId, { fingerprint, report })
      log.debug('Intelligence report served from saved copy', { clientId, generatedAt: saved.generatedAt.toISOString() })
      return report
    }
  }

  const key = `${clientId}:${fingerprint}`
  const running = inFlight.get(key)
  if (running) {
    log.info('Joining analysis already in progress', { clientId })
    return running
  }

  const run = computeReport(clientId)
    .then(async (report) => {
      // Don't keep a fallback answer when an LLM is configured — retry the LLM next time instead.
      const isFallback = aiMode() === 'llm' && report.model.startsWith('deterministic')
      if (!isFallback) {
        memoryCache.set(clientId, { fingerprint, report })
        await prisma.aiReport.upsert({
          where: { clientId },
          create: { clientId, fingerprint, model: report.model, report: report as unknown as object },
          update: { fingerprint, model: report.model, report: report as unknown as object, generatedAt: new Date() },
        })
      }
      return report
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, run)
  return run
}

type Corpus = Awaited<ReturnType<typeof getCorpus>>

/** Builds the report from the analysis tools' results. Everything except `narrative` is computed by code. */
function assembleReport(clientId: string, corpus: Corpus, results: Map<string, any>, meta: { mode: string; model: string; narrative: string; trace: TraceEntry[] }): IntelligenceReport {
  const recurring: Insight[] = results.get('detect_recurring_patterns')
  const shifts = results.get('detect_trend_shifts')
  const contradictions: Insight[] = results.get('detect_contradictions')
  const emotional = results.get('analyze_emotional_trends')
  const unresolved: Insight[] = results.get('find_unresolved_issues')
  const commitments = results.get('analyze_commitments')
  const all = [...recurring, ...shifts.emerging, ...shifts.disappearing, ...contradictions, ...emotional.insights, ...unresolved, ...commitments.insights]

  return {
    clientId,
    clientName: corpus.clientName,
    firstName: corpus.firstName,
    generatedAt: new Date().toISOString(),
    mode: meta.mode,
    model: meta.model,
    narrative: meta.narrative,
    overview: results.get('get_reflection_overview'),
    recurring,
    emerging: shifts.emerging,
    disappearing: shifts.disappearing,
    contradictions,
    emotional,
    unresolved,
    commitments,
    opportunities: generateCoachingQuestions(all),
    dataGap: shifts.dataGap,
    trace: meta.trace,
  }
}

/** Fast analysis (tools only, no LLM), keyed by client and valid while the data fingerprint matches. */
const analysisCache = new Map<string, { fingerprint: string; report: IntelligenceReport }>()

/**
 * The client's insights without waiting for an LLM: patterns, trends, contradictions, commitments and
 * coaching questions are all computed by the analysis tools from the client's own words, in milliseconds.
 * If the full AI report for the current data already exists it is returned (with its narrative);
 * otherwise `narrative` is empty and `model` is "analysis-tools" — fetch runIntelligence for the AI briefing.
 */
export async function runAnalysis(clientId: string): Promise<IntelligenceReport> {
  const fingerprint = await reportFingerprint(clientId)
  const full = memoryCache.get(clientId)
  if (full?.fingerprint === fingerprint) return full.report
  const cached = analysisCache.get(clientId)
  if (cached?.fingerprint === fingerprint) return cached.report

  const startedAt = Date.now()
  invalidateCorpus(clientId)
  const corpus = await getCorpus(clientId)
  const trace: TraceEntry[] = []
  const results = new Map<string, any>()
  for (const t of buildAnalysisTools(trace)) results.set(t.name, JSON.parse(await t.invoke({ clientId })))
  const report = assembleReport(clientId, corpus, results, { mode: aiMode(), model: 'analysis-tools', narrative: '', trace })
  analysisCache.set(clientId, { fingerprint, report })
  log.debug('Fast analysis computed (no LLM)', { clientId, ms: Date.now() - startedAt })
  return report
}

async function computeReport(clientId: string): Promise<IntelligenceReport> {
  const startedAt = Date.now()
  invalidateCorpus(clientId) // analyse the current data, not a cached snapshot
  const corpus = await getCorpus(clientId)
  log.info('Intelligence analysis started', { clientId, mode: aiMode(), reflections: corpus.submissions.length })
  const trace: TraceEntry[] = []
  const tools = buildAnalysisTools(trace)
  const mode = aiMode()

  const deterministic = () =>
    new DeterministicAnalystModel({
      plan: ANALYSIS_TOOL_NAMES.map((name) => ({ name, args: { clientId } })),
      finalize: (res) => deterministicNarrative(new Map(res.map((r) => [r.name, JSON.parse(r.content)]))),
    })
  const input = { messages: [{ role: 'user' as const, content: `Analyze coaching client ${corpus.clientName} (clientId: ${clientId}) and brief me before our next session.` }] }

  let out
  let servedBy = aiModelName()
  if (mode === 'unavailable') unavailable('no GOOGLE_API_KEY or GROQ_API_KEY is set and DETERMINISTIC_FALLBACK is false.')
  if (mode === 'llm') {
    // Gemini primary; modelFallbackMiddleware retries the model call on Groq.
    const { model, middleware } = getAgentModel()
    try {
      out = await createAgent({ model, tools, systemPrompt: SYSTEM_PROMPT, middleware }).invoke(input, { recursionLimit: 20, callbacks: llmCallbacks('intelligence'), runName: 'intelligence' })
    } catch (e) {
      if (!deterministicFallback()) {
        log.error('Gemini and Groq both failed; deterministic fallback is disabled', { clientId, error: (e as Error).message })
        unavailable('Gemini and Groq both failed to analyze this client. Try again shortly.')
      }
      log.warn('Gemini and Groq both failed; using the deterministic analyst', { clientId, error: (e as Error).message })
      trace.length = 0
      servedBy = 'deterministic-analyst-v1 (LLM unavailable)'
    }
  }
  if (!out) out = await createAgent({ model: deterministic(), tools, systemPrompt: SYSTEM_PROMPT }).invoke(input, { recursionLimit: 20, callbacks: llmCallbacks('intelligence'), runName: 'intelligence' })

  const results = new Map<string, any>()
  for (const m of out.messages) {
    if (ToolMessage.isInstance(m) && m.name) {
      try {
        results.set(m.name, JSON.parse(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      } catch {
        /* ignore malformed tool output */
      }
    }
  }
  // Guarantee completeness: if an LLM skipped a tool, run it directly.
  for (const t of tools) {
    if (!results.has(t.name)) results.set(t.name, JSON.parse(await t.invoke({ clientId })))
  }

  const last = out.messages[out.messages.length - 1]
  const narrative = typeof last?.content === 'string' && last.content.trim() ? last.content : deterministicNarrative(results)

  const report = assembleReport(clientId, corpus, results, { mode, model: servedBy, narrative, trace })
  log.info('Intelligence analysis finished', { clientId, servedBy, ms: Date.now() - startedAt, toolCalls: trace.length, insights: report.opportunities.length })
  return report
}
