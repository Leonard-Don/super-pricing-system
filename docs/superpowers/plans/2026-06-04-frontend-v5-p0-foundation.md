# 前端 v5 · P0 基座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在并行目录 `web/` 搭出一个能跑的 Vite + TS + Tailwind + shadcn/ui 前端骨架:暗金设计系统、类型化 API 客户端、移植范式(核心 axios 客户端 + 一个纯工具,连测试)、统一 DataTable、三工作区路由外壳、登录鉴权、Vitest+RTL 基座。

**Architecture:** 全新 Vite 应用建在 `web/`,旧 `frontend/` 保持可跑直到 P4 切换。保留可移植的"框架无关层"(API 服务 / 视图模型 / 纯工具)并顺手转 TS;UI 层用 shadcn/Tailwind 重建。本计划只覆盖 P0 基座;P1–P3 各工作区按需移植剩余纯逻辑文件,复用 P0 建立的范式与 DataTable。

**Tech Stack:** Vite · React 18 · TypeScript (strict) · Tailwind CSS · shadcn/ui (Radix) · React Router · TanStack Table + TanStack Virtual · Recharts · axios · Vitest · React Testing Library · openapi-typescript

**范围说明(对 spec 的有意细化):** spec §9 的 P0 写"移植框架无关层(API 服务 + 视图模型 + 工具 + 其单测)"。本计划按 YAGNI 收窄为:P0 建立**移植范式**(`core` API 客户端 + `formatting` 工具,各带测试),其余纯逻辑文件随 P1–P3 各工作区按需移植。这样 P0 产出真正可运行的骨架,而非一次性大搬迁。

---

## ⚠️ 执行中栈修正(2026-06-04,提交 `0a5149e`)

实施时发现:当前 shadcn(v4)生成的组件面向 **Tailwind v4**,与本计划原先 pin 的 Tailwind v3 不兼容(`bg-primary`/`ring-3`/`--radius-md`/CSS 变量透明度修饰符在 v3 不存在,导致 Button 视觉破损)。因此 **T4/T5 实际落地为 Tailwind v4(CSS-first)+ shadcn v4**,并把 shadcn 自身的 token 体系主题化为暗金,而不是另造一套平行的工具类。下方 T4/T5 的 v3 步骤已被此修正取代。

**统一 token → 工具类映射(所有下游任务 T7–T13 必须遵守,取代正文里出现的 `bg-bg`/`text-ink`/`text-muted`/`border-line`/`bg-surface`/`text-accent`/`bg-accent-soft`/`rounded-card`/`rounded-control` 等自造名):**

| 用途 | 工具类 |
|---|---|
| 页面底色 | `bg-background` |
| 主文本 | `text-foreground` |
| 次/弱文本 | `text-muted-foreground` |
| 面板/卡片底 | `bg-card` |
| 升起面/hover 面 | `bg-secondary` / `bg-accent` |
| 分隔线、边框 | `border-border` |
| 品牌金(强调) | `text-primary` / `bg-primary` / `border-primary`;软底用 `bg-primary/10` |
| 金按钮 | shadcn `<Button>` 默认 variant(已主题化为金底深字) |
| 涨/正 | `text-pos` / `bg-pos`(自定义 token,已在 `index.css @theme` 暴露) |
| 跌/负 | `text-neg` / `bg-neg` |
| 圆角 | `rounded-md` / `rounded-lg`(由 `--radius` 驱动) |

> 同名陷阱已规避:shadcn 的 `accent` 是"hover 面"而非品牌色;品牌金一律用 `primary`。`text-muted-foreground` 才是弱文本(`--muted` 是面,不是文本)。
> **T8 修正**:`getValueColor(0)` 应返回 `'var(--muted-foreground)'`(不是 `'var(--muted)'`),测试与实现同步。

---

## 文件结构(P0 结束时 `web/` 的形态)

```
web/
  package.json
  vite.config.ts            # dev server :3100 + 代理 /api → :8100 + vitest 配置
  tsconfig.json             # strict + 路径别名 @/*
  tailwind.config.ts        # 暗金 tokens 映射到 Tailwind theme
  postcss.config.js
  components.json           # shadcn 配置
  index.html
  .env.development          # VITE_API_URL 等
  scripts/
    gen-api-types.mjs       # 从 ../docs/openapi.json 生成类型
  src/
    main.tsx                # 入口:Router + ThemeProvider + AuthProvider
    index.css               # Tailwind 指令 + :root 暗金 CSS 变量
    vite-env.d.ts           # import.meta.env 类型
    setupTests.ts           # RTL/jest-dom 注册
    lib/
      utils.ts              # shadcn cn() 工具
    components/ui/          # shadcn 生成的基础件(button.tsx 等)
    components/
      AppShell.tsx          # 顶栏 + 侧栏导航 + 内容区
      ErrorBoundary.tsx
      DataTable.tsx         # TanStack Table 封装(排序/虚拟化)
      RequireAuth.tsx       # 路由守卫
    routes/
      router.tsx            # React Router 路由表(懒加载)
      pricing/PricingPage.tsx     # P1 占位
      godeye/GodeyePage.tsx       # P2 占位
      workbench/WorkbenchPage.tsx # P3 占位
      auth/LoginPage.tsx
    services/
      api/core.ts           # 移植自 frontend/src/services/api/core.js
    auth/
      AuthContext.tsx
    theme/
      ThemeProvider.tsx     # 固定暗色;挂 class 到 <html>
    generated/
      api-types.ts          # openapi-typescript 生成(勿手改)
    utils/
      formatting.ts         # 移植自 frontend/src/utils/formatting.js
  src/**/__tests__/*.test.ts(x)
.github/workflows/web-ci.yml
```

