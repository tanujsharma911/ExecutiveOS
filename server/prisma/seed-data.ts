/**
 * Fictional demo data for ExecutiveOS.
 * All people and companies are invented. Weeks are relative: week 1 is the oldest
 * (9 weeks before the current week), week 9 is last week.
 */

export interface WeeklyEntry {
  achievement: string
  challenge: string
  avoiding: string
  confidence: number
  team: number
  energyGain: string
  energyDrain: string
  improve: string
  emotion: string
  energy: number
  stress: number
  goal: number
}

export interface DailyEntry {
  /** days before today (1 = yesterday) */
  daysAgo: number
  emotion: string
  energy: number
  note: string
  protectedTime: boolean
}

export interface MonthlyEntry {
  /** months before current month (1 = last month) */
  monthsAgo: number
  lesson: string
  pattern: string
  goal: number
  confidence: number
  nextFocus: string
}

export interface SeedCommitment {
  title: string
  description: string
  dueInDays: number
  createdDaysAgo: number
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  goal: string
  theme: string
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'BLOCKED'
  updates: { daysAgo: number; status: SeedCommitment['status']; note: string; by: 'COACH' | 'CLIENT' }[]
}

export interface SeedSession {
  /** negative = past, positive = upcoming (days from today) */
  dayOffset: number
  hour: number
  durationMin: number
  topic: string
  summary?: string
  topics?: string[]
  observations?: string
  decisions?: string[]
  followUps?: string[]
}

export interface SeedClient {
  name: string
  email: string
  avatarColor: string
  company: string
  designation: string
  industry: string
  companySize: string
  location: string
  phone: string
  links: { label: string; url: string }[]
  startWeeksAgo: number
  program: string
  coachNotes: string
  /** index 0 = week 1 (oldest). Missing entries (null) = not submitted */
  weekly: (WeeklyEntry | null)[]
  daily: DailyEntry[]
  monthly: MonthlyEntry[]
  commitments: SeedCommitment[]
  sessions: SeedSession[]
}

export const COACH = {
  name: 'Dr. Elena Vasquez',
  email: 'elena@executiveos.app',
  title: 'Executive Coach, PCC',
  avatarColor: '#0f766e',
}

export const PROGRAMS = [
  {
    key: 'independence',
    name: 'Leadership Independence',
    description:
      'A six-month program for founder-CEOs moving from doing to leading: decision rights, delegation and building an accountable leadership team.',
    durationWeeks: 26,
    focusAreas: ['Delegation', 'Team ownership', 'Trust'],
  },
  {
    key: 'scaling',
    name: 'Scaling Founder',
    description:
      'For founders whose companies have outgrown their operating model. Moves the CEO from operator to strategist and builds the leadership bench.',
    durationWeeks: 24,
    focusAreas: ['Strategic thinking', 'Hiring leaders', 'Operating cadence'],
  },
  {
    key: 'presence',
    name: 'Executive Presence Intensive',
    description:
      'A focused program on communication, board relationships and the courage to have difficult conversations early.',
    durationWeeks: 16,
    focusAreas: ['Executive presence', 'Board communication', 'Difficult conversations'],
  },
]

