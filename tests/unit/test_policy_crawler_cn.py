"""
Phase D regression tests for the CN-side policy_radar selectors.

These tests pin the new DOM contract captured during the 2026-05-16 audit:

* NDRC ``/xxgk/zcfb/fzggwl/`` (and ``/xxgk/zcfb/tz/``) now serialise rows as
  ``ul.u-list > li`` with the policy link as the first ``<a>`` and the date
  carried in a trailing ``<span>YYYY/MM/DD</span>`` sibling. The audit replaced
  the stale ``.list_con li`` selector with this structure; if the NDRC site
  ever moves back, this fixture-driven assertion fires immediately.
* NEA ``/policy/zxwj.htm`` is Vue-rendered; the real listing lives at
  ``/policy/ds_<datasource_id>.json``. The crawler now hits that JSON endpoint
  directly via ``PolicySource.json_url`` and parses the ``datasource`` array.
* BoE was dropped from the default ``POLICY_SOURCES`` because the live origin
  closes the TLS handshake for non-browser clients; the deprecated config is
  retained under ``DEPRECATED_POLICY_SOURCES`` for opt-in callers.

No live network access — both fixtures are trimmed snapshots taken from the
real responses on the audit date.
"""

import json
from typing import Optional

import pytest

from src.data.alternative.policy_radar.policy_crawler import (
    DEPRECATED_POLICY_SOURCES,
    POLICY_SOURCES,
    PolicyCrawler,
    PolicySource,
)


# ── Fixtures: trimmed real-page snapshots (2026-05-16) ─────────────────────


NDRC_FZGGWL_HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div class="list">
  <ul class="u-list">
    <li><a href="./202604/t20260409_1404577.html" target="_blank"
        title="《电力重大事故隐患判定标准及治理监督管理规定》 2026年第41号令">
        《电力重大事故隐患判定标准及治理监督管理规定》 2026年第41号令</a>
        <div class="popbox">
          <div class="close" title="关闭"></div>
          <h3 title="相关解读">相关解读</h3>
          <ul>
            <li><a href="../../jd/jd/202604/t20260424_1404868.html" target="_blank"
                title="《电力重大事故隐患判定标准及治理监督管理规定》解读">
                《电力重大事故隐患判定标准及治理监督管理规定》解读</a></li>
          </ul>
        </div>
        <span>2026/04/09</span></li>
    <li><a href="./202602/t20260211_1403694.html" target="_blank"
        title="《粮食流通行政执法办法》 2026年第40号令">
        《粮食流通行政执法办法》 2026年第40号令</a>
        <span>2026/02/11</span></li>
    <li><a href="./202601/t20260123_1403413.html" target="_blank"
        title="《国家发展改革委企业技术中心认定管理办法》 2025年第39号令">
        《国家发展改革委企业技术中心认定管理办法》 2025年第39号令</a>
        <span>2026/01/23</span></li>
    <li class="empty"></li>
  </ul>
</div>
</body></html>"""


NDRC_TZ_HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<ul class="u-list">
  <li><a href="./202605/t20260511_1405152.html" target="_blank"
      title="关于核定南水北调中线干线工程供水价格的通知(发改价格〔2026〕630号)">
      关于核定南水北调中线干线工程供水价格的通知(发改价格〔2026〕630号)</a>
      <span>2026/05/11</span></li>
  <li><a href="./202604/t20260427_1404891.html" target="_blank"
      title="关于印发《西藏生态安全屏障保护与建设规划(修编)》的通知(发改农经〔2026〕508号)">
      关于印发《西藏生态安全屏障保护与建设规划(修编)》的通知(发改农经〔2026〕508号)</a>
      <span>2026/04/27</span></li>
</ul>
</body></html>"""


