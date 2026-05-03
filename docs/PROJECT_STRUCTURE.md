# super-pricing-system 结构说明

当前 `super-pricing-system` 是私有系统主仓，承接以下能力：

- `定价研究`
- `上帝视角`
- `研究工作台`
- `Quant Lab`

## 前端入口

```text
frontend/src/App.js
├── pricing
├── godsEye
├── workbench
└── quantlab
```

- 系统仓保留这四个 view 的导航、懒加载和 URL 状态。
- `cross-market` 仅作为系统流内部重开路径保留，不再作为顶层导航入口。
- 与三块主仓共享的底层能力允许在当前仓保留一份快照副本。
- 公开回测工作台的前端页面壳、图表组件和本地模板/报告工具已移除；需要公开策略工作台时切换到
  同级目录中的 `quant-trading-system`。
- 公开实时看盘、交易面板、市场分析和行业热力图的前端页面壳也已移除；当前仓只保留 Quant Lab、
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
  只用于 Quant Lab 内部实验、历史快照兼容和本地验证脚本；它们不再进入
  本仓生成的 OpenAPI/Postman 主文档，也不作为顶层产品边界描述。
- 当前仓以 GitHub private repo 形式维护，并继续演进系统部分。

## 目录概览

```text
super-pricing-system/
├── backend/                    # FastAPI 后端与系统模块 API
├── frontend/                   # React 前端与系统模块页面
├── src/                        # 定价、研究工作台、Quant Lab 等底层实现
├── tests/                      # pytest 与 E2E
└── scripts/                    # 启停、检查、辅助脚本
```

## 快速开始

```bash
cd /path/to/super-pricing-system
./scripts/start_system.sh
```

## 开发约束

- 当前仓已经绑定 GitHub private remote。
- 系统仓只保留 `pricing / godsEye / workbench / quantlab` 四块可见入口。
- `cross-market` 仅保留给系统流内部重开使用。
- 与公开主仓共享的底层快照代码只能作为内部支撑继续存在；面向使用者的入口、
  README、OpenAPI 和 Postman 集合必须保持当前私有系统边界。
- 如需公开开发三块主仓，请切换到同级目录中的 `quant-trading-system`。
