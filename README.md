<div align="center">

<img src="docs/screenshots/github-social-preview.png" alt="Super Pricing System" width="720" />

<br />

# 🏛️ Super Pricing System

**宏观错误定价套利引擎 · Macro Mispricing Arbitrage Engine**

*一套面向 A 股市场的全链路量化研究系统，覆盖定价研究、宏观因子监控、另类数据挖掘、跨市场回测与研究运营闭环。*

**当前版本：`v4.1.0`** · [查看更新日志](docs/CHANGELOG.md)

[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-brightgreen?style=for-the-badge)](./LICENSE)

[![CI](https://img.shields.io/github/actions/workflow/status/Leonard-Don/super-pricing-system/ci.yml?branch=main&style=flat-square&label=CI&logo=github)](https://github.com/Leonard-Don/super-pricing-system/actions/workflows/ci.yml)
[![Latest Release](https://img.shields.io/github/v/release/Leonard-Don/super-pricing-system?style=flat-square&logo=github)](https://github.com/Leonard-Don/super-pricing-system/releases/latest)

<br />

> 💰 定价研究 · 🛰️ 上帝视角 · 📂 研究工作台 · 🧪 Quant Lab — **4** 大核心工作区 · **11** 类 API 分组 · **30+** 运维脚本

[本地体验](#-本地体验) · [核心模块](#-核心模块) · [页面预览](#-页面预览) · [快速开始](#-快速开始) · [系统架构](#-系统架构) · [测试](#-测试) · [API 参考](docs/API_REFERENCE.md)

</div>

---

## 🎯 系统定位

本仓库是一个独立维护的量化研究项目，专注于以下四大核心方向：

| 工作区 | 图标 | 说明 |
|--------|------|------|
| **定价研究** | 💰 | CAPM / Fama-French 三因子 / DCF 估值 / Gap Analysis |
| **上帝视角 (GodEye)** | 🛰️ | 宏观因子引擎 · 证据质量 · 政策雷达 · 结构性衰败 · 跨市场总览 |
| **研究工作台** | 📂 | 研究任务持久化 · 状态流转 · 深链重开 · 剧本联动 |
| **Quant Lab** | 🧪 | 参数优化 · 风险归因 · 估值历史 · 告警编排 · 数据质量诊断 |

### 🎯 这个仓适合谁

- 需要**多模型定价分析**能力，CAPM / FF3 / DCF 一键对比，发现错误定价
- 需要**宏观因子监控**和**证据质量引擎**，从源头追踪因子的可信度和衰变
- 需要一个完整的**研究运营闭环**，从发现到建模到回测到执行的全链路
- 需要**另类数据管道**：政策雷达、治理数据、人事脆弱性、供应链信号

### 🔎 GitHub 首页导航

| 如果你想先看 | 入口 |
|------|------|
| 🖼️ 系统实际长什么样 | [本地体验](#-本地体验) + [页面预览](#-页面预览) |
| ⚡ 怎么最快启动 | [快速开始](#-快速开始) |
| 🔌 提供了哪些 API | [API 路由](#-api-路由) + [API 参考](docs/API_REFERENCE.md) |
| 📝 最近版本改了什么 | [更新日志](docs/CHANGELOG.md) |

---

## 🧭 本地体验

> 当前不提供在线 Demo。请在本地启动前后端后体验完整功能。

### 30 秒启动

```bash
git clone https://github.com/Leonard-Don/super-pricing-system.git
cd super-pricing-system
cp .env.example .env
./scripts/start_system.sh
```

### 启动后可访问

| 页面 | 地址 | 说明 |
|------|------|------|
| 💰 定价研究 | `http://localhost:3100?view=pricing` | CAPM / FF3 / DCF / Gap Analysis |
| 🛰️ 上帝视角 | `http://localhost:3100?view=godsEye` | 宏观因子 · 证据质量 · 政策雷达 · 跨市场总览 |
| 📂 研究工作台 | `http://localhost:3100?view=workbench` | 研究任务持久化 · 状态流转 · 深链重开 |
| 🧪 Quant Lab | `http://localhost:3100?view=quantlab` | 参数优化 · 风险归因 · 估值历史 · 告警编排 |
| 📖 API 文档 | `http://localhost:8100/docs` | OpenAPI 交互式文档 |

### 💡 推荐体验路径

1. 先进入 **定价研究**，完成标的检索、多模型估值和理论价格判断
2. 再切到 **上帝视角**，查看宏观因子、证据质量和跨市场叙事切换
3. 接着进入 **研究工作台**，验证任务卡、状态流转和深链重开
4. 最后进入 **Quant Lab**，运行参数优化、估值实验和告警编排

---

## 🧩 核心模块

### 💰 定价研究 (Pricing Research)

多模型定价分析引擎，支持标的快速检索与同行对比：

- **CAPM 模型** — 市场风险溢价估算与 β 系数分析
- **Fama-French 三因子** — 规模/价值因子暴露计算
- **DCF 现金流折现** — 自由现金流建模与敏感性分析
- **Gap Analysis** — 市场价格与理论价值的偏离度分析，识别潜在套利机会
- **估值支撑解释** — 多模型交叉验证与定价结论可解释性

### 🛰️ 上帝视角 (GodEye Dashboard)

宏观错误定价监控总部，集成多因子可靠度引擎：

- **宏观因子雷达** — 官僚摩擦 / 基荷错位 / 技术稀释 / 人事脆弱性 / 利率曲线压力 / 信用利差压力 / 汇率错配
- **证据质量引擎** — 来源可信度 · 冲突/漂移/断流诊断 · 跨源确认 · 反转前兆 · 因子共振
- **结构性衰败监控** — people / governance / execution / physical / evidence 维度雷达
- **部门混乱看板** — 政策执行紊乱监控与部门注意力碎片化分析
- **政策时间线** — 官方 feed + 正文抓取 + source health 诊断
- **跨市场总览** — 多市场联动关系与叙事切换预警

### 📂 研究工作台 (Research Workbench)

持久化研究运营中心，驱动从发现到执行的研究闭环：

- **研究卡片管理** — 后端持久化任务卡 · 状态流转 · 深链重开
- **快照解释与版本对比** — recommendation / allocation / bias / driver 主题变化追踪
- **研究剧本联动** — 与 GodEye、定价研究、跨市场回测的保存与重开闭环
- **共振驱动优先级** — 自动降级 · 核心腿受压 · 直达 deep link

### 🧪 Quant Lab

独立量化实验台，系统性验证策略假设：

- **策略优化器** — 批量参数搜索 · Walk-Forward 验证
- **组合实验** — 多资产组合构建 · 基准对比 · 风险归因
- **估值实验室** — 估值历史回溯 · 敏感性矩阵
- **告警编排** — 自定义告警条件 · 批量管理 · 通知调度
- **数据质量中心** — 数据源健康度 · 断流/漂移检测 · 质量评分

---

## 🖼️ 页面预览

<div align="center">
  <table>
    <tr>
      <td width="58%">
        <img src="docs/screenshots/product-tour-v2.png" alt="系统总览" />
      </td>
      <td width="42%">
        <img src="docs/screenshots/product-tour.gif" alt="操作演示" />
      </td>
    </tr>
    <tr>
      <td align="center"><strong>系统总览</strong><br/>四大主工作区与研究闭环入口</td>
      <td align="center"><strong>交互演示</strong><br/>从入口切换到研究动作的连续体验</td>
    </tr>
  </table>
</div>

> 本地页面入口见上方"本地体验"。如果你想直接验证当前主应用链路，推荐在 `tests/e2e/` 下运行端到端验证。

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (React 18)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌───────────────┐  │
│  │ 定价研究  │ │ GodEye   │ │ 研究工作台    │ │  Quant Lab    │  │
│  │ Pricing  │ │ Dashboard│ │ Workbench    │ │  Laboratory   │  │
│  └──────────┘ └──────────┘ └──────────────┘ └───────────────┘  │
│                Ant Design · Recharts · Lightweight Charts       │
├───────────────────────┬─────────────────────────────────────────┤
│     REST API (v1)     │           WebSocket                     │
├───────────────────────┴─────────────────────────────────────────┤
│                   Backend (FastAPI + Uvicorn)                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────┐  │
│  │ Pricing API│ │ Macro API  │ │Workbench   │ │QuantLab API │  │
│  │ AltData API│ │ Evidence   │ │ API        │ │Alerts API   │  │
│  └────────────┘ └────────────┘ └────────────┘ └─────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                     Core Engine (src/)                           │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Analytics  │ │ Backtest │ │ Strategy │ │ Alternative Data │  │
│  │ (28+ 模块) │ │  Engine  │ │ Library  │ │    Pipeline      │  │
│  └───────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                     Infrastructure                               │
│        TimescaleDB · Redis · Celery · Prometheus                 │
└─────────────────────────────────────────────────────────────────┘
```

### 技术栈

<table>
<tr><td>

**后端**

| 组件 | 技术 |
|------|------|
| Web 框架 | FastAPI 0.100+ · Uvicorn · Pydantic v2 |
| 数据处理 | Pandas · NumPy · SciPy · scikit-learn |
| 金融数据 | AKShare · yfinance · pandas-datareader |
| 异步 & 任务 | aiohttp · asyncio · Celery · APScheduler |
| 实时通信 | WebSocket (websockets 12+) |
| 数据库 | TimescaleDB (PostgreSQL 16) · Redis 7 |
| 监控 | Prometheus · psutil |

</td><td>

**前端 & 基础设施**

| 组件 | 技术 |
|------|------|
| 框架 | React 18 · Create React App |
| UI 库 | Ant Design 5 · @ant-design/icons |
| 图表 | Recharts · Lightweight Charts |
| 网络 | Axios · WebSocket |
| 工具 | dayjs · lodash · jsPDF |
| 基础设施 | TimescaleDB · Redis · Celery |
| CI/CD | GitHub Actions |

</td></tr>
</table>

---

## 🔌 API 路由

> 浏览器和脚本实际访问的是 `/pricing/*`、`/quant-lab/*` 等路由。完整接口可在 `http://localhost:8100/docs` 查看。

| 路由前缀 | 模块 | 说明 |
|----------|------|------|
| `/pricing/*` | 💰 定价研究 | 标的搜索 · 多模型定价 · 同行对比 · 敏感性分析 |
| `/pricing-support/*` | 定价支撑 | 基准因子摘要 · 估值支撑解释 |
| `/alt-data/*` | 另类数据 | 供应链 · 治理 · 人事 · 政策源 · 实体统一 |
| `/macro/*` | 🛰️ 宏观引擎 | 因子可靠度 · 冲突诊断 · 衰败监控 · 部门混乱 |
| `/research-workbench/*` | 📂 研究工作台 | 任务卡 CRUD · 状态流转 · 快照 |
| `/quant-lab/*` | 🧪 Quant Lab | 优化实验 · 批量回测 · 告警 · 估值 |
| `/cross-market/*` | 跨市场 | 模板推荐 · 组合回测 · 执行诊断 |
| `/analysis/*` | 分析 | 技术分析 · 模式识别 · AI 预测 |
| `/backtest/*` | 回测引擎 | 单资产 / 组合 / 批量 / Walk-Forward |
| `/industry/*` | 行业研究 | 热力图 · 排名 · 龙头股 · 趋势 |
| `/realtime/*` | 实时行情 | 行情流 · 快照 · 深度详情 · 提醒 |
| `/infrastructure/*` | 基础设施 | 认证 · 令牌管理 · 通知 · 系统状态 |

---

## 🚀 快速开始

### 环境要求

| 依赖 | 最低版本 | 推荐版本 |
|------|----------|----------|
| Python | `3.9+` | `3.13` |
| Node.js | `16+` | `22` |
| npm | `8+` | `10+` |
| Docker | 可选 | `24+` (用于 TimescaleDB + Redis) |

### 1. 克隆与配置

```bash
git clone https://github.com/Leonard-Don/super-pricing-system.git
cd super-pricing-system
cp .env.example .env
```

### 2. 安装依赖

```bash
# 后端依赖
pip install -r requirements.txt

# 前端依赖
cd frontend && npm install && cd ..
```

### 3. 启动系统

**最简启动（无需 Docker）：**

```bash
./scripts/start_system.sh
```

**完整启动（含基础设施 + Celery Worker）：**

```bash
./scripts/start_system.sh --with-infra --with-worker --bootstrap-persistence
```

### 4. 验证

```bash
# 健康检查
python3 ./scripts/health_check.py

# 打开浏览器
# 前端: http://localhost:3100
# API:  http://localhost:8100/docs
```

### 5. 停止系统

```bash
# 仅前后端
./scripts/stop_system.sh

# 含基础设施和 Worker
./scripts/stop_system.sh --with-infra --with-worker
```

---

## 🧪 测试

```bash
# 运行全部测试（unit + integration + system）
python scripts/run_tests.py

# 仅单元测试
python scripts/run_tests.py --unit

# 仅集成测试
python scripts/run_tests.py --integration

# 前端测试
cd frontend && CI=1 npm test -- --runInBand --watchAll=false

# 覆盖率报告
python scripts/run_tests.py --coverage
```

> 详细说明请参阅 [测试指南](docs/TESTING_GUIDE.md)

---

## 📦 部署

### 开发环境

```bash
pip install -r requirements-dev.txt
cd frontend && npm install && cd ..
./scripts/start_system.sh
```

### 生产环境

```bash
# 后端
API_RELOAD=false python backend/main.py

# 前端构建
cd frontend && npm run build
```

### 基础设施（Docker）

```bash
# 启动 TimescaleDB + Redis
./scripts/start_infra_stack.sh --bootstrap-persistence

# 启动 Celery Worker
./scripts/start_celery_worker.sh

# 数据迁移
python3 ./scripts/migrate_infra_store.py --apply
```

> 若未安装 Docker，系统可自动降级为 SQLite + 本地执行器运行。
>
> 支持 Nginx 反向代理部署，详见 [部署指南](docs/DEPLOYMENT.md)。

---

## 📁 目录结构

```
super-pricing-system/
├── backend/                         # FastAPI 后端应用
│   ├── main.py                      # 应用入口 & Uvicorn 启动
│   └── app/
│       ├── api/v1/endpoints/        # 26+ REST API 端点
│       ├── core/                    # 配置中心 & 应用核心
│       ├── db/                      # TimescaleDB Schema & 迁移
│       ├── schemas/                 # Pydantic 请求/响应模型
│       ├── services/                # 业务服务层 (QuantLab 7 服务)
│       └── websocket/               # 实时行情 & 交易推送
│
├── frontend/                        # React 前端应用
│   └── src/
│       ├── components/              # 40+ 页面组件
│       │   ├── pricing/             # 定价研究 UI (11 组件)
│       │   ├── GodEyeDashboard/     # 上帝视角 UI (29 组件)
│       │   ├── research-workbench/  # 研究工作台 UI (18 组件)
│       │   ├── quant-lab/           # 量化实验台 UI (49 组件)
│       │   └── ...
│       ├── hooks/                   # 自定义 React Hooks
│       ├── services/                # API 调用封装
│       └── i18n/                    # 国际化
│
├── src/                             # 核心计算引擎
│   ├── analytics/                   # 分析模块 (26+ 引擎)
│   ├── backtest/                    # 回测引擎 (14 模块)
│   ├── data/                        # 数据层
│   │   ├── alternative/             # 另类数据管道
│   │   └── providers/               # 多数据源适配器
│   ├── strategy/                    # 策略库
│   └── research/                    # 研究工作台核心
│
├── tests/                           # 测试套件
│   ├── unit/                        # 单元测试
│   ├── integration/                 # 集成测试
│   └── e2e/                         # 浏览器端到端回归
│
├── scripts/                         # 运维脚本 (30+)
├── docs/                            # 项目文档
├── docker-compose.pricing-infra.yml # 基础设施编排
└── VERSION                          # 当前版本: 4.1.0
```

---

## 📚 相关文档

| 文档 | 说明 |
|------|------|
| [API 参考手册](docs/API_REFERENCE.md) | 完整 API 端点说明 |
| [更新日志](docs/CHANGELOG.md) | 版本发布记录 |
| [部署指南](docs/DEPLOYMENT.md) | 开发/生产环境部署 |
| [测试指南](docs/TESTING_GUIDE.md) | 测试分层与运行方式 |
| [项目结构](docs/PROJECT_STRUCTURE.md) | 代码组织说明 |
| [贡献指南](CONTRIBUTING.md) | 开发流程与提交建议 |
| [安全政策](SECURITY.md) | 漏洞报告流程 |

### GitHub 协作入口

- [Pull Request 模板](.github/PULL_REQUEST_TEMPLATE.md)
- [Bug Report 模板](.github/ISSUE_TEMPLATE/bug_report.yml)
- [Feature Request 模板](.github/ISSUE_TEMPLATE/feature_request.yml)
- [CI 工作流](.github/workflows/ci.yml)

---

## 🔗 相关项目

如果你还需要更偏交易研究、实时监控和行业轮动分析的能力，可以查看独立项目 [quant-trading-system](https://github.com/Leonard-Don/quant-trading-system)。

两个项目当前按独立仓维护：

| 项目 | 聚焦领域 |
|------|----------|
| **super-pricing-system** (本仓) | 💰 定价研究 · 🛰️ 上帝视角 · 📂 研究工作台 · 🧪 Quant Lab |
| **quant-trading-system** | 📊 策略回测 · 📈 实时行情 · 🔥 行业热度 |

两边各自独立 clone、安装、启动、测试和发布。

---

## 📄 License

[MIT License](LICENSE) © 2026 Leonardo
