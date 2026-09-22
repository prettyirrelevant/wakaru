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
          'inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap font-semibold',
          'transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 hover:shadow-md':
              variant === 'default',
            'border border-border bg-surface text-foreground hover:border-border-strong hover:bg-muted/70': variant === 'secondary',
            'text-muted-foreground hover:bg-muted hover:text-foreground': variant === 'ghost',
            'bg-destructive text-white hover:bg-destructive/90':
              variant === 'destructive',
          },
          {
            'h-10 px-4 text-sm': size === 'default',
            'h-8 px-3 text-xs': size === 'sm',
            'h-12 px-6 text-sm': size === 'lg',
            'h-10 w-10 p-0': size === 'icon',
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
