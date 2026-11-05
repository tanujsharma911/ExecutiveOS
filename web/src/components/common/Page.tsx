import { AlertCircle, Loader2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[12px] font-medium text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[13.5px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground', className)}>
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-[13px] text-danger">
      <AlertCircle className="size-4" /> {message}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: React.ElementType; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      {Icon ? <Icon className="mb-3 size-6 text-muted-foreground" /> : null}
      <div className="text-[14px] font-medium">{title}</div>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ElementType; tone?: 'ai' | 'warning' | 'default' }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(16,16,20,0.04)]">
      <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
        {label}
        {Icon ? <Icon className={cn('size-4', tone === 'ai' ? 'text-ai' : tone === 'warning' ? 'text-warning' : 'text-muted-foreground/70')} /> : null}
      </div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-1.5 text-[12px] text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

export function SectionTitle({ children, icon: Icon, right }: { children: React.ReactNode; icon?: React.ElementType; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {Icon ? <Icon className="size-3.5" /> : null}
        {children}
      </h2>
      {right}
    </div>
  )
}
