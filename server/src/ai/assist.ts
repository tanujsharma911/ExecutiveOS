/**
 * Generative assists: AI form creation, adaptive form suggestions and
 * post-session suggestions. LLM mode uses structured output via LangChain;
 * deterministic mode uses the theme lexicon. The coach approves everything.
 */
import { z } from 'zod'
import { prisma } from '../db.js'
import { EMOTION_OPTIONS } from '../lib/formTemplates.js'
import type { Evidence } from './analyzers.js'
import { getCorpus } from './corpus.js'
import { runIntelligence } from './intelligence.js'
import { detectThemes, THEME_BY_KEY } from './lexicon.js'
import { createLogger } from '../lib/logger.js'
import { aiMode, deterministicFallback, invokeStructured, unavailable } from './model.js'

const log = createLogger('ai')

const QUESTION_TYPES = ['SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'RATING', 'YES_NO', 'DATE', 'NUMBER', 'EMOTION', 'GOAL_PROGRESS'] as const

const GeneratedForm = z.object({
  title: z.string(),
  description: z.string(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONE_TIME']),
  questions: z.array(
    z.object({
      type: z.enum(QUESTION_TYPES),
      label: z.string(),
      helpText: z.string().optional(),
      required: z.boolean(),
      options: z.array(z.string()).optional(),
      metricKey: z.enum(['confidence', 'team', 'energy', 'stress', 'goalProgress', 'emotion']).optional(),
      rationale: z.string().describe('Why this question helps the coach'),
    }),
  ),
})
export type GeneratedForm = z.infer<typeof GeneratedForm>
type GenQ = GeneratedForm['questions'][number]

const THEME_QUESTION_BANK: Record<string, GenQ[]> = {
  delegation: [
    { type: 'LONG_TEXT', label: 'Which responsibility did you hand off this week, and how did it go?', required: true, rationale: 'Tracks concrete delegation behaviour, not intentions.' },
    { type: 'LONG_TEXT', label: 'Where did you take work back from someone on your team? What prompted it?', required: false, rationale: 'Surfaces the moments the control pattern shows up.' },
    { type: 'RATING', label: 'How comfortable were you letting others own important decisions this week?', required: true, metricKey: undefined, rationale: 'A self-reported trend line for delegation comfort.' },
  ],
  team_ownership: [
    { type: 'LONG_TEXT', label: 'Where did your team take ownership without needing you?', required: false, rationale: 'Builds evidence of team capability.' },
    { type: 'NUMBER', label: 'How many issues were escalated to you that someone else could have resolved?', required: false, rationale: 'Quantifies escalation load.' },
  ],
  trust_control: [{ type: 'LONG_TEXT', label: 'What would you need to see to trust your team with more?', required: false, rationale: 'Makes implicit trust criteria explicit.' }],
  strategic_thinking: [
    { type: 'NUMBER', label: 'How many hours did you spend on strategic work this week?', required: false, rationale: 'Tracks protected strategy time.' },
    { type: 'LONG_TEXT', label: 'What strategic question deserves more of your attention?', required: false, rationale: 'Keeps the long view visible.' },
  ],
  hiring: [
    { type: 'LONG_TEXT', label: 'Where are you on your most important leadership hire, and what is the next step?', required: false, rationale: 'Tracks progress on hiring.' },
    { type: 'LONG_TEXT', label: 'How is your organizational structure changing as you hire?', required: false, rationale: 'Connects hiring to org design.' },
  ],
  operational_overload: [{ type: 'NUMBER', label: 'How many hours did you spend firefighting operational issues?', required: false, rationale: 'Quantifies operational pull.' }],
  board_communication: [
    { type: 'RATING', label: 'How prepared do you feel for your next board interaction?', required: false, rationale: 'Tracks board readiness.' },
    { type: 'LONG_TEXT', label: 'What is the one message you need the board to hear?', required: false, rationale: 'Builds message discipline.' },
  ],
  difficult_conversations: [
    { type: 'LONG_TEXT', label: 'Which conversation are you postponing, and what is the cost of waiting?', required: true, rationale: 'Surfaces avoidance early.' },
    { type: 'YES_NO', label: 'Did you have a conversation you had been avoiding?', required: false, rationale: 'Simple behavioural tracker.' },
  ],
  executive_presence: [{ type: 'LONG_TEXT', label: 'When did you feel most present as a leader this week?', required: false, rationale: 'Identifies conditions for presence.' }],
  cto_relationship: [{ type: 'RATING', label: 'How would you rate your working relationship with your CTO this week?', required: false, rationale: 'Tracks a key relationship.' }],
  energy_wellbeing: [{ type: 'LONG_TEXT', label: 'What did you do this week to restore your energy?', required: false, rationale: 'Keeps recovery visible.' }],
}

const EXTRA_KEYWORDS: [RegExp, string][] = [
  [/ownership|accountab/i, 'team_ownership'],
  [/trust|control|micromanag/i, 'trust_control'],
  [/strateg|scal/i, 'strategic_thinking'],
  [/burnout|energy|wellbeing|stress/i, 'energy_wellbeing'],
  [/communicat|presence|speak/i, 'executive_presence'],
  [/conflict|feedback|conversation/i, 'difficult_conversations'],
]

function detectFrequency(prompt: string): GeneratedForm['frequency'] {
  if (/\bdaily\b|every day/i.test(prompt)) return 'DAILY'
  if (/\bmonthly\b/i.test(prompt)) return 'MONTHLY'
  if (/quarter/i.test(prompt)) return 'QUARTERLY'
  if (/annual|yearly/i.test(prompt)) return 'ANNUALLY'
  if (/one[- ]time|intake|onboarding/i.test(prompt)) return 'ONE_TIME'
  return 'WEEKLY'
}

export function generateFormDeterministic(prompt: string): GeneratedForm {
  const frequency = detectFrequency(prompt)
  const themes = new Set(detectThemes(prompt))
  for (const [re, key] of EXTRA_KEYWORDS) if (re.test(prompt)) themes.add(key)
  if (!themes.size) themes.add('strategic_thinking')
  const period = { DAILY: 'today', WEEKLY: 'this week', MONTHLY: 'this month', QUARTERLY: 'this quarter', ANNUALLY: 'this year', ONE_TIME: 'right now' }[frequency]
  const who = /\bCEO\b/i.test(prompt) ? 'CEO' : /founder/i.test(prompt) ? 'founder' : 'leader'
  const themeLabels = [...themes].map((t) => THEME_BY_KEY.get(t)?.label.toLowerCase() ?? t.replace(/_/g, ' '))

  const qs: GenQ[] = [{ type: 'LONG_TEXT', label: `What was your most meaningful leadership moment ${period}?`, required: true, rationale: 'Opens with a strength-based reflection.' }]
  for (const t of themes) qs.push(...(THEME_QUESTION_BANK[t] ?? []).slice(0, 2))
  qs.push(
    { type: 'RATING', label: `How confident do you feel about your leadership ${period}?`, required: true, metricKey: 'confidence', rationale: 'Feeds the leadership confidence trend.' },
    { type: 'EMOTION', label: `Which feeling best describes ${period}?`, required: true, options: EMOTION_OPTIONS, metricKey: 'emotion', rationale: 'Feeds emotional trend analysis.' },
    { type: 'LONG_TEXT', label: `What is one thing you will do differently ${frequency === 'DAILY' ? 'tomorrow' : 'next ' + period.replace('this ', '')}?`, required: true, rationale: 'Turns reflection into a commitment.' },
  )
  const title = `${frequency === 'ONE_TIME' ? '' : frequency.charAt(0) + frequency.slice(1).toLowerCase().replace('_', '-') + ' '}${themeLabels.length === 1 ? themeLabels[0].replace(/^\w/, (c) => c.toUpperCase()) : 'Leadership'} Reflection`.trim()
  return {
    title,
    description: `A ${frequency.toLowerCase().replace('_', '-')} reflection for a ${who} focused on ${themeLabels.join(', ')}.`,
    frequency,
    questions: qs.slice(0, 10),
  }
}

export async function generateForm(prompt: string): Promise<GeneratedForm & { mode: string }> {
  if (aiMode() === 'unavailable') unavailable('no GOOGLE_API_KEY or GROQ_API_KEY is set and DETERMINISTIC_FALLBACK is false.')
  if (aiMode() === 'llm') {
    try {
      const { data: res, provider } = await invokeStructured('form.generate', GeneratedForm, [
        { role: 'system', content: 'You design reflection forms for executive coaches. Write 6–10 thoughtful, non-leading questions. Include one RATING question with metricKey "confidence" and one EMOTION question with metricKey "emotion". Never ask clients to self-diagnose.' },
        { role: 'user', content: prompt },
      ])
      return { ...res, mode: `llm:${provider}` }
    } catch (e) {
      if (!deterministicFallback()) unavailable('Gemini and Groq both failed to generate the form. Try again shortly.')
      log.warn('LLM form generation failed, using deterministic generator', { error: (e as Error).message })
    }
  }
  return { ...generateFormDeterministic(prompt), mode: 'deterministic' }
}

/** Adaptive form suggestions from a client's recurring and emerging themes. */
export async function refreshFormSuggestions(clientId: string) {
  const r = await runIntelligence(clientId)
  const existing = await prisma.question.findMany({ where: { form: { assignments: { some: { clientId } } } }, select: { label: true } })
  const labels = existing.map((q) => q.label.toLowerCase())
  const candidates = [...r.emerging, ...r.recurring, ...r.unresolved].filter((i) => i.themeKey && i.themeKey !== 'energy_wellbeing')
  const seen = new Set<string>()
  for (const i of candidates) {
    const theme = THEME_BY_KEY.get(i.themeKey!)
    if (!theme || seen.has(theme.key)) continue
    seen.add(theme.key)
    if (labels.some((l) => l.includes(theme.formQuestion.label.toLowerCase().slice(0, 30)))) continue
    const mentions = i.stats?.mentions ?? i.evidence.length
    const rationale = `${r.firstName} has repeatedly mentioned ${theme.label.toLowerCase()} (${mentions} reflection${mentions === 1 ? '' : 's'}${i.category === 'emerging' ? ', increasing recently' : ''}). Consider adding a question that tracks it directly.`
    await prisma.formSuggestion.upsert({
      where: { clientId_theme_question: { clientId, theme: theme.key, question: theme.formQuestion.label } },
      create: { clientId, theme: theme.key, question: theme.formQuestion.label, type: theme.formQuestion.type, rationale, evidence: i.evidence.slice(0, 2) as unknown as object },
      update: { rationale, evidence: i.evidence.slice(0, 2) as unknown as object },
    })
    if (seen.size >= 4) break
  }
}

const SessionAssist = z.object({
  themes: z.array(z.string()),
  commitments: z.array(z.object({ title: z.string(), description: z.string(), goal: z.string(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH']), theme: z.string().optional() })),
  followUpQuestions: z.array(z.string()),
})

export interface SessionAssistResult {
  themes: { key: string; label: string }[]
  commitments: { title: string; description: string; goal: string; priority: 'LOW' | 'MEDIUM' | 'HIGH'; theme?: string }[]
  relevantReflections: Evidence[]
  followUpQuestions: string[]
  mode: string
}

/** Suggestions after a coach saves a session record. */
export async function assistSession(sessionId: string): Promise<SessionAssistResult> {
  const s = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })
  const text = [s.topic, s.summary, s.observations, ...s.topics, ...s.decisions, ...s.followUps].join('. ')
  const keys = [...new Set([...detectThemes(text), ...s.topics.flatMap((t) => detectThemes(t))])]
  const corpus = await getCorpus(s.clientId)
  const relevant = corpus.snippets
    .filter((sn) => sn.themes.some((t) => keys.includes(t)))
    .slice(-4)
    .reverse()
    .map((sn) => ({ quote: sn.text, date: sn.date, source: `${sn.formTitle} · ${sn.question}`, submissionId: sn.submissionId }))

  let commitments: SessionAssistResult['commitments'] = s.decisions.map((d) => {
    const theme = detectThemes(d)[0] ?? keys[0]
    return {
      title: d.length > 80 ? d.slice(0, 77) + '…' : d,
      description: `Agreed in session “${s.topic}”.`,
      goal: theme ? THEME_BY_KEY.get(theme)?.label ?? 'Leadership' : 'Leadership',
      priority: 'MEDIUM' as const,
      theme,
    }
  })
  if (!commitments.length && keys[0]) {
    const t = THEME_BY_KEY.get(keys[0])!
    commitments = [{ title: `Run one experiment on ${t.label.toLowerCase()} before the next session`, description: 'Pick one concrete situation and act differently; reflect on what happened.', goal: t.label, priority: 'MEDIUM', theme: t.key }]
  }
  let followUpQuestions = keys.flatMap((k) => THEME_BY_KEY.get(k)?.questions.slice(1, 2) ?? []).slice(0, 4)
  let mode = 'deterministic'

  if (aiMode() === 'unavailable') unavailable('no GOOGLE_API_KEY or GROQ_API_KEY is set and DETERMINISTIC_FALLBACK is false.')
  if (aiMode() === 'llm') {
    try {
      const { data: res, provider } = await invokeStructured('session.assist', SessionAssist, [
        { role: 'system', content: 'You help an executive coach after a session. Suggest themes discussed, 1–3 specific commitments, and 2–4 follow-up questions. The coach will review everything.' },
        { role: 'user', content: `Session notes:\n${text}\n\nRelevant past reflections:\n${relevant.map((r) => `- ${r.quote}`).join('\n')}` },
      ])
      commitments = res.commitments
      followUpQuestions = res.followUpQuestions
      keys.push(...res.themes.flatMap((t) => detectThemes(t)).filter((k) => !keys.includes(k)))
      mode = `llm:${provider}`
    } catch (e) {
      if (!deterministicFallback()) unavailable('Gemini and Groq both failed to generate session suggestions. Try again shortly.')
      log.warn('LLM session assist failed, using deterministic output', { error: (e as Error).message })
    }
  }

  return {
    themes: keys.map((k) => ({ key: k, label: THEME_BY_KEY.get(k)?.label ?? k })),
    commitments,
    relevantReflections: relevant,
    followUpQuestions,
    mode,
  }
}
