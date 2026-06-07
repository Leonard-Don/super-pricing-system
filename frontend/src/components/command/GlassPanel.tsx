import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function GlassPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--cmd-glass-border)] bg-[var(--cmd-glass)] backdrop-blur-md',
        className,
      )}
    >
      {children}
    </div>
  );
}
