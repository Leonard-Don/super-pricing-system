# 数据源成交量/成交额单位归一化 — 设计文档

- 日期: 2026-05-29
- 状态: 已确认设计,待实现
- 关联: Tushare Pro 接入后引入的跨源单位不一致问题

## 1. 问题

接入付费源 Tushare 后,A 股默认走 `A_STOCK → [tushare, akshare, yahoo]` 路由链,tushare 为主源。
但各数据源的 `volume` / `amount` 量纲不一致,而代码库中**当前没有任何归一化逻辑**(已用 Explore agent 全量确认),
原始值直接流入下游 15+ 处 volume 消费者(OBV / MFI / VWAP / VPVR / 回测撮合 / 因子表达式)
和 8+ 处 amount 消费者(含 `_money_flow.py` 的市值估算)。

后果:一旦主源 tushare 限流 / 积分不足 / 超时,fallback 到 yahoo,**同一只 A 股的 `volume` 字段会突然跳变 100 倍**,
`amount` 字段口径也对不上。任何依赖成交量/成交额的指标会算错。价格(close)一致,故核心定价不受影响,但这是埋藏的雷。

实测自洽验证(平安银行 000001.SZ):`tushare vol×100×close ≈ amount×1000` ✓,`yahoo volume / tushare volume = 100.0x` ✓。

## 2. 目标 / 非目标

**目标**
- 所有 provider 输出层(历史 DataFrame + quote dict)的 `volume` 统一为「股」、`amount` 统一为「元」。
- 跨源切换(直连 / fallback / 跨市场)对下游完全透明:同一只票同一天,无论哪个源服务,volume/amount 口径一致。
- 其余源(yahoo / us_stock / commodity / alphavantage / twelvedata)零行为变化。

**非目标**
- 不改前端展示。归一后 A 股 volume 以「股」为单位(比交易员习惯的「手」大 100 倍),这是选定「股+元」标准时的已知取舍,属展示层决定,本次不动 `realtimeShareTemplates.js`。
- 不改比率类字段(`pct_change` / `turnover_rate` / `volume_ratio` / `returns`),它们与量纲无关。
- 不为 akshare 启用做端到端联网验证(akshare 默认未启用);其系数按东财接口文档行为标注,代码注明「best-effort,启用时需复验」。

## 3. 标准单位(已确认)

| 标准 | volume | amount |
|---|---|---|
| 选定 | 股 (shares) | 元 (yuan) |

各源原生单位与折算系数:

| 源 | volume 原生 | amount 原生 | VOLUME_TO_SHARES | AMOUNT_TO_YUAN |
|---|---|---|---|---|
| tushare | 手 | 千元 | 100 | 1000 |
| akshare | 手 | 元 | 100 | 1 |
| yahoo / us_stock / commodity | 股 | (无) | 1 | 1 |
| alphavantage / twelvedata | 股 | (无) | 1 | 1 |

## 4. 方案(已确认:方案 A — 声明式单位 + 汇聚点归一)

### 4.1 关键结构事实

`BaseDataProvider._standardize_dataframe` 是**所有 provider 历史数据的唯一汇聚点**——
yahoo / us_stock(继承yahoo) / commodity(继承yahoo) / alphavantage / twelvedata / akshare / tushare 的
`get_historical_data` 返回路径全部经过它(已 grep 确认 7 个调用点)。

tushare 的 `get_latest_quote` **派生自自身 `get_historical_data`**,故只要在汇聚点归一,tushare 的历史与报价一并覆盖,无需额外改动报价路径。

akshare 的 `get_latest_quote` 走独立的实时 spot 接口(非派生),需单独处理。

### 4.2 改动点

