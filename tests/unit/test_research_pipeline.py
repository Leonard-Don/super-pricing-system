"""Unit tests for the Qlib-style research experiment pipeline contracts.

The pipeline module (``src/research/pipeline.py``) extends the existing
experiment registry with four reviewable contract objects:

* ``DataHandler``  — deterministic tabular input for pricing / provider rows
* ``FeatureSet``   — validated feature columns + target derived from a handler
* ``ModelRun``     — model_type / parameters / metrics + handler/feature provenance
* ``BacktestReport`` — strategy or quote decision metrics with source health

These tests pin the public contract so future refactors cannot silently
drift the field set or relax validation. The style mirrors
``test_experiment_registry.py`` (fixture-free pytest, plain assertions).
"""

from __future__ import annotations

import math

import pytest

from src.research.pipeline import (
    BacktestReport,
    DataHandler,
    FeatureSet,
    ModelRun,
    PipelineError,
)

# ---------------------------------------------------------------------------
# DataHandler — deterministic tabular input
# ---------------------------------------------------------------------------


def _pricing_rows():
    return [
        {"date": "2026-01-02", "symbol": "600519", "close": 1700.5, "volume": 12000},
        {"date": "2026-01-03", "symbol": "600519", "close": 1712.0, "volume": 11400},
        {"date": "2026-01-06", "symbol": "600519", "close": 1695.2, "volume": 12880},
    ]


def test_data_handler_from_records_infers_columns_in_declared_order():
    handler = DataHandler.from_records(
        name="moutai-daily",
        records=_pricing_rows(),
        provider="akshare",
    )

    assert handler.name == "moutai-daily"
    assert handler.provider == "akshare"
    assert handler.row_count == 3
    assert handler.column_count == 4
    assert set(handler.columns) == {"date", "symbol", "close", "volume"}


def test_data_handler_explicit_columns_must_match_record_keys():
    rows = _pricing_rows()

    handler = DataHandler.from_records(
        name="explicit",
        records=rows,
        columns=["date", "symbol", "close", "volume"],
    )
    # Explicit columns drive the order, not the dict insertion order.
    assert handler.columns == ("date", "symbol", "close", "volume")

    with pytest.raises(PipelineError, match="unknown column"):
        DataHandler.from_records(
            name="explicit",
            records=rows,
            columns=["date", "symbol", "close", "volume", "missing_col"],
        )


def test_data_handler_rejects_duplicate_columns():
    with pytest.raises(PipelineError, match="duplicate"):
        DataHandler.from_records(
            name="dup",
            records=[{"a": 1, "b": 2}],
            columns=["a", "a", "b"],
        )


def test_data_handler_rejects_empty_columns_and_empty_name():
    with pytest.raises(PipelineError, match="at least one column"):
        DataHandler.from_records(name="x", records=[{}], columns=[])

    with pytest.raises(PipelineError, match="name"):
        DataHandler.from_records(name="   ", records=_pricing_rows())


def test_data_handler_rejects_non_string_column_names():
    # Non-string key in a record (inferred-columns path).
    with pytest.raises(PipelineError, match="column names must be strings"):
        DataHandler.from_records(
            name="bad-infer",
            records=[{"a": 1, 2: 3}],  # type: ignore[dict-item]
        )
    # Non-string in explicit columns list.
    with pytest.raises(PipelineError, match="column names must be strings"):
        DataHandler.from_records(
            name="bad-explicit",
            records=[{"a": 1, "b": 2}],
            columns=["a", 2],  # type: ignore[list-item]
        )


def test_data_handler_missingness_counts_none_and_missing_keys():
    handler = DataHandler.from_records(
        name="missing",
        records=[
            {"a": 1, "b": 2},
            {"a": None, "b": 3},
            {"a": 4},  # b key missing entirely
        ],
        columns=["a", "b"],
    )
    # a has 1 None out of 3 ⇒ 1/3; b has 1 missing out of 3 ⇒ 1/3.
    assert handler.missingness["a"] == pytest.approx(1 / 3)
    assert handler.missingness["b"] == pytest.approx(1 / 3)


def test_data_handler_missingness_is_zero_for_empty_table():
    handler = DataHandler.from_records(
        name="empty",
        records=[],
        columns=["a", "b"],
    )
    assert handler.row_count == 0
    assert handler.missingness == {"a": 0.0, "b": 0.0}


def test_data_handler_fingerprint_is_stable_for_identical_inputs():
    a = DataHandler.from_records(
        name="stable",
        records=_pricing_rows(),
        provider="akshare",
    )
    b = DataHandler.from_records(
        name="stable",
        records=_pricing_rows(),
        provider="akshare",
    )
    assert a.fingerprint == b.fingerprint
    assert a.fingerprint.startswith("sha256:")