---

### Task 1: Scaffold Vite + React + TS 到 `web/`

**Files:**
- Create: `web/` (整个目录,由脚手架生成)

- [ ] **Step 1: 用 Vite 模板生成项目**

Run(在仓库根 `/Users/leonardodon/super-pricing-system`):
```bash
npm create vite@latest web -- --template react-ts
cd web && npm install
```
Expected: `web/` 生成 React+TS 模板,`npm install` 成功。

- [ ] **Step 2: 删除模板里用不到的样板**

删除 `web/src/App.css`、`web/src/assets/react.svg`、`web/public/vite.svg`,并清空 `web/src/App.tsx` 为空壳:
```tsx
export default function App() {
  return <div>super-pricing v5 — bootstrap ok</div>;
}
```

- [ ] **Step 3: 验证 dev server 起得来**

Run: `cd web && npm run dev`
Expected: Vite 在某端口启动(下个 Task 改成 3100),浏览器显示 "bootstrap ok"。Ctrl-C 退出。

- [ ] **Step 4: Commit**

```bash
git add web
git commit -m "chore(web): scaffold Vite + React + TS app"
```

---

### Task 2: TypeScript strict + 路径别名 `@/*`

**Files:**
- Modify: `web/tsconfig.json`
- Modify: `web/vite.config.ts`
- Create: `web/src/vite-env.d.ts`(覆盖已有的同名文件)

- [ ] **Step 1: 开 strict + 别名**

`web/tsconfig.json` 的 `compilerOptions` 确保含:
```jsonc
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 2: vite 解析别名**

`web/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

- [ ] **Step 3: 声明 import.meta.env 类型**

`web/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_TIMEOUT?: string;
  readonly VITE_API_TIMEOUT_ANALYSIS?: string;
  readonly VITE_API_TIMEOUT_STANDARD?: string;
  readonly VITE_API_TIMEOUT_DASHBOARD?: string;
  readonly VITE_API_TIMEOUT_WORKBENCH?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
```

- [ ] **Step 4: 验证类型检查通过**

Run: `cd web && npx tsc --noEmit`
Expected: 无错误退出(exit 0)。

- [ ] **Step 5: Commit**

```bash
git add web/tsconfig.json web/vite.config.ts web/src/vite-env.d.ts
git commit -m "chore(web): strict TS + @/* path alias"
```

---

### Task 3: Vitest + React Testing Library 基座

**Files:**
- Modify: `web/package.json`(加 devDeps + test script)
- Modify: `web/vite.config.ts`(加 test 配置)
- Create: `web/src/setupTests.ts`
- Test: `web/src/__tests__/smoke.test.ts`

- [ ] **Step 1: 安装测试依赖**

Run:
```bash
cd web && npm i -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: 写一个必失败的冒烟测试**

`web/src/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ping } from '@/lib/ping';

describe('test harness', () => {
  it('runs and resolves alias imports', () => {
    expect(ping()).toBe('pong');
  });
});
```

- [ ] **Step 3: 运行,确认因模块缺失而失败**

Run: `cd web && npx vitest run`
Expected: FAIL — 无法解析 `@/lib/ping`。

> 注:此时还没配 vitest 的 alias/环境,下一步一起补,再让它通过。

- [ ] **Step 4: 配置 vitest + 写 ping**

`web/vite.config.ts` 顶部加三斜线引用并补 `test` 段:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    css: false,
  },
});
```

`web/src/setupTests.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

`web/src/lib/ping.ts`:
```ts
export const ping = (): string => 'pong';
```

`web/package.json` 的 `scripts` 加:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: 运行,确认通过**

Run: `cd web && npm test`
Expected: PASS,1 个测试通过。

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/vite.config.ts web/src/setupTests.ts web/src/lib/ping.ts web/src/__tests__/smoke.test.ts
git commit -m "test(web): Vitest + RTL harness"
```

---

### Task 4: Tailwind + 暗金设计系统 tokens

**Files:**
- Modify: `web/package.json`(tailwind devDeps)
- Create: `web/tailwind.config.ts`、`web/postcss.config.js`
- Modify: `web/src/index.css`
- Modify: `web/src/main.tsx`(确保 import 了 index.css)

- [ ] **Step 1: 安装 Tailwind(v3 稳定线)**

Run:
```bash
cd web && npm i -D tailwindcss@^3 postcss autoprefixer
npx tailwindcss init -p --ts
```

- [ ] **Step 2: 配置 content + 主题映射到 CSS 变量**

`web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        elevated: 'var(--elevated)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        accent: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)' },
        pos: 'var(--pos)',
        neg: 'var(--neg)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"SF Mono"', '"Roboto Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '10px', control: '8px' },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: 注入 Tailwind 指令 + 暗金 CSS 变量**

`web/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #0E0E12;
  --surface: #17171C;
  --elevated: #1C1C22;
  --line: #2A2A33;
  --ink: #ECECEE;
  --muted: #8E8E98;
  --accent: #E2B23C;
  --accent-soft: rgba(226, 178, 60, 0.12);
  --pos: #5FBF7E;
  --neg: #E5685A;
}

