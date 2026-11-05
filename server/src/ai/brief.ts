/**
 * AI Session Preparation — a LangGraph StateGraph that assembles a coaching brief.
 *
 *   START → analyze → [snapshot, explore, commitments, context] → compose → END
 */
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { prisma } from '../db.js'
import type { Evidence, Insight } from './analyzers.js'
import { getCorpus } from './corpus.js'
import { runIntelligence, type IntelligenceReport } from './intelligence.js'
import { THEME_BY_KEY } from './lexicon.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('ai')

export interface BriefItem {
  key: string
  text: string
  detail?: string
  evidence: Evidence[]
  confidence?: string
  insightId?: string
}

export interface SessionBrief {
  sessionId: string
  generatedAt: string
  model: string
  snapshot: { emotionalState: string; progress: string[]; lastSessionAt: string | null }
  explore: BriefItem[]
  questions: BriefItem[]
  commitments: { completed: any[]; incomplete: any[]; overdue: any[] }
  context: BriefItem[]
  graph: string[]
}

const BriefState = Annotation.Root({
  sessionId: Annotation<string>,
  clientId: Annotation<string>,
  report: Annotation<IntelligenceReport | null>({ reducer: (_a, b) => b, default: () => null }),
  snapshot: Annotation<SessionBrief['snapshot'] | null>({ reducer: (_a, b) => b, default: () => null }),
  explore: Annotation<BriefItem[]>({ reducer: (_a, b) => b, default: () => [] }),
  questions: Annotation<BriefItem[]>({ reducer: (_a, b) => b, default: () => [] }),
  commitments: Annotation<SessionBrief['commitments'] | null>({ reducer: (_a, b) => b, default: () => null }),
  context: Annotation<BriefItem[]>({ reducer: (_a, b) => b, default: () => [] }),
  visited: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
})

type S = typeof BriefState.State
const fmt = (iso: string | Date) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

async function analyze(state: S): Promise<Partial<S>> {
  const report = await runIntelligence(state.clientId)
  return { report, visited: ['analyze'] }
}

async function snapshot(state: S): Promise<Partial<S>> {
  const r = state.report!
  const client = await prisma.clientProfile.findUniqueOrThrow({ where: { id: state.clientId } })
  const lastSession = await prisma.session.findFirst({ where: { clientId: state.clientId, status: 'COMPLETED' }, orderBy: { scheduledAt: 'desc' } })
  const corpus = await getCorpus(state.clientId)
  const since = lastSession?.scheduledAt.toISOString() ?? corpus.submissions[0]?.date ?? new Date().toISOString()
  const weeklyRecent = corpus.metrics.filter((m) => m.frequency === 'WEEKLY').slice(-3)
  const emos = weeklyRecent.map((m) => m.emotion).filter(Boolean)
  const conf = r.emotional.series.find((s) => s.key === 'confidence')
  const stress = r.emotional.series.find((s) => s.key === 'stress')
  const newSubs = corpus.submissions.filter((s) => s.date > since).length
  const cmUpdates = corpus.commitments.flatMap((c) => c.updates.filter((u) => u.createdAt.toISOString() > since && u.authorRole === 'CLIENT').map((u) => ({ c, u })))
  const progress: string[] = [
    `${newSubs} reflection${newSubs === 1 ? '' : 's'} submitted since ${lastSession ? `the last session (${fmt(since)})` : 'the start of coaching'}.`,
  ]
  for (const { c, u } of cmUpdates.slice(-3)) progress.push(`“${c.title}” → ${u.status.replace(/_/g, ' ').toLowerCase()}: ${u.note}`)
  if (r.dataGap) progress.push(r.dataGap)
  return {
    snapshot: {
      emotionalState: emos.length
        ? `Recent weeks: ${emos.join(' → ')}. Confidence ${conf?.last ?? '—'}/10${conf?.delta ? ` (${conf.delta > 0 ? '+' : ''}${conf.delta} since start)` : ''}, stress ${stress?.last ?? '—'}/10.`
        : 'No recent emotional data.',
      progress,
      lastSessionAt: lastSession?.scheduledAt.toISOString() ?? null,
    },
    visited: ['snapshot'],
  }
}

