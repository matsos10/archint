import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative flex gap-3 rounded-xl border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', {
  variants: {
    variant: {
      default: 'bg-card',
      info: 'border-primary/20 bg-accent text-accent-foreground',
      warning: 'border-warning/40 bg-warning/10',
      destructive: 'border-destructive/30 bg-destructive/8 text-destructive',
      success: 'border-success/30 bg-success/8',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div role={variant === 'destructive' ? 'alert' : 'status'} className={cn(alertVariants({ variant }), className)} {...props} />;
}
