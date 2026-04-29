#!/usr/bin/env python3
"""
超级定价系统 - FastAPI 后端服务
"""

import sys
import os
import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

# 添加src目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "src"))

from backend.app.core.config import APP_VERSION, config, setup_logging
from backend.app.api.v1.api import api_router
from backend.app.websocket.routes import router as websocket_router
from backend.app.core.error_handler import register_exception_handlers
from backend.app.core.rate_limit_state import rate_limiter
from src.middleware.request_id import RequestIDMiddleware
from src.data.realtime_manager import realtime_manager
from src.data.data_manager import DataManager
from src.data.alternative import (
    get_alt_data_manager,
    start_alt_data_scheduler,
    stop_alt_data_scheduler,
)

# 配置日志
setup_logging()
logger = logging.getLogger(__name__)

# 创建全局数据管理器实例
data_manager = DataManager()
HOT_REALTIME_SYMBOLS = [
    "^GSPC", "^DJI", "^IXIC", "^RUT", "000001.SS", "^HSI",
    "AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD", "ETH-USD",
]
INDUSTRY_WARMUP_DELAY_SECONDS = 12
ALT_DATA_START_DELAY_SECONDS = 30


def is_env_flag_enabled(name: str, default: bool = False) -> bool:
    """统一解析布尔环境变量，避免测试和运行时对开关值理解不一致。"""
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    normalized = str(raw_value).strip().lower()
    if not normalized:
        return default

    return normalized not in {"0", "false", "no", "off"}


def should_run_noncritical_startup_tasks() -> bool:
    """允许 E2E 等场景关闭启动期预热和后台抓取，减少冷启动干扰。"""
    return not is_env_flag_enabled("DISABLE_NONCRITICAL_STARTUP_TASKS", False)


async def warm_up_cache():
    """缓存预热 - 仅在应用稳定后预加载少量非行业核心数据"""
    # 1. 基础美股
    hot_symbols = ["AAPL", "GOOGL", "MSFT", "TSLA", "NVDA"]
    logger.info(f"Warming up cache for {len(hot_symbols)} symbols...")

    try:
        loop = asyncio.get_event_loop()
        # 预加载美股
        await loop.run_in_executor(
            None,
            lambda: data_manager.get_multiple_stocks(hot_symbols)
        )

        logger.info(
            "Skipping eager realtime quote prewarm for %s symbols to avoid poisoning provider health before the first live session.",
            len(HOT_REALTIME_SYMBOLS),
        )

        logger.info(
            "Skipping eager A-share industry prewarm during startup; industry endpoints will hydrate on demand from cached snapshots first."
        )
        logger.info("Non-critical cache warmup completed.")
    except Exception as e:
        logger.warning(f"Cache warmup failed (non-critical): {e}")


async def delayed_background_start():
    """延后非关键后台任务，避免与行业模块冷启动竞争网络与 CPU。"""
    await asyncio.sleep(ALT_DATA_START_DELAY_SECONDS)
    try:
        get_alt_data_manager()
        start_alt_data_scheduler()
        await asyncio.to_thread(get_alt_data_manager().refresh_all, True)
        logger.info("Delayed alternative-data startup completed.")
    except Exception as e:
        logger.warning(f"Delayed alternative-data startup failed (non-critical): {e}")


async def delayed_warm_up_cache():
    """在应用稳定后再做行业缓存预热。"""
    await asyncio.sleep(INDUSTRY_WARMUP_DELAY_SECONDS)
    await warm_up_cache()


def start_background_task(coroutine, *, name: str) -> asyncio.Task:
    """为后台任务保留句柄，便于关停时统一回收。"""
    task = asyncio.create_task(coroutine, name=name)
    return task


async def cancel_background_tasks(tasks: list[asyncio.Task]) -> None:
    """优雅停止后台任务，避免 reload/shutdown 后留下悬挂协程。"""
    pending_tasks = [task for task in tasks if task and not task.done()]
    for task in pending_tasks:
        task.cancel()

    if not pending_tasks:
        return

    results = await asyncio.gather(*pending_tasks, return_exceptions=True)
    for task, result in zip(pending_tasks, results):
        if isinstance(result, Exception) and not isinstance(result, asyncio.CancelledError):
            logger.warning("Background task %s exited with error during shutdown: %s", task.get_name(), result)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    background_tasks: list[asyncio.Task] = []

    # 启动事件
    logger.info("Starting up RealTimeDataManager background task")
    background_tasks.append(
        start_background_task(
            realtime_manager.start_real_time_updates(),
            name="realtime-manager",
        )
    )

    if should_run_noncritical_startup_tasks():
        # 非关键后台刷新延后执行，避免与行业模块冷启动竞争资源
        background_tasks.append(
            start_background_task(
                delayed_background_start(),
                name="alt-data-startup",
            )
        )

        # 缓存预热（后台延后执行，不阻塞启动）
        background_tasks.append(
            start_background_task(
                delayed_warm_up_cache(),
                name="cache-warmup",
            )
        )
    else:
        logger.info(
            "Skipping non-critical startup tasks because DISABLE_NONCRITICAL_STARTUP_TASKS is enabled."
        )

    try:
        yield
    finally:
        # 关闭事件
        logger.info("Stopping RealTimeDataManager")
        realtime_manager.stop_real_time_updates()
        stop_alt_data_scheduler()
        await cancel_background_tasks(background_tasks)


