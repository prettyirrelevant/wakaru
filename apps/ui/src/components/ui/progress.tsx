import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '~/lib/utils';

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        className="h-full bg-foreground transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
);

Progress.displayName = 'Progress';
