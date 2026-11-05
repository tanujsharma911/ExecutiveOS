import { ArrowDownRight, ArrowUpRight, ChevronDown, Copy, GitCompareArrows, HeartPulse, Lightbulb, ListChecks, MessageCircleQuestion, Quote, Repeat, Sparkles, TriangleAlert } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Evidence, Insight, InsightCategory } from '@/lib/types'
import { cn, fmtDate } from '@/lib/utils'
import { ConfidencePill } from './Status'

export const CATEGORY_META: Record<InsightCategory, { label: string; icon: React.ElementType; tone: string }> = {
  recurring: { label: 'Recurring pattern', icon: Repeat, tone: 'text-ai bg-ai-soft' },
  emerging: { label: 'Emerging', icon: ArrowUpRight, tone: 'text-warning bg-warning-soft' },
  disappearing: { label: 'Fading', icon: ArrowDownRight, tone: 'text-success bg-success-soft' },
  contradiction: { label: 'Contradiction', icon: GitCompareArrows, tone: 'text-danger bg-danger-soft' },
  emotional: { label: 'Emotional trend', icon: HeartPulse, tone: 'text-pink-700 bg-pink-50' },
  unresolved: { label: 'Unresolved', icon: TriangleAlert, tone: 'text-warning bg-warning-soft' },
  commitment: { label: 'Commitments', icon: ListChecks, tone: 'text-foreground bg-muted' },
}

export function CategoryChip({ category }: { category: InsightCategory }) {
  const m = CATEGORY_META[category]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', m.tone)}>
      <m.icon className="size-3" /> {m.label}
    </span>
  )
}

export function EvidenceQuote({ e, compact }: { e: Evidence; compact?: boolean }) {
  return (
    <figure className={cn('relative rounded-lg border-l-2 border-ai/40 bg-muted/60 py-2 pl-3 pr-3', compact && 'py-1.5')}>
      <blockquote className="font-serif text-[15px] leading-snug text-foreground/90">“{e.quote}”</blockquote>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground">
        <span className="font-medium text-foreground/70">{fmtDate(e.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <span>·</span>
        <span>{e.source}</span>
      </figcaption>
    </figure>
  )
}

export function HypothesisBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-ai/15 bg-ai-soft/60 px-3 py-2.5', className)}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ai">
        <Sparkles className="size-3" /> AI hypothesis · not a conclusion
      </div>
      <p className="text-[13px] leading-relaxed text-foreground/85">{children}</p>
    </div>
  )
}

export function SuggestedQuestion({ question, onUse, used }: { question: string; onUse?: () => void; used?: boolean }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <MessageCircleQuestion className="size-3" /> Suggested coaching question
      </div>
      <p className="font-serif text-[16px] leading-snug">{question}</p>
      <div className="mt-2 flex gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            navigator.clipboard?.writeText(question).catch(() => undefined)
            toast.success('Question copied')
          }}
        >
          <Copy /> Copy
        </Button>
        {onUse ? (
          <Button size="sm" variant={used ? 'secondary' : 'ai-soft'} onClick={onUse}>
            <Lightbulb /> {used ? 'Added to session' : 'Use in next session'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function InsightCard({ insight, defaultOpen, onUseQuestion, usedQuestion, className }: { insight: Insight; defaultOpen?: boolean; onUseQuestion?: (i: Insight) => void; usedQuestion?: boolean; className?: string }) {
  const [open, setOpen] = React.useState(!!defaultOpen)
  const related = (insight.stats?.relatedThemes as string[] | undefined) ?? []
  return (
    <article className={cn('rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,16,20,0.04)] transition hover:shadow-[0_2px_10px_rgba(16,16,20,0.06)]', className)}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <CategoryChip category={insight.category} />
            <ConfidencePill level={insight.confidence} score={insight.confidenceScore} />
          </div>
          <h3 className="text-[14.5px] font-semibold leading-snug">{insight.title}</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{insight.summary}</p>
        </div>
        <ChevronDown className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="grid gap-3 border-t px-4 pb-4 pt-3.5 animate-rise">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Observed facts</div>
            <ul className="grid gap-1">
              {insight.facts.map((f) => (
                <li key={f} className="flex gap-2 text-[13px]">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-foreground/50" /> <span>{f}</span>
                </li>
              ))}
            </ul>
            {related.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                Related themes:
                {related.map((r) => (
                  <Badge key={r} variant="outline">
                    {r}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          {insight.evidence.length ? (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Quote className="size-3" /> Evidence ({insight.evidence.length})
              </div>
              <div className="grid gap-2">
                {insight.evidence.map((e, i) => (
                  <EvidenceQuote key={i} e={e} />
                ))}
              </div>
            </div>
          ) : null}
          {insight.hypothesis ? <HypothesisBox>{insight.hypothesis}</HypothesisBox> : null}
          {insight.suggestedQuestion ? <SuggestedQuestion question={insight.suggestedQuestion} onUse={onUseQuestion ? () => onUseQuestion(insight) : undefined} used={usedQuestion} /> : null}
        </div>
      ) : null}
    </article>
  )
}
