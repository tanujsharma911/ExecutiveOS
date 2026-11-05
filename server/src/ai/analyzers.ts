/**
 * Deterministic analysis functions over a client's reflection corpus.
 * These are exposed to LangChain/LangGraph as tools (see tools.ts).
 */
import type { Corpus, MetricPoint, Snippet } from './corpus.js'
import { BEHAVIOUR, INTENT, RESOLUTION, THEME_BY_KEY } from './lexicon.js'

const DAY = 86_400_000

export type InsightCategory = 'recurring' | 'emerging' | 'disappearing' | 'contradiction' | 'emotional' | 'unresolved' | 'commitment'
export type Confidence = 'High' | 'Medium' | 'Low'

export interface Evidence {
  quote: string
  date: string
  source: string
  submissionId?: string
}

export interface Insight {
  id: string
  category: InsightCategory
  title: string
  summary: string
  facts: string[]
  hypothesis?: string
  suggestedQuestion?: string
  confidence: Confidence
  confidenceScore: number
  evidence: Evidence[]
  themeKey?: string
  stats?: Record<string, string | number | string[]>
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })

function confidenceOf(score: number): Confidence {
  return score >= 0.75 ? 'High' : score >= 0.5 ? 'Medium' : 'Low'
}

function toEvidence(s: Snippet): Evidence {
  return { quote: s.text, date: s.date, source: `${s.formTitle} · ${s.question}`, submissionId: s.submissionId }
}

function pickEvidence(snips: Snippet[], n = 3): Evidence[] {
  // Prefer behaviour-laden sentences written as challenges, then spread them across time.
  const score = (s: Snippet) => Number(BEHAVIOUR.test(s.text)) + Number(/challenge|avoiding|drain/i.test(s.question))
  const max = Math.max(0, ...snips.map(score))
  const seen = new Set<string>()
  let pool: Snippet[] = []
  for (let level = max; level >= 0 && pool.length < n; level--) {
    for (const s of snips.filter((x) => score(x) === level).sort((a, b) => a.date.localeCompare(b.date))) {
      if (seen.has(s.submissionId)) continue
      seen.add(s.submissionId)
      pool.push(s)
    }
  }
  pool = pool.sort((a, b) => a.date.localeCompare(b.date))
  if (pool.length > n) {
    const top = pool.filter((s) => score(s) === max)
    const src = top.length >= n ? top : pool
    pool = Array.from({ length: n }, (_, i) => src[Math.round((i * (src.length - 1)) / (n - 1))])
  }
  return [...new Map(pool.map((s) => [s.submissionId, s])).values()].map(toEvidence)
}

function byTheme(corpus: Corpus) {
  const map = new Map<string, Snippet[]>()
  for (const s of corpus.snippets) for (const t of s.themes) map.set(t, [...(map.get(t) ?? []), s])
  return map
}

function distinctSubs(snips: Snippet[]) {
  return new Set(snips.map((s) => s.submissionId)).size
}

function relatedThemes(_corpus: Corpus, key: string, snips: Snippet[]): string[] {
  const co = new Map<string, number>()
  for (const s of snips) for (const t of s.themes) if (t !== key) co.set(t, (co.get(t) ?? 0) + 1)
  for (const r of THEME_BY_KEY.get(key)?.related ?? []) co.set(r, (co.get(r) ?? 0) + 0.5)
  return [...co.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => THEME_BY_KEY.get(k)?.label ?? k)
    .filter(Boolean)
}

