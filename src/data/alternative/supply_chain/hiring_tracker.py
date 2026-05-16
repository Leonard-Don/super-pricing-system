"""
招聘趋势追踪器（精简版）

历史上本模块通过抓取 51job 等公开招聘平台来计算
"市场运营岗 vs 技术岗"占比变化。2026 Q2 的另类数据审计
（docs/alt_data_audit.md）确认 51job 选择器早已失效，
live fetch 始终返回 0 条岗位、置信度为 0，没有任何信号价值，
因此整条 live fetch 通路已被移除。

当前职责：
    - 持有常量 ``TRACKED_COMPANIES`` 与 ``JOB_CATEGORIES``，
      供 ``people_layer`` 等下游模块复用；
    - ``analyze_company`` 直接返回 ``signal="no_data"``，
      保留接口契约，让 ``chain_signals``/``people_signal`` 平稳运作。

如果以后接入真实的招聘数据（猎聘 API、企业官网 ATS 等），
应当新建独立的 Provider 而不是恢复 51job 抓取。
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..base_alt_provider import AntiCrawlMixin

logger = logging.getLogger(__name__)

# ── 岗位分类关键词 ──

JOB_CATEGORIES = {
    "core_tech": {
        "name": "核心技术岗",
        "keywords": [
            "算法工程师", "系统架构师", "芯片设计", "FPGA", "ASIC",
            "编译器", "操作系统", "内核开发", "底层算力", "GPU开发",
            "AI研究员", "机器学习", "深度学习", "自动驾驶",
            "量化研究", "嵌入式", "硬件工程",
        ],
    },
    "applied_tech": {
        "name": "应用技术岗",
        "keywords": [
            "前端开发", "后端开发", "全栈", "移动开发", "iOS", "Android",
            "产品经理", "测试工程师", "DevOps", "云计算",
            "数据分析师", "BI分析",
        ],
    },
    "marketing_biz": {
        "name": "市场/运营岗",
        "keywords": [
            "市场营销", "品牌经理", "新媒体运营", "直播运营", "内容运营",
            "用户增长", "运营分析", "用户运营", "增长运营", "社区运营",
        ],
    },
    "finance_compliance": {
        "name": "金融/合规岗",
        "keywords": [
            "财务总监", "CFO", "合规经理", "风控", "审计",
            "投资者关系", "董秘", "法务", "IPO",
            "ESG", "内控", "合规官",
        ],
    },
}

# 需追踪的核心企业
TRACKED_COMPANIES = {
    "alibaba": {"name": "阿里巴巴", "ticker": "BABA", "sector": "互联网"},
    "tencent": {"name": "腾讯", "ticker": "0700.HK", "sector": "互联网"},
    "baidu": {"name": "百度", "ticker": "BIDU", "sector": "AI"},
    "huawei": {"name": "华为", "ticker": None, "sector": "ICT"},
    "bytedance": {"name": "字节跳动", "ticker": None, "sector": "互联网"},
    "nvidia": {"name": "英伟达", "ticker": "NVDA", "sector": "半导体"},
    "tsmc": {"name": "台积电", "ticker": "TSM", "sector": "半导体"},
}


class HiringTracker(AntiCrawlMixin):
    """
    招聘趋势追踪器（常量持有器 + no-data 接口）

    51job live fetch 通路已移除，本类不再产生有效信号。
    ``analyze_company`` 始终返回 ``signal="no_data"``，
    下游可据此回退到 curated 数据或忽略招聘维度。

    Usage:
        tracker = HiringTracker()
        report = tracker.analyze_company("alibaba")
        assert report["signal"] == "no_data"
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self._min_interval = self.config.get("min_request_interval", 3.0)
        self.logger = logger
        # 历史数据存储（保留字段供潜在的子类扩展）
        self._history: Dict[str, List[Dict[str, Any]]] = {}

    def analyze_company(
        self,
        company_id: str,
        source: str = "auto",
    ) -> Dict[str, Any]:
        """
        返回公司招聘信号的 no-data 占位

        51job 抓取通路已下线，因此这里直接返回 no-data 结构，
        不再触发任何网络 IO。
        """
        company = TRACKED_COMPANIES.get(company_id)
        if not company:
            return {"error": f"未追踪的公司: {company_id}"}

        return {
            "company": company["name"],
            "ticker": company.get("ticker"),
            "sector": company.get("sector"),
            "total_jobs": 0,
            "signal": "no_data",
            "signal_strength": 0.0,
            "alert": False,
            "alert_message": None,
            "source": "hiring_tracker:no_data",
            "fallback_reason": "51job_adapter_removed",
            "timestamp": datetime.now().isoformat(),
        }

    def analyze_all_companies(self) -> Dict[str, Dict[str, Any]]:
        """对所有追踪公司返回 no-data 占位"""
        return {company_id: self.analyze_company(company_id) for company_id in TRACKED_COMPANIES}

    def get_dilution_ranking(self) -> List[Dict[str, Any]]:
        """
        获取技术稀释度排名

        live fetch 移除后，本方法没有有效数据可排序，
        返回空列表以保持接口稳定。
        """
        return []
