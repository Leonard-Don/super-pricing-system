import threading

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import pricing
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
                    "executive_evidence": {"leadership_balance": "商业/财务主导"},
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
