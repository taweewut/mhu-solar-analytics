"""Application configuration via pydantic-settings.

All config comes from environment variables (prefix ``MOMSOLAR_``) or a local ``.env``
file. Document keys in ``.env.example``.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Typed application settings, loaded from the environment / ``.env``."""

    model_config = SettingsConfigDict(
        env_prefix="MOMSOLAR_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    data_dir: Path = Field(
        default=ROOT / "frontend" / "public" / "data",
        description="Processed data folder (homes.json, ft_rates.csv, <home>/*.csv).",
    )
    solis_raw_dir: Path | None = Field(
        default=None, description="MomHome: folder with the SolisCloud exports (for /refresh)."
    )
    huawei_raw_dir: Path | None = Field(
        default=None,
        description="MhuHome: 'Raw from Inverter report' folder solar_pipeline saves into.",
    )
    sheet: str | None = Field(
        default=None,
        description="Google Sheet download (.xlsx) with the PEA Log, MEA Log and Ft tables.",
    )
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://solar.localhost:8080,http://solar-dev.localhost:8080"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