# Real subset of the NEA JSON datasource (titles may arrive wrapped in <a> when
# contentType=="Link", so we cover both variants).
NEA_DATASOURCE_JSON = json.dumps(
    {
        "categoryDisplayName": "最新文件",
        "datasource": [
            {
                "title": "中国绿色电力证书发展报告（2025）",
                "publishUrl": "../20260515/76a82a7375a942e2ab748b36cf7cc14b/c.html",
                "publishTime": "2026-05-15 17:10:41",
                "contentType": "MultiMedia",
            },
            {
                "title": (
                    "<a href='http://www.nea.gov.cn/20260514/ded62aeb85294f51ab9597405dcd3449/c.html'"
                    " target='_blank'>"
                    "国家能源局关于印发《新型储能电站建设工程质量监督大纲》的通知</a>"
                ),
                "publishUrl": (
                    "http://www.nea.gov.cn/20260514/ded62aeb85294f51ab9597405dcd3449/c.html"
                ),
                "publishTime": "2026-04-20 00:00:00",
                "contentType": "Link",
            },
            {
                "title": (
                    "<a href='http://www.nea.gov.cn/20260513/a38f9ff036f145a7bcfb6724e9f8d89e/c.html'"
                    " target='_blank'>国家能源局公告 2026年 第1号</a>"
                ),
                "publishUrl": (
                    "http://www.nea.gov.cn/20260513/a38f9ff036f145a7bcfb6724e9f8d89e/c.html"
                ),
                "publishTime": "2026-05-13 08:45:44",
                "contentType": "Link",
            },
        ],
    },
    ensure_ascii=False,
)


# ── Helpers ────────────────────────────────────────────────────────────────


class _FakeResponse:
    """Mimics the subset of requests.Response that PolicyCrawler reaches for."""

    def __init__(self, text: str, encoding: str = "utf-8"):
        self.text = text
        self.encoding = encoding


def _install_fake_request(
    monkeypatch: pytest.MonkeyPatch,
    crawler: PolicyCrawler,
    route: dict[str, Optional[_FakeResponse]],
) -> None:
    """Install a fake _safe_request that resolves URLs via the ``route`` dict.

    Any URL not in the route returns None (mirrors the production failure path)
    so a test failure surfaces as a missing key rather than a real network call.
    """

    def fake_safe_request(url: str, **kwargs):
        return route.get(url)

    monkeypatch.setattr(crawler, "_safe_request", fake_safe_request)


# ── NDRC selector tests ────────────────────────────────────────────────────


def test_ndrc_html_parser_extracts_real_dom(monkeypatch):
    """The new ``ul.u-list > li`` selector against current NDRC HTML."""
    crawler = PolicyCrawler()
    source = POLICY_SOURCES["ndrc"]
    _install_fake_request(
        monkeypatch,
        crawler,
        {source.list_url: _FakeResponse(NDRC_FZGGWL_HTML)},
    )

    policies = crawler.crawl_source("ndrc", limit=10, days_back=365)

    # The fixture has three real entries plus one ``<li class="empty">``;
    # the parser must skip the empty spacer.
    assert len(policies) == 3
    first = policies[0]
    assert first["title"].startswith("《电力重大事故隐患判定标准")
    # Trailing span carries the date — format ``YYYY/MM/DD``.
    assert first["date"] == "2026/04/09"
    # Relative href must be resolved against list_url.
    assert first["link"] == (
        "https://www.ndrc.gov.cn/xxgk/zcfb/fzggwl/202604/t20260409_1404577.html"
    )
    assert first["source_id"] == "ndrc"
    assert first["ingest_mode"] == "html"

    # Nested popbox <a> ("相关解读") must NOT pollute the result; the parser
    # picks the first descendant anchor (the policy itself) only once per row.
    titles = [p["title"] for p in policies]
    assert all("解读" not in t or "管理规定" in t for t in titles)


def test_ndrc_tz_uses_same_dom_pattern(monkeypatch):
    """The ``tz/`` (通知) sub-listing shares the same ``ul.u-list`` shape."""
    crawler = PolicyCrawler()
    source = POLICY_SOURCES["ndrc_tz"]
    _install_fake_request(
        monkeypatch,
        crawler,
        {source.list_url: _FakeResponse(NDRC_TZ_HTML)},
    )

    policies = crawler.crawl_source("ndrc_tz", limit=10, days_back=365)
    assert len(policies) == 2
    assert policies[0]["title"].startswith("关于核定南水北调中线干线工程供水价格")
    assert policies[0]["date"] == "2026/05/11"
    assert policies[0]["link"].endswith("t20260511_1405152.html")
    assert policies[0]["source_id"] == "ndrc_tz"


