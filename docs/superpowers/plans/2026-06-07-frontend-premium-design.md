# 前端高级化 ·「作战大屏」设计语言 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v5 前端的视觉工艺提升到电影感「作战大屏 / Command Center」高级档 —— 先建一层设计系统(token + 原件),再落到 GodEye 与定价分析两个旗舰页。

**Architecture:** Tailwind v4 `@theme` 扩展现有 dark+amber 主题(不破坏 shadcn token,旧组件零改动继承);新建 `components/command/*` 一组单一职责原件;原地精修旗舰页(建立焦点层、关键数字 hero 化、数字全站 tabular),**不改交互/数据流/后端**。

**Tech Stack:** Vite + React 19 + TypeScript(strict)+ Tailwind v4 + shadcn/ui + Recharts;`@fontsource/space-grotesk` + `@fontsource/jetbrains-mono`(自托管);Vitest + React Testing Library。

**Spec:** `docs/superpowers/specs/2026-06-07-frontend-premium-design.md`

---

## 通用约束

- **工作目录:`frontend/`**(分支 `feat/frontend-premium-design`,已建)。所有命令在 `frontend/` 下执行。
- **禁止 `npm run dev`**(预览用已运行的 dev server / `mcp__Claude_Preview`)。验证:`npx tsc --noEmit`、`npx vitest run <file>`、`npx eslint . ; echo exit=$?`(看真退出码)、`npm run build`。
- **无 `any`;shadcn 语义 token;text-pos/text-neg;TS strict。** 新原件归 `frontend/src/components/command/`。
- 每个任务全绿后 commit。**不改后端、不改交互逻辑、不删现有功能。**

---

## 文件结构 (File Structure)

**新建:**
- `frontend/src/components/command/useCountUp.ts` — 数字 count-up hook(尊重 reduced-motion)
- `frontend/src/components/command/DataNumber.tsx` — 等宽 tabular 数字 + pos/neg/glow
- `frontend/src/components/command/GlassPanel.tsx` — 玻璃容器
- `frontend/src/components/command/StatPanel.tsx` — 指标卡(含 focus 焦点变体)
- `frontend/src/components/command/SectionFrame.tsx` — ◢ 指挥式区块头
- `frontend/src/components/command/GlowBars.tsx` — 发光柱序列
- `frontend/src/components/command/AlertBanner.tsx` — 警报条
- `frontend/src/components/command/LiveStatus.tsx` — 实时状态点
- `frontend/src/components/command/chartTheme.ts` — 共享 Recharts 指挥主题常量
- `frontend/src/components/command/index.ts` — 桶导出
- 对应 `frontend/src/components/command/__tests__/*.test.tsx`

**修改:**
- `frontend/src/index.css` — `@theme` 扩展 + 指挥 token
- `frontend/src/main.tsx` — import 字体
- `frontend/package.json` — 加 `@fontsource/*` 依赖
- `frontend/src/features/godeye/components/{GodEyeHeader,GodEyeStatusStats,GodEyeAlerts}.tsx` + `routes/godeye/GodeyePage.tsx`
- `frontend/src/features/pricing/components/{GapOverviewCard,FactorModelCard,PeerComparisonCard}.tsx`
- `frontend/src/features/pricing/components/ChartFrame.tsx` — 接共享 chartTheme

---

### Task 1: 设计 token + 自托管字体(基座)

**Files:**
- Modify: `frontend/package.json`(加依赖)
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: 安装自托管字体**

Run(在 `frontend/`):
```bash
npm i @fontsource/space-grotesk @fontsource/jetbrains-mono
```
Expected: `added N packages`,无报错。

- [ ] **Step 2: 在入口 import 字体**

在 `frontend/src/main.tsx` 顶部(其它 import 之前)加:
```ts
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
```

- [ ] **Step 3: 扩展 `index.css` 的指挥 token**

