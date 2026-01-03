import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '~/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'default', size = 'default', asChild = false, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-foreground text-background hover:bg-foreground/90':
              variant === 'default',
            'bg-muted text-foreground hover:bg-muted/80': variant === 'secondary',
            'hover:bg-muted': variant === 'ghost',
            'bg-destructive text-white hover:bg-destructive/90':
              variant === 'destructive',
          },
          {
            'h-10 px-4 py-2 text-sm': size === 'default',
            'h-8 px-3 text-xs': size === 'sm',
            'h-12 px-6 text-base': size === 'lg',
            'h-10 w-10': size === 'icon',
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
