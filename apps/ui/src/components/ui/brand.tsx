import { cn } from '~/lib/utils';

interface BrandProps {
  className?: string;
  compact?: boolean;
}

export function Brand({ className, compact = false }: BrandProps) {
  return (
    <div className={cn('flex items-center gap-3', className)} translate="no">
      <img
        src="/logo.png"
        alt=""
        width="40"
        height="40"
        className="h-9 w-9 object-cover"
      />
      {!compact && (
        <div className="leading-none">
          <p className="text-[15px] font-semibold tracking-[-0.02em]">wakaru</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            ~/private-finance
          </p>
        </div>
      )}
    </div>
  );
}
