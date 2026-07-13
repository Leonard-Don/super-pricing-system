# Super Pricing 本地退役设计

## 目标

在删除 `/Users/leonardodon/super-pricing-system` 前，只保留经审核仍适用于最新 `origin/main`、能够通过相应验证的代码，并将这些代码提交和推送到 GitHub。删除未被 Git 跟踪的环境配置、缓存、数据库和运行历史，不将它们上传或长期归档。

## 设计确认时的本地状态

- 本地 `main` 与 `origin/main` 当前指向同一提交。
- 一个旧 stash 包含“移除本地基础设施栈”的 WIP，涉及脚本、Compose 文件及部署文档。
- 本地 `v4.1.0` 标签与 GitHub 同名标签指向不同历史；该标签不作为产品代码迁移。
- `.env`、`data/`、缓存、构建产物和测试产物不在保留范围。

## 审核与整合

1. 在工作区外的临时目录中创建包含全部活动 refs（包括 `refs/stash`）的 Git bundle，并通过 `git bundle verify` 与临时 bare repository 实际 fetch 验证恢复能力；不复制 `.env` 或本地数据。
2. 对照当前架构、README、部署文档和启动脚本，确认基础设施栈是否仍是受支持的运行方式。
3. 如果栈已过时，只移植完整且一致的移除方案，包括代码、脚本、文档和测试更新；如果仍受支持，则整个 stash 直接丢弃，不保留半完成删除。
4. 所有保留修改形成聚焦提交，提交信息使用中文，并保持工作区无无关改动。

## 实施后复核结果与偏差

- `infra-removal-wip-pre-l3` stash 经完整审核后整体丢弃；其中删除 TimescaleDB、Redis 与配套生命周期的方向不适用于当前 `main`。清理前的 refs 已保存在上述经验证的外部 Git bundle 中。
- Task 2 审核发现 `start_system.sh --with-worker` 会自动启动 beat，但 `stop_system.sh --with-worker` 只停止 worker。保留方案因此加入最小修复：先停止 beat、再停止 worker，并新增隔离的 shell 行为合同测试。
- Task 3 全量后端验证暴露信号面板往返测试依赖真实当前时间。保留方案固定该测试的参考时钟，不修改生产实现。
- 因上述审核修复，最终保留提交同时包含退役文档、`stop_system.sh` 修复及相关测试修复，不再是“仅文档”变更；基础设施栈本身仍完整保留。

## 验证门槛

- Shell 修改至少通过 `bash -n`，并运行脚本提供的非破坏性帮助或状态入口。
- 后端修改运行 Ruff 和 `pytest -q tests/unit tests/integration`；根据改动范围补充项目特定测试。
- 前端修改运行 `CI=true npm test -- --watch=false`；涉及构建链时补充生产构建。
- Compose 或部署文档变化必须与实际启动路径和健康检查保持一致。
- 所有保留修改必须通过相关验证；无法形成完整方案或无法证明价值的 WIP 不提交。
- 推送或合并后重新 fetch，确认所有保留提交已经进入 `origin/main`，本地 `main` 与 `origin/main` 一致，且不存在未提交、未推送或未审核的代码。

## 删除门槛

只有在验证和远端一致性检查完成后，才删除项目目录。推送前把预期 `main` SHA 写入仓库外 marker；进程或 LaunchAgent 命中、进程枚举失败、引用扫描错误都会阻断删除。删除包含 `.env`、本地数据库、缓存和历史记录；这些内容不会上传。删除后验证项目路径不存在，用 `git ls-remote` 精确断言 GitHub `main` 仍等于 marker 中的 SHA，然后才删除 marker。

## 失败处理

任何测试失败、推送失败、远端分支保护或不可解释的本地差异都会暂停删除。外部 Git bundle 只用于短期恢复审核前的 refs；完成远端精确 SHA 验证后明确删除该 bundle。
