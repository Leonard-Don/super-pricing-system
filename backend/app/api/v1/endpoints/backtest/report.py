"""PDF 报告生成路由：``/report`` 与 ``/report/base64``。"""

import base64
import logging
from datetime import datetime
from typing import Tuple

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from src.utils.data_validation import ensure_json_serializable, normalize_backtest_results

from ._helpers import run_backtest_pipeline
from ._schemas import ReportRequest

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_report_pdf(request: ReportRequest) -> Tuple[bytes, str]:
    """Generate report bytes and filename through a single shared path."""
    from src.reporting import pdf_generator

    backtest_result = request.backtest_result

    if not backtest_result:
        backtest_result, _ = run_backtest_pipeline(
            symbol=request.symbol,
            strategy_name=request.strategy,
            parameters=request.parameters,
            start_date=request.start_date,
            end_date=request.end_date,
            initial_capital=request.initial_capital,
            commission=request.commission,
            slippage=request.slippage,
        )
    else:
        backtest_result = ensure_json_serializable(
            normalize_backtest_results(backtest_result)
        )

    pdf_content = pdf_generator.generate_backtest_report(
        backtest_result=backtest_result,
        symbol=request.symbol,
        strategy=request.strategy,
        parameters=request.parameters,
    )
    filename = (
        f"backtest_report_{request.symbol}_{request.strategy}_"
        f"{datetime.now().strftime('%Y%m%d')}.pdf"
    )
    return pdf_content, filename


@router.post("/report", summary="生成回测报告 PDF")
async def generate_report(request: ReportRequest):
    """生成策略回测报告 PDF。"""
    try:
        pdf_content, filename = _build_report_pdf(request)
        return Response(
            content=pdf_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/report/base64", summary="生成回测报告 (Base64)")
async def generate_report_base64(request: ReportRequest):
    """生成策略回测报告并返回 Base64 编码，适用于前端直接下载。"""
    try:
        pdf_content, filename = _build_report_pdf(request)
        pdf_base64 = base64.b64encode(pdf_content).decode("utf-8")
        return {
            "success": True,
            "data": {
                "pdf_base64": pdf_base64,
                "filename": filename,
                "content_type": "application/pdf",
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating report: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
