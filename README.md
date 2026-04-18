<![CDATA[<div align="center">

# 🏛️ Super Pricing System

**宏观错误定价套利引擎 · Macro Mispricing Arbitrage Engine**

[![Version](https://img.shields.io/badge/version-4.0.0-blue.svg)](./VERSION)
[![Python](https://img.shields.io/badge/python-3.9+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=white)](https://react.dev/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

*一套面向 A 股市场的全链路量化研究系统，覆盖定价研究、宏观因子监控、另类数据挖掘、跨市场回测与研究运营闭环。*

<img src="docs/screenshots/product-tour-v2.png" width="800" alt="系统总览" />

</div>

---

## 📖 目录

- [系统定位](#-系统定位)
- [核心模块](#-核心模块)
- [系统架构](#-系统架构)
- [技术栈](#-技术栈)
- [快速开始](#-快速开始)
- [可用页面](#-可用页面)
- [API 路由](#-api-路由)
- [目录结构](#-目录结构)
- [测试](#-测试)
- [部署](#-部署)
- [相关文档](#-相关文档)
- [License](#-license)

---

## 🎯 系统定位

本仓库是私有系统主仓，承接从公开仓 `quant-trading-system` 拆出的系统侧能力，专注于以下四大核心方向：

| 方向 | 说明 |
|------|------|
| 💰 **定价研究** | CAPM / Fama-French 三因子 / DCF 估值 / Gap Analysis |
| 🛰️ **上帝视角 (GodEye)** | 宏观因子引擎 · 证据质量 · 政策雷达 · 结构性衰败 · 跨市场总览 |
| 📂 **研究工作台** | 研究任务持久化 · 状态流转 · 深链重开 · 剧本联动 |
| 🧪 **Quant Lab** | 参数优化 · 风险归因 · 估值历史 · 告警编排 · 数据质量诊断 |

**与公开仓的边界：**

```
quant-trading-system (公开)          super-pricing-system (私有)
├── 策略回测                          ├── 定价研究
├── 实时行情                          ├── 上帝视角 (GodEye)
└── 行业热度                          ├── 研究工作台
                                     └── Quant Lab
```

> 两边允许暂时共享底层代码快照，但不再共用前端入口和公开 API。

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

宏观错误定价监控总部，集成 6 因子可靠度引擎：

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

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React 18)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌───────────────┐  │
│  │  定价研究  │ │ GodEye   │ │ 研究工作台    │ │  Quant Lab    │  │
│  └──────────┘ └──────────┘ └──────────────┘ └───────────────┘  │
│                    Ant Design · Recharts · LightweightCharts     │
├─────────────────────────┬───────────────────────────────────────┤
│      REST API (v1)      │           WebSocket                   │
├─────────────────────────┴───────────────────────────────────────┤
│                     Backend (FastAPI + Uvicorn)                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────┐  │
│  │ Pricing API │ │ Macro API  │ │Workbench API│ │QuantLab API │  │
│  └────────────┘ └────────────┘ └────────────┘ └─────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Services / Schemas / Middleware                │  │
│  └────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        Core Engine (src/)                        │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Analytics  │ │ Backtest │ │ Strategy │ │ Alternative Data │  │
│  │ (28+ 模块) │ │  Engine  │ │ Library  │ │    Pipeline      │  │
│  └───────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      Infrastructure                              │
│         TimescaleDB · Redis · Celery · Prometheus                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ 技术栈

### 后端

| 组件 | 技术 |
|------|------|
| Web 框架 | FastAPI 0.100+ · Uvicorn · Pydantic v2 |
| 数据处理 | Pandas · NumPy · SciPy · scikit-learn |
| 金融数据 | AKShare (A股) · yfinance · pandas-datareader (Fama-French) |
| 异步 & 任务 | aiohttp · asyncio · Celery · APScheduler |
| 实时通信 | WebSocket (websockets 12+) |
| 数据库 | TimescaleDB (PostgreSQL 16) · Redis 7 |
| 监控 | Prometheus · psutil |
| 安全 | cryptography · Rate Limiter · Request Validation |

### 前端

| 组件 | 技术 |
|------|------|
| 框架 | React 18 · Create React App |
| UI 库 | Ant Design 5 · @ant-design/icons |
| 图表 | Recharts · Lightweight Charts (TradingView) |
| 网络 | Axios · WebSocket |
| 工具 | dayjs · lodash · jsPDF |

### 基础设施

| 组件 | 用途 |
|------|------|
| TimescaleDB | 时序数据持久化（因子历史 / 行情快照 / 告警记录） |
| Redis | 缓存 · Celery Broker · 实时状态 |
| Celery | 异步任务队列（批量回测 / 数据刷新） |
| Docker Compose | 基础设施一键编排 |
| GitHub Actions | CI 自动化测试 |

---

## 🚀 快速开始

### 环境要求

- Python 3.9+
- Node.js 16+ / npm 8+
- Docker (可选，用于 TimescaleDB + Redis)

### 1. 克隆与配置

```bash
git clone <your-private-repo-url> super-pricing-system
cd super-pricing-system

# 复制环境配置
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
# 前端: http://localhost:3000
# API:  http://localhost:8000/docs
```

### 5. 停止系统

```bash
# 仅前后端
./scripts/stop_system.sh

# 含基础设施和 Worker
./scripts/stop_system.sh --with-infra --with-worker
```

---

## 📺 可用页面

启动后可直接访问以下页面：

| 页面 | 地址 | 说明 |
|------|------|------|
| 💰 定价研究 | `http://localhost:3000?view=pricing` | CAPM / FF3 / DCF / Gap Analysis |
| 🛰️ 上帝视角 | `http://localhost:3000?view=godsEye` | 宏观因子 · 证据质量 · 政策雷达 · 跨市场总览 |
| 📂 研究工作台 | `http://localhost:3000?view=workbench` | 研究任务持久化 · 状态流转 · 深链重开 |
| 🧪 Quant Lab | `http://localhost:3000?view=quantlab` | 参数优化 · 风险归因 · 估值历史 · 告警编排 |
| 📖 API 文档 | `http://localhost:8000/docs` | OpenAPI 交互式文档 |

---

## 🔌 API 路由

当前仓维护以下 API 分组（均挂载在 `/api/v1` 下）：

| 路由前缀 | 模块 | 说明 |
|----------|------|------|
| `/pricing/*` | 定价研究 | 标的搜索 · 多模型定价 · 同行对比 · 敏感性分析 |
| `/pricing-support/*` | 定价支撑 | 基准因子摘要 · 估值支撑解释 |
| `/alt-data/*` | 另类数据 | 供应链 · 治理 · 人事 · 政策源 · 实体统一 |
| `/macro*` | 宏观引擎 | 因子可靠度 · 冲突诊断 · 衰败监控 · 部门混乱 |
| `/research-workbench/*` | 研究工作台 | 任务卡 CRUD · 状态流转 · 快照 |
| `/quant-lab/*` | Quant Lab | 优化实验 · 批量回测 · 告警 · 估值 |
| `/cross-market/*` | 跨市场 | 模板推荐 · 组合回测 · 执行诊断 |
| `/analysis/*` | 分析 | 技术分析 · 模式识别 · AI 预测 |
| `/backtest/*` | 回测引擎 | 单资产 / 组合 / 批量 / Walk-Forward |
| `/industry/*` | 行业研究 | 热力图 · 排名 · 龙头股 · 趋势 · 提醒 |
| `/realtime/*` | 实时行情 | 行情流 · 快照 · 深度详情 · 提醒 |
| `/infrastructure/*` | 基础设施 | 认证 · 令牌管理 · 通知 · 系统状态 |

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
│       ├── services/                # 业务服务层
│       └── websocket/               # 实时行情 & 交易推送
│
├── frontend/                        # React 前端应用
│   ├── package.json
│   └── src/
│       ├── App.js                   # 路由入口 & 视图切换
│       ├── components/              # 40+ 页面组件
│       │   ├── pricing/             # 定价研究 UI
│       │   ├── GodEyeDashboard/     # 上帝视角 UI (28 组件)
│       │   ├── research-workbench/  # 研究工作台 UI
│       │   ├── QuantLab.js          # 量化实验台
│       │   └── ...
│       ├── hooks/                   # 自定义 React Hooks
│       ├── services/                # API 调用封装
│       ├── contexts/                # React Context
│       └── i18n/                    # 国际化
│
├── src/                             # 核心计算引擎
│   ├── analytics/                   # 分析模块 (26+ 引擎)
│   │   ├── asset_pricing.py         # CAPM / FF3 资产定价
│   │   ├── pricing_gap_analyzer.py  # 价格偏离分析
│   │   ├── valuation_model.py       # DCF 估值模型
│   │   ├── macro_factors/           # 宏观因子库 (12 因子)
│   │   ├── sentiment_analyzer.py    # 情绪分析
│   │   ├── pattern_recognizer.py    # 形态识别
│   │   └── ...
│   ├── backtest/                    # 回测引擎 (14 模块)
│   │   ├── backtester.py            # 单资产回测
│   │   ├── portfolio_backtester.py  # 组合回测
│   │   ├── batch_backtester.py      # 批量回测
│   │   ├── cross_market_backtester.py  # 跨市场回测
│   │   ├── risk_manager.py          # 风险管理
│   │   └── ...
│   ├── data/                        # 数据层
│   │   ├── alternative/             # 另类数据管道
│   │   │   ├── policy_radar/        # 政策雷达
│   │   │   ├── governance.py        # 治理数据
│   │   │   ├── people/              # 人事数据
│   │   │   └── supply_chain/        # 供应链数据
│   │   ├── providers/               # 多数据源适配器
│   │   ├── realtime_manager.py      # 实时行情管理
│   │   └── data_manager.py          # 统一数据管理
│   ├── strategy/                    # 策略库 (10+ 策略)
│   ├── research/                    # 研究工作台核心
│   ├── security/                    # 安全校验
│   ├── middleware/                  # 缓存 · 限流 · 请求链路
│   └── settings/                    # 配置分域管理
│
├── tests/                           # 测试套件
│   ├── unit/                        # 单元测试
│   ├── integration/                 # 集成测试
│   ├── e2e/                         # 浏览器端到端回归
│   └── manual/                      # 手工调试脚本
│
├── scripts/                         # 运维脚本 (30+)
│   ├── start_system.sh              # 一键启动
│   ├── stop_system.sh               # 一键停止
│   ├── health_check.py              # 健康检查
│   ├── start_infra_stack.sh         # 基础设施启动
│   ├── start_celery_worker.sh       # 任务队列启动
│   ├── performance_test.py          # 性能测试
│   └── ...
│
├── docs/                            # 项目文档
│   ├── API_REFERENCE.md             # API 参考手册
│   ├── CHANGELOG.md                 # 更新日志
│   ├── DEPLOYMENT.md                # 部署指南
│   ├── TESTING_GUIDE.md             # 测试指南
│   ├── PROJECT_STRUCTURE.md         # 结构说明
│   ├── openapi.json                 # OpenAPI 规范
│   └── postman_collection.json      # Postman 集合
│
├── docker-compose.quant-infra.yml   # 基础设施编排
├── .github/workflows/ci.yml         # CI 流水线
├── requirements.txt                 # 生产依赖
├── requirements-dev.txt             # 开发依赖
└── VERSION                          # 当前版本: 4.0.0
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

# 行业热度 E2E（需本地服务已启动）
python scripts/run_tests.py --e2e-industry

# 实时行情 E2E
python scripts/run_tests.py --e2e-realtime

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

支持 Nginx 反向代理部署，详见 [部署指南](docs/DEPLOYMENT.md)。

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

---

## 📄 License

[MIT License](LICENSE) © 2026 Leonardo
]]>