html { color-scheme: dark; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: 'Inter', system-ui, sans-serif;
}
```

- [ ] **Step 4: 确保入口引入样式 + 渲染可见暗金**

`web/src/main.tsx` 顶部含 `import './index.css';`。把 `App.tsx` 改成:
```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-bg text-ink p-8">
      <h1 className="text-accent text-2xl font-bold">超级定价系统 v5</h1>
      <p className="text-muted">暗金台 · bootstrap</p>
    </div>
  );
}
```

- [ ] **Step 5: 验证视觉**

Run: `cd web && npm run dev`
Expected: 暗色背景(#0E0E12)、金色标题(#E2B23C)、灰色副文本。Ctrl-C 退出。

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): Tailwind + dark/amber design tokens"
```

---

### Task 5: shadcn/ui 初始化 + Button

**Files:**
- Create: `web/components.json`、`web/src/lib/utils.ts`、`web/src/components/ui/button.tsx`(由 CLI 生成)
- Test: `web/src/components/ui/__tests__/button.test.tsx`

- [ ] **Step 1: 初始化 shadcn**

Run:
```bash
cd web && npx shadcn@latest init
```
交互选项按提示选:Style=Default、Base color=Neutral、CSS variables=Yes。确保它写入的别名与本项目一致(`@/components`、`@/lib/utils`)。

- [ ] **Step 2: 加 Button 组件**

Run: `cd web && npx shadcn@latest add button`
Expected: 生成 `web/src/components/ui/button.tsx` 与 `web/src/lib/utils.ts`(含 `cn`)。

- [ ] **Step 3: 写 Button 渲染测试(先失败)**

`web/src/components/ui/__tests__/button.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>开始分析</Button>);
    expect(screen.getByRole('button', { name: '开始分析' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `cd web && npm test`
Expected: PASS(Button 已由 CLI 生成,渲染测试直接通过,顺带验证 RTL+shadcn 链路通)。

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): shadcn/ui init + Button"
```

---

### Task 6: Dev server 端口 3100 + 代理 + 环境变量

**Files:**
- Modify: `web/vite.config.ts`
- Create: `web/.env.development`

- [ ] **Step 1: 配端口与代理**

`web/vite.config.ts` 的 `defineConfig` 加 `server` 段(与现有 `plugins/resolve/test` 并列):
```ts
  server: {
    port: 3100,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8100',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
```

- [ ] **Step 2: 开发环境变量**

`web/.env.development`:
```
VITE_API_URL=/api
VITE_API_TIMEOUT=300000
VITE_API_TIMEOUT_ANALYSIS=120000
VITE_API_TIMEOUT_STANDARD=30000
VITE_API_TIMEOUT_DASHBOARD=45000
VITE_API_TIMEOUT_WORKBENCH=30000
```

> `VITE_API_URL=/api` 让浏览器走 Vite 代理到 `:8100`,规避 CORS(对齐评估里"端口 8100/3100 全链一致"的约定)。

- [ ] **Step 3: 验证端口固定为 3100**

Run: `cd web && npm run dev`
Expected: 输出含 `http://localhost:3100`。Ctrl-C 退出。

- [ ] **Step 4: Commit**

```bash
git add web/vite.config.ts web/.env.development
git commit -m "chore(web): pin dev server to 3100 + /api proxy to backend"
```

---

### Task 7: 移植核心 API 客户端 `core.ts`(范式锚点)

**参考源**:`frontend/src/services/api/core.js`(行为权威)。需把 `process.env.REACT_APP_*` → `import.meta.env.VITE_*`、`process.env.NODE_ENV === 'development'` → `import.meta.env.DEV`。

**Files:**
- Create: `web/src/services/api/core.ts`
- Test: `web/src/services/api/__tests__/core.test.ts`

- [ ] **Step 1: 写测试(先失败)——锁住超时档、token 缓存、刷新去重**

`web/src/services/api/__tests__/core.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  withTimeoutProfile,
  API_TIMEOUT_PROFILES,
  getApiAuthToken,
  setApiAuthToken,
  getApiRefreshToken,
  setApiRefreshToken,
} from '@/services/api/core';

describe('api core', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setApiAuthToken('');
    setApiRefreshToken('');
  });

  it('withTimeoutProfile picks the profile timeout', () => {
    expect(withTimeoutProfile('standard').timeout).toBe(API_TIMEOUT_PROFILES.standard);
    expect(withTimeoutProfile('analysis').timeout).toBe(API_TIMEOUT_PROFILES.analysis);
  });

  it('withTimeoutProfile lets explicit config.timeout win', () => {
    expect(withTimeoutProfile('standard', { timeout: 5 }).timeout).toBe(5);
  });

  it('unknown profile falls back to default timeout', () => {
    // @ts-expect-error intentionally invalid profile
    expect(withTimeoutProfile('nope').timeout).toBe(API_TIMEOUT_PROFILES.default);
  });

  it('auth token setter persists to localStorage and getter reads cache', () => {
    setApiAuthToken('abc');
    expect(getApiAuthToken()).toBe('abc');
    expect(window.localStorage.getItem('pricing_auth_token')).toBe('abc');
    setApiAuthToken('');
    expect(getApiAuthToken()).toBe('');
    expect(window.localStorage.getItem('pricing_auth_token')).toBeNull();
  });

  it('refresh token setter persists and clears', () => {
    setApiRefreshToken('r1');
    expect(getApiRefreshToken()).toBe('r1');
    expect(window.localStorage.getItem('pricing_refresh_token')).toBe('r1');
    setApiRefreshToken('');
    expect(window.localStorage.getItem('pricing_refresh_token')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd web && npx vitest run src/services/api/__tests__/core.test.ts`