def test_ndrc_legacy_selector_returns_empty(monkeypatch):
    """Sanity: the *pre-Phase-D* ``.list_con li`` selector against current HTML
    yields zero rows. If a future regression reintroduces the stale selector,
    this assertion fires immediately."""
    legacy = PolicySource(
        name="国家发改委(legacy)",
        base_url="https://www.ndrc.gov.cn",
        list_url="https://www.ndrc.gov.cn/xxgk/zcfb/",
        selectors={
            "list_container": ".list_con li",
            "title": "a",
            "date": "span",
            "link": "a",
        },
    )
    crawler = PolicyCrawler(sources={"legacy_ndrc": legacy})
    _install_fake_request(
        monkeypatch,
        crawler,
        {legacy.list_url: _FakeResponse(NDRC_FZGGWL_HTML)},
    )

    policies = crawler.crawl_source("legacy_ndrc", limit=10, days_back=365)
    assert policies == []  # ``.list_con li`` does not exist in current DOM


# ── NEA JSON adapter tests ─────────────────────────────────────────────────


def test_nea_json_adapter_parses_datasource(monkeypatch):
    """The new NEA path reads ``/policy/ds_<id>.json`` and unwraps <a> titles."""
    crawler = PolicyCrawler()
    source = POLICY_SOURCES["nea"]
    assert source.json_url is not None  # config invariant
    _install_fake_request(
        monkeypatch,
        crawler,
        {source.json_url: _FakeResponse(NEA_DATASOURCE_JSON)},
    )

    policies = crawler.crawl_source("nea", limit=10, days_back=365)
    assert len(policies) == 3

    # Plain title (contentType=MultiMedia) → unwrapped.
    assert policies[0]["title"] == "中国绿色电力证书发展报告（2025）"
    # Anchor-wrapped title (contentType=Link) must be stripped of HTML.
    assert policies[1]["title"].startswith("国家能源局关于印发《新型储能电站建设工程质量监督大纲》")
    assert "<" not in policies[1]["title"] and ">" not in policies[1]["title"]
    # publishTime preserved verbatim — the parser further normalises via
    # ``_parse_date`` later in the pipeline.
    assert policies[0]["date"] == "2026-05-15 17:10:41"
    # Relative publishUrl resolved; absolute one kept as-is.
    assert policies[0]["link"].endswith("/76a82a7375a942e2ab748b36cf7cc14b/c.html")
    assert policies[0]["link"].startswith("http")
    assert policies[1]["link"].startswith(
        "http://www.nea.gov.cn/20260514/ded62aeb85294f51ab9597405dcd3449"
    )

    # ingest_mode telegraphed for downstream source_health bookkeeping.
    assert {p["ingest_mode"] for p in policies} == {"json"}
    assert {p["source_id"] for p in policies} == {"nea"}


def test_nea_json_adapter_handles_malformed_payload(monkeypatch):
    """Non-JSON / non-dict payloads must yield ``[]`` instead of raising."""
    crawler = PolicyCrawler()
    source = POLICY_SOURCES["nea"]
    assert source.json_url is not None
    _install_fake_request(
        monkeypatch,
        crawler,
        {source.json_url: _FakeResponse("<html>not json</html>")},
    )
    policies = crawler.crawl_source("nea", limit=10, days_back=365)
    assert policies == []


def test_nea_date_parser_handles_publish_time():
    """``_parse_date`` must understand NEA's ``YYYY-MM-DD HH:MM:SS`` format."""
    crawler = PolicyCrawler()
    parsed = crawler._parse_date("2026-05-15 17:10:41")
    assert (parsed.year, parsed.month, parsed.day) == (2026, 5, 15)
    assert (parsed.hour, parsed.minute) == (17, 10)


# ── Configuration shape regression ─────────────────────────────────────────


def test_boe_removed_from_default_sources():
    """Phase D pulled BoE out of the default config (Akamai-style TLS WAF
    blocks non-browser clients). It must still be reachable via the deprecated
    map for opt-in callers."""
    assert "boe" not in POLICY_SOURCES
    assert "boe" in DEPRECATED_POLICY_SOURCES
    # The deprecated config is still wired to the same feed adapter so callers
    # can roll back the deprecation with a single import.
    assert DEPRECATED_POLICY_SOURCES["boe"].feed_adapter == "boe_news"


def test_cn_sources_dominate_default_after_phase_d():
    """The default config must include CN sources (ndrc + nea variants) so
    ``policy_radar`` snapshots are no longer western-only — the audit's
    headline regression."""
    keys = set(POLICY_SOURCES.keys())
    assert {"ndrc", "ndrc_tz", "nea"}.issubset(keys), (
        "Phase D requires ndrc + ndrc_tz + nea wired into the default crawler"
    )
    # Western sources are still present.
    assert {"fed", "ecb"}.issubset(keys)
