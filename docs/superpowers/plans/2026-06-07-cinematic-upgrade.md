# 作战大屏 II · 电影感升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cinematic motion/texture/micro-viz layer on top of the existing「作战大屏」design system, then roll it across all 6 screens (flagship-first), appearance-only and reduced-motion-guarded.

**Architecture:** New self-contained primitives in `frontend/src/components/command/` (Reveal, MicroBar, Sparkline, TacticalBackdrop, Skeleton, GlassTooltip) + token/CSS-keyframe additions in `index.css` + chart-theme refinement. Each primitive is TDD'd in isolation; pages then consume them with no change to hooks/data flow/interactions.

**Tech Stack:** React 19 + TypeScript (strict) + Tailwind v4 (`@theme` + CSS vars) + Recharts + Vitest/RTL. Motion via CSS keyframes + existing `useCountUp`; reduced-motion via CSS `@media` + the existing global `matchMedia` test mock in `src/setupTests.ts`.

**Conventions (match existing code):** `cn` from `@/lib/utils`; command tokens `--cmd-*` in `index.css`; tones `pos|neg|amber`; barrel `@/components/command`; no `any`; unique React keys; tabular numbers preserved.

---

## File Structure

**Create:**
- `frontend/src/components/command/Reveal.tsx` — staggered rise-in wrapper
- `frontend/src/components/command/MicroBar.tsx` — inline value bar + diverging variant
- `frontend/src/components/command/Sparkline.tsx` — mini trend line (SVG)
- `frontend/src/components/command/TacticalBackdrop.tsx` — grid + corner-radar hero texture
- `frontend/src/components/command/Skeleton.tsx` — shimmer skeleton
- `frontend/src/components/command/GlassTooltip.tsx` — glass Recharts tooltip content
- matching `__tests__/*.test.tsx` for each

**Modify:**
- `frontend/src/index.css` — motion/texture/depth tokens + keyframes (`cmd-rise`, `cmd-pulse`, `cmd-radar-spin`, `cmd-shimmer`) + reduced-motion guards
- `frontend/src/components/command/index.ts` — export new primitives
- `frontend/src/features/pricing/lib/chartTheme.ts` — gradient/glow/reference-band helpers
- Page/feature files (GodEye, pricing, valuation, factor, workbench, login) in application tasks

---

## Task 1: Design-language delta tokens + keyframes

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add tokens + keyframes**

In the `:root` and `.dark` token blocks add (alongside existing `--cmd-*`):

```css
  --cmd-ease: cubic-bezier(0.22, 0.61, 0.36, 1);
  --cmd-rise-dist: 10px;
  --cmd-grid-line: rgba(110, 168, 255, 0.06);
  --cmd-radar: rgba(70, 200, 144, 0.20);
  --cmd-depth: 0 14px 44px -18px var(--cmd-glow-amber);
```

After the token blocks (top-level CSS, not inside `@theme`) add keyframes + reduced-motion guards:

```css
@keyframes cmd-rise { from { opacity: 0; transform: translateY(var(--cmd-rise-dist)); } to { opacity: 1; transform: none; } }
@keyframes cmd-pulse { 0% { box-shadow: 0 0 0 0 rgba(70,200,144,.5); } 70% { box-shadow: 0 0 0 7px rgba(70,200,144,0); } 100% { box-shadow: 0 0 0 0 rgba(70,200,144,0); } }
@keyframes cmd-radar-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes cmd-shimmer { 100% { transform: translateX(100%); } }

.cmd-reveal { opacity: 0; animation: cmd-rise 0.5s var(--cmd-ease) forwards; }

@media (prefers-reduced-motion: reduce) {
  .cmd-reveal { opacity: 1 !important; animation: none !important; }
  .cmd-pulse, .cmd-radar-sweep, .cmd-shimmer-bar { animation: none !important; }
}
```

- [ ] **Step 2: Verify build picks up CSS**

