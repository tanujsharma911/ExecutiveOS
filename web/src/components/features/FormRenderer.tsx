import { BrickWall, Check, HeartHandshake, Leaf, Moon, Rocket, ShieldCheck, Sunrise, Target, Waves, Wind, type LucideIcon } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/input'
import type { Question, QuestionType } from '@/lib/types'
import { cn } from '@/lib/utils'

export const QUESTION_TYPES: { value: QuestionType; label: string; hint: string }[] = [
  { value: 'SHORT_TEXT', label: 'Short text', hint: 'One line answer' },
  { value: 'LONG_TEXT', label: 'Long text', hint: 'Open reflection' },
  { value: 'SINGLE_CHOICE', label: 'Single choice', hint: 'Pick one option' },
  { value: 'MULTIPLE_CHOICE', label: 'Multiple choice', hint: 'Pick any options' },
  { value: 'RATING', label: 'Rating scale (1–10)', hint: 'Numeric self-rating' },
  { value: 'YES_NO', label: 'Yes / No', hint: 'Binary answer' },
  { value: 'DATE', label: 'Date', hint: 'Calendar date' },
  { value: 'NUMBER', label: 'Number', hint: 'Any number' },
  { value: 'EMOTION', label: 'Emotion selection', hint: 'Visual emotion cards' },
  { value: 'GOAL_PROGRESS', label: 'Goal progress', hint: '0–100% slider' },
]

export const EMOTIONS: { label: string; icon: LucideIcon; color: string; bg: string }[] = [
  { label: 'Motivated', icon: Rocket, color: '#4f46e5', bg: '#eef0ff' },
  { label: 'Confident', icon: ShieldCheck, color: '#0f766e', bg: '#e6f5f2' },
  { label: 'Focused', icon: Target, color: '#0369a1', bg: '#e7f3fb' },
  { label: 'Calm', icon: Leaf, color: '#15803d', bg: '#eaf6ec' },
  { label: 'Hopeful', icon: Sunrise, color: '#b45309', bg: '#fdf3e4' },
  { label: 'Grateful', icon: HeartHandshake, color: '#be185d', bg: '#fcebf3' },
  { label: 'Tired', icon: Moon, color: '#475569', bg: '#eff1f4' },
  { label: 'Anxious', icon: Wind, color: '#7c3aed', bg: '#f2ecfd' },
  { label: 'Frustrated', icon: BrickWall, color: '#c2410c', bg: '#fdeee6' },
  { label: 'Overwhelmed', icon: Waves, color: '#1d4ed8', bg: '#e9effd' },
]

