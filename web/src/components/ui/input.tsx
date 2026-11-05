import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn('flex h-9 w-full rounded-md border border-input bg-card px-3 text-[13.5px] shadow-xs placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring/60 disabled:opacity-50', className)} {...props} />
))
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn('flex min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-[13.5px] shadow-xs placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring/60 disabled:opacity-50', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[12.5px] font-medium text-foreground/90', className)} {...p} />
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn('flex h-9 w-full appearance-none rounded-md border border-input bg-card bg-[length:16px] bg-[right_8px_center] bg-no-repeat pl-3 pr-8 text-[13.5px] shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b6b73' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
    {children}
  </select>
))
NativeSelect.displayName = 'NativeSelect'