Expected: FAIL — 无法解析 `@/services/api/core`。

- [ ] **Step 3: 安装 axios 并写 `core.ts`**

Run: `cd web && npm i axios`

`web/src/services/api/core.ts`(从 `frontend/src/services/api/core.js` 移植,逐项适配如下):
```ts
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

const DEFAULT_LOCAL_API_BASE_URL = 'http://127.0.0.1:8100';
export const API_BASE_URL = import.meta.env.VITE_API_URL || DEFAULT_LOCAL_API_BASE_URL;
export const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT ?? '') || 300000;
const API_AUTH_TOKEN_KEY = 'pricing_auth_token';
const API_REFRESH_TOKEN_KEY = 'pricing_refresh_token';

let authTokenCache = '';
let refreshTokenCache = '';
let refreshInFlight: Promise<unknown> | null = null;
if (typeof window !== 'undefined') {
  authTokenCache = window.localStorage.getItem(API_AUTH_TOKEN_KEY) || '';
  refreshTokenCache = window.localStorage.getItem(API_REFRESH_TOKEN_KEY) || '';
}

export const getApiAuthToken = (): string => authTokenCache;
export const getApiRefreshToken = (): string => refreshTokenCache;

export const setApiAuthToken = (token: string): void => {
  authTokenCache = token || '';
  if (typeof window !== 'undefined') {
    if (authTokenCache) window.localStorage.setItem(API_AUTH_TOKEN_KEY, authTokenCache);
    else window.localStorage.removeItem(API_AUTH_TOKEN_KEY);
  }
};

export const setApiRefreshToken = (token: string): void => {
  refreshTokenCache = token || '';
  if (typeof window !== 'undefined') {
    if (refreshTokenCache) window.localStorage.setItem(API_REFRESH_TOKEN_KEY, refreshTokenCache);
    else window.localStorage.removeItem(API_REFRESH_TOKEN_KEY);
  }
};

const parseTimeout = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const API_TIMEOUT_PROFILES = {
  default: API_TIMEOUT,
  analysis: parseTimeout(import.meta.env.VITE_API_TIMEOUT_ANALYSIS, 120000),
  standard: parseTimeout(import.meta.env.VITE_API_TIMEOUT_STANDARD, 30000),
  dashboard: parseTimeout(import.meta.env.VITE_API_TIMEOUT_DASHBOARD, 45000),
  workbench: parseTimeout(import.meta.env.VITE_API_TIMEOUT_WORKBENCH, 30000),
} as const;

export type TimeoutProfile = keyof typeof API_TIMEOUT_PROFILES;

export const withTimeoutProfile = (
  profile: TimeoutProfile = 'default',
  config: AxiosRequestConfig = {},
): AxiosRequestConfig => ({
  ...config,
  timeout: config.timeout ?? API_TIMEOUT_PROFILES[profile] ?? API_TIMEOUT_PROFILES.default,
});

const isCanceledRequest = (error: AxiosError): boolean =>
  axios.isCancel(error) ||
  error?.code === 'ERR_CANCELED' ||
  error?.name === 'CanceledError' ||
  error?.message === 'canceled';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

const refreshAccessTokenIfNeeded = async (): Promise<unknown> => {
  if (!refreshTokenCache) throw new Error('No refresh token available');
  if (!refreshInFlight) {
    refreshInFlight = api
      .post(
        '/infrastructure/auth/refresh',
        { refresh_token: refreshTokenCache },
        withTimeoutProfile('standard', { headers: { 'X-Skip-Auth-Refresh': '1' } }),
      )
      .then((response) => {
        const payload = response.data || {};
        if (payload.access_token) setApiAuthToken(payload.access_token);
        if (payload.refresh_token) setApiRefreshToken(payload.refresh_token);
        return payload;
      })
      .catch((error) => {
        setApiAuthToken('');
        setApiRefreshToken('');
        throw error;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (authTokenCache && !config.headers?.Authorization) {
      config.headers.Authorization = `Bearer ${authTokenCache}`;
    }
    if (import.meta.env.DEV) {
      console.log('API Request:', config.method?.toUpperCase(), config.url);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error: AxiosError & { userMessage?: string; errorCode?: string }) => {
    if (isCanceledRequest(error)) {
      error.userMessage = '请求已取消';
      error.errorCode = 'REQUEST_CANCELED';
      return Promise.reject(error);
    }
    const originalRequest = (error.config || {}) as InternalAxiosRequestConfig & { _retry?: boolean };
    const url = String(originalRequest.url || '');
    const canRefresh =
      error.response?.status === 401 &&
      refreshTokenCache &&
      !originalRequest._retry &&
      originalRequest.headers?.['X-Skip-Auth-Refresh'] !== '1' &&
      !url.includes('/infrastructure/auth/login') &&
      !url.includes('/infrastructure/auth/refresh') &&
      !url.includes('/infrastructure/oauth/token');

    if (canRefresh) {
      originalRequest._retry = true;
      return refreshAccessTokenIfNeeded().then(() => {
        originalRequest.headers.Authorization = `Bearer ${authTokenCache}`;
        return api(originalRequest);
      });
    }

    let errorMessage = '请求失败，请稍后重试';
    let errorCode = 'UNKNOWN_ERROR';
    if (error.response) {
      const { status, data } = error.response as { status: number; data: any };
      if (data?.error) {
        errorMessage = data.error.message || errorMessage;
        errorCode = data.error.code || errorCode;
      } else if (data?.detail) {
        errorMessage = data.detail;
      } else if (typeof data === 'string') {
        errorMessage = data;
      }
      switch (status) {
        case 400: errorMessage = errorMessage || '请求参数错误'; break;
        case 401: errorMessage = '请先登录'; break;
        case 403: errorMessage = '没有权限访问'; break;
        case 404: errorMessage = errorMessage || '请求的资源不存在'; break;
        case 429: errorMessage = '请求过于频繁，请稍后再试'; break;
        case 500: errorMessage = '服务器内部错误，请稍后重试'; break;
        case 502:
        case 503: errorMessage = '服务暂时不可用，请稍后重试'; break;
        default: break;
      }
      console.error(`API Error [${status}] ${errorCode}:`, errorMessage);
    } else if (error.request) {
      errorMessage = error.code === 'ECONNABORTED' ? '请求超时，请检查网络连接' : '无法连接到服务器，请检查网络';
      console.error('API Network Error:', error.config?.url || 'unknown', error.message);
    } else {
      console.error('API Config Error:', error.message);
    }
    error.userMessage = errorMessage;
    error.errorCode = errorCode;
    return Promise.reject(error);
  },
);

export { api };
export default api;
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd web && npx vitest run src/services/api/__tests__/core.test.ts`
Expected: PASS,6 个测试全过。

