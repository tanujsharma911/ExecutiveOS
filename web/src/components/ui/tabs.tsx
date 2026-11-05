import { Tabs as T } from 'radix-ui'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Tabs = T.Root
export function TabsList({ className, ...p }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn('flex items-center gap-1 overflow-x-auto overflow-y-hidden no-scrollbar shadow-[inset_0_-1px_0_0_var(--border)]', className)} {...p} />
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'relative inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground cursor-pointer [&_svg]:size-3.5',
        className,
      )}
      {...p}
    />
  )
}
export function TabsContent({ className, ...p }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn('pt-5 focus-visible:outline-none animate-rise', className)} {...p} />
}

export function Segmented<V extends string>({ value, onChange, options, className }: { value: V; onChange: (v: V) => void; options: { value: V; label: React.ReactNode }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-lg bg-muted p-0.5', className)}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cn('rounded-md px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground transition cursor-pointer', value === o.value && 'bg-card text-foreground shadow-sm')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
