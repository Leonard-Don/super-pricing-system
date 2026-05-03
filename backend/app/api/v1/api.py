from fastapi import APIRouter
from backend.app.api.v1.endpoints import (
    market_data,
    strategies,
    backtest,
    system,
    realtime,
    analysis,
    optimization,
    trading,
    industry,
    events,
    pricing,
    alt_data,
    macro,
    cross_market,
    research_workbench,
    quant_lab,
    infrastructure,
)

api_router = APIRouter()

# These routers remain mounted because Quant Lab, pricing research, and legacy
# saved tasks still call them as support primitives. They are intentionally
# hidden from the generated API surface so this private repo presents only the
# split-out system boundary instead of the public quant-trading workspace.
INTERNAL_SUPPORT_API = {"include_in_schema": False}

api_router.include_router(
    market_data.router,
    prefix="/market-data",
    tags=["Internal Support"],
    **INTERNAL_SUPPORT_API,
)
api_router.include_router(
    strategies.router,
    prefix="/strategies",
    tags=["Internal Support"],
    **INTERNAL_SUPPORT_API,
)
api_router.include_router(
    backtest.router,
    prefix="/backtest",
    tags=["Internal Support"],
    **INTERNAL_SUPPORT_API,
)
api_router.include_router(system.router, prefix="/system", tags=["System"])
api_router.include_router(
    realtime.router,
    prefix="/realtime",
    tags=["Internal Support"],
    **INTERNAL_SUPPORT_API,
)
api_router.include_router(
    analysis.router,
    prefix="/analysis",
    tags=["Internal Support"],
    **INTERNAL_SUPPORT_API,
)
api_router.include_router(
    optimization.router,
    prefix="/optimization",
    tags=["Internal Support"],
    **INTERNAL_SUPPORT_API,
)
api_router.include_router(
    trading.router,
    prefix="/trade",
    tags=["Internal Support"],
    **INTERNAL_SUPPORT_API,
)
api_router.include_router(
    industry.router,
    prefix="/industry",
    tags=["Internal Support"],
    **INTERNAL_SUPPORT_API,
)
api_router.include_router(
    events.router,
    prefix="/events",
    tags=["Internal Support"],
    **INTERNAL_SUPPORT_API,
)
api_router.include_router(pricing.router, prefix="/pricing", tags=["Asset Pricing Research"])
api_router.include_router(alt_data.router, prefix="/alt-data", tags=["Alternative Data"])
api_router.include_router(macro.router, prefix="/macro", tags=["Macro Mispricing"])
api_router.include_router(cross_market.router, prefix="/cross-market", tags=["Cross Market"])
api_router.include_router(
    research_workbench.router,
    prefix="/research-workbench",
    tags=["Research Workbench"],
)
api_router.include_router(quant_lab.router, prefix="/quant-lab", tags=["Quant Lab"])
api_router.include_router(
    infrastructure.router,
    prefix="/infrastructure",
    tags=["Infrastructure"],
)
