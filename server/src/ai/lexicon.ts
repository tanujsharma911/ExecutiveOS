/**
 * Theme lexicon used by the deterministic analysis tools.
 * Each theme has detection patterns plus hedged, non-diagnostic coaching language.
 */
export interface Theme {
  key: string
  label: string
  patterns: RegExp[]
  related: string[]
  /** Hypothesis language — always framed as a possibility, never a diagnosis */
  hypothesis: string
  questions: string[]
  /** Question the coach could add to a form */
  formQuestion: { label: string; type: 'LONG_TEXT' | 'RATING' | 'YES_NO' }
  /** Positive framing used when the theme fades */
  fadingNote: string
}

export const THEMES: Theme[] = [
  {
    key: 'delegation',
    label: 'Delegation',
    patterns: [/delegat/i, /\bhand(ed|ing)? (it |this |them )?(off|over|back)\b/i, /\bmyself\b/i, /\bended up doing\b/i, /\btook (it|the \w+|this) back\b/i, /\bstep(ped)? in\b/i, /\bwithout (me|my sign-off)\b/i, /\blet (go|the team|them|jenna|leo|omar)\b/i],
    related: ['trust_control', 'team_ownership'],
    hypothesis: 'The issue may be less about team capability and more about difficulty relinquishing control when the stakes feel high.',
    questions: [
      'What would have to change for you to trust someone else with this responsibility?',
      'When you take work back, what are you protecting?',
      'What is the cost to your team each time a decision routes back to you?',
    ],
    formQuestion: { label: 'Which decision did you hand off this week, and what happened?', type: 'LONG_TEXT' },
    fadingNote: 'Delegation is coming up less often — worth checking whether it has been resolved or simply stopped being discussed.',
  },
  {
    key: 'trust_control',
    label: 'Trust & control',
    patterns: [/\btrust\b/i, /\bcontrol\b/i, /micromanag/i, /every decision/i, /sign-?off/i, /\bapprov(e|ing|al)s?\b/i, /too risky/i, /bottleneck/i, /routes? through (me|my)/i],
    related: ['delegation', 'team_ownership'],
    hypothesis: 'Approval and sign-off language may indicate that risk tolerance, rather than process, is shaping how decisions flow.',
    questions: ['What level of risk would you accept for your team to own this decision?', 'Where are you the bottleneck by choice rather than by necessity?'],
    formQuestion: { label: 'Which approvals did you give this week that someone else could have given?', type: 'LONG_TEXT' },
    fadingNote: 'Fewer references to approvals and control recently.',
  },
  {
    key: 'team_ownership',
    label: 'Team ownership',
    patterns: [/ownership/i, /\btake ownership\b/i, /accountab/i, /escalat/i, /\bwithout me\b/i, /decision rights/i, /making enough decisions/i, /\bran .* without me\b/i],
    related: ['delegation', 'trust_control'],
    hypothesis: 'The team may be escalating because past escalations were rewarded with the CEO stepping in.',
    questions: ['What signal does your team get when they escalate to you?', 'What would ownership look like on your team in 90 days?'],
    formQuestion: { label: 'Where did your team take ownership without you this week?', type: 'LONG_TEXT' },
    fadingNote: 'Team ownership concerns are appearing less frequently.',
  },
  {
    key: 'cto_relationship',
    label: 'CTO relationship',
    patterns: [/\bmarcus\b/i, /\bCTO\b/],
    related: ['difficult_conversations', 'trust_control'],
    hypothesis: 'Repeated postponement of the conversation with the CTO may suggest the relationship carries more weight than the operational disagreement itself.',
    questions: ['What do you need from Marcus that you have not yet asked for?', 'What would a great partnership with your CTO look like a year from now?'],
    formQuestion: { label: 'How would you rate your working relationship with your CTO this week?', type: 'RATING' },
    fadingNote: 'The CTO relationship is mentioned less often.',
  },
  {
    key: 'hiring',
    label: 'Hiring leadership talent',
    patterns: [/\bhir(e|ed|ing)\b/i, /recruit/i, /candidate/i, /\bVP\b/, /head of/i, /\boffer\b/i, /interview/i, /leadership bench/i],
    related: ['operational_overload', 'strategic_thinking'],
    hypothesis: 'Hiring may be carrying an emotional load beyond logistics — each senior hire changes what the founder’s own role looks like.',
    questions: ['What will you stop doing the day your new leader starts?', 'What does “great” look like for this role in month six?'],
    formQuestion: { label: 'How is the current hiring process affecting your organizational structure and your own role?', type: 'LONG_TEXT' },
    fadingNote: 'Hiring concerns are easing.',
  },
  {
    key: 'operational_overload',
    label: 'Operational overload',
    patterns: [/firefight/i, /warehouse/i, /fulfil?ment/i, /stretched/i, /too many things/i, /\binbox\b/i, /\bslack\b/i, /lands? on my desk/i, /backlog/i, /default for every/i, /7am to midnight/i],
    related: ['strategic_thinking', 'delegation'],
    hypothesis: 'Being the default for operational issues may be crowding out the strategic work the client says matters most.',
    questions: ['Which operational fire this week could only you have put out?', 'What would you do with the time if operations ran without you?'],
    formQuestion: { label: 'How many hours did you spend on operational firefighting this week?', type: 'LONG_TEXT' },
    fadingNote: 'Operational firefighting has largely disappeared from recent reflections — a possible sign the hiring and delegation work is paying off.',
  },
  {
    key: 'strategic_thinking',
    label: 'Strategic thinking',
    patterns: [/strateg/i, /long-term/i, /big picture/i, /six months ahead/i, /thinking time/i, /\b2027\b/, /priorit/i, /wholesale channel/i],
    related: ['operational_overload'],
    hypothesis: 'Strategic thinking appears when time is protected in advance; it rarely appears reactively.',
    questions: ['What strategic question deserves your best hours next week?', 'What made the protected strategy time hold this time?'],
    formQuestion: { label: 'How much time did you protect for strategic thinking this week?', type: 'LONG_TEXT' },
    fadingNote: 'Strategy is mentioned less often recently.',
  },
  {
    key: 'board_communication',
    label: 'Board pressure & communication',
    patterns: [/\bboard\b/i, /\bmargaret\b/i, /\bchair\b/i, /investor/i],
    related: ['executive_presence', 'difficult_conversations'],
    hypothesis: 'Board interactions may be a context where the client’s confidence is most sensitive to pushback.',
    questions: ['What position do you want to hold in the next board conversation, regardless of pushback?', 'How does board pressure change the way you lead your team that week?'],
    formQuestion: { label: 'How prepared do you feel for your next board interaction?', type: 'RATING' },
    fadingNote: 'Board pressure is coming up less.',
  },
  {
    key: 'difficult_conversations',
    label: 'Avoiding difficult conversations',
    patterns: [/difficult conversation/i, /hard conversation/i, /haven'?t told/i, /\bpostpon/i, /soften/i, /direct feedback/i, /the conversation with/i, /didn'?t raise/i, /keep putting off/i, /avoiding conversations/i],
    related: ['executive_presence', 'cto_relationship'],
    hypothesis: 'The repeated postponement may relate to how much the client values harmony in key relationships. This is a pattern to explore, not a conclusion.',
    questions: ['What are you afraid will happen if you have this conversation this week?', 'What is the cost of another month without this conversation?', 'What would the most courageous version of you say in the first sentence?'],
    formQuestion: { label: 'Which conversation are you postponing, and what is the cost of waiting?', type: 'LONG_TEXT' },
    fadingNote: 'Avoided conversations are mentioned less — check whether they happened.',
  },
  {
    key: 'executive_presence',
    label: 'Executive presence',
    patterns: [/all-hands/i, /composure/i, /rambled/i, /decisive/i, /without notes/i, /three messages/i, /presence/i, /opening three minutes/i],
    related: ['board_communication'],
    hypothesis: 'Presence appears strongest when the client has prepared the opening; it may be more about preparation rituals than innate style.',
    questions: ['What do you do differently on the days you feel most present?', 'How do you want the room to feel after you speak?'],
    formQuestion: { label: 'When did you feel most present as a leader this week?', type: 'LONG_TEXT' },
    fadingNote: 'Presence comes up less often.',
  },
  {
    key: 'energy_wellbeing',
    label: 'Energy & wellbeing',
    patterns: [/\brun\b/i, /\bkids\b/i, /family/i, /weekend/i, /late nights?/i, /11pm/i, /at all hours/i, /not sustainable/i, /exhaust/i, /quiet (saturday|day)/i],
    related: [],
    hypothesis: 'Recovery activities (family time, running, quiet mornings) appear to correlate with the client’s higher-energy weeks.',
    questions: ['What restores you, and how protected is it right now?'],
    formQuestion: { label: 'What did you do this week to restore your energy?', type: 'LONG_TEXT' },
    fadingNote: 'Wellbeing is mentioned less often.',
  },
  {
    key: 'fundraising',
    label: 'Fundraising',
    patterns: [/series [abc]/i, /\braise\b/i, /fundrais/i, /investor meetings/i],
    related: ['board_communication'],
    hypothesis: 'Fundraising was an energising context for the client.',
    questions: ['What from the fundraising process could you bring into day-to-day leadership?'],
    formQuestion: { label: 'How are investor relationships affecting your focus?', type: 'LONG_TEXT' },
    fadingNote: 'Fundraising has dropped out of reflections since the round closed — expected and not a concern.',
  },
  {
    key: 'client_escalations',
    label: 'Client escalations',
    patterns: [/escalation/i, /escalated to me/i, /\bhalden\b/i, /\bmilestone\b/i],
    related: ['difficult_conversations'],
    hypothesis: 'Client escalations may be a downstream signal of the unaddressed delivery-leadership issue.',
    questions: ['What would need to be true for client escalations to stop reaching you?'],
    formQuestion: { label: 'Which client issues reached you this week that should not have?', type: 'LONG_TEXT' },
    fadingNote: 'Client escalations are appearing less often.',
  },
]

export const THEME_BY_KEY = new Map(THEMES.map((t) => [t.key, t]))

/** Intent markers: the client states what they want / plan to do */
export const INTENT = /\b(i need to|i want to|i will|i'?ll|i should|need to stop|commit to|block|protect|hand|let|give|finally have|have the conversation)\b/i

/** Behaviour markers: what actually happened, usually contrary to intent */
export const BEHAVIOUR = /\b(ended up|took .* back|myself|stepped in|still haven'?t|again|isn'?t making|without me|postpon|softened|conceded|instead of|didn'?t raise|routes? through)\b/i

/** Resolution markers: an issue appears to be resolved */
export const RESOLUTION = /\b(resolved|accepted|completed|finished|signed|closed|went (better|well|fine)|breakthrough|handed .* and)\b/i

export function detectThemes(text: string): string[] {
  const hits: string[] = []
  for (const t of THEMES) if (t.patterns.some((p) => p.test(text))) hits.push(t.key)
  return hits
}
