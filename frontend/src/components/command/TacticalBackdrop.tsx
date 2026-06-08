import { cn } from '@/lib/utils';

export function TacticalBackdrop({
  grid = true,
  radar = false,
  intensity = 1,
  className,
}: {
  grid?: boolean;
  radar?: boolean;
  intensity?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      style={{
        opacity: intensity,
        maskImage: 'radial-gradient(130% 110% at 50% 0%, #000 35%, transparent 92%)',
        WebkitMaskImage: 'radial-gradient(130% 110% at 50% 0%, #000 35%, transparent 92%)',
      }}
    >
      {grid && (
        <div
          data-layer="grid"
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(var(--cmd-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--cmd-grid-line) 1px, transparent 1px)',
            backgroundSize: '24px 24px, 24px 24px',
          }}
        />
      )}
      {radar && (
        <div data-layer="radar" className="absolute" style={{ top: '14%', left: '88%' }}>
          {[60, 120, 180].map((d) => (
            <span
              key={d}
              className="absolute rounded-full"
              style={{ width: d, height: d, transform: 'translate(-50%,-50%)', border: '1px solid var(--cmd-radar)' }}
            />
          ))}
          <span
            className="cmd-radar-sweep absolute rounded-full"
            style={{
              width: 96,
              height: 96,
              transform: 'translate(-50%,-50%)',
              background: 'conic-gradient(from 0deg, var(--cmd-radar), transparent 55%)',
              animation: 'cmd-radar-spin 4s linear infinite',
              maskImage: 'radial-gradient(circle, #000 60%, transparent 62%)',
              WebkitMaskImage: 'radial-gradient(circle, #000 60%, transparent 62%)',
            }}
          />
        </div>
      )}
    </div>
  );
}