def test_data_handler_fingerprint_changes_with_data_or_provider():
    base = DataHandler.from_records(name="x", records=_pricing_rows(), provider="akshare")
    different_rows = DataHandler.from_records(
        name="x",
        records=[{**row, "close": row["close"] + 1.0} for row in _pricing_rows()],
        provider="akshare",
    )
    different_provider = DataHandler.from_records(name="x", records=_pricing_rows(), provider="sina")
    assert base.fingerprint != different_rows.fingerprint
    assert base.fingerprint != different_provider.fingerprint


def test_data_handler_summary_returns_contract_keys():
    handler = DataHandler.from_records(
        name="contract",
        records=_pricing_rows(),
        provider="akshare",
    )
    summary = handler.summary()
    assert set(summary.keys()) == {
        "name",
        "provider",
        "columns",
        "row_count",
        "column_count",
        "missingness",
        "fingerprint",
    }
    assert summary["name"] == "contract"
    assert summary["provider"] == "akshare"
    assert summary["row_count"] == 3
    assert summary["fingerprint"] == handler.fingerprint


# ---------------------------------------------------------------------------
# FeatureSet — validated features + target with provenance
# ---------------------------------------------------------------------------


def _feature_handler():
    return DataHandler.from_records(
        name="feature-source",
        records=[
            {"close": 1.0, "vol": 100, "ma5": 1.1, "ret": 0.01},
            {"close": 1.2, "vol": 110, "ma5": 1.15, "ret": 0.02},
            {"close": 1.1, "vol": None, "ma5": 1.12, "ret": -0.01},
        ],
        provider="akshare",
    )


def test_feature_set_from_handler_records_features_and_target():
    handler = _feature_handler()

    fs = FeatureSet.from_handler(
        handler,
        name="momentum-features",
        features=["close", "vol", "ma5"],
        target="ret",
    )
    assert fs.feature_columns == ("close", "vol", "ma5")
    assert fs.target == "ret"
    assert fs.sample_count == 3
    assert fs.data_handler_fingerprint == handler.fingerprint


def test_feature_set_rejects_target_in_features():
    handler = _feature_handler()
    with pytest.raises(PipelineError, match=r"target.*overlaps"):
        FeatureSet.from_handler(
            handler,
            name="bad",
            features=["close", "ret"],
            target="ret",
        )


def test_feature_set_rejects_duplicate_features():
    handler = _feature_handler()
    with pytest.raises(PipelineError, match="duplicate"):
        FeatureSet.from_handler(
            handler,
            name="dup",
            features=["close", "close"],
            target="ret",
        )


def test_feature_set_rejects_features_not_in_handler_columns():
    handler = _feature_handler()
    with pytest.raises(PipelineError, match="unknown column"):
        FeatureSet.from_handler(
            handler,
            name="bad",
            features=["close", "not_a_column"],
            target="ret",
        )
    with pytest.raises(PipelineError, match="unknown column"):
        FeatureSet.from_handler(
            handler,
            name="bad",
            features=["close"],
            target="not_a_target",
        )


def test_feature_set_rejects_empty_features_and_blank_target():
    handler = _feature_handler()
    with pytest.raises(PipelineError, match="at least one feature"):
        FeatureSet.from_handler(handler, name="empty", features=[], target="ret")
    with pytest.raises(PipelineError, match="target"):
        FeatureSet.from_handler(handler, name="blank", features=["close"], target="  ")


def test_feature_set_missingness_includes_target_and_total():
    handler = _feature_handler()
    fs = FeatureSet.from_handler(
        handler,
        name="missing-summary",
        features=["close", "vol"],
        target="ret",
    )
    # 1 None in `vol` across 3 rows ⇒ 1/3; close/ret/_target are all 0.
    assert fs.missingness["close"] == pytest.approx(0.0)
    assert fs.missingness["vol"] == pytest.approx(1 / 3)
    assert fs.missingness["_target"] == pytest.approx(0.0)
    # _total is a feature-only aggregate: total missing cells / (rows * #features).
    assert fs.missingness["_total"] == pytest.approx(1 / 6)


def test_feature_set_fingerprint_is_stable_and_distinct():
    handler = _feature_handler()
    a = FeatureSet.from_handler(handler, name="x", features=["close", "vol"], target="ret")
    b = FeatureSet.from_handler(handler, name="x", features=["close", "vol"], target="ret")
    assert a.fingerprint == b.fingerprint
    c = FeatureSet.from_handler(handler, name="x", features=["close"], target="ret")
    assert a.fingerprint != c.fingerprint


