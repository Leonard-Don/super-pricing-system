# Legacy Route Retirement Matrix

This repo now exposes product APIs through pricing research, alt-data/macro, cross-market, research workbench, quant-lab, and infrastructure routes. Older quant-workspace route groups remain mounted only for saved task replay and local compatibility. They are intentionally hidden from OpenAPI via `include_in_schema=False`.

The source-of-truth machine-readable matrix is `backend/app/api/v1/legacy_route_retirement.py`; `tests/unit/test_legacy_route_retirement.py` guards that every hidden route group is documented and that public product route groups are not accidentally added to the legacy matrix.

| Route group | Status | Replacement | Removal condition |
|---|---|---|---|
| `/market-data` | Hidden legacy support | `quant-trading-system` market-data APIs for new UI work | Saved tasks and notebooks stop requesting market-data endpoints from this repo. |
| `/strategies` | Hidden legacy support | `quant-trading-system` strategy/backtest workspace | Strategy execution and examples are fully migrated out of `super-pricing-system`. |
| `/backtest` | Hidden legacy support | Quant Lab and `quant-trading-system` backtest surfaces | Historical saved tasks no longer deep-link to legacy backtest routes. |
| `/realtime` | Hidden legacy support | Quant Lab alert center and `quant-trading-system` realtime feeds | Realtime alerts no longer depend on this repo's legacy websocket/polling handlers. |
| `/analysis` | Hidden legacy support | Pricing, cross-market, and macro product APIs | Pricing research screens stop importing legacy analysis task payloads. |
| `/optimization` | Hidden legacy support | Quant Lab experiment tasks for new optimizer work | Optimizer experiments are represented as Quant Lab tasks or deleted. |
| `/trade` | Hidden legacy support | Research Workbench tasks and Quant Lab alert actions | No saved action payload submits to `/trade`. |
| `/industry` | Hidden legacy support | Cross-market diagnostics and pricing research industry context | Active dashboards stop reading industry heatmap internals directly. |
| `/events` | Hidden legacy support | Cross-market public diagnostics and Research Workbench event payloads | Event-study internals are no longer needed by saved task replay. |

## Policy

- Do not add new frontend call sites to the route groups above.
- New product work should land on the public route groups (`/pricing`, `/alt-data`, `/macro`, `/cross-market`, `/research-workbench`, `/quant-lab`, `/infrastructure`).
- If a hidden router is removed, remove it from both the code matrix and this document in the same commit.
- If a hidden router is added, it must include owner, replacement, removal condition, and the `include_in_schema_false` OpenAPI policy.
