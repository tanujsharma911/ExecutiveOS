import type { QuestionType } from '../generated/prisma/enums.js'

export interface QuestionTemplate {
  key: string
  type: QuestionType
  label: string
  helpText?: string
  required?: boolean
  options?: string[]
  metricKey?: string
}

export const EMOTION_OPTIONS = ['Motivated', 'Confident', 'Focused', 'Calm', 'Hopeful', 'Grateful', 'Tired', 'Anxious', 'Frustrated', 'Overwhelmed']

export const WEEKLY_REFLECTION: QuestionTemplate[] = [
  { key: 'achievement', type: 'LONG_TEXT', label: 'What was your biggest achievement this week?', required: true },
  { key: 'challenge', type: 'LONG_TEXT', label: 'What was your biggest challenge?', required: true },
  { key: 'avoiding', type: 'LONG_TEXT', label: 'What decision are you currently avoiding?', helpText: 'Be honest — this stays between you and your coach.' },
  { key: 'confidence', type: 'RATING', label: 'How confident do you feel about your leadership?', required: true, metricKey: 'confidence' },
  { key: 'team', type: 'RATING', label: 'How would you rate your relationship with your team?', required: true, metricKey: 'team' },
  { key: 'energyGain', type: 'LONG_TEXT', label: 'What gave you energy this week?' },
  { key: 'energyDrain', type: 'LONG_TEXT', label: 'What drained your energy?' },
  { key: 'improve', type: 'LONG_TEXT', label: 'What is one thing you want to improve next week?', required: true },
  { key: 'emotion', type: 'EMOTION', label: 'Which feeling best describes your week?', required: true, options: EMOTION_OPTIONS, metricKey: 'emotion' },
  { key: 'energy', type: 'RATING', label: 'Overall energy level', metricKey: 'energy' },
  { key: 'stress', type: 'RATING', label: 'Overall stress level', metricKey: 'stress' },
  { key: 'goal', type: 'GOAL_PROGRESS', label: 'Progress toward your primary coaching goal', helpText: 'Self-reported estimate, 0–100%.', metricKey: 'goalProgress' },
]

export const DAILY_CHECKIN: QuestionTemplate[] = [
  { key: 'emotion', type: 'EMOTION', label: 'How are you feeling right now?', required: true, options: EMOTION_OPTIONS, metricKey: 'emotion' },
  { key: 'energy', type: 'RATING', label: 'Energy level', required: true, metricKey: 'energy' },
  { key: 'note', type: 'LONG_TEXT', label: 'What is on your mind today?' },
  { key: 'protectedTime', type: 'YES_NO', label: 'Did you protect time for your top priority?' },
]

export const MONTHLY_REVIEW: QuestionTemplate[] = [
  { key: 'lesson', type: 'LONG_TEXT', label: 'What was your most important leadership lesson this month?', required: true },
  { key: 'pattern', type: 'LONG_TEXT', label: 'What pattern have you noticed in yourself?' },
  { key: 'goal', type: 'GOAL_PROGRESS', label: 'Progress toward your coaching goals', metricKey: 'goalProgress', required: true },
  { key: 'confidence', type: 'RATING', label: 'Leadership confidence this month', metricKey: 'confidence' },
  { key: 'nextFocus', type: 'SHORT_TEXT', label: 'What should we focus on next month?' },
]
