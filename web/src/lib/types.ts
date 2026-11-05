export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'ONE_TIME'
export type QuestionType = 'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'RATING' | 'YES_NO' | 'DATE' | 'NUMBER' | 'EMOTION' | 'GOAL_PROGRESS'
export type CommitmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'BLOCKED'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'
export type Confidence = 'High' | 'Medium' | 'Low'
export type InsightCategory = 'recurring' | 'emerging' | 'disappearing' | 'contradiction' | 'emotional' | 'unresolved' | 'commitment'

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

export interface ClientAlert {
  id: string
  severity: 'high' | 'medium' | 'info'
  kind: string
  message: string
  detail?: string
  insightId?: string
}

export interface TraceEntry {
  tool: string
  args: Record<string, unknown>
  durationMs: number
  summary: string
}

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
  commitments: { insights: Insight[]; summary: { total: number; completed: number; incomplete: number; overdue: number; completionRate: number } }
  opportunities: { question: string; rationale: string; insightId: string; category: InsightCategory }[]
  dataGap?: string
  trace: TraceEntry[]
  alerts: ClientAlert[]
}

export interface ClientRow {
  id: string
  name: string
  email: string
  avatarColor: string
  company: string
  designation: string
  industry: string
  location: string
  program: string
  programId: string | null
  startDate: string
  lastReflectionAt: string | null
  lastWeeklyAt: string | null
  engagement: 'Active' | 'Slipping' | 'At risk'
  daysSinceWeekly: number | null
  confidence: number | null
  confidenceDelta: number | null
  confidenceTrend: number[]
  goalProgress: number | null
  commitmentRate: number
  openCommitments: number
  reflections: number
}

export interface UserLite {
  name: string
  avatarColor: string
}

export interface CommitmentUpdate {
  id: string
  status: CommitmentStatus
  note: string
  authorRole: 'COACH' | 'CLIENT'
  createdAt: string
}

export interface Commitment {
  id: string
  clientId: string
  sessionId: string | null
  title: string
  description: string
  dueDate: string
  priority: Priority
  goal: string
  theme: string | null
  status: CommitmentStatus
  createdAt: string
  updatedAt: string
  client?: { user: UserLite }
  updates?: CommitmentUpdate[]
  session?: { id: string; topic: string; scheduledAt: string } | null
}

export interface Session {
  id: string
  clientId: string
  scheduledAt: string
  durationMin: number
  topic: string
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
  summary: string
  topics: string[]
  observations?: string
  decisions: string[]
  followUps: string[]
  prepNotes?: string
  meetingLink?: string | null
  client?: { user: UserLite }
  commitments?: { id: string; title: string; status: CommitmentStatus }[]
}

export interface Question {
  id?: string
  type: QuestionType
  label: string
  helpText?: string | null
  required: boolean
  options: string[]
  metricKey?: string | null
}

export interface Form {
  id: string
  title: string
  description: string
  frequency: Frequency
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  aiGenerated: boolean
  updatedAt: string
  questions: Question[]
  assignments: { clientId: string; client: { user: UserLite } }[]
  _count: { submissions: number }
}

export interface AnswerSnapshot {
  questionId: string
  label: string
  type: QuestionType
  metricKey: string | null
  value: unknown
}

export interface Submission {
  id: string
  formId: string
  status: 'DRAFT' | 'SUBMITTED'
  periodStart: string
  dueAt: string
  submittedAt: string | null
  answers: AnswerSnapshot[]
  form: { id?: string; title: string; frequency: Frequency }
}

export interface Growth {
  series: MetricSeries[]
  completionSeries: { date: string; value: number }[]
  timeline: { date: string; kind: 'breakthrough' | 'challenge' | 'session' | 'goal' | 'pattern'; title: string; detail?: string }[]
  weeklyStreak: { current: number; best: number; total: number }
  dailyStreak: { current: number; best: number; total: number; doneToday: boolean; graceUsed: boolean; last14: boolean[] }
  disclaimer: string
}

export interface Notification {
  id: string
  title: string
  body: string
  link: string | null
  kind: string
  read: boolean
  createdAt: string
}

export interface Activity {
  dailyStreak: { current: number; best: number; total: number; doneToday: boolean; graceUsed: boolean; last14: boolean[] }
  heatmap: { end: string; days: Record<string, { count: number; kinds: string[] }>; total: number; activeDays: number }
}
