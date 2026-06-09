"""
人的维度信号溯源单元测试
验证 PeopleSignalAnalyzer.analyze() 的输出携带正确的来源/数据模式标记，
确保前端能诚实地标注策展数据，避免合规风险。
"""

import pytest
from src.data.alternative.people.people_signal import PeopleSignalAnalyzer


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_analyzer() -> PeopleSignalAnalyzer:
    return PeopleSignalAnalyzer()


# ---------------------------------------------------------------------------
# Top-level provenance fields
# ---------------------------------------------------------------------------

class TestTopLevelProvenance:
    def test_analyze_returns_source_key(self):
        """analyze() 输出必须包含 source 字段."""
        result = _make_analyzer().analyze("NVDA")
        assert "source" in result, "缺少 source 字段"

    def test_analyze_returns_data_mode_key(self):
        """analyze() 输出必须包含 data_mode 字段."""
        result = _make_analyzer().analyze("NVDA")
        assert "data_mode" in result, "缺少 data_mode 字段"

    def test_curated_symbol_has_curated_data_mode(self):
        """有策展条目的标的（如 BABA）应携带 data_mode='curated'."""
        result = _make_analyzer().analyze("BABA", "阿里巴巴")
        assert result["data_mode"] == "curated", (
            f"BABA 应为 curated，得到 {result['data_mode']!r}"
        )

    def test_nvda_curated_data_mode(self):
        """NVDA 有完整策展条目，data_mode 应为 curated."""
        result = _make_analyzer().analyze("NVDA", "NVIDIA")
        assert result["data_mode"] == "curated"

    def test_unknown_symbol_data_mode_is_string(self):
        """无策展条目的标的返回的 data_mode 是字符串（不抛错）."""
        result = _make_analyzer().analyze("UNKN999")
        assert isinstance(result["data_mode"], str)


# ---------------------------------------------------------------------------
# hiring_signal.source propagation
# ---------------------------------------------------------------------------

class TestHiringSignalSourcePropagation:
    def test_hiring_signal_has_source_key(self):
        """hiring_signal 子字典必须包含 source 字段."""
        result = _make_analyzer().analyze("NVDA")
        assert "source" in result["hiring_signal"], "hiring_signal 缺少 source 字段"

    def test_curated_symbol_hiring_source_is_curated(self):
        """有策展招聘条目的标的（NVDA/BABA 等）hiring_signal.source 应为 curated_hiring_profiles."""
        for symbol in ("NVDA", "BABA", "TSM", "BIDU"):
            result = _make_analyzer().analyze(symbol)
            src = result["hiring_signal"]["source"]
            assert src == "curated_hiring_profiles", (
                f"{symbol} hiring_signal.source 应为 'curated_hiring_profiles'，得到 {src!r}"
            )

    def test_unknown_symbol_hiring_source_is_not_curated(self):
        """无策展招聘条目的标的 hiring_signal.source 不应为 curated_hiring_profiles."""
        result = _make_analyzer().analyze("UNKN999")
        src = result["hiring_signal"]["source"]
        assert src != "curated_hiring_profiles", (
            f"无策展条目的标的 hiring_signal.source 不应声称来自策展，得到 {src!r}"
        )

    def test_hiring_signal_source_is_not_wrong_fallback(self):
        """curated 标的的 hiring_signal.source 不应再错误地写成 'hiring_tracker'."""
        result = _make_analyzer().analyze("NVDA")
        src = result["hiring_signal"]["source"]
        assert src != "hiring_tracker", (
            f"NVDA 是策展条目，source 不应写成 'hiring_tracker'，得到 {src!r}"
        )


# ---------------------------------------------------------------------------
# Sub-provider source fields pass-through
# ---------------------------------------------------------------------------

class TestSubProviderSourcePassThrough:
    def test_executive_profile_retains_source(self):
        """executive_profile 子字典应携带 source 字段."""
        result = _make_analyzer().analyze("NVDA")
        assert "source" in result["executive_profile"], "executive_profile 缺少 source 字段"

    def test_insider_flow_retains_source(self):
        """insider_flow 子字典应携带 source 字段."""
        result = _make_analyzer().analyze("NVDA")
        assert "source" in result["insider_flow"], "insider_flow 缺少 source 字段"

    def test_executive_profile_source_value(self):
        """executive_profile.source 应为 curated_people_profiles."""
        result = _make_analyzer().analyze("BABA")
        assert result["executive_profile"]["source"] == "curated_people_profiles"

    def test_insider_flow_source_value(self):
        """insider_flow.source 应为 curated_insider_flows."""
        result = _make_analyzer().analyze("NVDA")
        assert result["insider_flow"]["source"] == "curated_insider_flows"
