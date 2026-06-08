import type { ReactNode, ElementType, CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Tag className={cn('cmd-reveal', className)} style={{ animationDelay: `${delay}ms`, ...style }}>
      {children}
    </Tag>
  );
}
