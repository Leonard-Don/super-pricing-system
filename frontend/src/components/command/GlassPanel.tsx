import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function GlassPanel({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--cmd-glass-border)] bg-[var(--cmd-glass)] backdrop-blur-md',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
