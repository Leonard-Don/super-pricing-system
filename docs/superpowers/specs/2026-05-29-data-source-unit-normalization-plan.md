# 实现计划 — 数据源 volume/amount 单位归一化

关联设计: `2026-05-29-data-source-unit-normalization-design.md`
方法: TDD(红 → 绿 → 重构),纯合成数据,不走网络。

## 前置事实(已核实)
- `BaseDataProvider._standardize_dataframe` 是所有 provider 历史数据唯一汇聚点(7 个调用点)。
- tushare quote 派生自自身 get_historical_data;akshare quote 走独立 spot 接口。
- `tests/unit/test_tushare_provider.py` 当前为占位桩(0 真实用例),将被替换。

## Phase 1 — 基类归一化原语(TDD)
**测试先行**(写入 `tests/unit/test_tushare_provider.py`,先红):
- [ ] T1 `_apply_unit_normalization` 按系数折算 volume/amount
- [ ] T2 比率列(pct_change/turnover_rate/volume_ratio/returns)不受影响
- [ ] T3 系数=1 时帧逐值不变(no-op 回归)
- [ ] T4 缺列(无 amount)不报错

**实现**(`src/data/providers/base_provider.py`):
- [ ] 加类属性 `VOLUME_TO_SHARES: float = 1.0`、`AMOUNT_TO_YUAN: float = 1.0`
- [ ] 加 `_apply_unit_normalization(df)`:列存在且系数≠1 才折算;`pd.to_numeric` 防御
- [ ] 加 `_normalize_quote_units(quote)`:对 dict 的 volume/amount 键折算
- [ ] 在 `_standardize_dataframe` 返回前调用 `_apply_unit_normalization`

## Phase 2 — tushare 归一(TDD)
**测试**:
- [ ] T5 直接喂 `_normalize_history_frame`,验证 volume×100、amount×1000
- [ ] T6 派生 quote(mock 历史)落在 股+元

**实现**(`src/data/providers/tushare_provider.py`):
- [ ] 加 `VOLUME_TO_SHARES = 100`、`AMOUNT_TO_YUAN = 1000`(报价零额外改动)

## Phase 3 — akshare 归一(TDD)
**测试**:
- [ ] T7 akshare quote 经 `_normalize_quote_units` 归一

**实现**(`src/data/providers/akshare_provider.py`):
- [ ] 加 `VOLUME_TO_SHARES = 100`、`AMOUNT_TO_YUAN = 1`(注释:东财口径,best-effort)
- [ ] `get_latest_quote` return 前调用 `self._normalize_quote_units(result)`

## Phase 4 — 跨源一致性回归 + 验证
- [ ] T8 同一 close 下 tushare 归一 volume 与 yahoo 同口径(堵 100 倍跳变)
- [ ] 跑全量相关单测:tushare/provider_factory/realtime/data_quality 无回归
- [ ] (可选)最小联网冒烟:tushare 000001.SZ 归一后 volume 与 yahoo 差 <1%

## 验收
- 新测试全绿 + 既有 29 测试无回归
- tushare/akshare 历史与报价为 股+元;yahoo 等源逐值不变
