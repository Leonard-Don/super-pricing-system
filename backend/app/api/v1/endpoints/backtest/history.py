"""回测历史 CRUD 路由：``/history``、``/history/stats``、``/history/{record_id}``、``/history/advanced``。"""

import logging

from fastapi import APIRouter, HTTPException

from backend.app.schemas.backtest import AdvancedHistorySaveRequest
from src.backtest.history import backtest_history
from src.utils.data_validation import ensure_json_serializable

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/history", summary="获取回测历史记录")
async def get_backtest_history(
    limit: int = 20,
    offset: int = 0,
    symbol: str = None,
    strategy: str = None,
    record_type: str = None,
    summary_only: bool = False,
):
    """获取回测历史记录"""
    try:
        stats = backtest_history.get_statistics(symbol=symbol, strategy=strategy, record_type=record_type)
        history = backtest_history.get_history(
            limit=limit,
            offset=offset,
            symbol=symbol,
            strategy=strategy,
            record_type=record_type,
            summary_only=summary_only,
        )
        return ensure_json_serializable({
            "success": True,
            "data": history,
            "total": stats.get("total_records", len(history)),
            "limit": limit,
            "offset": offset,
        })
    except Exception as e:
        logger.error(f"Error fetching backtest history: {e}")
        return {"success": False, "error": str(e)}


@router.get("/history/stats", summary="获取回测历史统计")
async def get_backtest_stats(symbol: str = None, strategy: str = None, record_type: str = None):
    """获取回测历史统计信息"""
    try:
        stats = backtest_history.get_statistics(symbol=symbol, strategy=strategy, record_type=record_type)
        return ensure_json_serializable({"success": True, "data": stats})
    except Exception as e:
        logger.error(f"Error fetching backtest stats: {e}")
        return {"success": False, "error": str(e)}


@router.get("/history/{record_id}", summary="获取特定回测记录")
async def get_backtest_record(record_id: str):
    """根据ID获取回测记录详情"""
    record = backtest_history.get_by_id(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return ensure_json_serializable({"success": True, "data": record})


@router.delete("/history/{record_id}", summary="删除回测记录")
async def delete_backtest_record(record_id: str):
    """删除特定回测记录"""
    success = backtest_history.delete(record_id)
    if not success:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True, "message": "Record deleted"}


@router.post("/history/advanced", summary="保存高级实验记录到历史")
async def save_advanced_history_record(request: AdvancedHistorySaveRequest):
    try:
        record_id = backtest_history.save({
            "record_type": request.record_type,
            "title": request.title or "",
            "symbol": request.symbol,
            "strategy": request.strategy,
            "start_date": request.start_date,
            "end_date": request.end_date,
            "parameters": request.parameters,
            "metrics": request.metrics,
            "result": request.result,
        })
        return ensure_json_serializable({
            "success": True,
            "data": {
                "record_id": record_id,
            },
        })
    except Exception as e:
        logger.error(f"Error saving advanced history record: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
