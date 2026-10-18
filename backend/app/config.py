from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "WasteLess ML Service"
    cors_origins: list[str] = ["http://localhost:3000"]

    # Same database the Next.js app uses through Prisma (PostgreSQL).
    # Local dev default: the PGlite server started with `npm run db:local`.
    # SQLite also works for isolated tests: sqlite:///path/to.db
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5433/postgres"

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
