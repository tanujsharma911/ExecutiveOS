import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shown only where an LLM is still writing (e.g. the AI summary). A gently pulsing sparkle, a label that
 * steps through what the assistant is doing, and shimmering lines where the text will appear.
 */
export function AiGenerating({ steps = ['Reading the analysis', 'Connecting the patterns', 'Writing the summary'], lines = 3, className }: { steps?: string[]; lines?: number; className?: string }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (steps.length < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % steps.length), 1800)
    return () => clearInterval(t)
  }, [steps.length])
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3', 'w-3/5']
  return (
    <div className={cn('grid gap-2', className)} role="status" aria-live="polite" data-ai-generating>
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ai">
        <Sparkles className="ai-sparkle size-3.5" />
        <span key={i} className="animate-rise">
          {steps[i]}
        </span>
        <span className="ai-dots" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </div>
      {Array.from({ length: lines }, (_, k) => (
        <div key={k} className={cn('ai-shimmer h-3.5 rounded', widths[k % widths.length])} style={{ animationDelay: `${k * 120}ms` }} />
      ))}
    </div>
  )
}
