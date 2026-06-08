import { cn } from '@/lib/utils';

const STROKE: Record<string, string> = { pos: 'var(--pos)', neg: 'var(--neg)', amber: 'var(--cmd-amber-bright, #f3b85a)' };

export function Sparkline({
  points,
  tone = 'amber',
  width = 64,
  height = 18,
  className,
}: {
  points: number[];
  tone?: 'pos' | 'neg' | 'amber';
  width?: number;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return <span className={cn('inline-block', className)} style={{ width, height }} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points
    .map((p, i) => `${(i * step).toFixed(1)},${(height - ((p - min) / span) * height).toFixed(1)}`)
    .join(' ');
  return (
    <svg className={cn('inline-block align-middle', className)} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={coords} fill="none" stroke={STROKE[tone]} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
