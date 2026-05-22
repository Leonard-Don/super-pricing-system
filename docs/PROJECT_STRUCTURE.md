# super-pricing-system 结构说明

当前 `super-pricing-system` 是私有系统主仓，承接以下能力：

- `定价研究`
- `上帝视角`
- `研究工作台`
- `定价实验台 (Quant Lab)`

## 前端入口

```text
frontend/src/App.js
├── pricing
├── godsEye
├── workbench
└── quantlab
```

- 系统仓保留这四个 view 的导航、懒加载和 URL 状态。
- `quantlab` 入口现在按定价实验台收口：估值历史、自定义因子和内部运行支撑继续留在本仓；
  策略优化、回测增强、风险归因、行业轮动、行业智能和实时信号验证已经从本仓前端可见入口移除,
  对应的后端路由和 `src/` 引擎模块仍在本仓挂载并作为内部运行支撑维护(只是从公开 OpenAPI
  文档隐藏),更偏交易方向的进一步开发可放到 `quant-trading-system`。
- `cross-market` 仅作为系统流内部重开路径保留，不再作为顶层导航入口。
- 回测、策略等底层引擎能力完整保留在本仓 `src/` 引擎中,作为内部运行支撑维护。
- 公开回测工作台的前端页面壳、图表组件和本地模板/报告工具已移除；需要公开策略工作台时切换到
  同级目录中的 `quant-trading-system`。
- 公开实时看盘、交易面板、市场分析和行业热力图的前端页面壳也已移除；当前仓只保留定价实验台、
  cross-market 和研究工作台仍需调用的内部 API 支撑。

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
├── frontend/                   # React 前端与系统模块页面
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
