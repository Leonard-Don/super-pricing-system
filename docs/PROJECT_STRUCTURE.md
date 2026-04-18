# super-pricing-system 结构说明

当前 `super-pricing-system` 是本地私有系统主仓，承接以下能力：

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
- 与三块主仓共享的底层能力允许在当前仓保留一份快照副本。

## 后端承接范围

```text
backend/app/api/v1/api.py
├── /pricing/*
├── /macro*
├── /research-workbench/*
└── /quant-lab/*
```

- 与上述路由配套的 service、schema、analytics 和 data 支撑代码都由当前仓继续维护。
- 当前仓默认不配置远端，仅在本机继续演进系统部分。

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

- 当前仓保持本地独立 Git 仓。
- `git remote -v` 应为空，避免误推到 GitHub。
- 如需公开开发三块主仓，请切换到同级目录中的 `quant-trading-system`。
