import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70 border border-border',
        outline: 'border border-border bg-card hover:bg-muted text-foreground shadow-xs',
        ghost: 'hover:bg-muted text-foreground',
        ai: 'bg-ai text-white hover:bg-ai/90 shadow-sm',
        'ai-soft': 'bg-ai-soft text-ai hover:bg-ai-soft/70',
        danger: 'bg-danger text-white hover:bg-danger/90',
        link: 'text-foreground underline-offset-4 hover:underline px-0',
      },
      size: { default: 'h-9 px-3.5', sm: 'h-8 px-2.5 text-xs', lg: 'h-10 px-5', icon: 'size-9', 'icon-sm': 'size-7' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'
export { buttonVariants }