export const CLIENTS: (SeedClient & { programKey: string })[] = [
  {
    programKey: 'independence',
    name: 'Alex Morgan',
    email: 'alex.morgan@lumenstack.io',
    avatarColor: '#4338ca',
    company: 'LumenStack',
    designation: 'Co-founder & CEO',
    industry: 'B2B SaaS · Analytics',
    companySize: '140 employees',
    location: 'Austin, TX',
    phone: '+1 (512) 555-0142',
    links: [
      { label: 'LinkedIn', url: 'https://www.linkedin.com/in/alex-morgan-lumenstack' },
      { label: 'LumenStack website', url: 'https://lumenstack.io' },
      { label: 'Series B announcement', url: 'https://lumenstack.io/blog/series-b' },
    ],
    startWeeksAgo: 10,
    program: 'Leadership Independence',
    coachNotes:
      'Alex is self-aware and quick to name the control pattern, but under board pressure reverts to doing the work personally. The CTO relationship is the live edge. Watch for "I ended up doing it myself" language.',
    weekly: [
      { achievement: 'Closed the Series B extension and announced it to the team on Friday.', challenge: 'Product review ran two hours over because I rewrote half of the roadmap slides myself.', avoiding: 'Whether to restructure the product org under Marcus.', confidence: 8.5, team: 7, energyGain: 'Investor meetings — the story is finally landing.', energyDrain: 'Late nights fixing the sales deck before the board call.', improve: 'Hand off the weekly metrics review to Omar.', emotion: 'Motivated', energy: 7, stress: 5, goal: 30 },
      { achievement: 'Ran our first leadership offsite since the raise — good energy in the room.', challenge: 'Two product decisions stalled until I weighed in. I need to stop being involved in every decision.', avoiding: 'Telling Marcus that the platform rebuild is slipping.', confidence: 8.2, team: 7, energyGain: 'Watching Jenna run the sales kickoff on her own.', energyDrain: 'Approving every hiring req personally.', improve: 'Let the leadership team make two decisions without me.', emotion: 'Focused', energy: 7, stress: 5, goal: 34 },
      { achievement: 'Shipped the self-serve onboarding flow two weeks early.', challenge: "I don't trust the team to handle the enterprise renewal with Halvorsen, so I took the calls myself.", avoiding: 'Giving Marcus feedback about how he runs architecture reviews.', confidence: 7.8, team: 6, energyGain: 'A customer told me the new dashboards saved them a week of work.', energyDrain: 'Back-to-back calls with no thinking time.', improve: 'Delegate the Halvorsen renewal to the account team.', emotion: 'Frustrated', energy: 6, stress: 6, goal: 38 },
      { achievement: 'Hired a Head of Customer Success.', challenge: "I ended up doing the board presentation myself after Omar's draft came in late.", avoiding: 'A real conversation with Marcus about ownership of the roadmap.', confidence: 7.6, team: 6, energyGain: 'Coaching session — naming the control pattern out loud helped.', energyDrain: "Rewriting other people's work at 11pm.", improve: 'Give Omar the board deck two weeks earlier, with a clear brief.', emotion: 'Anxious', energy: 6, stress: 6, goal: 40 },
      { achievement: 'Leadership team ran the first half of quarterly planning prep without me.', challenge: 'Nobody seems to take ownership of cross-team issues — they all escalate to me.', avoiding: 'Deciding whether Marcus is the right CTO for the next stage.', confidence: 7.0, team: 5, energyGain: 'A long run on Sunday morning.', energyDrain: 'Escalations landing in my DMs at all hours.', improve: 'Push escalations back to the owners instead of answering them.', emotion: 'Frustrated', energy: 5, stress: 7, goal: 42 },
      { achievement: 'Marcus and I had a decent 1:1 about the platform timeline.', challenge: 'I stepped in on the pricing change because it felt too risky to leave with the team.', avoiding: 'Telling the board the platform rebuild will slip a quarter.', confidence: 7.2, team: 6, energyGain: 'The product team demo — they are sharper than I give them credit for.', energyDrain: 'Board pressure on the Q4 number.', improve: 'Trust the pricing working group to finish without me.', emotion: 'Hopeful', energy: 6, stress: 6, goal: 45 },
      { achievement: 'Closed two expansion deals in the same week.', challenge: 'The board pushed hard on burn and the platform delay. Marcus and I disagreed in front of the leadership team.', avoiding: 'The difficult conversation with Marcus about how we resolve disagreements.', confidence: 6.6, team: 5, energyGain: 'Time with my kids over the long weekend.', energyDrain: 'Board pressure and the tension with Marcus.', improve: 'Schedule the conversation with Marcus.', emotion: 'Overwhelmed', energy: 5, stress: 7, goal: 46 },
      { achievement: 'Finished leadership team feedback sessions with all five direct reports.', challenge: 'I took the roadmap back from Marcus after the board call. I know that undercuts him.', avoiding: 'The conversation with Marcus, again.', confidence: 6.4, team: 5, energyGain: 'Honest feedback from Jenna in her session.', energyDrain: "Feeling like I'm the bottleneck for the whole company.", improve: 'Hand roadmap ownership back to Marcus with clear decision rights.', emotion: 'Frustrated', energy: 4, stress: 8, goal: 48 },
      { achievement: 'Shared a decision-rights draft with the leadership team.', challenge: "My team isn't making enough decisions without me — everything still routes through my calendar.", avoiding: 'Whether to bring in an outside facilitator for me and Marcus.', confidence: 6.2, team: 5, energyGain: 'A quiet Saturday morning to think about strategy.', energyDrain: 'The board prep cycle and constant escalations.', improve: 'Let the pricing group ship without my sign-off.', emotion: 'Anxious', energy: 5, stress: 7, goal: 50 },
    ],
    daily: [
      { daysAgo: 61, emotion: 'Frustrated', energy: 6, note: 'Spent the afternoon redoing the onboarding spec myself instead of delegating it.', protectedTime: false },
      { daysAgo: 47, emotion: 'Focused', energy: 7, note: 'Good run this morning. Still holding too many decisions — counted 14 approvals today.', protectedTime: true },
      { daysAgo: 33, emotion: 'Anxious', energy: 5, note: "Couldn't let go of the renewal pricing. Took it back from the account team.", protectedTime: false },
      { daysAgo: 19, emotion: 'Overwhelmed', energy: 4, note: 'Board call prep all day. Marcus and I are not aligned and the team can feel it.', protectedTime: false },
      { daysAgo: 5, emotion: 'Hopeful', energy: 6, note: 'Drafted decision rights. Writing it down made the control pattern obvious.', protectedTime: true },
      { daysAgo: 4, emotion: 'Focused', energy: 6, note: 'Let Jenna run the forecast call without me. It went fine.', protectedTime: true },
      { daysAgo: 3, emotion: 'Frustrated', energy: 5, note: 'Pricing group asked for my sign-off again. I gave it, but I should have pushed it back.', protectedTime: false },
      { daysAgo: 2, emotion: 'Calm', energy: 6, note: 'Quiet day. Thought about what Marcus needs from me to own the roadmap.', protectedTime: true },
      { daysAgo: 1, emotion: 'Hopeful', energy: 6, note: 'Preparing for coaching. I want to talk about trust, not tactics.', protectedTime: true },
    ],
    monthly: [
      { monthsAgo: 2, lesson: 'Raising money is easier for me than letting others run things.', pattern: 'I take work back when the stakes feel high.', goal: 32, confidence: 8.3, nextFocus: 'Delegation of recurring operating reviews.' },
      { monthsAgo: 1, lesson: 'My team escalates to me because I have trained them to.', pattern: 'Under board pressure I stop delegating and start doing.', goal: 46, confidence: 6.6, nextFocus: 'Team ownership and the CTO partnership.' },
    ],
    commitments: [
      { title: 'Delegate the weekly metrics review to the CFO', description: 'Omar runs the Monday metrics review end-to-end; Alex attends as a participant only.', dueInDays: -48, createdDaysAgo: 62, priority: 'MEDIUM', goal: 'Delegation', theme: 'delegation', status: 'PARTIALLY_COMPLETED', updates: [{ daysAgo: 50, status: 'IN_PROGRESS', note: 'Omar ran it twice.', by: 'CLIENT' }, { daysAgo: 47, status: 'PARTIALLY_COMPLETED', note: 'I took it back the week before the board meeting.', by: 'CLIENT' }] },
      { title: 'Delegate the Halvorsen renewal to the account team', description: 'Account team owns the renewal; Alex available only for the exec sponsor call.', dueInDays: -34, createdDaysAgo: 46, priority: 'HIGH', goal: 'Delegation', theme: 'delegation', status: 'NOT_STARTED', updates: [{ daysAgo: 33, status: 'NOT_STARTED', note: 'Pricing felt too risky — I ran the calls myself.', by: 'CLIENT' }] },
      { title: 'Delegate product roadmap ownership to CTO', description: 'Marcus owns the Q1 roadmap and presents it to the board. Alex gives input in one review, not ongoing edits.', dueInDays: -6, createdDaysAgo: 20, priority: 'HIGH', goal: 'Delegation', theme: 'delegation', status: 'IN_PROGRESS', updates: [{ daysAgo: 15, status: 'IN_PROGRESS', note: 'Shared the brief with Marcus.', by: 'CLIENT' }, { daysAgo: 12, status: 'IN_PROGRESS', note: 'Took the roadmap back after the board call. Need to hand it back.', by: 'CLIENT' }] },
      { title: 'Have a difficult conversation with CTO', description: 'Direct conversation with Marcus about how disagreements get resolved and what each of you needs.', dueInDays: -3, createdDaysAgo: 20, priority: 'HIGH', goal: 'CTO partnership', theme: 'cto_relationship', status: 'BLOCKED', updates: [{ daysAgo: 8, status: 'BLOCKED', note: "Marcus has been travelling and I haven't rescheduled.", by: 'CLIENT' }] },
      { title: 'Conduct leadership team feedback sessions', description: 'One structured feedback conversation with each direct report about how Alex can lead them better.', dueInDays: -12, createdDaysAgo: 34, priority: 'MEDIUM', goal: 'Team ownership', theme: 'team_ownership', status: 'COMPLETED', updates: [{ daysAgo: 13, status: 'COMPLETED', note: 'Done with all five. Jenna was the most candid.', by: 'CLIENT' }] },
      { title: 'Publish decision rights for the leadership team', description: 'A one-page document listing which decisions belong to the CEO, the leadership team and individual owners.', dueInDays: 9, createdDaysAgo: 6, priority: 'HIGH', goal: 'Team ownership', theme: 'team_ownership', status: 'IN_PROGRESS', updates: [{ daysAgo: 4, status: 'IN_PROGRESS', note: 'Draft shared with the team for comments.', by: 'CLIENT' }] },
    ],
    sessions: [
      { dayOffset: -66, hour: 15, durationMin: 75, topic: 'Kickoff: goals, decision rights and the delegation baseline', summary: 'Set coaching goals. Alex estimates he personally approves 40+ decisions a week. Agreed to track where he takes work back.', topics: ['Delegation', 'Goals', 'Decision rights'], observations: 'High energy, fast talker. Frames delegation as a team capability problem.', decisions: ['Track every decision taken back for two weeks'], followUps: ['Review the decision log'] },
      { dayOffset: -52, hour: 15, durationMin: 60, topic: 'The control pattern', summary: 'Reviewed the decision log. Pattern: Alex takes work back when stakes feel high or timelines feel tight.', topics: ['Delegation', 'Trust', 'Control'], observations: 'Visible discomfort when asked what would happen if a decision went wrong.', decisions: ['Delegate the metrics review to Omar'], followUps: ['Explore what "risky" means to Alex'] },
      { dayOffset: -38, hour: 16, durationMin: 60, topic: 'CTO partnership', summary: 'Discussed tension with Marcus. Alex admires his technical depth but does not trust his prioritisation.', topics: ['CTO relationship', 'Trust', 'Roadmap'], observations: 'Alex speaks about Marcus in the third person even when describing their shared goals.', decisions: ['Weekly 1:1 with Marcus with a fixed agenda'], followUps: ['Difficult conversation with Marcus'] },
      { dayOffset: -24, hour: 15, durationMin: 60, topic: 'Board pressure and roadmap ownership', summary: 'Board meeting raised the stakes on the platform delay. Alex considered taking the roadmap back. Committed to handing roadmap ownership to Marcus.', topics: ['Board pressure', 'Roadmap', 'Delegation'], observations: 'Confidence notably lower than at kickoff.', decisions: ['Marcus owns the Q1 roadmap'], followUps: ['Check whether the handoff held after the board call'] },
      { dayOffset: -10, hour: 15, durationMin: 60, topic: 'Feedback sessions debrief', summary: 'Alex completed feedback sessions. Common theme from reports: they wait for Alex because he often redoes their work.', topics: ['Team ownership', 'Feedback'], observations: 'Alex was moved by Jenna\'s feedback. Opening to the idea that the team is waiting for him.', decisions: ['Draft decision rights document'], followUps: ['Decision rights review'] },
      { dayOffset: 2, hour: 15, durationMin: 60, topic: 'Delegation, trust and the CTO relationship' },
    ],
  },
  {
    programKey: 'scaling',
    name: 'Sarah Chen',
    email: 'sarah.chen@verdantgoods.com',
    avatarColor: '#be185d',
    company: 'Verdant Goods',
    designation: 'Founder & CEO',
    industry: 'E-commerce · Sustainable home goods',
    companySize: '85 employees',
    location: 'Portland, OR',
    phone: '+1 (503) 555-0187',
    links: [
      { label: 'LinkedIn', url: 'https://www.linkedin.com/in/sarah-chen-verdant' },
      { label: 'Verdant Goods store', url: 'https://verdantgoods.com' },
      { label: 'Founder podcast interview', url: 'https://verdantgoods.com/press/founder-podcast' },
    ],
    startWeeksAgo: 10,
    program: 'Scaling Founder',
    coachNotes:
      'Sarah has made real progress letting go of operations since Leo\'s supplier win. Hiring is now the bottleneck. She responds well to concrete experiments ("protect one Friday").',
    weekly: [
      { achievement: 'Hit record weekly revenue during the Labor Day sale.', challenge: 'I spent three days in the warehouse firefighting fulfilment delays.', avoiding: 'Hiring a VP of Operations — I keep thinking I can hold it together myself.', confidence: 5.5, team: 6, energyGain: 'Customer reviews on the new linen line.', energyDrain: 'Operations firefighting from 7am to midnight.', improve: 'Block two hours for strategy on Friday.', emotion: 'Overwhelmed', energy: 4, stress: 8, goal: 20 },
      { achievement: 'Signed the new 3PL contract.', challenge: "Every supplier issue still lands on my desk — I'm stretched across too many things.", avoiding: 'Telling my co-founder I need him to own supply chain.', confidence: 5.8, team: 6, energyGain: 'A strategy afternoon with my advisor.', energyDrain: 'Inbox and Slack — 400 messages a day.', improve: 'Write down the three priorities for Q4.', emotion: 'Anxious', energy: 4, stress: 8, goal: 24 },
      { achievement: 'Defined Q4 strategic priorities with the leadership team.', challenge: 'Spent Friday in the warehouse again instead of strategy time.', avoiding: 'Starting the VP Operations search properly.', confidence: 6.0, team: 6, energyGain: 'Seeing the team rally around the priorities.', energyDrain: 'Firefighting the returns backlog.', improve: 'Brief a recruiter for the VP Ops role.', emotion: 'Frustrated', energy: 5, stress: 7, goal: 30 },
      { achievement: 'Kicked off the VP Operations search with a recruiter.', challenge: 'Hiring leadership talent is harder than I expected — two candidates dropped out.', avoiding: 'Raising the compensation band for the VP role.', confidence: 6.2, team: 7, energyGain: 'First real thinking time in a month — mapped the wholesale channel.', energyDrain: 'Candidate no-shows.', improve: 'Protect Friday mornings for strategy.', emotion: 'Focused', energy: 5, stress: 7, goal: 35 },
      { achievement: 'Handed supplier negotiations to Leo, and he got a better deal than I would have.', challenge: 'Interviewed four VP candidates; none have scaled a team past 200.', avoiding: 'Deciding whether to pause the wholesale launch.', confidence: 6.6, team: 7, energyGain: "Leo's win — it showed me what happens when I let go.", energyDrain: 'Late-night interview prep.', improve: 'Define what great looks like for the VP Ops role.', emotion: 'Hopeful', energy: 6, stress: 6, goal: 42 },
      { achievement: 'Wholesale pilot signed with two retailers.', challenge: 'The hiring process is eating my calendar — five interviews this week.', avoiding: 'Telling the team the VP search will take until January.', confidence: 6.9, team: 7, energyGain: 'A full strategy Friday — the first one I protected all quarter.', energyDrain: 'Repeating the same context in every interview.', improve: 'Delegate first-round interviews to the Head of People.', emotion: 'Motivated', energy: 6, stress: 6, goal: 50 },
      { achievement: 'Leadership team ran Black Friday planning without me in the room.', challenge: "The finalist for the VP role asked for equity we haven't budgeted.", avoiding: 'The equity conversation with my board.', confidence: 7.1, team: 8, energyGain: 'Long-term planning for 2027 — the big picture feels clearer.', energyDrain: 'Compensation negotiations.', improve: 'Finalize the long-term hiring plan for 2027.', emotion: 'Focused', energy: 7, stress: 5, goal: 55 },
      { achievement: 'Made an offer to Dana for VP of Operations.', challenge: "Worried about onboarding a senior leader while I'm still the default for every ops question.", avoiding: 'Clarifying which decisions move to Dana from day one.', confidence: 7.3, team: 8, energyGain: 'Planning the strategy offsite.', energyDrain: 'Counter-offer anxiety.', improve: "Draft Dana's first-90-days decision rights.", emotion: 'Confident', energy: 7, stress: 5, goal: 60 },
      { achievement: 'Dana accepted — she starts December 1.', challenge: 'Building a leadership bench beyond Dana; we need a Head of Growth too.', avoiding: 'Restructuring my own role once Dana starts.', confidence: 7.4, team: 8, energyGain: "Quarterly strategy review — the first time I've looked six months ahead.", energyDrain: 'End-of-quarter cash planning.', improve: 'Spend one day a week fully on strategy.', emotion: 'Confident', energy: 7, stress: 5, goal: 64 },
    ],
    daily: [
      { daysAgo: 60, emotion: 'Overwhelmed', energy: 3, note: 'Warehouse until 10pm. This is not sustainable.', protectedTime: false },
      { daysAgo: 45, emotion: 'Anxious', energy: 4, note: 'Every supplier problem lands on me. I need an operations leader.', protectedTime: false },
      { daysAgo: 30, emotion: 'Hopeful', energy: 6, note: 'Leo handled the supplier call. I stayed out of it.', protectedTime: true },
      { daysAgo: 16, emotion: 'Focused', energy: 7, note: 'Strategy Friday held. Sketched the 2027 wholesale plan.', protectedTime: true },
      { daysAgo: 6, emotion: 'Confident', energy: 7, note: 'Dana said yes. Now the work is letting her actually own operations.', protectedTime: true },
      { daysAgo: 3, emotion: 'Calm', energy: 7, note: 'Wrote my own role description for 2027.', protectedTime: true },
      { daysAgo: 2, emotion: 'Focused', energy: 7, note: 'Head of Growth profile drafted with the Head of People.', protectedTime: true },
      { daysAgo: 1, emotion: 'Motivated', energy: 8, note: 'Big picture is clearer than it has been all year.', protectedTime: true },
    ],
    monthly: [
      { monthsAgo: 2, lesson: 'I am the bottleneck in operations, not the warehouse.', pattern: 'I fill every gap myself instead of hiring for it.', goal: 22, confidence: 5.7, nextFocus: 'Start the VP Operations search.' },
      { monthsAgo: 1, lesson: 'When I let go (Leo, Black Friday planning) the team rises.', pattern: 'Strategy time only happens when I protect it in advance.', goal: 52, confidence: 7.0, nextFocus: 'Close the VP hire and design my role for 2027.' },
    ],
    commitments: [
      { title: 'Define quarterly strategic priorities', description: 'Three Q4 priorities agreed with the leadership team and shared company-wide.', dueInDays: -45, createdDaysAgo: 60, priority: 'HIGH', goal: 'Strategic thinking', theme: 'strategic_thinking', status: 'COMPLETED', updates: [{ daysAgo: 46, status: 'COMPLETED', note: 'Shared at the all-hands.', by: 'CLIENT' }] },
      { title: 'Delegate supplier negotiations to ops lead', description: 'Leo owns supplier negotiations for the Q4 restock.', dueInDays: -30, createdDaysAgo: 44, priority: 'MEDIUM', goal: 'Operating cadence', theme: 'delegation', status: 'COMPLETED', updates: [{ daysAgo: 31, status: 'COMPLETED', note: 'Leo negotiated 8% better terms.', by: 'CLIENT' }] },
      { title: 'Protect Friday strategy time for four weeks', description: 'No meetings or warehouse time on Friday mornings.', dueInDays: -4, createdDaysAgo: 32, priority: 'MEDIUM', goal: 'Strategic thinking', theme: 'strategic_thinking', status: 'PARTIALLY_COMPLETED', updates: [{ daysAgo: 5, status: 'PARTIALLY_COMPLETED', note: 'Three out of four Fridays protected.', by: 'CLIENT' }] },
      { title: 'Hire VP of Operations', description: 'Run the search to an accepted offer.', dueInDays: 10, createdDaysAgo: 46, priority: 'HIGH', goal: 'Hiring leaders', theme: 'hiring', status: 'COMPLETED', updates: [{ daysAgo: 9, status: 'IN_PROGRESS', note: 'Offer out to Dana.', by: 'CLIENT' }, { daysAgo: 2, status: 'COMPLETED', note: 'Dana accepted, starts Dec 1.', by: 'CLIENT' }] },
      { title: "Draft Dana's first-90-days decision rights", description: 'Explicit list of decisions that move from Sarah to the VP of Operations.', dueInDays: 14, createdDaysAgo: 8, priority: 'HIGH', goal: 'Operating cadence', theme: 'delegation', status: 'IN_PROGRESS', updates: [] },
      { title: 'Open the Head of Growth search', description: 'Role scorecard and recruiter brief.', dueInDays: 21, createdDaysAgo: 3, priority: 'MEDIUM', goal: 'Hiring leaders', theme: 'hiring', status: 'NOT_STARTED', updates: [] },
    ],
    sessions: [
      { dayOffset: -65, hour: 18, durationMin: 60, topic: 'Kickoff: from operator to strategist', summary: 'Sarah works 80-hour weeks, most in operations. Set goal of one strategy day per week.', topics: ['Operational overload', 'Strategic thinking'], observations: 'Exhausted but clear-eyed.', decisions: ['Block Friday strategy time'], followUps: ['VP Ops hiring timeline'] },
      { dayOffset: -51, hour: 18, durationMin: 60, topic: 'Why the VP search keeps slipping', summary: 'Explored the belief that "no one will care as much as I do". Agreed to brief a recruiter.', topics: ['Hiring', 'Control'], observations: 'Named the fear of losing the culture.', decisions: ['Brief a recruiter'], followUps: ['Define VP scorecard'] },
      { dayOffset: -37, hour: 18, durationMin: 60, topic: 'Letting Leo lead', summary: 'Leo\'s supplier win was a breakthrough moment. Sarah connected it to her strategy-time goal.', topics: ['Delegation', 'Team ownership'], observations: 'Noticeably lighter. Energy up.', decisions: ['Delegate first-round interviews'], followUps: ['Strategy Friday review'] },
      { dayOffset: -23, hour: 18, durationMin: 60, topic: 'Compensation and the board', summary: 'Prepared Sarah for the equity conversation with the board.', topics: ['Hiring', 'Board'], observations: 'More confident framing the business case.', decisions: ['Ask board for expanded equity pool'], followUps: ['Offer outcome'] },
      { dayOffset: -9, hour: 18, durationMin: 60, topic: 'Designing the CEO role for 2027', summary: 'With Dana joining, began designing what Sarah stops doing.', topics: ['Strategic thinking', 'Role design'], observations: 'Excited and a little anxious about losing her operational identity.', decisions: ['Draft Dana decision rights'], followUps: ['Head of Growth search'] },
      { dayOffset: 4, hour: 18, durationMin: 60, topic: 'Onboarding Dana and the Head of Growth search' },
    ],
  },
  {
    programKey: 'presence',
    name: 'David Miller',
    email: 'david.miller@brightpath-tech.com',
    avatarColor: '#b45309',
    company: 'BrightPath Technologies',
    designation: 'Chief Executive Officer',
    industry: 'Technology services · IT consulting',
    companySize: '600 employees',
    location: 'Chicago, IL',
    phone: '+1 (312) 555-0119',
    links: [
      { label: 'LinkedIn', url: 'https://www.linkedin.com/in/david-miller-brightpath' },
      { label: 'BrightPath Tech', url: 'https://brightpath-tech.com' },
    ],
    startWeeksAgo: 10,
    program: 'Executive Presence Intensive',
    coachNotes:
      'David is warm and well-liked; conflict avoidance is the core pattern. Board preparation work is paying off. He has gone quiet on reflections — check in on what is happening with Tom.',
    weekly: [
      { achievement: 'Delivered the Q3 results at all-hands; people said it felt clearer than last quarter.', challenge: "Tom's delivery team missed another milestone and I didn't raise it with him.", avoiding: 'Giving Tom direct feedback about the missed milestones.', confidence: 6.4, team: 7, energyGain: 'Client visit in Austin.', energyDrain: 'Preparing for the board meeting.', improve: 'Give Tom direct feedback this week.', emotion: 'Anxious', energy: 6, stress: 6, goal: 25 },
      { achievement: 'Won the regional banking contract renewal.', challenge: 'Board meeting — I rambled when Margaret pushed on margins.', avoiding: 'Telling the board we need to reprice our managed services.', confidence: 6.0, team: 7, energyGain: 'Coaching session — practising the opening three minutes.', energyDrain: 'Second-guessing what I said in the board meeting.', improve: 'Prepare a one-page board update with three clear messages.', emotion: 'Frustrated', energy: 5, stress: 7, goal: 28 },
      { achievement: 'Client escalation with Halden Insurance resolved.', challenge: "I still haven't told Tom how serious the delivery issues are.", avoiding: 'The hard conversation with Tom.', confidence: 5.8, team: 6, energyGain: 'A clear morning to write.', energyDrain: 'Avoiding conversations I know I need to have.', improve: 'Have the conversation with Tom before Friday.', emotion: 'Anxious', energy: 5, stress: 7, goal: 30 },
      { achievement: 'Presented the pricing proposal to the leadership team with real composure.', challenge: "The board chair asked for the pricing plan early; I wasn't ready and postponed.", avoiding: 'Sending the pricing memo to the board.', confidence: 6.1, team: 7, energyGain: 'The leadership team pushed back productively in the pricing session.', energyDrain: 'The board deadline.', improve: 'Rehearse the board update with Margaret.', emotion: 'Hopeful', energy: 6, stress: 6, goal: 35 },
      { achievement: 'Rehearsed the board update with Margaret — she said I sounded more decisive.', challenge: "Gave Tom feedback, but softened it so much I'm not sure it landed.", avoiding: 'Following up with Tom with specifics.', confidence: 6.3, team: 6, energyGain: "Margaret's feedback.", energyDrain: 'Client escalation calls at night.', improve: 'Be direct in the follow-up with Tom.', emotion: 'Hopeful', energy: 6, stress: 6, goal: 38 },
      { achievement: 'Board meeting went better — I opened with the three messages.', challenge: 'The board questioned the pricing plan and I conceded more than I wanted to.', avoiding: "Pushing back on the board's margin target.", confidence: 5.9, team: 6, energyGain: 'Delivering the all-hands without notes.', energyDrain: "The board's reaction to pricing.", improve: 'Prepare my counter-position for the board pricing discussion.', emotion: 'Anxious', energy: 5, stress: 7, goal: 40 },
      { achievement: 'Closed the cloud migration deal.', challenge: "Tom's team missed the Halden milestone again and the client escalated to me. I still haven't told Tom what needs to change.", avoiding: 'The conversation with Tom — I keep postponing it.', confidence: 5.4, team: 5, energyGain: 'Weekend away with family.', energyDrain: 'Board pressure and the Tom situation.', improve: 'Finally have the direct conversation with Tom.', emotion: 'Overwhelmed', energy: 4, stress: 8, goal: 40 },
      null,
      null,
    ],
    daily: [
      { daysAgo: 58, emotion: 'Anxious', energy: 5, note: 'Board deck review. I keep adding slides instead of cutting them.', protectedTime: false },
      { daysAgo: 44, emotion: 'Frustrated', energy: 5, note: 'Another missed milestone. I said nothing in the delivery review.', protectedTime: false },
      { daysAgo: 29, emotion: 'Hopeful', energy: 6, note: 'Rehearsal with Margaret went well. Three messages, no more.', protectedTime: true },
      { daysAgo: 22, emotion: 'Anxious', energy: 5, note: 'Softened the feedback to Tom again. Why do I do that?', protectedTime: false },
    ],
    monthly: [
      { monthsAgo: 2, lesson: 'Clarity in the board room starts with fewer messages.', pattern: 'I postpone hard conversations until they become crises.', goal: 26, confidence: 6.2, nextFocus: 'Board communication.' },
      { monthsAgo: 1, lesson: 'My presence improves when I prepare the first three minutes.', pattern: 'I soften feedback until it loses its meaning.', goal: 38, confidence: 5.9, nextFocus: 'The conversation with Tom.' },
    ],
    commitments: [
      { title: 'Rehearse board update with the chair', description: 'Thirty-minute rehearsal with Margaret before the October board meeting.', dueInDays: -32, createdDaysAgo: 40, priority: 'HIGH', goal: 'Board communication', theme: 'board_communication', status: 'COMPLETED', updates: [{ daysAgo: 33, status: 'COMPLETED', note: 'She said I sounded decisive.', by: 'CLIENT' }] },
      { title: 'Give direct feedback to VP Delivery', description: 'Specific, direct conversation with Tom about the missed milestones and what must change by end of quarter.', dueInDays: -40, createdDaysAgo: 55, priority: 'HIGH', goal: 'Difficult conversations', theme: 'difficult_conversations', status: 'PARTIALLY_COMPLETED', updates: [{ daysAgo: 30, status: 'PARTIALLY_COMPLETED', note: 'Had a conversation but softened it.', by: 'CLIENT' }] },
      { title: 'Follow up with Tom with specific expectations', description: 'Written expectations with dates, discussed in person.', dueInDays: -12, createdDaysAgo: 26, priority: 'HIGH', goal: 'Difficult conversations', theme: 'difficult_conversations', status: 'NOT_STARTED', updates: [] },
      { title: 'Send the pricing memo to the board', description: 'One-page memo on repricing managed services.', dueInDays: -18, createdDaysAgo: 34, priority: 'MEDIUM', goal: 'Board communication', theme: 'board_communication', status: 'BLOCKED', updates: [{ daysAgo: 20, status: 'BLOCKED', note: 'Waiting on finance numbers.', by: 'CLIENT' }] },
      { title: 'Lead the November all-hands without notes', description: 'Practise with the comms lead beforehand.', dueInDays: 12, createdDaysAgo: 10, priority: 'LOW', goal: 'Executive presence', theme: 'executive_presence', status: 'IN_PROGRESS', updates: [] },
    ],
    sessions: [
      { dayOffset: -64, hour: 14, durationMin: 60, topic: 'Kickoff: presence and the board room', summary: 'David wants to be seen as decisive by his board. Explored his tendency to over-explain.', topics: ['Executive presence', 'Board communication'], observations: 'Articulate one-on-one, hesitant when imagining board pushback.', decisions: ['Three-message board update format'], followUps: ['Board rehearsal'] },
      { dayOffset: -50, hour: 14, durationMin: 60, topic: 'The Tom conversation', summary: 'David acknowledged he has avoided giving Tom feedback for two quarters.', topics: ['Difficult conversations', 'Delivery'], observations: 'Became visibly uncomfortable. Values being liked.', decisions: ['Give Tom direct feedback'], followUps: ['Check on the conversation'] },
      { dayOffset: -36, hour: 14, durationMin: 60, topic: 'Board rehearsal debrief', summary: 'Rehearsal with Margaret went well. Feedback to Tom happened but was softened.', topics: ['Board communication', 'Difficult conversations'], observations: 'Proud of the board work; deflected when asked about Tom.', decisions: ['Written expectations for Tom'], followUps: ['Pricing memo'] },
      { dayOffset: -22, hour: 14, durationMin: 60, topic: 'Holding a position with the board', summary: 'Board pushed back on pricing and David conceded. Explored what holding a position would have required.', topics: ['Board communication', 'Executive presence'], observations: 'Energy lower. Reflections have become shorter.', decisions: ['Prepare a counter-position'], followUps: ['Tom follow-up', 'Pricing memo'] },
      { dayOffset: 6, hour: 14, durationMin: 60, topic: 'Board communication and the conversation with Tom' },
    ],
  },
]

export const EMOTIONS = ['Motivated', 'Confident', 'Focused', 'Calm', 'Hopeful', 'Anxious', 'Frustrated', 'Overwhelmed', 'Tired', 'Grateful']
