import * as React from 'react';
import { cn } from '@/shared/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:ring-ring/50 disabled:bg-subtle hover:not-focus-visible:bg-track aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 bg-canvas flex field-sizing-content min-h-24 w-full rounded-lg border border-transparent px-3.5 py-2.5 text-base font-medium transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-[15px]',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