- [ ] **Step 5: 类型检查**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 6: Commit**

```bash
git add web/src/services web/package.json web/package-lock.json
git commit -m "feat(web): port core API client to TS (axios instance, timeout profiles, refresh dedupe)"
```

---

### Task 8: 移植纯工具 `formatting.ts`(确立"纯逻辑移植"范式)

**参考源**:`frontend/src/utils/formatting.js`。注意 `getValueColor` 的色值改用新暗金 token 变量名。

**Files:**
- Create: `web/src/utils/formatting.ts`
- Test: `web/src/utils/__tests__/formatting.test.ts`

- [ ] **Step 1: 写测试(先失败)**

`web/src/utils/__tests__/formatting.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatPercentage, formatCurrency, getValueColor } from '@/utils/formatting';

describe('formatPercentage', () => {
  it('formats a ratio as a 2-dp percent', () => {
    expect(formatPercentage(0.1234)).toBe('12.34%');
  });
  it('returns dash for null/undefined/non-finite', () => {
    expect(formatPercentage(null)).toBe('-');
    expect(formatPercentage(undefined)).toBe('-');
    expect(formatPercentage(Number.NaN)).toBe('-');
  });
});

describe('formatCurrency', () => {
  it('formats USD', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });
});

describe('getValueColor', () => {
  it('maps sign to semantic token vars', () => {
    expect(getValueColor(1)).toBe('var(--pos)');
    expect(getValueColor(-1)).toBe('var(--neg)');
    expect(getValueColor(0)).toBe('var(--muted)');
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd web && npx vitest run src/utils/__tests__/formatting.test.ts`
Expected: FAIL — 模块未找到。

- [ ] **Step 3: 写 `formatting.ts`(移植 + token 适配)**

`web/src/utils/formatting.ts`:
```ts
export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export const formatPercentage = (value: number | null | undefined): string => {
  if (value === undefined || value === null) return '-';
  if (!Number.isFinite(Number(value))) return '-';
  return `${(Number(value) * 100).toFixed(2)}%`;
};

export const getValueColor = (value: number): string => {
  if (value > 0) return 'var(--pos)';
  if (value < 0) return 'var(--neg)';
  return 'var(--muted)';
};
```

- [ ] **Step 4: 运行,确认通过**

Run: `cd web && npx vitest run src/utils/__tests__/formatting.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/src/utils
git commit -m "feat(web): port formatting util to TS (semantic token colors)"
```

---

### Task 9: 从 `docs/openapi.json` 生成类型化 API 类型

**Files:**
- Modify: `web/package.json`(devDep + script)
- Create: `web/scripts/gen-api-types.mjs`
- Create: `web/src/generated/api-types.ts`(生成产物)
- Test: `web/src/generated/__tests__/api-types.test.ts`

- [ ] **Step 1: 安装 openapi-typescript**

Run: `cd web && npm i -D openapi-typescript`

- [ ] **Step 2: 写生成脚本**

`web/scripts/gen-api-types.mjs`:
```js
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = path.resolve(here, '../../docs/openapi.json');
const out = path.resolve(here, '../src/generated/api-types.ts');
execSync(`npx openapi-typescript "${spec}" -o "${out}"`, { stdio: 'inherit' });
console.log('Generated', out);
```

`web/package.json` 的 `scripts` 加:
```json
"gen:api": "node scripts/gen-api-types.mjs"
```

- [ ] **Step 3: 生成类型**