/** A. Recurring patterns */
export function detectRecurringPatterns(corpus: Corpus): Insight[] {
  const out: Insight[] = []
  for (const [key, snips] of byTheme(corpus)) {
    const theme = THEME_BY_KEY.get(key)
    if (!theme) continue
    const mentions = distinctSubs(snips)
    if (mentions < 3) continue
    const first = snips[0].date
    const last = snips[snips.length - 1].date
    const weeks = Math.max(1, Math.round((Date.parse(last) - Date.parse(first)) / (7 * DAY)))
    const behaviourHits = snips.filter((s) => BEHAVIOUR.test(s.text)).length
    const weight = key === 'energy_wellbeing' ? 0.75 : 1
    const score = Math.min(0.95, (0.35 + mentions * 0.05 + Math.min(weeks, 8) * 0.03 + Math.min(behaviourHits, 4) * 0.03) * weight)
    out.push({
      id: `recurring:${key}`,
      category: 'recurring',
      themeKey: key,
      title: `${theme.label} pattern detected`,
      summary: `${theme.label} has appeared in ${mentions} reflections over ${weeks} week${weeks === 1 ? '' : 's'}.`,
      facts: [`First observed: ${fmt(first)}`, `Total mentions: ${mentions} reflections (${snips.length} statements)`, `Time period: ${weeks} weeks`, `Most recent: ${fmt(last)}`],
      hypothesis: theme.hypothesis,
      suggestedQuestion: theme.questions[0],
      confidence: confidenceOf(score),
      confidenceScore: Number(score.toFixed(2)),
      evidence: pickEvidence(snips, 3),
      stats: { firstObserved: first, lastObserved: last, mentions, weeks, rank: mentions + behaviourHits * 0.5, relatedThemes: relatedThemes(corpus, key, snips) },
    })
  }
  return out.sort((a, b) => Number(b.stats?.rank) - Number(a.stats?.rank))
}

/** B & C. Emerging and disappearing patterns */
export function detectTrendShifts(corpus: Corpus, recentDays = 21): { emerging: Insight[]; disappearing: Insight[]; dataGap?: string } {
  const now = Date.parse(corpus.now)
  const cutoff = now - recentDays * DAY
  const recentSubs = corpus.submissions.filter((s) => Date.parse(s.date) >= cutoff)
  const priorSubs = corpus.submissions.filter((s) => Date.parse(s.date) < cutoff)
  if (recentSubs.length < 3 || priorSubs.length < 3) {
    return {
      emerging: [],
      disappearing: [],
      dataGap: `Only ${recentSubs.length} reflection${recentSubs.length === 1 ? '' : 's'} in the last ${recentDays} days — not enough recent data to compare trends reliably.`,
    }
  }
  const emerging: Insight[] = []
  const disappearing: Insight[] = []
  for (const [key, snips] of byTheme(corpus)) {
    const theme = THEME_BY_KEY.get(key)
    if (!theme) continue
    const recent = snips.filter((s) => Date.parse(s.date) >= cutoff)
    const prior = snips.filter((s) => Date.parse(s.date) < cutoff)
    const rRate = distinctSubs(recent) / recentSubs.length
    const pRate = distinctSubs(prior) / priorSubs.length
    const rPct = Math.round(rRate * 100)
    const pPct = Math.round(pRate * 100)
    if (distinctSubs(recent) >= 2 && rRate >= Math.max(0.3, pRate * 1.6)) {
      const score = Math.min(0.9, 0.4 + (rRate - pRate) * 0.6 + distinctSubs(recent) * 0.04)
      emerging.push({
        id: `emerging:${key}`,
        category: 'emerging',
        themeKey: key,
        title: `${theme.label} is becoming more frequent`,
        summary: `Mentioned in ${rPct}% of reflections in the last ${recentDays} days, up from ${pPct}% before.`,
        facts: [`Recent window: ${distinctSubs(recent)} of ${recentSubs.length} reflections`, `Earlier: ${distinctSubs(prior)} of ${priorSubs.length} reflections`],
        hypothesis: `${theme.label} may be becoming a more central concern. Worth asking whether this is a new pressure or an existing one becoming visible.`,
        suggestedQuestion: theme.questions[1] ?? theme.questions[0],
        confidence: confidenceOf(score),
        confidenceScore: Number(score.toFixed(2)),
        evidence: pickEvidence(recent, 3),
        stats: { recentShare: rPct, priorShare: pPct },
      })
    } else if (distinctSubs(prior) >= 3 && rRate <= pRate * 0.35) {
      const score = Math.min(0.85, 0.4 + (pRate - rRate) * 0.6)
      disappearing.push({
        id: `disappearing:${key}`,
        category: 'disappearing',
        themeKey: key,
        title: `${theme.label} is appearing less often`,
        summary: `Mentioned in ${pPct}% of earlier reflections, ${rPct}% in the last ${recentDays} days.`,
        facts: [`Earlier: ${distinctSubs(prior)} of ${priorSubs.length} reflections`, `Recent window: ${distinctSubs(recent)} of ${recentSubs.length} reflections`, `Last mentioned: ${fmt(snips[snips.length - 1].date)}`],
        hypothesis: theme.fadingNote,
        suggestedQuestion: `What changed around ${theme.label.toLowerCase()} — and what would you want to keep doing?`,
        confidence: confidenceOf(score),
        confidenceScore: Number(score.toFixed(2)),
        evidence: pickEvidence(prior, 2),
        stats: { recentShare: rPct, priorShare: pPct },
      })
    }
  }
  return { emerging: emerging.sort((a, b) => b.confidenceScore - a.confidenceScore), disappearing: disappearing.sort((a, b) => b.confidenceScore - a.confidenceScore) }
}

