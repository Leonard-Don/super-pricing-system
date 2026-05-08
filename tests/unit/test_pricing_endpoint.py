import threading

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import pricing
from backend.app.api.v1.endpoints.pricing_support import run_screening
from src.analytics.pricing_gap_analyzer import PricingGapAnalyzer


def _build_client(monkeypatch):
    app = FastAPI()
    app.include_router(pricing.router, prefix="/pricing")
    return TestClient(app)


def test_pricing_screener_endpoint_returns_ranked_results(monkeypatch):
    class FakeAnalyzer:
        def screen(self, symbols, period, limit):
            return {
                "period": period,
                "total_input": len(symbols),
                "analyzed_count": 2,
                "result_count": 2,
                "results": [
                    {
                        "rank": 1,
                        "symbol": "AAPL",
                        "screening_score": 58.4,
                        "gap_pct": 42.0,
                        "people_governance_discount_pct": 9.2,
                        "people_governance_confidence": 0.74,
                        "people_governance_label": "治理折价",
                    },
                    {
                        "rank": 2,
                        "symbol": "MSFT",
                        "screening_score": 27.3,
                        "gap_pct": -18.0,
                        "people_governance_discount_pct": -3.4,
                        "people_governance_confidence": 0.62,
                        "people_governance_label": "执行支撑",
                    },
                ],
                "failures": [],
            }

    client = _build_client(monkeypatch)
    client.app.dependency_overrides[pricing._get_gap_analyzer] = lambda: FakeAnalyzer()

    response = client.post(
        "/pricing/screener",
        json={
            "symbols": ["AAPL", "MSFT"],
            "period": "1y",
            "limit": 5,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["period"] == "1y"
    assert payload["result_count"] == 2
    assert payload["results"][0]["symbol"] == "AAPL"
    assert payload["results"][1]["rank"] == 2
    assert payload["results"][0]["people_governance_discount_pct"] == 9.2
    assert payload["results"][1]["people_governance_label"] == "执行支撑"
    assert payload["generated_at"]


def test_pricing_screener_endpoint_passes_max_workers_to_analyzer(monkeypatch):
    received = []

    class WorkerAwareAnalyzer:
        def screen(self, symbols, period, limit, max_workers):
            received.append((list(symbols), period, limit, max_workers))
            return {
                "period": period,
                "total_input": len(symbols),
                "analyzed_count": len(symbols),
                "result_count": 0,
                "worker_count": max_workers,
                "results": [],
                "failures": [],
            }

    client = _build_client(monkeypatch)
    client.app.dependency_overrides[pricing._get_gap_analyzer] = lambda: WorkerAwareAnalyzer()

    response = client.post(
        "/pricing/screener",
        json={
            "symbols": ["AAPL", "MSFT"],
            "period": "6mo",
            "limit": 2,
            "max_workers": 7,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["worker_count"] == 7
    assert payload["generated_at"]
    assert received == [(["AAPL", "MSFT"], "6mo", 2, 7)]


def test_pricing_screener_endpoint_preserves_boundary_screening_shape(monkeypatch):
    class BoundaryAnalyzer:
        def screen(self, symbols, period, limit, max_workers):
            return {
                "period": period,
                "total_input": len(symbols),
                "analyzed_count": 0,
                "result_count": 0,
                "results": [],
                "failures": [
                    {
                        "symbol": symbols[0],
                        "reason": "insufficient_history",
                        "message": "not enough usable price history",
                    }
                ],
                "diagnostics": {
                    "requested_limit": limit,
                    "max_workers": max_workers,
                    "degraded": True,
                    "empty_results_reason": "all candidates failed",
                },
            }

    client = _build_client(monkeypatch)
    client.app.dependency_overrides[pricing._get_gap_analyzer] = lambda: BoundaryAnalyzer()

    response = client.post(
        "/pricing/screener",
        json={
            "symbols": ["AAPL"],
            "period": "5y",
            "limit": 1,
            "max_workers": 1,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload.pop("generated_at")
    assert payload == {
        "period": "5y",
        "total_input": 1,
        "analyzed_count": 0,
        "result_count": 0,
        "results": [],
        "failures": [
            {
                "symbol": "AAPL",
                "reason": "insufficient_history",
                "message": "not enough usable price history",
            }
        ],
        "diagnostics": {
            "requested_limit": 1,
            "max_workers": 1,
            "degraded": True,
            "empty_results_reason": "all candidates failed",
        },
    }


def test_pricing_screener_endpoint_propagates_analyzer_internal_typeerror_as_500(monkeypatch):
    """End-to-end guard: a TypeError raised inside a 4-arg-capable analyzer must surface
    as a 500 with the original message and the analyzer body must execute exactly once.

    Without signature-based dispatch in run_screening, a TypeError from the analyzer body
    would be misclassified as wrong-arity and trigger the legacy 3-arg fallback — which,
    when max_workers has a default, re-enters the body (double side effects) and replaces
    the error envelope's detail with whatever the second invocation surfaces.
    """
    call_count = 0

    class FourArgAnalyzerInternalTypeError:
        def screen(self, symbols, period, limit, max_workers=4):
            nonlocal call_count
            call_count += 1
            raise TypeError("pricing engine signature drift")

    client = _build_client(monkeypatch)
    client.app.dependency_overrides[pricing._get_gap_analyzer] = (
        lambda: FourArgAnalyzerInternalTypeError()
    )

    response = client.post(
        "/pricing/screener",
        json={"symbols": ["AAPL"], "period": "1y", "limit": 5, "max_workers": 3},
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "pricing engine signature drift"}
    assert call_count == 1


def test_pricing_gap_analysis_endpoint_returns_people_governance_overlay(monkeypatch):
    class FakeAnalyzer:
        def analyze(self, symbol, period):
            return {
                "symbol": symbol,
                "gap_analysis": {"gap_pct": 18.5, "direction": "溢价(高估)"},
                "people_governance_overlay": {
                    "label": "治理折价",
                    "governance_discount_pct": 8.6,
                    "confidence": 0.72,
                    "source_mode_summary": {"label": "fallback-heavy", "coverage": 7},
                    "executive_evidence": {"leadership_balance": "运营/财务主导"},
                    "insider_evidence": {"label": "内部人减持偏谨慎"},
                    "hiring_evidence": {"dilution_ratio": 1.67},
                    "policy_execution_context": {"label": "chaotic", "top_department": "发改委"},
                    "summary": "执行/治理折价主导当前定价。",
                },
                "implications": {"primary_view": "高估"},
            }

    client = _build_client(monkeypatch)
    client.app.dependency_overrides[pricing._get_gap_analyzer] = lambda: FakeAnalyzer()

    response = client.post("/pricing/gap-analysis", json={"symbol": "BABA", "period": "1y"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["symbol"] == "BABA"
    assert payload["people_governance_overlay"]["label"] == "治理折价"
    assert payload["people_governance_overlay"]["governance_discount_pct"] == 8.6
    assert payload["people_governance_overlay"]["policy_execution_context"]["top_department"] == "发改委"


def test_pricing_gap_analysis_endpoint_wraps_analyzer_errors(monkeypatch):
    class BrokenAnalyzer:
        def analyze(self, symbol, period):
            raise RuntimeError(f"pricing feed unavailable for {symbol}/{period}")

    client = _build_client(monkeypatch)
    client.app.dependency_overrides[pricing._get_gap_analyzer] = lambda: BrokenAnalyzer()

    response = client.post("/pricing/gap-analysis", json={"symbol": "BABA", "period": "1y"})

    assert response.status_code == 500
    assert response.json()["detail"] == "pricing feed unavailable for BABA/1y"


def test_pricing_symbol_suggestions_supports_symbol_and_name(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/pricing/symbol-suggestions?q=apple&limit=5")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] >= 1
    assert payload["data"][0]["symbol"] == "AAPL"


def test_pricing_symbol_suggestions_supports_chinese_alias(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/pricing/symbol-suggestions?q=苹果&limit=5")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] >= 1
    assert payload["data"][0]["symbol"] == "AAPL"
    assert payload["data"][0]["group"] == "Mega Cap Tech"


def test_pricing_valuation_sensitivity_endpoint(monkeypatch):
    class FakeModel:
        def build_sensitivity_analysis(self, symbol, overrides=None):
            return {
                "symbol": symbol,
                "base": {"fair_value": {"mid": 123.4}},
                "applied_overrides": overrides or {},
                "sensitivity_matrix": [],
            }

    client = _build_client(monkeypatch)
    client.app.dependency_overrides[pricing._get_valuation_model] = lambda: FakeModel()

    response = client.post(
        "/pricing/valuation-sensitivity",
        json={"symbol": "AAPL", "wacc": 0.09, "initial_growth": 0.12},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["symbol"] == "AAPL"
    assert payload["base"]["fair_value"]["mid"] == 123.4
    assert payload["applied_overrides"]["wacc"] == 0.09


def test_pricing_gap_history_endpoint(monkeypatch):
    class FakeAnalyzer:
        def build_gap_history(self, symbol, period, points):
            return {
                "symbol": symbol,
                "period": period,
                "history": [
                    {"date": "2026-01-01", "price": 100.0, "fair_value_mid": 110.0, "gap_pct": -9.1},
                    {"date": "2026-02-01", "price": 118.0, "fair_value_mid": 110.0, "gap_pct": 7.3},
                ],
                "summary": {"max_gap_pct": 7.3, "min_gap_pct": -9.1, "latest_gap_pct": 7.3},
                "points": points,
            }

    client = _build_client(monkeypatch)
    client.app.dependency_overrides[pricing._get_gap_analyzer] = lambda: FakeAnalyzer()

    response = client.get("/pricing/gap-history?symbol=AAPL&period=1y&points=24")

    assert response.status_code == 200
    payload = response.json()
    assert payload["symbol"] == "AAPL"
    assert payload["period"] == "1y"
    assert len(payload["history"]) == 2
    assert payload["summary"]["latest_gap_pct"] == 7.3


def test_pricing_peers_endpoint(monkeypatch):
    class FakeAnalyzer:
        def build_peer_comparison(self, symbol, candidate_symbols, limit):
            return {
                "symbol": symbol,
                "sector": "Technology",
                "target": {"symbol": symbol, "is_target": True, "fair_value": 110.0},
                "peers": [
                    {"symbol": "MSFT", "is_target": False, "fair_value": 420.0},
                    {"symbol": "NVDA", "is_target": False, "fair_value": 980.0},
                ][:limit],
                "summary": {"peer_count": min(limit, 2)},
                "candidate_count": len(candidate_symbols),
            }

    client = _build_client(monkeypatch)
    client.app.dependency_overrides[pricing._get_gap_analyzer] = lambda: FakeAnalyzer()

    response = client.get("/pricing/peers?symbol=AAPL&limit=1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["symbol"] == "AAPL"
    assert payload["target"]["symbol"] == "AAPL"
    assert payload["summary"]["peer_count"] == 1
    assert payload["peers"][0]["symbol"] == "MSFT"
    assert payload["candidate_count"] > 10


def test_run_screening_passes_max_workers_when_analyzer_supports_it():
    received = []

    class WorkerAwareAnalyzer:
        def screen(self, symbols, period, limit, max_workers):
            received.append((list(symbols), period, limit, max_workers))
            return {"period": period, "results": []}

    result = run_screening(WorkerAwareAnalyzer(), ["AAPL", "MSFT"], "1y", 5, 3)

    assert result == {"period": "1y", "results": []}
    assert received == [(["AAPL", "MSFT"], "1y", 5, 3)]


def test_run_screening_falls_back_when_analyzer_lacks_max_workers():
    received = []

    class LegacyAnalyzer:
        def screen(self, symbols, period, limit):
            received.append((list(symbols), period, limit))
            return {"period": period, "results": []}

    result = run_screening(LegacyAnalyzer(), ["AAPL"], "6mo", 4, 2)

    assert result == {"period": "6mo", "results": []}
    assert received == [(["AAPL"], "6mo", 4)]


def test_run_screening_supports_callable_screen_object_with_max_workers():
    received = []

    class CallableScreen:
        def __call__(self, symbols, period, limit, max_workers):
            received.append((list(symbols), period, limit, max_workers))
            return {"period": period, "worker_count": max_workers}

    class AnalyzerWithCallableScreen:
        def __init__(self):
            self.screen = CallableScreen()

    result = run_screening(AnalyzerWithCallableScreen(), ["AAPL"], "1y", 6, 4)

    assert result == {"period": "1y", "worker_count": 4}
    assert received == [(["AAPL"], "1y", 6, 4)]


def test_run_screening_passes_max_workers_to_varargs_screen():
    received = []

    class VarargsAnalyzer:
        def screen(self, symbols, period, limit, *extra_args):
            received.append((list(symbols), period, limit, extra_args))
            return {"period": period, "extra_args": extra_args}

    result = run_screening(VarargsAnalyzer(), ["MSFT"], "3mo", 7, 2)

    assert result == {"period": "3mo", "extra_args": (2,)}
    assert received == [(["MSFT"], "3mo", 7, (2,))]


def test_run_screening_propagates_internal_typeerror_without_double_invoking():
    """Internal TypeError from a 4-arg analyzer must propagate after a single call.

    Signature inspection narrows the legacy 3-arg fallback so a TypeError
    raised inside the analyzer body is not confused with a wrong-arity
    TypeError. The body must execute exactly once and the original
    exception must reach the caller unchanged.
    """
    call_count = 0

    class FourArgAnalyzerInternalTypeError:
        def screen(self, symbols, period, limit, max_workers=4):
            nonlocal call_count
            call_count += 1
            raise TypeError("internal data parse failure")

    captured = None
    try:
        run_screening(FourArgAnalyzerInternalTypeError(), ["AAPL"], "1y", 5, 3)
    except TypeError as exc:
        captured = str(exc)

    assert call_count == 1
    assert captured == "internal data parse failure"


def test_run_screening_propagates_internal_typeerror_from_legacy_analyzer():
    """A 3-arg legacy analyzer raising TypeError internally must not double-invoke."""
    call_count = 0

    class LegacyAnalyzerInternalTypeError:
        def screen(self, symbols, period, limit):
            nonlocal call_count
            call_count += 1
            raise TypeError("legacy internal failure")

    captured = None
    try:
        run_screening(LegacyAnalyzerInternalTypeError(), ["AAPL"], "1y", 5, 3)
    except TypeError as exc:
        captured = str(exc)

    assert call_count == 1
    assert captured == "legacy internal failure"


def test_pricing_gap_analyzer_reuses_recent_analysis_cache():
    call_counts = {
        "factor": 0,
        "valuation": 0,
        "people": 0,
    }

    class StubPricingEngine:
        def analyze(self, symbol, period):
            call_counts["factor"] += 1
            return {"symbol": symbol, "period": period}

    class StubValuationModel:
        def analyze(self, symbol):
            call_counts["valuation"] += 1
            return {"company_name": "Apple Inc.", "sector": "Technology"}

    class StubPeopleAnalyzer:
        def analyze(self, symbol, company_name, sector):
            call_counts["people"] += 1
            return {"summary": f"{symbol}:{company_name}:{sector}"}

    analyzer = PricingGapAnalyzer.__new__(PricingGapAnalyzer)
    analyzer.pricing_engine = StubPricingEngine()
    analyzer.valuation_model = StubValuationModel()
    analyzer.people_analyzer = StubPeopleAnalyzer()
    analyzer.alt_data_manager = None
    analyzer._analysis_cache = {}
    analyzer._analysis_cache_lock = threading.RLock()
    analyzer._analysis_cache_ttl_seconds = 120
    analyzer._analyze_gap = lambda factor, valuation: {"fair_value_mid": 123.4, "gap_pct": 8.6}
    analyzer._analyze_deviation_drivers = lambda factor, valuation: {"primary_driver": {"factor": "alpha"}}
    analyzer._load_alt_context = lambda symbol: {}
    analyzer._build_people_governance_overlay = lambda **kwargs: {"label": "执行支撑"}
    analyzer._derive_implications = lambda *args, **kwargs: {"structural_decay": {}, "macro_mispricing_thesis": {}}
    analyzer._generate_summary = lambda gap, valuation, people: "cached-summary"

    first = analyzer.analyze("aapl", "1y", parallel=False)
    second = analyzer.analyze("AAPL", "1y", parallel=False)
    first["valuation"]["company_name"] = "Mutated"
    third = analyzer.analyze("AAPL", "1y", parallel=False)

    assert call_counts["factor"] == 1
    assert call_counts["valuation"] == 1
    assert call_counts["people"] == 1
    assert second["symbol"] == "AAPL"
    assert third["valuation"]["company_name"] == "Apple Inc."
