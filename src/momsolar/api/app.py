"""FastAPI application factory and ASGI entrypoint.

Run in dev with::

    uvicorn momsolar.api.app:app --reload

Interactive docs at ``/docs``. The frontend reads this when ``VITE_API_BASE_URL`` is set,
otherwise it fetches the same data as static CSVs. No auth — keep it LAN/VPN-only.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from momsolar.api import refresh, service
from momsolar.api.routers import data
from momsolar.api.routers.data import home_path
from momsolar.api.schemas import FreshnessOut, RefreshOut
from momsolar.config import get_settings


def create_app() -> FastAPI:
    """Build the FastAPI app with CORS and routers mounted."""
    settings = get_settings()
    app = FastAPI(
        title="MomHome Solar API",
        version="0.1.0",
        summary="Solis + PEA data for the MomHome solar dashboard.",
    )

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        """Liveness probe."""
        return {"status": "ok"}

    @app.get("/homes/{home}/freshness", response_model=FreshnessOut, tags=["meta"])
    def data_freshness(path: Path = Depends(home_path)) -> FreshnessOut:
        """Latest reading / day / bill, the days with 5-min data, and refresh state."""
        return FreshnessOut(**service.freshness(path), refreshing=refresh.is_refreshing())

    @app.post("/refresh", response_model=RefreshOut, tags=["meta"])
    def trigger_refresh(background_tasks: BackgroundTasks) -> RefreshOut:
        """Re-import every home's raw exports (Solis + PEA, Huawei + MEA) in the background."""
        started = refresh.start(background_tasks)
        return RefreshOut(status="started" if started else "already_running")

    app.include_router(data.router)
    return app


app = create_app()