Run: `cd web && npm run gen:api`
Expected: 生成 `web/src/generated/api-types.ts`,含 `export interface paths { ... }`。

- [ ] **Step 4: 写一个守护测试(确认关键定价路由类型存在)**

`web/src/generated/__tests__/api-types.test.ts`:
```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { paths } from '@/generated/api-types';

describe('generated api types', () => {
  it('exposes the pricing factor-model route', () => {
    type P = paths;
    // 该路由在 public_route_surface_registry.md 中登记;若后端契约移除会在此处类型报错
    expectTypeOf<P['/pricing/factor-model']>().not.toBeNever();
  });
});
```

> 若生成的路径键名与此不完全一致(例如带版本前缀),按 `api-types.ts` 实际键名修正断言——这一步的意义是"契约漂移时编译期报警"。

- [ ] **Step 5: 运行类型测试**

Run: `cd web && npx vitest run src/generated/__tests__/api-types.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add web/scripts web/src/generated web/package.json web/package-lock.json
git commit -m "feat(web): typed API surface generated from docs/openapi.json"
```

---

### Task 10: 应用外壳 — 路由 + 侧栏导航 + 错误边界

**Files:**
- Create: `web/src/components/ErrorBoundary.tsx`
- Create: `web/src/components/AppShell.tsx`
- Create: `web/src/routes/router.tsx`
- Create: `web/src/routes/pricing/PricingPage.tsx`、`web/src/routes/godeye/GodeyePage.tsx`、`web/src/routes/workbench/WorkbenchPage.tsx`(占位)
- Modify: `web/src/main.tsx`
- Test: `web/src/components/__tests__/AppShell.test.tsx`

- [ ] **Step 1: 安装路由**

Run: `cd web && npm i react-router-dom`

- [ ] **Step 2: 写 ErrorBoundary**

`web/src/components/ErrorBoundary.tsx`:
```tsx
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) { console.error('UI crash:', error); }
  render() {
    if (this.state.hasError) {
      return <div className="p-8 text-neg">页面出错了，请刷新重试。</div>;
    }
    return this.props.children;
  }
}
```

- [ ] **Step 3: 写占位页**

三个文件,内容同构(各自改标题):
`web/src/routes/pricing/PricingPage.tsx`:
```tsx
export default function PricingPage() {
  return <div className="p-6"><h2 className="text-xl font-bold text-ink">定价研究</h2></div>;
}
```
`web/src/routes/godeye/GodeyePage.tsx`:
```tsx
export default function GodeyePage() {
  return <div className="p-6"><h2 className="text-xl font-bold text-ink">上帝视角</h2></div>;
}
```
`web/src/routes/workbench/WorkbenchPage.tsx`:
```tsx
export default function WorkbenchPage() {
  return <div className="p-6"><h2 className="text-xl font-bold text-ink">研究工作台</h2></div>;
}
```

- [ ] **Step 4: 写 AppShell(顶栏 + 侧栏)**

`web/src/components/AppShell.tsx`:
```tsx
import { NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/pricing', label: '定价研究' },
  { to: '/godeye', label: '上帝视角' },
  { to: '/workbench', label: '研究工作台' },
];

export function AppShell() {
  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <header className="h-14 border-b border-line bg-surface flex items-center px-4 gap-3">
        <span className="w-3 h-3 rounded bg-accent" />
        <span className="font-bold">超级定价系统</span>
        <span className="text-[10px] text-accent border border-accent rounded-full px-2 py-[1px] bg-accent-soft">v5</span>
      </header>
      <div className="flex flex-1 min-h-0">
        <nav aria-label="主导航" className="w-[220px] border-r border-line bg-surface p-3 flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-control text-sm ${isActive ? 'bg-accent-soft text-accent font-bold' : 'text-muted hover:text-ink'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 写路由表(懒加载)**

`web/src/routes/router.tsx`:
```tsx
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';

const PricingPage = lazy(() => import('@/routes/pricing/PricingPage'));
const GodeyePage = lazy(() => import('@/routes/godeye/GodeyePage'));
const WorkbenchPage = lazy(() => import('@/routes/workbench/WorkbenchPage'));

const lazyEl = (El: React.ComponentType) => (
  <Suspense fallback={<div className="p-6 text-muted">加载中…</div>}><El /></Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/pricing" replace /> },
      { path: 'pricing', element: lazyEl(PricingPage) },
      { path: 'godeye', element: lazyEl(GodeyePage) },
      { path: 'workbench', element: lazyEl(WorkbenchPage) },
    ],
  },
]);
```

- [ ] **Step 6: 接入入口**

`web/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './index.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { router } from '@/routes/router';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </React.StrictMode>,
);
```
删除不再需要的 `web/src/App.tsx`。

- [ ] **Step 7: 写外壳渲染测试(先失败)**

`web/src/components/__tests__/AppShell.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';