const CONTRADICTION_QUESTIONS: Record<string, string> = {
  trust_control: 'What makes it difficult to let your team make decisions independently?',
  delegation: 'What happens in the moment you decide to take the work back?',
  team_ownership: 'What makes it difficult to let your team make decisions independently?',
  strategic_thinking: 'What pulled you away from the strategy time you planned to protect?',
  difficult_conversations: 'What would make this the week you actually have the conversation?',
  cto_relationship: 'What has stopped the conversation with your CTO from happening?',
}

/** D. Contradictions between stated intent and later behaviour */
export function detectContradictions(corpus: Corpus): Insight[] {
  const out: Insight[] = []
  const seenPairs = new Set<string>()
  for (const [key, snips] of byTheme(corpus)) {
    const theme = THEME_BY_KEY.get(key)
    if (!theme) continue
    const intents = snips.filter((s) => INTENT.test(s.text) && !BEHAVIOUR.test(s.text) && (/improve|next|focus|commit/i.test(s.question) || /^(i need to|i want to|i will|i'll|i should)\b/i.test(s.text)))
    if (!intents.length) continue
    const intent = intents.find((s) => /need to|want to|will|commit/i.test(s.text)) ?? intents[0]
    const later = snips.filter((s) => Date.parse(s.date) > Date.parse(intent.date) + 6 * DAY && BEHAVIOUR.test(s.text) && s.submissionId !== intent.submissionId)
    if (!later.length) continue
    const latest = later[later.length - 1]
    const pairKey = `${intent.text}|${latest.text}`
    if (seenPairs.has(pairKey)) continue
    seenPairs.add(pairKey)
    const repeats = distinctSubs(later)
    const explicit = /need to|want to|i will|commit/i.test(intent.text) ? 0.12 : 0
    const score = Math.min(0.92, 0.42 + Math.min(repeats, 4) * 0.07 + explicit)
    out.push({
      id: `contradiction:${key}`,
      category: 'contradiction',
      themeKey: key,
      title: `Stated intention vs. recent behaviour: ${theme.label.toLowerCase()}`,
      summary: `There may be a contradiction between ${corpus.firstName}'s stated desire and current behaviour around ${theme.label.toLowerCase()}.`,
      facts: [`Earlier (${fmt(intent.date)}): “${intent.text}”`, `Recent (${fmt(latest.date)}): “${latest.text}”`, `${repeats} later reflection${repeats === 1 ? " describes" : "s describe"} behaviour that runs against the stated intention`],
      hypothesis: 'The gap between intention and behaviour may point to something the client values more than the stated goal (e.g. certainty, quality, harmony). This is a prompt for exploration, not a judgement.',
      suggestedQuestion: CONTRADICTION_QUESTIONS[key] ?? theme.questions[0],
      confidence: confidenceOf(score),
      confidenceScore: Number(score.toFixed(2)),
      evidence: [toEvidence(intent), toEvidence(latest)],
      stats: { earlier: intent.date, recent: latest.date },
    })
  }
  return out.sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 3)
}

export interface MetricSeries {
  key: string
  label: string
  points: { date: string; value: number }[]
  first: number | null
  last: number | null
  peak: number | null
  min: number | null
  delta: number | null
  direction: 'up' | 'down' | 'flat' | 'unknown'
}

const METRIC_LABELS: Record<string, string> = {
  confidence: 'Leadership confidence',
  team: 'Team relationship',
  energy: 'Energy',
  stress: 'Stress',
  goalProgress: 'Goal progress',
}

export function buildSeries(metrics: MetricPoint[], key: keyof MetricPoint, weeklyOnly = true): MetricSeries {
  const pts = metrics
    .filter((m) => (!weeklyOnly || m.frequency === 'WEEKLY') && typeof m[key] === 'number')
    .map((m) => ({ date: m.date, value: m[key] as number }))
  const vals = pts.map((p) => p.value)
  const first = vals[0] ?? null
  const last = vals[vals.length - 1] ?? null
  const delta = first !== null && last !== null ? Number((last - first).toFixed(1)) : null
  const threshold = key === 'goalProgress' ? 5 : 0.6
  return {
    key: String(key),
    label: METRIC_LABELS[String(key)] ?? String(key),
    points: pts,
    first,
    last,
    peak: vals.length ? Math.max(...vals) : null,
    min: vals.length ? Math.min(...vals) : null,
    delta,
    direction: delta === null ? 'unknown' : delta > threshold ? 'up' : delta < -threshold ? 'down' : 'flat',
  }
}

const POSITIVE = new Set(['Motivated', 'Confident', 'Focused', 'Calm', 'Hopeful', 'Grateful'])

/** E. Emotional trends */
export function analyzeEmotionalTrends(corpus: Corpus): { series: MetricSeries[]; emotions: { early: Record<string, number>; recent: Record<string, number> }; insights: Insight[] } {
  const series = (['confidence', 'team', 'energy', 'stress', 'goalProgress'] as const).map((k) => buildSeries(corpus.metrics, k))
  const weekly = corpus.metrics.filter((m) => m.frequency === 'WEEKLY')
  const half = Math.floor(weekly.length / 2)
  const tally = (ms: MetricPoint[]) => ms.reduce<Record<string, number>>((acc, m) => (m.emotion ? { ...acc, [m.emotion]: (acc[m.emotion] ?? 0) + 1 } : acc), {})
  const emotions = { early: tally(weekly.slice(0, half)), recent: tally(weekly.slice(half)) }

  const insights: Insight[] = []
  for (const s of series) {
    if (s.delta === null || s.direction === 'flat' || s.key === 'goalProgress' || s.points.length < 4) continue
    const lowWeeks = s.key === 'stress' ? s.points.filter((p) => p.value >= (s.peak ?? 0) - 1) : s.points.filter((p) => p.value <= (s.min ?? 0) + 0.6)
    const lowSubs = new Set(weekly.filter((m) => lowWeeks.some((p) => p.date === m.date)).map((m) => m.submissionId))
    const themeCounts = new Map<string, number>()
    for (const sn of corpus.snippets) if (lowSubs.has(sn.submissionId)) for (const t of sn.themes) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1)
    const topThemes = [...themeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => THEME_BY_KEY.get(k)?.label ?? k)
    const bad = s.key === 'stress' ? s.direction === 'up' : s.direction === 'down'
    const evidenceSnips = corpus.snippets.filter((sn) => lowSubs.has(sn.submissionId) && /challenge|drain/i.test(sn.question))
    const score = Math.min(0.9, 0.55 + Math.abs(s.delta) * 0.08)
    insights.push({
      id: `emotional:${s.key}`,
      category: 'emotional',
      title: `${s.label} ${s.direction === 'up' ? 'increased' : 'decreased'} from ${s.first} to ${s.last}`,
      summary: `Self-reported ${s.label.toLowerCase()} moved ${s.direction === 'up' ? 'up' : 'down'} by ${Math.abs(s.delta)} points across ${s.points.length} weekly reflections.`,
      facts: [`First: ${s.first} (${fmt(s.points[0].date)})`, `Latest: ${s.last} (${fmt(s.points[s.points.length - 1].date)})`, `Range: ${s.min}–${s.peak}`],
      hypothesis: topThemes.length
        ? `Weeks with the ${s.key === 'stress' ? 'highest' : 'lowest'} ${s.label.toLowerCase()} most often mention ${topThemes.join(' and ')}. This is a correlation in self-reported data, not a cause.`
        : undefined,
      suggestedQuestion: bad ? `What has shifted for you since your ${s.label.toLowerCase()} was at ${s.key === 'stress' ? s.min : s.peak}?` : `What do you attribute the change in ${s.label.toLowerCase()} to?`,
      confidence: confidenceOf(score),
      confidenceScore: Number(score.toFixed(2)),
      evidence: pickEvidence(evidenceSnips, 2),
      stats: { metric: s.key, first: s.first ?? 0, last: s.last ?? 0 },
    })
  }
  const pos = (r: Record<string, number>) => Object.entries(r).reduce((a, [k, v]) => a + (POSITIVE.has(k) ? v : 0), 0)
  const tot = (r: Record<string, number>) => Object.values(r).reduce((a, v) => a + v, 0)
  if (tot(emotions.early) && tot(emotions.recent)) {
    const e = Math.round((pos(emotions.early) / tot(emotions.early)) * 100)
    const r = Math.round((pos(emotions.recent) / tot(emotions.recent)) * 100)
    if (Math.abs(e - r) >= 25) {
      insights.push({
        id: 'emotional:emotions',
        category: 'emotional',
        title: `Positive emotions ${r > e ? 'rose' : 'fell'} from ${e}% to ${r}% of weeks`,
        summary: 'Based on the emotion the client selected for each weekly reflection.',
        facts: [`Earlier weeks: ${Object.entries(emotions.early).map(([k, v]) => `${k} ×${v}`).join(', ')}`, `Recent weeks: ${Object.entries(emotions.recent).map(([k, v]) => `${k} ×${v}`).join(', ')}`],
        confidence: 'Medium',
        confidenceScore: 0.6,
        evidence: [],
      })
    }
  }
  return { series, emotions, insights }
}

/** F. Unresolved issues */
export function findUnresolvedIssues(corpus: Corpus): Insight[] {
  const out: Insight[] = []
  const lastSubs = corpus.submissions.filter((s) => s.frequency === 'WEEKLY').slice(-3).map((s) => s.id)
  for (const [key, snips] of byTheme(corpus)) {
    const theme = THEME_BY_KEY.get(key)
    if (!theme) continue
    const problem = snips.filter((s) => /challenge|avoiding|drain/i.test(s.question))
    const weeks = distinctSubs(problem)
    if (weeks < 3) continue
    if (!problem.some((s) => lastSubs.includes(s.submissionId))) continue
    const lastProblem = problem[problem.length - 1]
    const resolvedAfter = snips.some((s) => Date.parse(s.date) > Date.parse(lastProblem.date) && RESOLUTION.test(s.text))
    if (resolvedAfter) continue
    const score = Math.min(0.9, 0.45 + weeks * 0.07)
    out.push({
      id: `unresolved:${key}`,
      category: 'unresolved',
      themeKey: key,
      title: `${theme.label} raised repeatedly, not yet resolved`,
      summary: `Raised as a challenge or avoided decision in ${weeks} reflections, including the most recent ones, with no sign of resolution.`,
      facts: [`First raised: ${fmt(problem[0].date)}`, `Latest: ${fmt(lastProblem.date)}`, `Appears in “challenge”, “avoiding” or “energy drain” answers ${problem.length} times`],
      hypothesis: theme.hypothesis,
      suggestedQuestion: theme.questions[theme.questions.length - 1],
      confidence: confidenceOf(score),
      confidenceScore: Number(score.toFixed(2)),
      evidence: pickEvidence(problem, 3),
    })
  }
  return out.sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 4)
}

