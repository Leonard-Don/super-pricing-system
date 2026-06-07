# super-pricing-system 结构说明

当前 `super-pricing-system` 是私有系统主仓，承接以下能力：

- `定价研究`
- `上帝视角`
- `研究工作台`
- `定价实验台 (Quant Lab)`

## 前端入口 (v5 — frontend/)

> v5 前端已从 CRA / Ant Design 重做为 Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui (暗金主题),
> 拆分前的旧前端 (CRA / Ant Design) 已于 P4 退役;v5 前端代码位于 `frontend/`。

```text
frontend/src/routes/
├── /pricing      (定价研究 — 含估值历史/自定义因子子页)
├── /godeye       (上帝视角 — 含深度诊断子页)
└── /workbench    (研究工作台)
```

- v5 前端收窄为三个工作区：**定价研究**、**上帝视角**、**研究工作台**。
- 估值历史与自定义因子作为定价研究子页保留；深度诊断作为上帝视角子页保留。
- `quantlab` 独立工作区已从前端入口移除；对应后端路由和 `src/` 引擎模块仍在本仓挂载并作为
  内部运行支撑维护（从公开 OpenAPI 文档隐藏），更偏交易方向的进一步开发可放到 `quant-trading-system`。
- `cross-market` 仅作为系统流内部重开路径保留，不再作为顶层导航入口。
- 回测、策略等底层引擎能力完整保留在本仓 `src/` 引擎中，作为内部运行支撑维护。

## 后端承接范围

```text
backend/app/api/v1/api.py
├── /pricing/*
├── /pricing-support/*
├── /alt-data/*
├── /macro*
├── /research-workbench/*
├── /research-workbench-support/*
├── /quant-lab/*
├── /cross-market/*          # 系统流内部重开路径
└── /infrastructure/*        # 系统运行与认证支撑
```

- 与上述路由配套的 service、schema、analytics 和 data 支撑代码都由当前仓继续维护。
- `/market-data/*`、`/strategies/*`、`/backtest/*`、`/realtime/*`、`/trade/*`、
  `/industry/*`、`/analysis/*`、`/events/*`、`/optimization/*` 仍在运行时挂载，
  只用于历史快照兼容、系统流重开和本地验证脚本；它们不再进入
  本仓生成的 OpenAPI/Postman 主文档，也不作为顶层产品边界描述。
- 当前仓以 GitHub private repo 形式维护，并继续演进系统部分。

## 目录概览

```text
super-pricing-system/
├── backend/                    # FastAPI 后端与系统模块 API
├── frontend/                        # v5 前端 (Vite + React 19 + TS + Tailwind v4 + shadcn/ui 暗金)
│   └── src/
│       ├── features/           # pricing/ · godeye/ · workbench/
│       ├── components/ui/      # shadcn/ui 组件库
│       ├── services/api/       # API 调用封装
│       └── routes/             # 路由配置 (dev :3100, 代理 /api → :8100)
├── src/                        # 定价、研究工作台、定价实验台等底层实现
├── tests/                      # pytest 与 E2E
├── scripts/                    # 启停、检查、辅助脚本
└── data/public/                # NEW (Phase F1) — 委员会提交的另类数据公开摘要
                                # 唯一对外可见的 data/ 子树：
                                # data/public/alt_data_summary.json
                                # 由 scripts/export_public_summary.py 生成，
                                # Celery beat alt_data.export_public_summary 每
                                # 30 分钟自动刷新，schema_version=1 稳定，
                                # ~5KB / 文件，对外消费者（cn-altdata-brief、
                                # 未来的 GitHub Pages 日报）直接读这份即可，
                                # 不需要访问 cache/alt_data/providers/*.json 私有
                                # runtime 缓存。详见 docs/alt_data_audit.md § 14。
```

## 快速开始

```bash
cd /path/to/super-pricing-system
./scripts/start_system.sh
```

## 开发约束

- 当前仓已经绑定 GitHub private remote。
- 系统仓只保留 `pricing / godsEye / workbench / quantlab` 四块可见入口。
- `quantlab` 只作为定价实验台和内部支撑区继续维护；交易策略、实时行情和行业轮动的新功能开发应进入
  同级目录中的 `quant-trading-system`。
- `cross-market` 仅保留给系统流内部重开使用。
- 回测、策略、交易等引擎代码作为内部运行支撑完整保留在本仓；面向使用者的入口、
  README、OpenAPI 和 Postman 集合必须保持当前私有系统边界。
- 如需面向交易方向做公开产品化开发，请切换到同级目录中的 `quant-trading-system`。
