// jest-dom adds custom jest matchers for asserting on DOM nodes.
// CRA 通过文件名约定自动加载该文件 — 不需要额外的 jest 配置。
import '@testing-library/jest-dom';

// 部分测试套件（research-workbench-copy-link、cross-market-backtest-panel、backtest-ui）
// 在 `--runInBand` 全量跑时会偶发性超过 jest 默认 5s/10s 超时，单跑都通过。
// 把全局 timeout 抬到 30 秒，让连续跑大量测试时仍然稳定，避免误报。
jest.setTimeout(30000);
