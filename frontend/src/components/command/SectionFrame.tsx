export function SectionFrame({ title, latin }: { title: string; latin?: string }) {
  return (
    <div className="mb-3.5 mt-7 flex items-center gap-3">
      <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--cmd-ink2)]">
        <span className="mr-1.5 text-primary">◢</span>
        {title}
        {latin && <span className="ml-2 text-[var(--cmd-ink3)]">· {latin}</span>}
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
    </div>
  );
}