Run: `cd frontend && npx tsc --noEmit; echo tsc=$?` → Expected: `tsc=0` (CSS change is type-neutral).
Run: `cd frontend && npm run build > /tmp/b.txt 2>&1; echo build=$?` → Expected: `build=0`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(web): cinematic tokens + keyframes (rise/pulse/radar/shimmer) with reduced-motion guards"
```

---

## Task 2: `Reveal` — staggered rise-in wrapper

**Files:**
- Create: `frontend/src/components/command/Reveal.tsx`
- Test: `frontend/src/components/command/__tests__/Reveal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Reveal } from '@/components/command/Reveal';

describe('Reveal', () => {
  it('renders children and the reveal class', () => {
    render(<Reveal>hello</Reveal>);
    const el = screen.getByText('hello');
    expect(el.className).toMatch(/cmd-reveal/);
  });
  it('applies the stagger delay as an inline animation-delay', () => {
    render(<Reveal delay={120}>x</Reveal>);
    expect((screen.getByText('x') as HTMLElement).style.animationDelay).toBe('120ms');
  });
  it('renders as the requested element', () => {
    render(<Reveal as="li">item</Reveal>);
    expect(screen.getByText('item').tagName).toBe('LI');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/command/__tests__/Reveal.test.tsx`
Expected: FAIL ("Cannot find module .../Reveal").

- [ ] **Step 3: Write minimal implementation**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/command/__tests__/Reveal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/command/Reveal.tsx frontend/src/components/command/__tests__/Reveal.test.tsx
git commit -m "feat(web): Reveal staggered rise-in wrapper (reduced-motion via CSS)"
```

---

## Task 3: `MicroBar` — inline value bar (+ diverging)

**Files:**
- Create: `frontend/src/components/command/MicroBar.tsx`
- Test: `frontend/src/components/command/__tests__/MicroBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MicroBar } from '@/components/command/MicroBar';

describe('MicroBar', () => {
  it('fills width proportional to value/max', () => {
    const { container } = render(<MicroBar value={0.71} />);
    const fill = container.querySelector('[data-fill]') as HTMLElement;
    expect(fill.style.width).toBe('71%');
  });
  it('clamps to 0..100%', () => {
    const { container } = render(<MicroBar value={5} max={1} />);
    expect((container.querySelector('[data-fill]') as HTMLElement).style.width).toBe('100%');
  });
  it('diverging negative anchors to the center and extends left', () => {
    const { container } = render(<MicroBar value={-0.4} diverging />);
    const fill = container.querySelector('[data-fill]') as HTMLElement;
    expect(fill.dataset.side).toBe('neg');
    expect(fill.style.width).toBe('20%'); // |−0.4| / 2 of half-track => 20%
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/command/__tests__/MicroBar.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```tsx
import { cn } from '@/lib/utils';

type Tone = 'pos' | 'neg' | 'amber';
const TONE_BG: Record<Tone, string> = {
  pos: 'linear-gradient(90deg, var(--pos), #9be6b8)',
  neg: 'linear-gradient(90deg, var(--neg), #ffb1a8)',
  amber: 'linear-gradient(90deg, var(--cmd-amber-bright, #f3b85a), #ffd690)',
};

export function MicroBar({
  value,
  max = 1,
  diverging = false,
  tone,
  className,
}: {
  value: number;
  max?: number;
  diverging?: boolean;
  tone?: Tone;
  className?: string;
}) {
  if (diverging) {
    const half = max; // track half-width represents [0, max]
    const pct = Math.min(100, (Math.abs(value) / half) * 50);
    const side = value < 0 ? 'neg' : 'pos';
    const resolved: Tone = tone ?? (side === 'neg' ? 'neg' : 'pos');
    return (
      <div className={cn('relative h-[6px] w-full rounded-full bg-white/[0.06]', className)}>
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
        <div
          data-fill
          data-side={side}
          className="absolute top-0 h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: TONE_BG[resolved],
            left: side === 'neg' ? `${50 - pct}%` : '50%',
          }}
        />
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const resolved: Tone = tone ?? 'amber';
  return (
    <div className={cn('h-[5px] w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div data-fill className="h-full rounded-full" style={{ width: `${pct}%`, background: TONE_BG[resolved] }} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/command/__tests__/MicroBar.test.tsx`
Expected: PASS (3 tests). If the diverging math test disagrees, align the test's expected % to the implemented formula (`|value|/max*50`) — keep ONE definition.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/command/MicroBar.tsx frontend/src/components/command/__tests__/MicroBar.test.tsx
git commit -m "feat(web): MicroBar inline value bar + diverging variant"
```

---

## Task 4: `Sparkline` — mini trend line

**Files:**
- Create: `frontend/src/components/command/Sparkline.tsx`
- Test: `frontend/src/components/command/__tests__/Sparkline.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from '@/components/command/Sparkline';

describe('Sparkline', () => {
  it('renders an svg polyline with one point per value', () => {
    const { container } = render(<Sparkline points={[1, 3, 2, 5]} />);
    const poly = container.querySelector('polyline') as SVGPolylineElement;
    expect(poly).not.toBeNull();
    expect(poly.getAttribute('points')!.trim().split(/\s+/).length).toBe(4);
  });
  it('renders nothing meaningful for <2 points', () => {
    const { container } = render(<Sparkline points={[1]} />);
    expect(container.querySelector('polyline')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/command/__tests__/Sparkline.test.tsx` → Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/command/__tests__/Sparkline.test.tsx` → Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/command/Sparkline.tsx frontend/src/components/command/__tests__/Sparkline.test.tsx
git commit -m "feat(web): Sparkline mini trend line"
```

---

## Task 5: `TacticalBackdrop` — grid + corner radar

**Files:**
- Create: `frontend/src/components/command/TacticalBackdrop.tsx`
- Test: `frontend/src/components/command/__tests__/TacticalBackdrop.test.tsx`

Reduced-motion note: the radar spin is CSS (`cmd-radar-sweep` → guarded by the `@media` rule in Task 1). Unit tests assert structure only.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TacticalBackdrop } from '@/components/command/TacticalBackdrop';

describe('TacticalBackdrop', () => {
  it('renders a grid layer by default', () => {
    const { container } = render(<TacticalBackdrop />);
    expect(container.querySelector('[data-layer="grid"]')).not.toBeNull();
  });
  it('renders the radar layer when radar is enabled', () => {
    const { container } = render(<TacticalBackdrop radar />);
    expect(container.querySelector('[data-layer="radar"]')).not.toBeNull();
    expect(container.querySelector('.cmd-radar-sweep')).not.toBeNull();
  });
  it('omits the grid when grid={false}', () => {
    const { container } = render(<TacticalBackdrop grid={false} radar />);
    expect(container.querySelector('[data-layer="grid"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/command/__tests__/TacticalBackdrop.test.tsx` → Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/command/__tests__/TacticalBackdrop.test.tsx` → Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/command/TacticalBackdrop.tsx frontend/src/components/command/__tests__/TacticalBackdrop.test.tsx
git commit -m "feat(web): TacticalBackdrop grid + corner radar texture"
```

---

## Task 6: `Skeleton` — shimmer placeholder

**Files:**
- Create: `frontend/src/components/command/Skeleton.tsx`
- Test: `frontend/src/components/command/__tests__/Skeleton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '@/components/command/Skeleton';

describe('Skeleton', () => {
  it('renders with given dimensions and a shimmer bar', () => {
    const { container } = render(<Skeleton w={120} h={16} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.width).toBe('120px');
    expect(root.style.height).toBe('16px');
    expect(container.querySelector('.cmd-shimmer-bar')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/command/__tests__/Skeleton.test.tsx` → Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/command/__tests__/Skeleton.test.tsx` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/command/Skeleton.tsx frontend/src/components/command/__tests__/Skeleton.test.tsx
git commit -m "feat(web): Skeleton shimmer placeholder"
```

---

## Task 7: `GlassTooltip` + chart-theme refinement helpers

**Files:**
- Create: `frontend/src/components/command/GlassTooltip.tsx`
- Test: `frontend/src/components/command/__tests__/GlassTooltip.test.tsx`
- Modify: `frontend/src/features/pricing/lib/chartTheme.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlassTooltip } from '@/components/command/GlassTooltip';

describe('GlassTooltip', () => {
  it('renders label and each entry name/value when active', () => {
    render(
      <GlassTooltip active label="2026-06" payload={[{ name: '公允价值', value: 303.59, color: '#f3b85a' }]} />,
    );
    expect(screen.getByText('2026-06')).toBeTruthy();
    expect(screen.getByText('公允价值')).toBeTruthy();
    expect(screen.getByText('303.59')).toBeTruthy();
  });
  it('renders nothing when inactive', () => {
    const { container } = render(<GlassTooltip active={false} label="x" payload={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/command/__tests__/GlassTooltip.test.tsx` → Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`GlassTooltip.tsx`:

```tsx
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
```

Append to `chartTheme.ts` (after the existing exports):

```ts
/** Build an SVG <linearGradient> id + stops object for an area fill (series → transparent). */
export const CHART_AREA_GRADIENT = {
  id: 'cmdAreaAmber',
  from: commandChartTheme.series.amber,
} as const;

/** drop-shadow filter string for a glowing active series. */
export const CHART_GLOW = `drop-shadow(0 0 5px ${commandChartTheme.series.amber}aa)`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/command/__tests__/GlassTooltip.test.tsx` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/command/GlassTooltip.tsx frontend/src/components/command/__tests__/GlassTooltip.test.tsx frontend/src/features/pricing/lib/chartTheme.ts
git commit -m "feat(web): GlassTooltip + chart gradient/glow helpers"
```

---

## Task 8: Barrel exports

**Files:**
- Modify: `frontend/src/components/command/index.ts`

- [ ] **Step 1: Add exports**

Append:

```ts
export { Reveal } from './Reveal';
export { MicroBar } from './MicroBar';
export { Sparkline } from './Sparkline';
export { TacticalBackdrop } from './TacticalBackdrop';
export { Skeleton } from './Skeleton';
export { GlassTooltip } from './GlassTooltip';
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit; echo tsc=$?` → Expected: `tsc=0`.
Run: `cd frontend && npx vitest run src/components/command; echo $?` → Expected: all command primitive tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/command/index.ts
git commit -m "feat(web): export cinematic primitives from command barrel"
```

---

## Task 9: Apply to GodEye (flagship)

**Files (modify):**
- `frontend/src/routes/godeye/GodeyePage.tsx`
- `frontend/src/features/godeye/components/GodEyeHeader.tsx`
- `frontend/src/features/godeye/components/GodEyeStatusStats.tsx`
- any godeye opportunity/score table component (e.g. `GodEyeStatusStats` or the section table)

- [ ] **Step 1: Apply primitives (appearance-only)**

- Header hero: wrap the gradient hero content with `<TacticalBackdrop grid radar />` as an absolutely-positioned child (hero container must be `relative overflow-hidden`).
- Wrap each top-level section in `<Reveal delay={n}>` with increasing `delay` (0, 60, 120, …) for the staggered light-up. Keep the existing DOM/test text intact.
- Score + each stat: ensure `StatPanel` uses `animate` for numeric values (count-up) — the macro score already animates; extend to the other numeric stats where the value is numeric and no test asserts an exact mid-animation string.
- Opportunity/score mini-table numeric score columns (0–1): render a `<MicroBar value={score} />` beside the `DataNumber` (keep the number).
- Loading states: where a section shows a blank/loading gap, render `<Skeleton />` rows.

**Constraints:** do NOT change hooks/data flow/props/interactions. Preserve all asserted text (section titles, labels, the `0.xxxx` score). No duplicate keys.

- [ ] **Step 2: Keep tests green**

Run: `cd frontend && npx vitest run src/features/godeye src/routes/godeye` → Expected: all PASS (fix by preserving text, NOT by editing assertions).

- [ ] **Step 3: tsc + eslint**

Run: `cd frontend && npx tsc --noEmit; echo tsc=$?` → `tsc=0`
Run: `cd frontend && npx eslint src/features/godeye src/routes/godeye; echo $?` → `0`

- [ ] **Step 4: Visual verify (controller does this)**

Preview `/godeye` @1440: staggered light-up on load, hero grid + corner radar, count-up, MicroBars in score table, zero console errors, reduced-motion off → animates.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/godeye frontend/src/routes/godeye
git commit -m "feat(web): cinematic layer on GodEye (backdrop + reveal + count-up + micro-bars)"
```

---

## Task 10: Apply to 定价分析 (flagship)

**Files (modify):**
- `frontend/src/routes/pricing/PricingAnalysisPage.tsx` (or the analysis route file)
- `frontend/src/features/pricing/components/GapOverviewCard.tsx`
- `frontend/src/features/pricing/components/FactorModelCard.tsx`
- `frontend/src/features/pricing/components/PeerComparisonCard.tsx`
- DCF / Monte Carlo / factor chart components under `frontend/src/features/pricing/components/`

- [ ] **Step 1: Apply primitives**

- Wrap major sections in `<Reveal delay={n}>` (stagger).
- Focus cards (公允价值/偏差/分数): `StatPanel animate` count-up where numeric.
- Peer-comparison + factor tables: add `<MicroBar value={...} />` for 0–1 score columns and `<MicroBar diverging value={...} />` for signed columns (溢折价/Alpha); add `<Sparkline points={...} />` where a per-row series exists (else skip). Keep the numeric text.
- Charts (DCF area, Monte Carlo, factor bars): use the GlassTooltip via `<Tooltip content={<GlassTooltip />} />`; add area gradient fill using `CHART_AREA_GRADIENT`; apply `CHART_GLOW` filter to the active line. Use `commandChartTheme` colors (already wired).

**Constraints:** appearance-only; preserve asserted text/values; unique keys (PeerComparison already keys by `${symbol}-${idx}`).

- [ ] **Step 2: Keep tests green**

Run: `cd frontend && npx vitest run src/features/pricing src/routes/pricing` → Expected: all PASS.

- [ ] **Step 3: tsc + eslint**

Run: `cd frontend && npx tsc --noEmit; echo tsc=$?` → `tsc=0`; `npx eslint src/features/pricing src/routes/pricing; echo $?` → `0`.

- [ ] **Step 4: Visual verify (controller)**

Preview `/pricing` with an AAPL analysis: count-up on focus cards, MicroBars/sparklines in tables, gradient+glow charts with glass tooltips, staggered reveal, zero console errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/pricing src/routes/pricing 2>/dev/null; git add frontend/src/routes/pricing
git commit -m "feat(web): cinematic layer on pricing analysis (micro-viz tables + refined charts + reveal)"
```

---

## Task 11: Apply to 估值实验室 + 因子实验室

**Files (modify):**
- `frontend/src/routes/pricing/ValuationLabPage.tsx`
- `frontend/src/routes/pricing/FactorLabPage.tsx`
- their feature components under `frontend/src/features/pricing/components/`

- [ ] **Step 1: Apply primitives**

- Focus cards (综合公允价值 / 最新因子值): `StatPanel animate`.
- 同行对比矩阵 / 估值历史 / 因子预览 tables: `MicroBar` for 0–1 scores, `MicroBar diverging` for 溢折价, `Sparkline` for the 估值历史 time series rows.
- Wrap sections in `<Reveal delay={n}>`. Charts (if any) use GlassTooltip + gradient.

**Constraints:** appearance-only; preserve asserted text; the labs' tests use exact `getByText` — keep label/number strings.

- [ ] **Step 2: Keep tests green**

Run: `cd frontend && npx vitest run src/routes/pricing src/features/pricing` → Expected: all PASS.

- [ ] **Step 3: tsc + eslint**

Run: `cd frontend && npx tsc --noEmit; echo tsc=$?` → `tsc=0`; eslint same paths → `0`.

- [ ] **Step 4: Visual verify (controller)**

Preview `/pricing/valuation` (run valuation) + `/pricing/factors` (run expression): count-up, MicroBars/sparklines, reveal, zero console.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/pricing frontend/src/features/pricing
git commit -m "feat(web): cinematic layer on valuation + factor labs (micro-viz + count-up + reveal)"
```

---

## Task 12: Apply to 研究工作台 + 登录页

**Files (modify):**
- `frontend/src/routes/workbench/WorkbenchPage.tsx`, `frontend/src/features/workbench/components/*`
- `frontend/src/routes/auth/LoginPage.tsx`

- [ ] **Step 1: Apply primitives**

- Workbench: wrap board/detail/briefing sections in `<Reveal delay={n}>`; stat-chip counts use `StatPanel animate`/count-up where numeric; kanban-column counts can `animate`; loading board → `<Skeleton />` cards; the green-highlighted stat chips can show a `MicroBar` proportion if a max is meaningful (else skip).
- Login: add `<TacticalBackdrop grid radar />` behind the glass card (the page container is already a centered gradient); wrap the card in `<Reveal>`.

**Constraints:** appearance-only — do NOT touch drag/bulk/briefing/candidate logic or form logic; preserve asserted text (column names, task titles, stat labels, login placeholders/`登录`). Unique keys in all lists.

- [ ] **Step 2: Keep tests green**

Run: `cd frontend && npx vitest run src/routes/workbench src/features/workbench src/routes/auth` → Expected: all PASS.

- [ ] **Step 3: tsc + eslint**

Run: `cd frontend && npx tsc --noEmit; echo tsc=$?` → `tsc=0`; eslint same paths → `0`.

- [ ] **Step 4: Visual verify (controller)**

Preview `/workbench` (reveal + count-up + skeleton on load) and `/login` (backdrop + reveal), zero console.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/workbench frontend/src/features/workbench frontend/src/routes/auth
git commit -m "feat(web): cinematic layer on workbench + login (reveal + count-up + backdrop + skeleton)"
```

---

## Task 13: Full gate + finish branch

- [ ] **Step 1: Full suite**

Run: `cd frontend && npx vitest run 2>&1 | tail -5` → Expected: all test files PASS (≥ prior count).

- [ ] **Step 2: tsc / eslint / build**

Run: `cd frontend && npx tsc --noEmit; echo tsc=$?` → `tsc=0`
Run: `cd frontend && npx eslint . > /tmp/e.txt 2>&1; echo eslint=$?` → `eslint=0`
Run: `cd frontend && npm run build > /tmp/b.txt 2>&1; echo build=$?` → `build=0`

- [ ] **Step 3: Visual sweep (controller)**

Preview all 6 screens @1440: cinematic light-up, texture, micro-viz, refined charts; zero console errors across all.

- [ ] **Step 4: Finish branch**

Use superpowers:finishing-a-development-branch (PR, CI green-guard, squash-merge, cleanup).

---

## Self-Review (against the spec)

- **§4 Motion** → Tasks 1 (keyframes), 2 (Reveal), 9–12 (count-up rollout + stagger + skeleton) ✓
- **§5 Micro-viz** → Tasks 3 (MicroBar), 4 (Sparkline), 9–12 (table application) ✓
- **§6 Chart refinement** → Task 7 (GlassTooltip + helpers), 10–11 (apply) ✓
- **§7 Tactical texture** → Task 5 (TacticalBackdrop), 9/12 (hero + login) ✓
- **§8 Primitives** → Tasks 2–8 ✓
- **§9 Application (flagship-first)** → Tasks 9 (GodEye) → 10 (pricing) → 11 (labs) → 12 (workbench/login) ✓
- **§10 Constraints** → reduced-motion (Task 1 `@media` + global mock), appearance-only, transform/opacity (every task) ✓
- **§11 Testing** → per-primitive tests (2–7), pages green (9–12), full gate (13) ✓
- **Type consistency:** `MicroBar({value,max,diverging,tone})`, `Reveal({delay,as})`, `TacticalBackdrop({grid,radar,intensity})`, `Sparkline({points,tone})`, `Skeleton({w,h,rounded})`, `GlassTooltip({active,label,payload})` — referenced identically in application tasks ✓

No placeholders; reduced-motion for CSS primitives is via the Task-1 `@media` guard (asserted structurally, verified visually).