def test_feature_set_summary_returns_contract_keys():
    handler = _feature_handler()
    fs = FeatureSet.from_handler(handler, name="summary", features=["close", "vol"], target="ret")
    summary = fs.summary()
    assert set(summary.keys()) == {
        "name",
        "feature_columns",
        "target",
        "sample_count",
        "missingness",
        "fingerprint",
        "data_handler_fingerprint",
        "data_handler_name",
    }
    assert summary["data_handler_name"] == handler.name


# ---------------------------------------------------------------------------
# ModelRun — model_type / parameters / metrics + provenance
# ---------------------------------------------------------------------------


def _model_inputs():
    handler = _feature_handler()
    fs = FeatureSet.from_handler(handler, name="mom", features=["close", "vol", "ma5"], target="ret")
    return handler, fs


def test_model_run_create_captures_type_parameters_metrics_and_provenance():
    handler, fs = _model_inputs()
    run = ModelRun.create(
        name="ridge-mom",
        model_type="ridge",
        parameters={"alpha": 0.5, "fit_intercept": True},
        metrics={"r2": 0.42, "rmse": 1.31},
        data_handler=handler,
        feature_set=fs,
        artifacts=["s3://bucket/ridge.pkl"],
    )

    assert run.name == "ridge-mom"
    assert run.model_type == "ridge"
    assert run.parameters == {"alpha": 0.5, "fit_intercept": True}
    assert run.metrics == {"r2": 0.42, "rmse": 1.31}
    assert run.artifacts == ("s3://bucket/ridge.pkl",)
    assert run.provider == handler.provider

    provenance = run.provenance()
    assert provenance["data_handler_fingerprint"] == handler.fingerprint
    assert provenance["feature_set_fingerprint"] == fs.fingerprint
    assert provenance["data_handler_name"] == handler.name
    assert provenance["feature_set_name"] == fs.name


def test_model_run_create_rejects_non_finite_metrics():
    handler, fs = _model_inputs()
    for bad in (float("nan"), float("inf"), float("-inf")):
        with pytest.raises(PipelineError, match="finite"):
            ModelRun.create(
                name="bad",
                model_type="ridge",
                parameters={},
                metrics={"r2": bad},
                data_handler=handler,
                feature_set=fs,
            )


def test_model_run_create_rejects_non_numeric_metrics():
    handler, fs = _model_inputs()
    with pytest.raises(PipelineError, match="numeric"):
        ModelRun.create(
            name="bad",
            model_type="ridge",
            parameters={},
            metrics={"r2": "high"},  # type: ignore[dict-item]
            data_handler=handler,
            feature_set=fs,
        )


def test_model_run_rejects_blank_model_type_and_name():
    handler, fs = _model_inputs()
    with pytest.raises(PipelineError, match="model_type"):
        ModelRun.create(
            name="x",
            model_type="   ",
            parameters={},
            metrics={"r2": 0.1},
            data_handler=handler,
            feature_set=fs,
        )
    with pytest.raises(PipelineError, match="name"):
        ModelRun.create(
            name="",
            model_type="ridge",
            parameters={},
            metrics={"r2": 0.1},
            data_handler=handler,
            feature_set=fs,
        )


def test_model_run_rejects_feature_set_from_different_handler():
    handler_a, _ = _model_inputs()
    handler_b = DataHandler.from_records(
        name="other",
        records=[{"close": 9.0, "vol": 1, "ma5": 9.0, "ret": 0.0}],
    )
    fs_b = FeatureSet.from_handler(handler_b, name="other", features=["close", "vol", "ma5"], target="ret")
    with pytest.raises(PipelineError, match=r"feature_set.*data_handler"):
        ModelRun.create(
            name="mismatch",
            model_type="ridge",
            parameters={},
            metrics={"r2": 0.1},
            data_handler=handler_a,
            feature_set=fs_b,
        )


def test_model_run_summary_has_contract_keys_and_is_serializable():
    handler, fs = _model_inputs()
    run = ModelRun.create(
        name="ridge",
        model_type="ridge",
        parameters={"alpha": 0.5},
        metrics={"r2": 0.5},
        data_handler=handler,
        feature_set=fs,
        artifacts=("a.pkl",),
    )
    summary = run.summary()
    assert set(summary.keys()) == {
        "name",
        "model_type",
        "parameters",
        "metrics",
        "artifacts",
        "provider",
        "provenance",
    }
    assert summary["provenance"]["data_handler_fingerprint"] == handler.fingerprint
    # Lists / dicts in summary must be plain Python types (JSON-serializable).
    import json

    json.dumps(summary)


