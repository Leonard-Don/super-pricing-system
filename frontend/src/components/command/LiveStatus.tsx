export function LiveStatus({ online, total, ts }: { online: number; total: number; ts: string }) {
  const ok = online >= total;
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-[var(--cmd-ink2)]">
      <span
        className="inline-block h-[7px] w-[7px] rounded-full"
        style={{
          background: ok ? 'var(--pos)' : 'var(--neg)',
          boxShadow: ok ? '0 0 0 3px rgba(95,191,126,.18), 0 0 10px var(--pos)' : '0 0 10px var(--neg)',
        }}
      />
      LIVE · {ts} · {online}/{total} ONLINE
    </div>
  );
}
