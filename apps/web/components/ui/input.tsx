import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-11 w-full rounded-xl border border-input bg-card px-3.5 text-[15px] shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'flex h-11 w-full appearance-none rounded-xl border border-input bg-card bg-[length:16px] bg-[right_12px_center] bg-no-repeat px-3.5 pr-9 text-[15px] shadow-xs focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring aria-invalid:border-destructive',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23888'%3E%3Cpath stroke-linecap='round' stroke-width='2' d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-24 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-[15px] shadow-xs focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  );
}