# ---------------------------------------------------------------------------
# BacktestReport — strategy/quote decision metrics with source health
# ---------------------------------------------------------------------------


_HEALTHY_SOURCE_HEALTH = {
    "checked_at": "2026-05-14T08:00:00Z",
    "selected_source": "akshare",
    "fallback_used": False,
    "sources": [
        {"id": "akshare", "ok": True, "required": True, "fallback": False},
        {"id": "yahoo", "ok": True, "required": False, "fallback": False},
    ],
}


_DEGRADED_SOURCE_HEALTH = {
    "checked_at": "2026-05-14T08:00:00Z",
    "selected_source": "yahoo",
    "fallback_used": True,
    "sources": [
        {"id": "akshare", "ok": False, "required": True, "fallback": False},
        {"id": "yahoo", "ok": True, "required": False, "fallback": True},
    ],
}


def test_backtest_report_create_captures_strategy_and_metrics():
    report = BacktestReport.create(
        name="mom-2026",
        strategy="momentum_v1",
        metrics={"sharpe_ratio": 1.31, "max_drawdown": -0.18, "num_trades": 42},
        source_health=_HEALTHY_SOURCE_HEALTH,
        artifacts=["report.json"],
    )
    assert report.name == "mom-2026"
    assert report.strategy == "momentum_v1"
    assert report.metrics == {"sharpe_ratio": 1.31, "max_drawdown": -0.18, "num_trades": 42}
    assert report.artifacts == ("report.json",)
    assert report.source_health == _HEALTHY_SOURCE_HEALTH


def test_backtest_report_rejects_non_finite_metrics():
    for bad in (float("nan"), float("inf"), float("-inf")):
        with pytest.raises(PipelineError, match="finite"):
            BacktestReport.create(
                name="bad",
                strategy="x",
                metrics={"sharpe_ratio": bad},
            )


def test_backtest_report_rejects_blank_strategy_and_name():
    with pytest.raises(PipelineError, match="strategy"):
        BacktestReport.create(name="x", strategy="   ", metrics={"sharpe_ratio": 1.0})
    with pytest.raises(PipelineError, match="name"):
        BacktestReport.create(name="", strategy="x", metrics={"sharpe_ratio": 1.0})


def test_backtest_report_required_source_failed_flag_reads_health():
    healthy = BacktestReport.create(
        name="ok",
        strategy="x",
        metrics={"sharpe_ratio": 1.0},
        source_health=_HEALTHY_SOURCE_HEALTH,
    )
    degraded = BacktestReport.create(
        name="degraded",
        strategy="x",
        metrics={"sharpe_ratio": 1.0},
        source_health=_DEGRADED_SOURCE_HEALTH,
    )
    no_health = BacktestReport.create(
        name="no-health",
        strategy="x",
        metrics={"sharpe_ratio": 1.0},
    )
    assert healthy.required_source_failed is False
    assert healthy.fallback_used is False
    assert degraded.required_source_failed is True
    assert degraded.fallback_used is True
    # Without a source_health payload, neither flag can be derived ⇒ False.
    assert no_health.required_source_failed is False
    assert no_health.fallback_used is False


def test_backtest_report_summary_has_contract_keys_and_is_serializable():
    report = BacktestReport.create(
        name="mom",
        strategy="momentum_v1",
        metrics={"sharpe_ratio": 1.0},
        source_health=_HEALTHY_SOURCE_HEALTH,
        artifacts=("r.json",),
    )
    summary = report.summary()
    assert set(summary.keys()) == {
        "name",
        "strategy",
        "metrics",
        "artifacts",
        "source_health",
        "required_source_failed",
        "fallback_used",
    }
    import json

    json.dumps(summary)


def test_backtest_report_handles_provider_record_metadata_in_source_health():
    """Source health may carry Phase-3 ProviderRecord fields (quality/freshness)."""
    sh = {
        **_HEALTHY_SOURCE_HEALTH,
        "provider_record": {
            "quality_score": 0.82,
            "evidence_url": "https://stats.gov.cn/x",
            "freshness": {"age_hours": 2.0, "label": "fresh", "weight": 1.0},
        },
    }
    report = BacktestReport.create(
        name="evidence",
        strategy="value_v1",
        metrics={"sharpe_ratio": 0.9},
        source_health=sh,
    )
    # The report stores the raw payload verbatim — the registry redacts on persistence.
    assert report.source_health["provider_record"]["quality_score"] == 0.82
    assert math.isclose(report.source_health["provider_record"]["freshness"]["weight"], 1.0)
