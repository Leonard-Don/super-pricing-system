import { cn } from '@/lib/utils';

export function Skeleton({
  w = '100%',
  h = 14,
  rounded = 8,
  className,
}: {
  w?: number | string;
  h?: number | string;
  rounded?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('relative overflow-hidden bg-white/[0.05]', className)}
      style={{ width: w, height: h, borderRadius: rounded }}
    >
      <div
        className="cmd-shimmer-bar absolute inset-0 -translate-x-full"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)',
          animation: 'cmd-shimmer 1.4s infinite',
        }}
      />
    </div>
  );
}