# 创建FastAPI应用
app = FastAPI(
    title="超级定价系统 API",
    description=f"""
    ## 宏观错误定价套利引擎

    ### 核心工作区
    - 💰 **定价研究**: CAPM / Fama-French 三因子 / DCF 估值 / Gap Analysis / 同行对比
    - 🛰️ **上帝视角 (GodEye)**: 宏观因子引擎 · 证据质量 · 政策雷达 · 结构性衰败 · 跨市场总览
    - 📂 **研究工作台**: 研究任务持久化 · 状态流转 · 深链重开 · 剧本联动
    - 🧪 **Quant Lab**: 参数优化 · 风险归因 · 估值历史 · 告警编排 · 数据质量诊断

    ### 支撑能力
    - 📊 **跨市场回测**: 模板推荐 · 组合回测 · 执行诊断
    - 🔗 **另类数据**: 供应链 · 治理 · 人事 · 政策源 · 实体统一
    - 🔌 **WebSocket 支持**: 实时报价推送与兼容层订阅确认接口
    - ⚡ **高性能后端**: 异步处理、缓存、诊断与健康检查

    ### API版本
    - **当前版本**: v{APP_VERSION}
    - **API版本**: v1
    - **最后更新**: 2026-04-22

    ### 认证
    研究与只读分析接口默认允许开发态匿名访问；认证、基础设施和管理类接口支持
    Bearer JWT、Refresh Token 与 X-API-Key。生产环境必须配置 `AUTH_SECRET`，
    CORS 仅放行显式配置的 `FRONTEND_URL` / `CORS_ORIGINS`。

    ### 限制
    - 请求频率: 100次/分钟
    - 数据范围: 最多5年历史数据
    - 并发回测: 最多10个
    """,
    version=APP_VERSION,
    lifespan=lifespan,
    terms_of_service="https://example.com/terms/",
    contact={
        "name": "超级定价系统支持",
        "url": "https://example.com/contact/",
        "email": "support@example.com",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config["cors_origins"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加请求追踪中间件
app.add_middleware(RequestIDMiddleware)

# 添加 Gzip 压缩中间件 (压缩大于 500 字节的响应)
app.add_middleware(GZipMiddleware, minimum_size=500)

# 注册全局异常处理器
register_exception_handlers(app)

# 添加速率限制中间件
@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    """速率限制中间件"""
    # 跳过预检请求、健康检查端点和 WebSocket
    if request.method == "OPTIONS":
        return await call_next(request)

    if request.url.path in ["/health", "/system/status", "/docs", "/openapi.json"] or request.url.path.startswith("/ws"):
        return await call_next(request)

    # 本地开发和浏览器回归流量不参与限流，避免把正常调试误判成异常洪泛。
    if rate_limiter.is_local_request(request):
        return await call_next(request)

    result = rate_limiter.evaluate(request)

    # 检查速率限制
    if not result["allowed"]:
        logger.warning(f"速率限制触发: 客户端 {result['subject']} @ {result['endpoint']}")
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Too many requests. Please try again later.",
                "limit": result["limit"],
                "endpoint": result["endpoint"],
                "retry_after": result["retry_after"],
            },
            headers={
                "Retry-After": str(result["retry_after"]),
                "X-RateLimit-Limit": str(result["limit"]),
                "X-RateLimit-Remaining": str(result["remaining"]),
                "X-RateLimit-Endpoint": str(result["endpoint"]),
            },
        )

    # 继续处理请求
    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(result["limit"])
    response.headers["X-RateLimit-Remaining"] = str(result["remaining"])
    response.headers["X-RateLimit-Endpoint"] = str(result["endpoint"])
    return response

# 包含API路由
app.include_router(api_router)

# 包含WebSocket路由
app.include_router(websocket_router, tags=["WebSocket"])

@app.get("/")
async def root():
    """根路径"""
    return {"message": "超级定价系统 API", "version": config["app_version"]}

@app.get("/health", tags=["健康检查"], summary="基础健康检查")
async def health_check():
    """
    基础健康检查接口
    """
    from datetime import datetime
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=config["api_host"],
        port=config["api_port"],
        reload=config["api_reload"],
    )