export function QuestionInput({ q, value, onChange, disabled }: { q: Question; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  switch (q.type) {
    case 'SHORT_TEXT':
      return <Input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-11 text-[15px]" placeholder="Your answer" />
    case 'LONG_TEXT':
      return <Textarea value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={4} className="font-serif text-[17px] leading-relaxed" placeholder="Take your time…" />
    case 'NUMBER':
      return <Input type="number" value={(value as number | string) ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} disabled={disabled} className="h-11 w-40 text-[15px]" />
    case 'DATE':
      return <Input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-11 w-52" />
    case 'YES_NO':
      return (
        <div className="flex gap-2">
          {[true, false].map((b) => (
            <button key={String(b)} type="button" disabled={disabled} onClick={() => onChange(b)} className={cn('h-11 w-24 rounded-lg border text-[14px] font-medium transition cursor-pointer', value === b ? 'border-foreground bg-foreground text-white' : 'bg-card hover:bg-muted')}>
              {b ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      )
    case 'RATING':
      return (
        <div>
          <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => onChange(n)}
                className={cn('h-11 rounded-lg border text-[14px] font-semibold tabular-nums transition cursor-pointer', value === n ? 'scale-[1.04] border-foreground bg-foreground text-white shadow' : typeof value === 'number' && n < value ? 'border-foreground/20 bg-foreground/5' : 'bg-card hover:bg-muted')}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[11.5px] text-muted-foreground">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>
      )
    case 'GOAL_PROGRESS': {
      const v = typeof value === 'number' ? value : 0
      return (
        <div className="flex items-center gap-4">
          <input type="range" min={0} max={100} step={5} value={v} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="h-2 flex-1 cursor-pointer accent-[var(--ai)]" />
          <span className="w-14 text-right text-[18px] font-semibold tabular-nums">{v}%</span>
        </div>
      )
    }
    case 'EMOTION': {
      const opts = q.options?.length ? q.options : EMOTIONS.map((e) => e.label)
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {opts.map((label) => {
            const e = EMOTIONS.find((x) => x.label === label) ?? { label, icon: Leaf, color: '#52525b', bg: '#f4f4f5' }
            const selected = value === label
            return (
              <button
                key={label}
                type="button"
                disabled={disabled}
                onClick={() => onChange(label)}
                className={cn('group relative flex flex-col items-center gap-2 rounded-xl border bg-card px-2 py-3.5 transition cursor-pointer', selected ? 'border-foreground shadow-md ring-2 ring-foreground/10' : 'hover:-translate-y-0.5 hover:shadow-sm')}
                style={selected ? { background: e.bg } : undefined}
              >
                <span className={cn('flex size-10 items-center justify-center rounded-full transition', selected && 'animate-pop')} style={{ background: e.bg, color: e.color }}>
                  <e.icon className="size-5" />
                </span>
                <span className="text-[12.5px] font-medium">{label}</span>
                {selected ? (
                  <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-foreground text-white">
                    <Check className="size-2.5" />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      )
    }
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE': {
      const multi = q.type === 'MULTIPLE_CHOICE'
      const arr = Array.isArray(value) ? (value as string[]) : []
      return (
        <div className="grid gap-1.5">
          {q.options.map((o) => {
            const on = multi ? arr.includes(o) : value === o
            return (
              <button
                key={o}
                type="button"
                disabled={disabled}
                onClick={() => onChange(multi ? (on ? arr.filter((x) => x !== o) : [...arr, o]) : o)}
                className={cn('flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-[14px] transition cursor-pointer', on ? 'border-foreground bg-foreground/[0.03]' : 'bg-card hover:bg-muted/60')}
              >
                <span className={cn('flex size-4 shrink-0 items-center justify-center border', multi ? 'rounded' : 'rounded-full', on ? 'border-foreground bg-foreground text-white' : 'border-input')}>{on ? <Check className="size-3" /> : null}</span>
                {o}
              </button>
            )
          })}
          {!q.options.length ? <span className="text-[13px] text-muted-foreground">No options configured.</span> : null}
        </div>
      )
    }
  }
}

export function FormRenderer({ questions, values, onChange, disabled, missing }: { questions: Question[]; values: Record<string, unknown>; onChange: (id: string, v: unknown) => void; disabled?: boolean; missing?: Set<string> }) {
  return (
    <div className="grid gap-9">
      {questions.map((q, i) => {
        const key = q.id ?? String(i)
        return (
          <div key={key} id={`q-${key}`} className={cn('scroll-mt-24', missing?.has(key) && 'rounded-xl ring-2 ring-danger/30 ring-offset-8')}>
            <div className="mb-3 flex gap-3">
              <span className="pt-0.5 text-[13px] font-medium tabular-nums text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <label className="text-[17px] font-medium leading-snug">
                  {q.label}
                  {q.required ? <span className="ml-1 text-danger">*</span> : null}
                </label>
                {q.helpText ? <p className="mt-0.5 text-[13px] text-muted-foreground">{q.helpText}</p> : null}
              </div>
            </div>
            <div className="sm:pl-8">
              <QuestionInput q={q} value={values[key]} onChange={(v) => onChange(key, v)} disabled={disabled} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
