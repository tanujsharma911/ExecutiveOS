import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] leading-[1.35] font-medium whitespace-nowrap [&_svg]:size-3', {
  variants: {
    variant: {
      default: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'border-border text-muted-foreground bg-card',
      ai: 'border-transparent bg-ai-soft text-ai',
      success: 'border-transparent bg-success-soft text-success',
      warning: 'border-transparent bg-warning-soft text-warning',
      danger: 'border-transparent bg-danger-soft text-danger',
      dark: 'border-transparent bg-primary text-primary-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
})

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