describe('AppShell', () => {
  it('renders the three workspace nav links', () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '定价研究' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '上帝视角' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '研究工作台' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: 运行测试 + 类型检查**

Run: `cd web && npm test && npx tsc --noEmit`
Expected: 全 PASS,tsc exit 0。

- [ ] **Step 9: 手动验证导航**

Run: `cd web && npm run dev` → 浏览器开 `localhost:3100`,确认默认跳转 `/pricing`,点侧栏三项切换且激活态为金色。Ctrl-C 退出。

- [ ] **Step 10: Commit**

```bash
git add web/src web/package.json web/package-lock.json
git commit -m "feat(web): app shell with router, sidebar nav, error boundary"
```

---

### Task 11: 统一数据表 `DataTable`(TanStack Table + 虚拟化)

**Files:**
- Modify: `web/package.json`
- Create: `web/src/components/DataTable.tsx`
- Test: `web/src/components/__tests__/DataTable.test.tsx`

- [ ] **Step 1: 安装 TanStack**

Run: `cd web && npm i @tanstack/react-table @tanstack/react-virtual`

- [ ] **Step 2: 写 DataTable 渲染/排序测试(先失败)**

`web/src/components/__tests__/DataTable.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';

type Row = { symbol: string; gap: number };
const columns: ColumnDef<Row>[] = [
  { accessorKey: 'symbol', header: '标的' },
  { accessorKey: 'gap', header: '低估' },
];
const data: Row[] = [
  { symbol: 'AAA', gap: -8 },
  { symbol: 'BBB', gap: -12 },
];

describe('DataTable', () => {
  it('renders headers and rows', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('标的')).toBeInTheDocument();
    expect(screen.getByText('AAA')).toBeInTheDocument();
    expect(screen.getByText('BBB')).toBeInTheDocument();
  });

  it('sorts when a header is clicked', async () => {
    render(<DataTable columns={columns} data={data} />);
    await userEvent.click(screen.getByText('低估'));
    const rows = screen.getAllByRole('row').slice(1); // drop header row
    expect(within(rows[0]).getByText('BBB')).toBeInTheDocument(); // -12 sorts first asc
  });
});
```

- [ ] **Step 3: 运行,确认失败**

Run: `cd web && npx vitest run src/components/__tests__/DataTable.test.tsx`
Expected: FAIL — 模块未找到。

- [ ] **Step 4: 实现 DataTable**

`web/src/components/DataTable.tsx`:
```tsx
import { useState } from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
}

export function DataTable<T>({ columns, data }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="border border-line rounded-card overflow-hidden bg-surface">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="text-muted text-xs">
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  onClick={h.column.getToggleSortingHandler()}
                  className="text-left px-3 py-2 cursor-pointer select-none border-b border-line"
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted() as string] ?? ''}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="font-mono">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-0">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2">
                  {flexRender(cell.column.columnDef.cell ?? cell.column.columnDef.header, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

> 虚拟化(`@tanstack/react-virtual`)在行数超过阈值(如 >100)时接入;P0 先建立可排序的基础表,虚拟化在首个真有长列表的工作区(P2/P3)按需加 `useVirtualizer`。**此处是有意的范围边界,非遗漏。**

- [ ] **Step 5: 运行测试,确认通过**

Run: `cd web && npx vitest run src/components/__tests__/DataTable.test.tsx`
Expected: PASS,2 个测试通过。

- [ ] **Step 6: Commit**

```bash
git add web/src/components/DataTable.tsx web/src/components/__tests__/DataTable.test.tsx web/package.json web/package-lock.json
git commit -m "feat(web): DataTable on TanStack Table (sortable base; virtualization deferred to first long-list view)"
```

---

### Task 12: 鉴权 — AuthContext + 登录页 + 路由守卫

**参考**:登录走 `POST /infrastructure/auth/login`,成功后写入 token(复用 Task 7 的 `setApiAuthToken/setApiRefreshToken`)。

> **范围边界(非遗漏)**:P0 实现用户名/密码登录 + 路由守卫,足以访问受保护端点。OAuth provider 弹窗 + `quant-oauth-callback` postMessage 全流程在后续按需移植(见 `public_route_surface_registry.md`)。

**Files:**
- Create: `web/src/auth/AuthContext.tsx`
- Create: `web/src/components/RequireAuth.tsx`
- Create: `web/src/routes/auth/LoginPage.tsx`
- Modify: `web/src/routes/router.tsx`
- Test: `web/src/auth/__tests__/AuthContext.test.tsx`

- [ ] **Step 1: 写 AuthContext 测试(先失败)**

`web/src/auth/__tests__/AuthContext.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { setApiAuthToken } from '@/services/api/core';

function Probe() {
  const { isAuthenticated, setSession, logout } = useAuth();
  return (
    <div>
      <span data-testid="state">{isAuthenticated ? 'in' : 'out'}</span>
      <button onClick={() => setSession({ access_token: 'a', refresh_token: 'r' })}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => { window.localStorage.clear(); setApiAuthToken(''); });

  it('reflects login and logout', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId('state').textContent).toBe('out');
    await act(async () => { screen.getByText('login').click(); });
    expect(screen.getByTestId('state').textContent).toBe('in');
    await act(async () => { screen.getByText('logout').click(); });
    expect(screen.getByTestId('state').textContent).toBe('out');
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd web && npx vitest run src/auth/__tests__/AuthContext.test.tsx`
Expected: FAIL — 模块未找到。

- [ ] **Step 3: 实现 AuthContext**

`web/src/auth/AuthContext.tsx`:
```tsx
import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  getApiAuthToken,
  setApiAuthToken,
  setApiRefreshToken,
} from '@/services/api/core';

interface Session { access_token: string; refresh_token?: string }
interface AuthValue {
  isAuthenticated: boolean;
  setSession: (s: Session) => void;
  logout: () => void;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string>(() => getApiAuthToken());
  const setSession = (s: Session) => {
    setApiAuthToken(s.access_token);
    if (s.refresh_token) setApiRefreshToken(s.refresh_token);
    setToken(s.access_token);
  };
  const logout = () => {
    setApiAuthToken('');
    setApiRefreshToken('');
    setToken('');
  };
  return (
    <AuthCtx.Provider value={{ isAuthenticated: Boolean(token), setSession, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd web && npx vitest run src/auth/__tests__/AuthContext.test.tsx`
Expected: PASS。

- [ ] **Step 5: 写 RequireAuth 守卫**

`web/src/components/RequireAuth.tsx`:
```tsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import type { ReactNode } from 'react';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
```

- [ ] **Step 6: 写登录页**

`web/src/routes/auth/LoginPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { withTimeoutProfile } from '@/services/api/core';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await api.post(
        '/infrastructure/auth/login',
        { username, password },
        withTimeoutProfile('standard'),
      );
      setSession(res.data);
      navigate('/pricing', { replace: true });
    } catch (err) {
      setError((err as { userMessage?: string }).userMessage ?? '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center">
      <form onSubmit={onSubmit} className="bg-surface border border-line rounded-card p-6 w-80 flex flex-col gap-3">
        <h1 className="text-accent font-bold text-lg">超级定价系统</h1>
        <input className="bg-elevated border border-line rounded-control px-3 py-2 text-sm"
          placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input type="password" className="bg-elevated border border-line rounded-control px-3 py-2 text-sm"
          placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-neg text-xs">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? '登录中…' : '登录'}</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: 接线路由 + Provider**

`web/src/routes/router.tsx` 调整:`/` 节点用 `RequireAuth` 包住 `AppShell`,新增 `/login`。把 `AppShell` 元素改为:
```tsx
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
```
并在文件顶部 `import { RequireAuth } from '@/components/RequireAuth';`,在路由数组追加一项:
```tsx
  { path: '/login', element: <LoginPage /> },
```
(顶部 `import LoginPage from '@/routes/auth/LoginPage';`)

`web/src/main.tsx` 用 `AuthProvider` 包住 `RouterProvider`:
```tsx
import { AuthProvider } from '@/auth/AuthContext';
// ...
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
```

- [ ] **Step 8: 全量测试 + 类型检查**

Run: `cd web && npm test && npx tsc --noEmit`
Expected: 全 PASS,tsc exit 0。

- [ ] **Step 9: 手动验证守卫**

Run: `cd web && npm run dev` → 未登录访问 `localhost:3100` 应跳到 `/login`。Ctrl-C 退出。

- [ ] **Step 10: Commit**

```bash
git add web/src
git commit -m "feat(web): auth context, login page, route guard (username/password)"
```

---

### Task 13: CI — web 的 tsc + lint + 测试

**Files:**
- Modify: `web/package.json`(lint script)
- Create: `web/.eslintrc.cjs`(若 scaffold 未生成 flat config)
- Create: `.github/workflows/web-ci.yml`

- [ ] **Step 1: 确认 lint 可跑**

Vite react-ts 模板自带 eslint 配置。确认 `web/package.json` 有 `"lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"`(没有则补)。
Run: `cd web && npm run lint`
Expected: 通过(0 warning)。如有报错按提示修。

- [ ] **Step 2: 写 web CI workflow**

`.github/workflows/web-ci.yml`:
```yaml
name: web-ci
on:
  push:
    paths: ['web/**', '.github/workflows/web-ci.yml']
  pull_request:
    paths: ['web/**', '.github/workflows/web-ci.yml']
jobs:
  web:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: web/package-lock.json
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

- [ ] **Step 3: 本地预跑 CI 的各步**

Run: `cd web && npm ci && npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: 全部成功,`web/dist/` 产出。

- [ ] **Step 4: Commit**

```bash
git add web/package.json .github/workflows/web-ci.yml
git commit -m "ci(web): tsc + lint + vitest + build on web/** changes"
```

---

## P0 完成验收(Definition of Done)

- [ ] `cd web && npm run dev` → `localhost:3100`,未登录跳 `/login`,登录后进 `/pricing`,侧栏三工作区可切换、激活态金色。
- [ ] `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build` 全绿。
- [ ] 暗金 tokens、类型化 API 类型、`core.ts`/`formatting.ts` 移植件及其测试、`DataTable`、外壳、鉴权均就位。
- [ ] 旧 `frontend/` 未被改动,仍可独立运行。

## 自检结果(对照 spec)

- **覆盖**:spec §3(tokens)→T4;§3 组件基础(shadcn/DataTable)→T5/T11;§4 路由→T10;§5 移植范式→T7/T8;§6 类型化客户端→T9、鉴权→T12;§7 测试/工程化→T3/T13。
- **有意细化(已在文中标注,非遗漏)**:(a) 框架无关层只在 P0 移植 `core`+`formatting` 做范式,其余随 P1–P3 按需移植;(b) DataTable 虚拟化推迟到首个长列表工作区;(c) OAuth 弹窗流程推迟,P0 先做账密登录。
- **类型一致性**:`setApiAuthToken/setApiRefreshToken/getApiAuthToken`、`withTimeoutProfile`、`useAuth().setSession/logout/isAuthenticated`、`DataTable<T>{columns,data}` 在各 Task 间签名一致。
