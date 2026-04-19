# 测试指南

## 测试结构

- `tests/unit/` 单元测试
- `tests/integration/` 集成测试
- `tests/e2e/` 浏览器端到端回归
- `tests/manual/` 手工/调试脚本

## 运行测试

```bash
# 默认运行 unit / integration / system
python scripts/run_tests.py

# 单元测试
python scripts/run_tests.py --unit

# 集成测试
python scripts/run_tests.py --integration

# 当前主应用入口 E2E 回归
python scripts/run_tests.py --e2e-surface

# Quant Lab E2E 回归
python scripts/run_tests.py --e2e-quantlab

# 当前主应用完整浏览器回归
python scripts/run_tests.py --e2e-current-app

# 覆盖率报告
python scripts/run_tests.py --coverage
```

也可以直接在 `tests/e2e/` 目录下运行：

```bash
npm run verify:app-surface
npm run verify:research
npm run verify:quantlab
npm run verify:current-app
```

## 测试分层说明

- `unit`：纯 Python 单元测试，不依赖已启动服务
- `integration`：接口与模块集成测试，可能依赖第三方数据源
- `system`：系统级脚本检查
- `e2e-surface`：当前主应用入口浏览器回归，覆盖 `pricing / godsEye / workbench / quantlab / cross-market` 以及 `/quantlab` 路径别名
- `e2e-research`：研究主链浏览器回归，覆盖 `pricing -> workbench -> godsEye -> cross-market`
- `e2e-quantlab`：`Quant Lab` 浏览器回归，覆盖优化、回测增强、风险、估值、行业、信号、基础设施与研究运营中心
- `e2e-current-app`：当前主应用完整浏览器回归，顺序执行入口面、研究主链与 Quant Lab

## 兼容入口

- `npm run verify:industry`：兼容旧命令，当前等价于 `npm run verify:app-surface`
- `npm run verify:realtime`：兼容旧命令，当前等价于 `npm run verify:quantlab`
- `python scripts/run_tests.py --e2e-industry`：兼容旧命令，当前等价于 `--e2e-surface`
- `python scripts/run_tests.py --e2e-realtime`：兼容旧命令，当前等价于 `--e2e-quantlab`

## 注意事项

- 部分测试依赖网络或第三方数据源
- 运行前请确保后端依赖已安装
- 默认 `python scripts/run_tests.py` 会在未检测到本地服务时自动跳过浏览器 E2E
- 浏览器 E2E 需要本地服务已启动：

```bash
python scripts/start_backend.py
./scripts/start_frontend.sh
```

---

**最后更新**: 2026-04-19