1. **`BaseDataProvider`(基类)**
   - 新增类属性(默认无操作):
     ```python
     VOLUME_TO_SHARES: float = 1.0   # 原生成交量 → 股 的系数
     AMOUNT_TO_YUAN: float = 1.0     # 原生成交额 → 元 的系数
     ```
   - 新增 `_apply_unit_normalization(df)`: 若 `volume`/`amount` 列存在且系数 ≠ 1,则就地折算;比率列不动。系数为 1 时直接返回(零开销)。
   - 新增 `_normalize_quote_units(quote)`: 对 quote dict 的 `"volume"`/`"amount"` 键按系数折算(供非派生型报价路径调用)。
   - 在 `_standardize_dataframe` 末尾(返回前)调用 `_apply_unit_normalization`。

2. **`TushareProvider`**: `VOLUME_TO_SHARES = 100`、`AMOUNT_TO_YUAN = 1000`。
   - 历史:经汇聚点自动归一。
   - 报价:派生自历史,自动归一,**零额外改动**。

3. **`AKShareProvider`**: `VOLUME_TO_SHARES = 100`、`AMOUNT_TO_YUAN = 1`(附注释:东财口径,best-effort)。
   - 历史:经汇聚点自动归一。
   - 报价(`get_latest_quote`):在 return 前调用 `self._normalize_quote_units(result)`。

4. **其余源**: 继承默认 `1.0`,无操作,零行为变化。

5. **前端**: 不改。

### 4.3 数据流(归一后)

```
provider.get_historical_data()
  → 各源解析原始帧
  → _standardize_dataframe()
       → 统一列名 / 补列 / returns
       → _apply_unit_normalization()   ← 新增,按系数折算 volume/amount
  → 返回(volume=股, amount=元)

tushare.get_latest_quote() → 调自身 get_historical_data()(已归一)→ 派生 quote(已归一)
akshare.get_latest_quote() → 实时 spot → _normalize_quote_units()(新增调用)→ 返回(已归一)
```

## 5. 错误处理 / 边界

- 列缺失:`_apply_unit_normalization` 仅在列存在时折算,缺失则跳过(yahoo 无 amount → 不报错)。
- 空帧:`_standardize_dataframe` 已有 `if df.empty: return df` 早退,归一步骤不触及空帧。
- 系数为 1:直接返回,不复制、不遍历,保证非 A 股源零额外开销。
- 非数值:折算前用 `pd.to_numeric(..., errors="coerce")` 防御(tushare 帧已做数值化;基类侧再保险)。
- quote 中 volume/amount 为 None 或缺键:`_normalize_quote_units` 跳过,不抛错。

## 6. 测试策略(TDD,纯合成数据,不走网络)

1. `test_apply_unit_normalization_scales_volume_and_amount` — 给定系数,volume/amount 按系数折算。
2. `test_apply_unit_normalization_leaves_ratio_columns_untouched` — `pct_change`/`turnover_rate`/`volume_ratio`/`returns` 不变。
3. `test_apply_unit_normalization_noop_when_factors_are_one` — yahoo/默认源:帧不变(回归保护)。
4. `test_apply_unit_normalization_handles_missing_columns` — 缺 amount 列不报错。
5. `test_tushare_history_normalized_to_shares_and_yuan` — 直接喂 `_normalize_history_frame`,验证 volume×100、amount×1000。
6. `test_tushare_quote_derived_in_shares_and_yuan` — tushare 派生 quote 落在 股+元(mock 历史)。
7. `test_akshare_quote_units_normalized` — akshare quote 经 `_normalize_quote_units` 归一。
8. `test_cross_source_volume_consistency` — 同一 close 下,tushare 归一 volume 与 yahoo 同口径(堵 100 倍跳变的回归)。
9. `test_tushare_provider.py` 当前是占位桩(一行注释 + 填充空白,0 个真实用例);本次将其替换为上述真实归一化测试。

## 7. 验收标准

- 上述测试全绿;现有 provider/factory/realtime/data_quality 单测无回归。
- tushare 历史与报价的 volume 为「股」、amount 为「元」。
- yahoo/us_stock 等非 A 股源帧逐值不变。
- 一次最小联网冒烟(可选,消耗积分可忽略):tushare 取 000001.SZ,确认归一后 volume 与 yahoo 同量级(差值 < 1%)。
