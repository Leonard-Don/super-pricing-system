interface Entry { name?: string; value?: number | string; color?: string }

export function GlassTooltip({
  active,
  label,
  payload = [],
}: {
  active?: boolean;
  label?: string | number;
  payload?: Entry[];
}) {
  if (!active) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0e1626]/90 px-3 py-2 text-xs shadow-[0_12px_40px_-16px_rgba(0,0,0,0.7)] backdrop-blur">
      {label != null && <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--cmd-ink3)]">{label}</div>}
      {payload.map((e, i) => (
        <div key={`${e.name}-${i}`} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: e.color ?? 'var(--cmd-amber-bright)' }} />
          <span className="text-[var(--cmd-ink2)]">{e.name}</span>
          <span className="ml-auto font-mono tabular-nums text-[var(--cmd-ink)]">{e.value}</span>
        </div>
      ))}
    </div>
  );
}
