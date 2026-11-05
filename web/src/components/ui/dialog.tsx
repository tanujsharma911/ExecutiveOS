import { X } from 'lucide-react'
import { Dialog as D } from 'radix-ui'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

export function DialogContent({ className, children, wide, ...p }: React.ComponentProps<typeof D.Content> & { wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-zinc-950/30 backdrop-blur-[1px] data-[state=open]:animate-rise" />
      <D.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-card shadow-2xl focus:outline-none',
          wide ? 'max-w-3xl' : 'max-w-lg',
          className,
        )}
        {...p}
      >
        {children}
        <D.Close className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  )
}
export function DialogHeader({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className="border-b px-5 py-4 pr-12">
      <D.Title className="text-[15px] font-semibold">{title}</D.Title>
      {description ? <D.Description className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">Dialog</D.Description>}
    </div>
  )
}
export function DialogBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-y-auto px-5 py-4', className)} {...p} />
}
export function DialogFooter({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3', className)} {...p} />
}