/** Commitment analysis: repeated incomplete commitments by theme */
export function analyzeCommitments(corpus: Corpus): { insights: Insight[]; summary: { total: number; completed: number; incomplete: number; overdue: number; completionRate: number } } {
  const now = Date.parse(corpus.now)
  const cms = corpus.commitments
  const completed = cms.filter((c) => c.status === 'COMPLETED').length
  const overdue = cms.filter((c) => c.status !== 'COMPLETED' && c.dueDate.getTime() < now).length
  const insights: Insight[] = []
  const themes = new Set(cms.map((c) => c.theme).filter(Boolean) as string[])
  for (const key of themes) {
    const list = cms.filter((c) => c.theme === key).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    let streak = 0
    for (const c of list) {
      if (c.status === 'COMPLETED') break
      streak++
    }
    if (streak < 2) continue
    const theme = THEME_BY_KEY.get(key)
    const label = theme?.label.toLowerCase() ?? key
    const ordinal = ['', 'first', 'second', 'third', 'fourth', 'fifth'][streak] ?? `${streak}th`
    const recentFirst = list.slice(0, streak)
    insights.push({
      id: `commitment:${key}`,
      category: 'commitment',
      themeKey: key,
      title: `${streak} consecutive ${label} commitments incomplete`,
      summary: `This is the ${ordinal} consecutive commitment related to ${label} that remains incomplete.`,
      facts: recentFirst.map((c) => `${c.title} — ${c.status.replace(/_/g, ' ').toLowerCase()}${c.dueDate.getTime() < now ? ' (overdue)' : ''}`),
      hypothesis: 'Repeated incomplete commitments on the same theme may signal that the commitment is addressing the symptom rather than what is making the step difficult.',
      suggestedQuestion: 'What is preventing you from taking this step?',
      confidence: streak >= 3 ? 'High' : 'Medium',
      confidenceScore: streak >= 3 ? 0.85 : 0.65,
      evidence: recentFirst
        .flatMap((c) => c.updates.filter((u) => u.authorRole === 'CLIENT').slice(-1).map((u) => ({ quote: u.note, date: u.createdAt.toISOString(), source: `Commitment update · ${c.title}` })))
        .slice(0, 3),
    })
  }
  return {
    insights,
    summary: { total: cms.length, completed, incomplete: cms.length - completed, overdue, completionRate: cms.length ? Math.round((completed / cms.length) * 100) : 0 },
  }
}

export interface CoachingOpportunity {
  question: string
  rationale: string
  insightId: string
  category: InsightCategory
}

/** G. Coaching opportunities */
export function generateCoachingQuestions(insights: Insight[], limit = 6): CoachingOpportunity[] {
  const priority: InsightCategory[] = ['contradiction', 'commitment', 'recurring', 'unresolved', 'emotional', 'emerging', 'disappearing']
  const seen = new Set<string>()
  const out: CoachingOpportunity[] = []
  for (const cat of priority) {
    for (const i of insights.filter((x) => x.category === cat)) {
      if (!i.suggestedQuestion || seen.has(i.suggestedQuestion)) continue
      seen.add(i.suggestedQuestion)
      out.push({ question: i.suggestedQuestion, rationale: i.summary, insightId: i.id, category: i.category })
      if (out.length >= limit) return out
    }
  }
  return out
}