在 `frontend/src/index.css` 的 `:root` 与 `.dark` 两个块**都**追加(放在 `--neg` 之后):
```css
  /* command-center tokens */
  --cmd-blue: #6ea8ff;
  --cmd-amber-bright: #f3b85a;
  --cmd-ink2: #9aa3b2;
  --cmd-ink3: #5f6776;
  --cmd-glass: rgba(255, 255, 255, 0.035);
  --cmd-glass-border: rgba(255, 255, 255, 0.07);
  --cmd-glow-amber: rgba(243, 184, 90, 0.35);
  --cmd-grad: radial-gradient(95% 60% at 8% -8%, #14213a 0%, rgba(20,33,58,0) 46%), radial-gradient(70% 50% at 100% 0%, rgba(243,184,90,.10) 0%, rgba(243,184,90,0) 55%);
```
在 `@theme inline` 块内,把字体族改为(替换现有两行 `--font-sans` / `--font-mono`):
```css
  --font-sans: "Space Grotesk", Inter, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --color-cmd-blue: var(--cmd-blue);
  --color-cmd-ink2: var(--cmd-ink2);
  --color-cmd-ink3: var(--cmd-ink3);
```
在 `@layer base` 的 `body` 规则内追加一行,让数字默认 tabular(可被局部覆盖):
```css
    font-feature-settings: "tnum";
  }
  .font-mono, .tabular-nums { font-variant-numeric: tabular-nums; }
```
(把上面两行放进 base 层,`.tabular-nums` 兜底确保等宽。)

- [ ] **Step 4: 验证 build + 预览**

Run: `npx tsc --noEmit && npm run build`
Expected: 均退出 0。然后在已运行的 preview(`localhost:3100`)刷新任一页,确认整体字体变为 Space Grotesk(拉丁)/系统中文,**无 console 报错**,布局不破。

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/index.css frontend/src/main.tsx
git commit -m "feat(web): command-center design tokens + self-hosted fonts"
```

---

### Task 2: `useCountUp` hook

**Files:**
- Create: `frontend/src/components/command/useCountUp.ts`
- Test: `frontend/src/components/command/__tests__/useCountUp.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCountUp } from '@/components/command/useCountUp';

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
  }));
}

