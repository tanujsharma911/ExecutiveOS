import { Popover as P, Switch as Sw, Tooltip as Tt } from 'radix-ui'
import * as React from 'react'
import { cn, initials } from '@/lib/utils'

export function Avatar({ name, color, size = 32, className }: { name: string; color?: string; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white', className)} style={{ width: size, height: size, background: color ?? '#52525b', fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  )
}

export function Progress({ value, className, tone = 'default' }: { value: number; className?: string; tone?: 'default' | 'ai' | 'success' | 'warning' }) {
  const color = { default: 'bg-foreground', ai: 'bg-ai', success: 'bg-success', warning: 'bg-warning' }[tone]
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} style={style} />
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-border', className)} />
}

export function Switch({ className, ...p }: React.ComponentProps<typeof Sw.Root>) {
  return (
    <Sw.Root className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-input transition data-[state=checked]:bg-foreground', className)} {...p}>
      <Sw.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[18px]" />
    </Sw.Root>
  )
}

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <Tt.Provider delayDuration={200}>
      <Tt.Root>
        <Tt.Trigger asChild>{children}</Tt.Trigger>
        <Tt.Portal>
          <Tt.Content sideOffset={6} className="z-50 max-w-xs rounded-md bg-zinc-900 px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-lg">
            {content}
          </Tt.Content>
        </Tt.Portal>
      </Tt.Root>
    </Tt.Provider>
  )
}

export const Popover = P.Root
export const PopoverTrigger = P.Trigger
export function PopoverContent({ className, ...p }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content sideOffset={8} align="end" className={cn('z-50 rounded-xl border bg-card shadow-xl focus:outline-none animate-rise', className)} {...p} />
    </P.Portal>
  )
}
