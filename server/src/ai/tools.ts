import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
  analyzeCommitments,
  analyzeEmotionalTrends,
  detectContradictions,
  detectRecurringPatterns,
  detectTrendShifts,
  findUnresolvedIssues,
} from './analyzers.js'
import { getCorpus } from './corpus.js'

export interface TraceEntry {
  tool: string
  args: Record<string, unknown>
  durationMs: number
  summary: string
}

const clientArg = z.object({ clientId: z.string().describe('The ClientProfile id of the coaching client to analyze') })

/**
 * Builds the analysis toolset for one agent run. Each tool records a trace
 * entry so the UI can show exactly which analyses produced each insight.
 */
export function buildAnalysisTools(trace: TraceEntry[]) {
  const wrap = <T>(name: string, fn: (clientId: string) => Promise<T>, summarize: (r: T) => string) =>
    async ({ clientId }: { clientId: string }) => {
      const t0 = performance.now()
      const result = await fn(clientId)
      trace.push({ tool: name, args: { clientId }, durationMs: Math.round(performance.now() - t0), summary: summarize(result) })
      return JSON.stringify(result)
    }

  return [
    tool(
      wrap('get_reflection_overview', async (id) => {
        const c = await getCorpus(id)
        return {
          client: c.clientName,
          reflections: c.submissions.length,
          weekly: c.submissions.filter((s) => s.frequency === 'WEEKLY').length,
          firstReflection: c.submissions[0]?.date ?? null,
          lastReflection: c.submissions[c.submissions.length - 1]?.date ?? null,
          lastWeeklyAt: c.lastWeeklyAt,
          statements: c.snippets.length,
        }
      }, (r) => `${r.reflections} reflections, ${r.statements} statements indexed`),
      {
        name: 'get_reflection_overview',
        description: 'Get a summary of how many reflections a client has submitted, over what date range, and when the last weekly reflection was submitted.',
        schema: clientArg,
      },
    ),
    tool(
      wrap('detect_recurring_patterns', async (id) => detectRecurringPatterns(await getCorpus(id)), (r) => `${r.length} recurring patterns`),
      {
        name: 'detect_recurring_patterns',
        description: 'Find themes (e.g. delegation, trust, board pressure) that recur across a client’s reflections, with first-observed date, mention counts, related themes and verbatim evidence.',
        schema: clientArg,
      },
    ),
    tool(
      wrap('detect_trend_shifts', async (id) => detectTrendShifts(await getCorpus(id)), (r) => `${r.emerging.length} emerging, ${r.disappearing.length} disappearing${r.dataGap ? ' (data gap)' : ''}`),
      {
        name: 'detect_trend_shifts',
        description: 'Compare the last 21 days of reflections with earlier ones to find emerging themes (becoming more frequent) and disappearing themes (fading).',
        schema: clientArg,
      },
    ),
    tool(
      wrap('detect_contradictions', async (id) => detectContradictions(await getCorpus(id)), (r) => `${r.length} possible contradictions`),
      {
        name: 'detect_contradictions',
        description: 'Find places where a client’s earlier stated intentions conflict with later described behaviour, returning both source statements with dates.',
        schema: clientArg,
      },
    ),
    tool(
      wrap('analyze_emotional_trends', async (id) => analyzeEmotionalTrends(await getCorpus(id)), (r) => `${r.series.length} metrics, ${r.insights.length} notable shifts`),
      {
        name: 'analyze_emotional_trends',
        description: 'Analyze self-reported leadership confidence, team relationship, energy, stress, goal progress and selected emotions over time.',
        schema: clientArg,
      },
    ),
    tool(
      wrap('find_unresolved_issues', async (id) => findUnresolvedIssues(await getCorpus(id)), (r) => `${r.length} unresolved issues`),
      {
        name: 'find_unresolved_issues',
        description: 'Identify problems the client repeatedly raises as challenges or avoided decisions that show no sign of resolution.',
        schema: clientArg,
      },
    ),
    tool(
      wrap('analyze_commitments', async (id) => analyzeCommitments(await getCorpus(id)), (r) => `${r.summary.total} commitments, ${r.summary.overdue} overdue, ${r.insights.length} repeated-incomplete patterns`),
      {
        name: 'analyze_commitments',
        description: 'Analyze the client’s coaching commitments: completion rate, overdue items and repeated incomplete commitments on the same theme.',
        schema: clientArg,
      },
    ),
  ]
}

export const ANALYSIS_TOOL_NAMES = [
  'get_reflection_overview',
  'detect_recurring_patterns',
  'detect_trend_shifts',
  'detect_contradictions',
  'analyze_emotional_trends',
  'find_unresolved_issues',
  'analyze_commitments',
] as const
