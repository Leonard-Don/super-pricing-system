"""Curated 50-name 公募基金 catalog for the fund_holdings provider.

The list is hand-maintained — see "manual quarterly refresh" note below — and
favours large, liquid equity / blend funds whose 季报 / 年报 holdings (top
positions) are publicly disclosed via AkShare's 天天基金 portfolio-holdings
endpoint (``ak.fund_portfolio_hold_em`` in the locked dependency line).

Each entry carries:

- ``code``: the 6-digit fund code akshare expects (also matches 天天基金 URL
  paths ``http://fund.eastmoney.com/<code>.html``).
- ``name``: a short display name; only used for narrative / public-summary
  output. Never used to drive the fetch.
- ``manager``: the public 基金经理 name as of the most recent quarterly
  filing window. Pure metadata — refresh manually on each catalog update.
- ``focus``: a short Chinese / EN tag covering the fund's investment
  flavour (e.g. ``"large_cap_blend"``, ``"new_energy"``,
  ``"consumer"``). Used by the provider's aggregation to surface
  per-flavour concentration breakdowns.

Manual quarterly refresh
------------------------

This static list is intentionally not pulled from a live ranking endpoint on
every refresh because the large-fund universe shifts slowly (a few percentage
points per quarter), and the refresh interval (weekly) is far shorter than the
catalog's drift cadence. Refresh checklist (every quarter close, 季报 /
年报 disclosure window):

1. Pull the latest quarterly AUM ranking from
   `天天基金 排行 (http://fund.eastmoney.com/data/fundranking.html)` or
   `ak.fund_open_fund_rank_em(...)`.
2. Drop funds that fell below the broad large-fund universe.
3. Add high-liquidity funds that climbed into the maintained 50-name list.
4. Replace ``manager`` strings for any funds whose 基金经理 changed.
5. Bump the ``CATALOG_VERSION`` constant below so downstream consumers can
   detect a refresh.

The provider unit tests pin the catalog *shape* but not individual codes,
so this file can be edited without test churn — only the count assertion
fails if the list shrinks below 30 funds.
"""

from __future__ import annotations

from dataclasses import dataclass

# Bumped manually each time TOP_50_FUND_CATALOG is edited. Provider exposes
# this to downstream consumers via ``provider_info.catalog_version``.
CATALOG_VERSION = "2026-Q1"


@dataclass(frozen=True)
class FundCatalogEntry:
    """One row in the curated public-fund catalog."""

    code: str
    name: str
    manager: str
    focus: str