async function explore(state: S): Promise<Partial<S>> {
  const r = state.report!
  const corpus = await getCorpus(state.clientId)
  const lastSeven = corpus.submissions.filter((s) => s.frequency === 'WEEKLY').slice(-7).map((s) => s.id)
  const items: BriefItem[] = []
  const top = r.recurring[0]
  if (top?.themeKey) {
    const inLast = new Set(corpus.snippets.filter((s) => lastSeven.includes(s.submissionId) && s.themes.includes(top.themeKey!)).map((s) => s.submissionId)).size
    items.push({ key: top.id, insightId: top.id, text: `${THEME_BY_KEY.get(top.themeKey)?.label} appeared in ${inLast} of the last ${lastSeven.length} weekly reflections.`, detail: top.hypothesis, evidence: top.evidence.slice(-2), confidence: top.confidence })
  }
  const emo = r.emotional.insights.find((i) => i.id === 'emotional:confidence') ?? r.emotional.insights[0]
  if (emo) items.push({ key: emo.id, insightId: emo.id, text: emo.title + '.', detail: emo.hypothesis, evidence: emo.evidence, confidence: emo.confidence })
  const third: Insight | undefined = r.emerging[0] ?? r.unresolved.find((u) => u.themeKey !== top?.themeKey) ?? r.contradictions[0]
  if (third) {
    const label = third.themeKey ? THEME_BY_KEY.get(third.themeKey)?.label : undefined
    const text = third.category === 'emerging' ? `${label} is coming up more often in recent reflections.` : third.category === 'unresolved' ? `${corpus.firstName} repeatedly mentioned ${label?.toLowerCase()} without resolution.` : third.summary
    items.push({ key: third.id, insightId: third.id, text, detail: third.hypothesis, evidence: third.evidence.slice(-2), confidence: third.confidence })
  }
  const questions: BriefItem[] = r.opportunities.slice(0, 5).map((o) => ({ key: `question:${o.insightId}`, insightId: o.insightId, text: o.question, detail: o.rationale, evidence: [] }))
  return { explore: items, questions, visited: ['explore'] }
}

async function commitments(state: S): Promise<Partial<S>> {
  const now = Date.now()
  const list = await prisma.commitment.findMany({ where: { clientId: state.clientId }, orderBy: { dueDate: 'asc' }, include: { updates: { orderBy: { createdAt: 'desc' }, take: 1 } } })
  return {
    commitments: {
      completed: list.filter((c) => c.status === 'COMPLETED'),
      overdue: list.filter((c) => c.status !== 'COMPLETED' && c.dueDate.getTime() < now),
      incomplete: list.filter((c) => c.status !== 'COMPLETED' && c.dueDate.getTime() >= now),
    },
    visited: ['commitments'],
  }
}

async function context(state: S): Promise<Partial<S>> {
  const r = state.report!
  const corpus = await getCorpus(state.clientId)
  const items: BriefItem[] = []
  const c = r.contradictions[0]
  if (c) items.push({ key: `ctx:${c.id}`, text: 'Earlier statement worth revisiting', detail: 'Stated intention that later behaviour may contradict.', evidence: [c.evidence[0]] })
  const top = r.recurring[0]
  if (top?.themeKey) {
    const first = corpus.snippets.find((s) => s.themes.includes(top.themeKey!))
    if (first) items.push({ key: 'ctx:first', text: `First time ${THEME_BY_KEY.get(top.themeKey)?.label.toLowerCase()} came up`, evidence: [{ quote: first.text, date: first.date, source: `${first.formTitle} · ${first.question}` }] })
  }
  const lessons = corpus.snippets.filter((s) => s.frequency === 'MONTHLY' && /lesson|pattern/i.test(s.question)).slice(-2)
  if (lessons.length) items.push({ key: 'ctx:monthly', text: 'In their own words (monthly reviews)', evidence: lessons.map((s) => ({ quote: s.text, date: s.date, source: `${s.formTitle} · ${s.question}` })) })
  const avoided = corpus.snippets.filter((s) => /avoiding/i.test(s.question)).slice(-1)
  if (avoided.length) items.push({ key: 'ctx:avoided', text: 'Most recent avoided decision', evidence: avoided.map((s) => ({ quote: s.text, date: s.date, source: `${s.formTitle} · ${s.question}` })) })
  return { context: items, visited: ['context'] }
}

async function compose(state: S): Promise<Partial<S>> {
  return { visited: ['compose'] }
}

const graph = new StateGraph(BriefState)
  .addNode('analyze', analyze)
  .addNode('snapshotNode', snapshot)
  .addNode('exploreNode', explore)
  .addNode('commitmentsNode', commitments)
  .addNode('contextNode', context)
  .addNode('compose', compose)
  .addEdge(START, 'analyze')
  .addEdge('analyze', 'snapshotNode')
  .addEdge('analyze', 'exploreNode')
  .addEdge('analyze', 'commitmentsNode')
  .addEdge('analyze', 'contextNode')
  .addEdge(['snapshotNode', 'exploreNode', 'commitmentsNode', 'contextNode'], 'compose')
  .addEdge('compose', END)
  .compile()

export async function buildSessionBrief(sessionId: string): Promise<SessionBrief> {
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })
  const t0 = Date.now()
  log.info('Session brief graph started', { sessionId, clientId: session.clientId })
  const out = await graph.invoke({ sessionId, clientId: session.clientId }, { runName: 'session-brief' })
  log.info('Session brief graph finished', { sessionId, nodes: out.visited.join('→'), ms: Date.now() - t0 })
  return {
    sessionId,
    generatedAt: new Date().toISOString(),
    model: out.report?.model ?? 'deterministic-analyst-v1',
    snapshot: out.snapshot!,
    explore: out.explore,
    questions: out.questions,
    commitments: out.commitments!,
    context: out.context,
    graph: out.visited,
  }
}