describe('useCountUp', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns the target immediately when reduced motion is preferred', () => {
    mockReducedMotion(true);
    const { result } = renderHook(() => useCountUp(0.1686));
    expect(result.current).toBe(0.1686);
  });

  it('returns a finite number not exceeding the target on first frame', () => {
    mockReducedMotion(false);
    const { result } = renderHook(() => useCountUp(100));
    expect(Number.isFinite(result.current)).toBe(true);
    expect(result.current).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/components/command/__tests__/useCountUp.test.ts`
Expected: FAIL（模块/函数不存在）。

- [ ] **Step 3: 实现**

```ts
import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Animate a number from 0 to `target` over `durationMs` (ease-out).
 * Returns `target` immediately when the user prefers reduced motion or rAF is unavailable.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const reduced = prefersReducedMotion();
  const [value, setValue] = useState<number>(reduced ? target : 0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced || typeof requestAnimationFrame !== 'function') {
      setValue(target);
      return;
    }
    startRef.current = null;
    let raf = 0;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const p = Math.min(1, (ts - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);

  return value;
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run src/components/command/__tests__/useCountUp.test.ts`
Expected: PASS（2 个测试)。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/command/useCountUp.ts frontend/src/components/command/__tests__/useCountUp.test.ts
git commit -m "feat(web): useCountUp hook (reduced-motion aware)"
```

---

### Task 3: `DataNumber`

**Files:**
- Create: `frontend/src/components/command/DataNumber.tsx`
- Test: `frontend/src/components/command/__tests__/DataNumber.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataNumber } from '@/components/command/DataNumber';

describe('DataNumber', () => {
  it('renders the value with tabular-nums + mono', () => {
    render(<DataNumber value="0.1686" />);
    const el = screen.getByText('0.1686');
    expect(el.className).toMatch(/tabular-nums/);
    expect(el.className).toMatch(/font-mono/);
  });

  it('applies the neg tone color class', () => {
    render(<DataNumber value="+144.5%" tone="neg" />);
    expect(screen.getByText('+144.5%').className).toMatch(/text-neg/);
  });

  it('applies the pos tone color class', () => {
    render(<DataNumber value="-27.8%" tone="pos" />);
    expect(screen.getByText('-27.8%').className).toMatch(/text-pos/);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/components/command/__tests__/DataNumber.test.tsx` → FAIL.

- [ ] **Step 3: 实现**

```tsx
import { cn } from '@/lib/utils';

export type NumberTone = 'default' | 'pos' | 'neg' | 'amber';

const toneClass: Record<NumberTone, string> = {
  default: 'text-foreground',
  pos: 'text-pos',
  neg: 'text-neg',
  amber: 'text-primary',
};

export function DataNumber({
  value,
  tone = 'default',
  glow = false,
  className,
}: {
  value: string | number;
  tone?: NumberTone;
  glow?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        toneClass[tone],
        glow && 'drop-shadow-[0_0_12px_var(--cmd-glow-amber)]',
        className,
      )}
    >
      {value}
    </span>
  );
}
```
> 注:`cn` 来自 `@/lib/utils`(shadcn 已有)。若不存在,用 `clsx`+`tailwind-merge`,先确认路径 `frontend/src/lib/utils.ts` 存在。

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run src/components/command/__tests__/DataNumber.test.tsx` → PASS(3 个).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/command/DataNumber.tsx frontend/src/components/command/__tests__/DataNumber.test.tsx
git commit -m "feat(web): DataNumber primitive (tabular mono + tone)"
```

---

### Task 4: `GlassPanel` + `StatPanel`

**Files:**
- Create: `frontend/src/components/command/GlassPanel.tsx`
- Create: `frontend/src/components/command/StatPanel.tsx`
- Test: `frontend/src/components/command/__tests__/StatPanel.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatPanel } from '@/components/command/StatPanel';

describe('StatPanel', () => {
  it('renders label, value and meta', () => {
    render(<StatPanel label="宏观错价分数" value="0.1686" meta="信号偏中性" />);
    expect(screen.getByText('宏观错价分数')).toBeTruthy();
    expect(screen.getByText('0.1686')).toBeTruthy();
    expect(screen.getByText('信号偏中性')).toBeTruthy();
  });

  it('applies the focus styling when focus is set', () => {
    const { container } = render(<StatPanel label="x" value="1" focus />);
    expect(container.querySelector('[data-focus="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: 运行验证失败** → `npx vitest run src/components/command/__tests__/StatPanel.test.tsx` → FAIL.

- [ ] **Step 3: 实现 GlassPanel**

```tsx
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
```

- [ ] **Step 4: 实现 StatPanel**

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { GlassPanel } from './GlassPanel';
import { DataNumber, type NumberTone } from './DataNumber';
import { useCountUp } from './useCountUp';

export function StatPanel({
  label,
  value,
  meta,
  focus = false,
  tone = 'default',
  animate = false,
  decimals = 2,
}: {
  label: string;
  value: string | number;
  meta?: ReactNode;
  focus?: boolean;
  tone?: NumberTone;
  /** When true and value is numeric, count-up animate it on mount. */
  animate?: boolean;
  decimals?: number;
}) {
  // Hook is always called (rules-of-hooks); result is ignored unless animating a number.
  const animated = useCountUp(typeof value === 'number' ? value : 0);
  const display =
    animate && typeof value === 'number' ? animated.toFixed(decimals) : value;
  return (
    <GlassPanel
      className={cn(
        'p-4',
        focus &&
          'border-primary/30 bg-gradient-to-b from-primary/[0.07] to-primary/[0.015] shadow-[0_14px_40px_-16px_var(--cmd-glow-amber)]',
      )}
    >
      <div data-focus={focus} className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wider text-[var(--cmd-ink3)]">{label}</div>
        <div className={cn('text-[38px] leading-none', focus && 'text-primary')}>
          <DataNumber value={display} tone={focus ? 'amber' : tone} glow={focus} />
        </div>
        {meta != null && <div className="text-[11.5px] text-[var(--cmd-ink2)]">{meta}</div>}
      </div>
    </GlassPanel>
  );
}
```

- [ ] **Step 5: 运行验证通过** → PASS(2 个).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/command/GlassPanel.tsx frontend/src/components/command/StatPanel.tsx frontend/src/components/command/__tests__/StatPanel.test.tsx
git commit -m "feat(web): GlassPanel + StatPanel (focus variant)"
```

---

### Task 5: `SectionFrame`

**Files:**
- Create: `frontend/src/components/command/SectionFrame.tsx`
- Test: `frontend/src/components/command/__tests__/SectionFrame.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionFrame } from '@/components/command/SectionFrame';

describe('SectionFrame', () => {
  it('renders the title and the ◢ marker', () => {
    render(<SectionFrame title="战场扫描" latin="BATTLEFIELD SCAN" />);
    expect(screen.getByText('战场扫描')).toBeTruthy();
    expect(screen.getByText(/BATTLEFIELD SCAN/)).toBeTruthy();
    expect(screen.getByText(/◢/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行验证失败** → FAIL.

- [ ] **Step 3: 实现**

```tsx
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
```

- [ ] **Step 4: 运行验证通过** → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/command/SectionFrame.tsx frontend/src/components/command/__tests__/SectionFrame.test.tsx
git commit -m "feat(web): SectionFrame command-style section header"
```

---

### Task 6: `GlowBars`

**Files:**
- Create: `frontend/src/components/command/GlowBars.tsx`
- Test: `frontend/src/components/command/__tests__/GlowBars.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GlowBars } from '@/components/command/GlowBars';

describe('GlowBars', () => {
  it('renders one bar per value', () => {
    const { container } = render(<GlowBars bars={[{ h: 40 }, { h: 80, accent: 'blue' }, { h: 100 }]} />);
    expect(container.querySelectorAll('[data-bar]').length).toBe(3);
  });
});
```

- [ ] **Step 2: 运行验证失败** → FAIL.

- [ ] **Step 3: 实现**

```tsx
import { cn } from '@/lib/utils';

export type GlowBar = { h: number; accent?: 'amber' | 'blue' | 'dim' };

const accentClass: Record<NonNullable<GlowBar['accent']>, string> = {
  amber: 'bg-gradient-to-t from-primary/15 to-primary/90 shadow-[0_0_14px_var(--cmd-glow-amber)]',
  blue: 'bg-gradient-to-t from-[var(--cmd-blue)]/10 to-[var(--cmd-blue)]/85 shadow-[0_0_12px_rgba(110,168,255,0.28)]',
  dim: 'bg-gradient-to-t from-white/[0.03] to-white/20',
};

export function GlowBars({ bars, className }: { bars: GlowBar[]; className?: string }) {
  return (
    <div className={cn('flex h-[88px] items-end gap-[7px]', className)}>
      {bars.map((b, i) => (
        <div
          key={i}
          data-bar
          className={cn('flex-1 rounded-t', accentClass[b.accent ?? 'amber'])}
          style={{ height: `${Math.max(2, Math.min(100, b.h))}%` }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 运行验证通过** → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/command/GlowBars.tsx frontend/src/components/command/__tests__/GlowBars.test.tsx
git commit -m "feat(web): GlowBars primitive"
```

---

### Task 7: `AlertBanner` + `LiveStatus`

**Files:**
- Create: `frontend/src/components/command/AlertBanner.tsx`
- Create: `frontend/src/components/command/LiveStatus.tsx`
- Test: `frontend/src/components/command/__tests__/AlertBannerLiveStatus.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertBanner } from '@/components/command/AlertBanner';
import { LiveStatus } from '@/components/command/LiveStatus';

describe('AlertBanner', () => {
  it('renders title, text and score', () => {
    render(<AlertBanner title="结构衰败警报" text="证据已共振" score="61%" />);
    expect(screen.getByText('结构衰败警报')).toBeTruthy();
    expect(screen.getByText('证据已共振')).toBeTruthy();
    expect(screen.getByText('61%')).toBeTruthy();
  });
});

describe('LiveStatus', () => {
  it('renders the online ratio and timestamp', () => {
    render(<LiveStatus online={8} total={8} ts="09:15:49" />);
    expect(screen.getByText(/8\/8/)).toBeTruthy();
    expect(screen.getByText(/09:15:49/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行验证失败** → FAIL.

- [ ] **Step 3: 实现 AlertBanner**

```tsx
import { cn } from '@/lib/utils';
import { DataNumber } from './DataNumber';

export function AlertBanner({
  title,
  text,
  score,
  tone = 'neg',
}: {
  title: string;
  text: string;
  score: string;
  tone?: 'neg' | 'amber';
}) {
  const border = tone === 'neg' ? 'border-neg/30' : 'border-primary/30';
  const wash = tone === 'neg' ? 'from-neg/10' : 'from-primary/10';
  return (
    <div className={cn('mt-3.5 flex items-center gap-3.5 rounded-xl border bg-gradient-to-r to-transparent px-[18px] py-[13px]', border, wash)}>
      <span className={cn('text-sm font-semibold', tone === 'neg' ? 'text-neg' : 'text-primary')}>⚠ {title}</span>
      <span className="text-[13px] text-[var(--cmd-ink2)]">{text}</span>
      <DataNumber value={score} tone={tone === 'neg' ? 'neg' : 'amber'} glow className="ml-auto text-[22px]" />
    </div>
  );
}
```

- [ ] **Step 4: 实现 LiveStatus**

```tsx
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
```

- [ ] **Step 5: 运行验证通过** → PASS(2 个).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/command/AlertBanner.tsx frontend/src/components/command/LiveStatus.tsx frontend/src/components/command/__tests__/AlertBannerLiveStatus.test.tsx
git commit -m "feat(web): AlertBanner + LiveStatus primitives"
```

---

### Task 8: `chartTheme.ts` + 桶导出 + 接入 ChartFrame

**Files:**
- Create: `frontend/src/components/command/chartTheme.ts`
- Create: `frontend/src/components/command/index.ts`
- Test: `frontend/src/components/command/__tests__/chartTheme.test.ts`
- Modify: `frontend/src/features/pricing/components/ChartFrame.tsx`(只接颜色常量,不改 API)

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { commandChartTheme } from '@/components/command/chartTheme';

describe('commandChartTheme', () => {
  it('exposes grid/axis/series tokens', () => {
    expect(commandChartTheme.grid).toMatch(/#|rgba/);
    expect(commandChartTheme.axis).toMatch(/#|rgba/);
    expect(commandChartTheme.series.amber).toMatch(/#|rgba/);
    expect(commandChartTheme.series.blue).toMatch(/#|rgba/);
  });
});
```

- [ ] **Step 2: 运行验证失败** → FAIL.

- [ ] **Step 3: 实现 chartTheme**

```ts
/** Shared Recharts "command center" theme tokens (dark, hairline, glow series). */
export const commandChartTheme = {
  grid: 'rgba(255,255,255,0.06)',
  axis: '#5f6776',
  axisFont: '10px "JetBrains Mono", ui-monospace, monospace',
  series: {
    amber: '#f3b85a',
    blue: '#6ea8ff',
    pos: '#46c890',
    neg: '#ff6f6f',
  },
  tooltip: {
    background: '#0e1626',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    color: '#eef0f4',
  },
} as const;
```

- [ ] **Step 4: 实现桶导出 `index.ts`**

```ts
export { useCountUp } from './useCountUp';
export { DataNumber, type NumberTone } from './DataNumber';
export { GlassPanel } from './GlassPanel';
export { StatPanel } from './StatPanel';
export { SectionFrame } from './SectionFrame';
export { GlowBars, type GlowBar } from './GlowBars';
export { AlertBanner } from './AlertBanner';
export { LiveStatus } from './LiveStatus';
export { commandChartTheme } from './chartTheme';
```

- [ ] **Step 5: 接入 ChartFrame**

读 `frontend/src/features/pricing/components/ChartFrame.tsx`,把其中硬编码的网格/坐标轴颜色(如 `CartesianGrid stroke`、`XAxis/YAxis` 的 `stroke`/`tick` 颜色)替换为 `commandChartTheme.grid` / `.axis`。**不改组件 props 与既有测试断言**;若现有测试断言了具体颜色字符串,改测试断言为新常量值。

- [ ] **Step 6: 运行验证通过**

Run: `npx vitest run src/components/command/__tests__/chartTheme.test.ts src/features/pricing/components/__tests__/ChartFrame.test.tsx`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/command/chartTheme.ts frontend/src/components/command/index.ts frontend/src/components/command/__tests__/chartTheme.test.ts frontend/src/features/pricing/components/ChartFrame.tsx frontend/src/features/pricing/components/__tests__/ChartFrame.test.tsx
git commit -m "feat(web): shared command chart theme + ChartFrame wiring"
```

---

### Task 9: 落地 GodEye(旗舰一)

**Files(修改):**
- `frontend/src/features/godeye/components/GodEyeHeader.tsx` — hero kick + 标题 + `LiveStatus`
- `frontend/src/features/godeye/components/GodEyeStatusStats.tsx` — 改用 `StatPanel`,错价分数 `focus`
- `frontend/src/features/godeye/components/GodEyeAlerts.tsx` — 改用 `AlertBanner`
- `frontend/src/routes/godeye/GodeyePage.tsx` — 区块头改用 `SectionFrame`
- `frontend/src/features/godeye/components/RiskPremiumRadar.tsx`(可选)— 套 `commandChartTheme`

> **原则:只换"外观/容器",不动 hook、数据流、props 形状、文案逻辑。** 现有 `GodeyePage.test.tsx` 断言的 7 个区块 kicker 文案(`宏观态势`/`战场扫描`/…)与面板标题必须保持可见。

- [ ] **Step 1: 读现状**

读上述 5 个文件,记下:错价分数当前如何渲染、状态卡结构、alert 文案来源、区块 kicker 文案如何渲染。确认 `GodeyePage.test.tsx` 里断言的文案字符串。

- [ ] **Step 2: 改 GodEyeHeader**

把标题区改成 command hero:外层加 `relative overflow-hidden rounded-2xl border border-primary/15 p-7`,背景用 `style={{ background: 'var(--cmd-grad)' }}`;顶部 kick 用 `<span className="text-primary">◢</span> 宏观错价指挥台 · GODEYE V2`(uppercase tracking);右上放 `<LiveStatus online={providerCount or 8} total={8} ts={snapshotTime} />`(数据沿用 header 已有的 props/字段,不新增请求)。保留"进入定价研究"按钮。

- [ ] **Step 3: 改 GodEyeStatusStats → StatPanel**

把状态卡网格改为渲染 `StatPanel`;**错价分数那张用 `focus` + count-up 动效**:
`<StatPanel label="宏观错价分数 · MACRO MISPRICING" value={Number(score)} focus animate decimals={4} meta={...} />`
(传**数字**而非字符串,`animate` 才会触发 `useCountUp`);其余卡(健康提供器/数据新鲜度/最近刷新)用普通 `StatPanel`;数字一律走 `StatPanel` 内的 `DataNumber`(tabular)。

- [ ] **Step 4: 改 GodEyeAlerts → AlertBanner**

把结构衰败警报渲染替换为 `<AlertBanner title={...} text={...} score={pct} tone="neg" />`,数据沿用现有。

- [ ] **Step 5: 区块头 → SectionFrame**

在 `GodeyePage.tsx`,把 7 个区块的 kicker 标题包成 `<SectionFrame title="战场扫描" latin="BATTLEFIELD SCAN" />` 等(**title 必须沿用现有中文文案字符串**,保证 `GodeyePage.test.tsx` 的 `getByText('战场扫描')` 仍命中)。

- [ ] **Step 6: 验证**

Run:
```bash
npx tsc --noEmit
npx vitest run src/routes/godeye/__tests__/GodeyePage.test.tsx src/features/godeye
```
Expected: PASS(现有 godeye 测试全绿)。再在 preview 打开 `/godeye`(匿名直接进),`mcp__Claude_Preview` 截图核对:hero 渐变 + LiveStatus、错价分数 focus 卡发光、SectionFrame 区块头、玻璃卡、tabular 数字;**无 console 报错**。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/godeye frontend/src/routes/godeye/GodeyePage.tsx
git commit -m "feat(web): apply command-center design to GodEye (hero/stats/alert/sections)"
```

---

### Task 10: 落地 定价分析(旗舰二)

**Files(修改):**
- `frontend/src/features/pricing/components/GapOverviewCard.tsx` — 公允价值/偏差 hero 化(`StatPanel focus` + `DataNumber`)
- `frontend/src/features/pricing/components/FactorModelCard.tsx` — 因子数字走 `DataNumber` tabular;区块用 `SectionFrame`(可选)
- `frontend/src/features/pricing/components/PeerComparisonCard.tsx` — 表格数字 `DataNumber`,溢折价 pos/neg tone

> **原则同上:原地精修,不动数据流/交互。** 现有 pricing 测试断言的文案/数值必须保持可见。

- [ ] **Step 1: 读现状**

读上述 3 个文件 + `PricingAnalysisPage.test.tsx`,记下 概览卡 当前如何渲染 当前市价/公允价值/偏差幅度/估值状态,以及 peer 表的数值列。

- [ ] **Step 2: GapOverviewCard 焦点化**

把"定价差异概览"里的 公允价值/偏差幅度 用 `StatPanel focus` + `DataNumber`(偏差按正负给 `tone="pos|neg"`)突出为焦点层;当前市价、估值状态降为次级(普通 `DataNumber`/弱化字重)。保留所有现有字段与文案。

- [ ] **Step 3: 表格/因子数字 tabular**

`FactorModelCard` 的 Alpha/Beta/R² 等、`PeerComparisonCard` 的 现价/公允/溢折价/P-E/P-S/EV-EBITDA 全部用 `<DataNumber>`(溢折价按正负 `tone`)。

- [ ] **Step 4: 验证**

Run:
```bash
npx tsc --noEmit
npx vitest run src/routes/pricing src/features/pricing
```
Expected: PASS。preview 打开 `/pricing`,跑一次 `开始分析`(如 `600519.SH`),截图核对:概览焦点卡、因子/同行表 tabular 对齐、图表指挥主题;**无 console 报错**。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/pricing
git commit -m "feat(web): apply command-center design to pricing analysis (focal layer + tabular)"
```

---

### Task 11: 收尾门禁 + 复审

- [ ] **Step 1: 全量门禁**

Run(逐条看真退出码):
```bash
npx tsc --noEmit ; echo tsc=$?
npx vitest run ; echo vitest=$?
npx eslint . ; echo eslint=$?
npm run build ; echo build=$?
```
Expected: 全部 0;测试数 = 旧基线 + 新增原件测试。

- [ ] **Step 2: 可视化复审**

preview 依次开 `/godeye`、`/pricing`、`/pricing/valuation`(继承 token)、`/workbench`(继承 token),`mcp__Claude_Preview` 截图;确认:整体高级化生效、旧页因继承 token 也变好看、**零 console 报错**、`prefers-reduced-motion` 下动效关闭(可临时用 devtools 模拟)。

- [ ] **Step 3:(若有)收尾 commit**

```bash
git add -A
git commit -m "chore(web): premium design polish + green gate"
```

- [ ] **Step 4: 完成分支**

用 `superpowers:finishing-a-development-branch`:push、开 PR、等 CI(web + 后端 + lint)绿、squash 合并、清理分支。

## 自检 (Self-check)

- Spec 每节都有任务覆盖:token/字体(T1)、useCountUp(T2)、7 原件(T2–T7)、chart 主题(T8)、GodEye 落地(T9)、定价落地(T10)、测试/门禁/验收(T11)。
- 类型一致:`DataNumber` 的 `NumberTone`、`GlowBar` 在各任务引用一致;`commandChartTheme` 形状在 T8 定义、T9/T10 引用。
- 无占位:每个代码步骤给了真实代码;集成任务(T9/T10)因改大文件,给"读现状 + 精确替换区域 + 保持现有测试文案可见"的具体步骤而非整文件重写。
- 不改后端/交互/数据流;其余页面通过 token 继承。
