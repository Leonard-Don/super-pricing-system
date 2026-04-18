# super-pricing-system

本仓是私有系统主仓，承接从公开仓拆出的系统部分，主要负责：

- `定价研究`
- `上帝视角`
- `研究工作台`
- `Quant Lab`

它当前以 GitHub private repo 形式维护，默认继续以本地开发为主。

---

## 仓库定位

这个仓是与 `quant-trading-system` 并行的私有系统仓，用来继续维护原来平台里不适合公开的系统侧能力。

与公开仓的边界如下：

- 公开仓保留：`策略回测 / 实时行情 / 行业热度`
- 当前仓保留：`定价研究 / 上帝视角 / 研究工作台 / Quant Lab`
- 两边允许暂时共享底层代码快照，但不再共用前端入口和公开 API

补充说明：
`GodEye / Research Workbench` 的连续复盘流程仍可通过隐藏的 `cross-market` 深链重开跨市场验证页，但这不再是系统仓的顶层导航入口。

---

## 当前可用页面

启动后可直接访问：

| 页面 | 地址 | 说明 |
|------|------|------|
| 💰 定价研究 | `http://localhost:3000?view=pricing` | CAPM / FF3 / DCF / Gap Analysis |
| 🛰️ 上帝视角 | `http://localhost:3000?view=godsEye` | 宏观因子、证据质量、政策雷达、跨市场总览 |
| 📂 研究工作台 | `http://localhost:3000?view=workbench` | 研究任务持久化、状态流转、深链重开 |
| 🧪 Quant Lab | `http://localhost:3000?view=quantlab` | 参数优化、风险归因、估值历史、告警编排、数据质量 |
| 📖 API 文档 | `http://localhost:8000/docs` | 当前系统仓公开的本地 API |

---

## 快速开始

```bash
cd /path/to/super-pricing-system
./scripts/start_system.sh
```

健康检查：

```bash
python3 ./scripts/health_check.py
```

停止系统：

```bash
./scripts/stop_system.sh
```

---

## 后端承接范围

当前仓继续维护以下系统侧接口：

- `/pricing/*`
- `/alt-data/*`
- `/macro*`
- `/research-workbench/*`
- `/quant-lab/*`

同时保留与这些能力配套的 `services / schemas / analytics / data` 支撑代码。

---

## 目录概览

```text
super-pricing-system/
├── backend/                    # FastAPI 后端与系统模块 API
├── frontend/                   # React 前端与系统模块页面
├── src/                        # 定价、宏观、工作台、Quant Lab 等底层实现
├── tests/                      # pytest 与浏览器验证
└── scripts/                    # 启停、验证、辅助脚本
```

---

## Git 约束

- 当前仓已经绑定 GitHub private remote，可正常提交和推送
- 系统仓只承接 `pricing / godsEye / workbench / quantlab` 四块可见入口
- `cross-market` 仅保留给系统流内部重开使用，不再作为顶层导航项

如需维护公开仓，请切换到同级目录下的 `quant-trading-system`。
