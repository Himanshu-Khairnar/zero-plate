from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SQLITE = (BACKEND_DIR.parent / "frontend" / "prisma" / "dev.db").resolve()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "WasteLess ML Service"
    cors_origins: list[str] = ["http://localhost:3000"]

    # Same database the Next.js app uses through Prisma.
    # SQLite for local dev; e.g. postgresql+psycopg://user:pass@host/db in prod.
    database_url: str = f"sqlite:///{DEFAULT_SQLITE.as_posix()}"

    # Where trained model artifacts are versioned.
    model_dir: Path = BACKEND_DIR / "models"

    # Forecast horizon in days (1..7 per the plan).
    horizon_days: int = 7
    # Outlets with fewer days of history than this use the global model.
    cold_start_days: int = 56
    # Number of weekly backtest folds used to compare models.
    backtest_folds: int = 4

    # Set to false to skip the network and use climatology only (tests, CI).
    use_open_meteo: bool = True
    holiday_country: str = "IN"


settings = Settings()