# Curated 50-name 大型公募基金 catalog (2026-Q1 disclosure window snapshot).
#
# Sources cross-referenced when building this list:
# - 天天基金 (http://fund.eastmoney.com/data/fundranking.html) AUM ranking
# - 同花顺 (https://fund.10jqka.com.cn/) parallel ranking
# - 各基金公司官网 quarterly reports (季报)
#
# Codes are 6-digit string identifiers as required by akshare. Names and
# managers are captured at the time of the last manual refresh — do not
# treat them as authoritative for any downstream attribution use case.
TOP_50_FUND_CATALOG: list[FundCatalogEntry] = [
    FundCatalogEntry("110011", "易方达优质精选混合", "萧楠", "large_cap_blend"),
    FundCatalogEntry("161725", "招商中证白酒指数(LOF)A", "侯昊", "consumer"),
    FundCatalogEntry("000961", "天弘沪深300ETF联接A", "陈瑶", "broad_index"),
    FundCatalogEntry("110022", "易方达消费行业股票", "萧楠", "consumer"),
    FundCatalogEntry("005827", "易方达蓝筹精选混合", "张坤", "large_cap_blend"),
    FundCatalogEntry("000083", "汇添富消费行业混合", "胡昕炜", "consumer"),
    FundCatalogEntry("001102", "前海开源国家比较优势混合", "曲扬", "large_cap_blend"),
    FundCatalogEntry("001475", "易方达环保主题混合", "祁禾", "new_energy"),
    FundCatalogEntry("001789", "前海开源沪港深优势精选", "邱杰", "cross_market"),
    FundCatalogEntry("001856", "前海开源沪港深裕鑫A", "曲扬", "cross_market"),
    FundCatalogEntry("002910", "易方达消费精选股票", "萧楠", "consumer"),
    FundCatalogEntry("005267", "广发科技先锋混合", "刘格菘", "tech"),
    FundCatalogEntry("260108", "景顺长城新兴成长混合", "刘彦春", "growth"),
    FundCatalogEntry("000209", "信诚新兴产业混合", "孙浩中", "growth"),
    FundCatalogEntry("162605", "景顺长城鼎益混合(LOF)", "刘彦春", "growth"),
    FundCatalogEntry("000404", "易方达新兴成长灵活配置", "祁禾", "growth"),
    FundCatalogEntry("001717", "工银瑞信前沿医疗股票", "谭冬寒", "healthcare"),
    FundCatalogEntry("001763", "汇添富全球互联混合(QDII)", "杨瑨", "tech"),
    FundCatalogEntry("002340", "兴全合宜灵活配置混合A", "谢治宇", "large_cap_blend"),
    FundCatalogEntry("163406", "兴全合润分级混合", "谢治宇", "large_cap_blend"),
    FundCatalogEntry("000031", "华夏复兴混合", "周克平", "growth"),
    FundCatalogEntry("000477", "建信改革红利股票", "陶灿", "thematic"),
    FundCatalogEntry("000595", "嘉实泰和混合", "归凯", "large_cap_blend"),
    FundCatalogEntry("001643", "汇丰晋信低碳先锋股票", "陆彬", "new_energy"),
    FundCatalogEntry("002001", "华夏回报混合", "蔡向阳", "large_cap_blend"),
    FundCatalogEntry("003095", "中欧医疗健康混合A", "葛兰", "healthcare"),
    FundCatalogEntry("003634", "汇丰晋信沪港深股票", "黄立华", "cross_market"),
    FundCatalogEntry("004241", "中欧时代先锋股票A", "周应波", "growth"),
    FundCatalogEntry("005354", "国投瑞银先进制造混合", "施成", "manufacturing"),
    FundCatalogEntry("005468", "南方智锐混合A", "茅炜", "growth"),
    FundCatalogEntry("005962", "南方智慧混合A", "茅炜", "growth"),
    FundCatalogEntry("006161", "嘉实瑞和两年持有期混合", "归凯", "large_cap_blend"),
    FundCatalogEntry("006257", "万家行业优选混合(LOF)", "黄兴亮", "thematic"),
    FundCatalogEntry("006624", "易方达供给改革灵活配置", "杨宗昌", "thematic"),
    FundCatalogEntry("007119", "易方达研究精选股票", "冯波", "large_cap_blend"),
    FundCatalogEntry("007130", "易方达科翔混合", "陈皓", "tech"),
    FundCatalogEntry("007531", "前海开源公用事业股票", "崔宸龙", "new_energy"),
    FundCatalogEntry("008286", "南方阿尔法混合A", "王博", "growth"),
    FundCatalogEntry("008763", "鹏华匠心精选混合", "王宗合", "large_cap_blend"),
    FundCatalogEntry("009136", "广发高端制造股票A", "郑澄然", "manufacturing"),
    FundCatalogEntry("009777", "易方达高质量严选三年持有", "张坤", "large_cap_blend"),
    FundCatalogEntry("010251", "易方达科顺定开混合", "陈皓", "tech"),
    FundCatalogEntry("011102", "汇添富中盘价值精选混合", "胡昕炜", "value"),
    FundCatalogEntry("011251", "工银瑞信新能源汽车混合", "闫思倩", "new_energy"),
    FundCatalogEntry("011854", "信达澳银新能源产业股票", "冯明远", "new_energy"),
    FundCatalogEntry("012348", "汇添富数字经济创新发展三年", "杨瑨", "tech"),
    FundCatalogEntry("011986", "嘉实先进制造股票", "陈嘉禾", "manufacturing"),
    FundCatalogEntry("012420", "前海开源新经济灵活配置混合", "曲扬", "growth"),
    FundCatalogEntry("013158", "招商品质生活混合", "王景", "consumer"),
    FundCatalogEntry("000968", "广发养老指数混合", "霍华明", "thematic"),
]


def get_top_50_codes() -> list[str]:
    """Return the 6-digit fund codes from the catalog.

    De-duplicates if the static list happens to contain duplicate codes for
    different share classes — the holdings endpoint returns the same top-10
    list regardless of share class.
    """

    seen: list[str] = []
    for entry in TOP_50_FUND_CATALOG:
        if entry.code not in seen:
            seen.append(entry.code)
    return seen


def get_focus_for_code(code: str) -> str:
    """Map a fund code back to its curated focus tag.

    Falls back to ``"unknown"`` for codes outside the catalog — useful when
    operators pass a custom fund list via the provider's ``codes`` kwarg.
    """

    for entry in TOP_50_FUND_CATALOG:
        if entry.code == code:
            return entry.focus
    return "unknown"


def get_name_for_code(code: str) -> str:
    """Map a fund code back to its display name (catalog metadata)."""

    for entry in TOP_50_FUND_CATALOG:
        if entry.code == code:
            return entry.name
    return code


__all__ = [
    "CATALOG_VERSION",
    "TOP_50_FUND_CATALOG",
    "FundCatalogEntry",
    "get_focus_for_code",
    "get_name_for_code",
    "get_top_50_codes",
]
