"""Thin database layer shared by the API, the trainer and the cron jobs.

The ML service reads and writes the same tables Prisma manages. Identifiers
are always double-quoted so the camelCase names work on SQLite and Postgres.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from app.config import settings

_engine: Engine | None = None


def engine() -> Engine:
    global _engine
    if _engine is None:
        kwargs: dict[str, Any] = {"pool_pre_ping": True}
        if settings.database_url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False}
        else:
            # No server-side prepared statements: plays well with poolers
            # (Neon/PgBouncer) and with the PGlite dev server.
            kwargs["connect_args"] = {"prepare_threshold": None}
            kwargs["pool_size"] = 2
            kwargs["max_overflow"] = 2
        _engine = create_engine(settings.database_url, **kwargs)
    return _engine


def is_sqlite() -> bool:
    return engine().dialect.name == "sqlite"


def new_id() -> str:
    """Prisma uses cuid(); any unique string is fine for rows we create."""
    return uuid.uuid4().hex[:25]


def now_value() -> Any:
    """A value Prisma will read back as a DateTime.

    Prisma stores SQLite DateTime columns as integer epoch milliseconds;
    Postgres gets a real timestamp.
    """
    now = datetime.now(timezone.utc)
    if is_sqlite():
        return int(now.timestamp() * 1000)
    return now.replace(tzinfo=None)


def read_df(sql: str, params: dict[str, Any] | None = None) -> pd.DataFrame:
    with engine().connect() as conn:
        return pd.read_sql_query(text(sql), conn, params=params or {})


def execute(sql: str, params: dict[str, Any] | Iterable[dict[str, Any]] | None = None) -> None:
    with engine().begin() as conn:
        _exec(conn, sql, params)


def _exec(conn: Connection, sql: str, params: Any) -> None:
    if params is None:
        conn.execute(text(sql))
    elif isinstance(params, dict):
        conn.execute(text(sql), params)
    else:
        rows = list(params)
        if rows:
            conn.execute(text(sql), rows)


def fetch_one(sql: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    with engine().connect() as conn:
        row = conn.execute(text(sql), params or {}).mappings().first()
        return dict(row) if row else None


def fetch_all(sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine().connect() as conn:
        return [dict(r) for r in conn.execute(text(sql), params or {}).mappings().all()]


# ----------------------------------------------------------------- queries


def outlet(outlet_id: str) -> dict[str, Any] | None:
    return fetch_one('SELECT * FROM "Outlet" WHERE id = :id', {"id": outlet_id})


def all_outlets() -> list[dict[str, Any]]:
    return fetch_all('SELECT * FROM "Outlet" ORDER BY name')


def dishes(outlet_id: str, active_only: bool = True) -> pd.DataFrame:
    sql = 'SELECT * FROM "Dish" WHERE "outletId" = :o'
    if active_only:
        sql += ' AND "isActive" = :t'
    return read_df(sql + " ORDER BY name", {"o": outlet_id, "t": True})


def daily_sales(outlet_id: str | None = None) -> pd.DataFrame:
    """Sales summed over shifts: one row per dish per day.

    Two sources are merged: imported/POS rows in SalesRecord (module B) and
    the "sold" counts staff log in kitchen mode (KitchenLog, module G). For a
    dish-day that has SalesRecord rows those win; otherwise the kitchen log
    is used at the dish's list price. This is the loop in the plan: every day
    of logged data makes the next forecast better.
    """
    where = ' WHERE d."outletId" = :o' if outlet_id else ""
    params: dict[str, Any] = {"o": outlet_id} if outlet_id else {}
    pos = read_df(
        f"""
        SELECT s."dishId" AS dish_id, d."outletId" AS outlet_id, s.date,
               SUM(s."qtySold") AS qty, AVG(s.price) AS price
        FROM "SalesRecord" s JOIN "Dish" d ON d.id = s."dishId"{where}
        GROUP BY s."dishId", d."outletId", s.date
        """,
        params,
    )
    date_expr = "strftime('%Y-%m-%d', k.date)" if is_sqlite() else "to_char(k.date, 'YYYY-MM-DD')"
    kitchen = read_df(
        f"""
        SELECT k."dishId" AS dish_id, d."outletId" AS outlet_id, {date_expr} AS date,
               SUM(k.sold) AS qty, MAX(d.price) AS price
        FROM "KitchenLog" k JOIN "Dish" d ON d.id = k."dishId"{where}
        GROUP BY k."dishId", d."outletId", {date_expr}
        HAVING SUM(k.sold) > 0
        """,
        params,
    )
    frames = [f for f in (pos, kitchen) if len(f)]
    if not frames:
        return pos
    df = pd.concat(frames, ignore_index=True)
    # SalesRecord rows come first, so keep="first" lets them win per dish-day.
    df = df.drop_duplicates(["dish_id", "date"], keep="first").sort_values(["date", "dish_id"]).reset_index(drop=True)
    df["qty"] = df["qty"].astype(float)
    df["price"] = df["price"].astype(float)
    return df


def dish_costs(outlet_id: str) -> pd.DataFrame:
    """Cost per plate from the recipe and current ingredient prices."""
    sql = """
        SELECT d.id AS dish_id,
               COALESCE(SUM(r."qtyPerPlate" * i."costPerUnit"), 0) AS cost_per_plate
        FROM "Dish" d
        LEFT JOIN "RecipeItem" r ON r."dishId" = d.id
        LEFT JOIN "Ingredient" i ON i.id = r."ingredientId"
        WHERE d."outletId" = :o
        GROUP BY d.id
    """
    return read_df(sql, {"o": outlet_id})


def external_days(city: str, start: str, end: str) -> pd.DataFrame:
    return read_df(
        'SELECT * FROM "ExternalDay" WHERE city = :c AND date >= :s AND date <= :e ORDER BY date',
        {"c": city, "s": start, "e": end},
    )


def upsert_external_days(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    for r in rows:
        r.setdefault("id", new_id())
    execute(
        """
        INSERT INTO "ExternalDay" (id, city, date, "tempMax", "tempMin", "rainMm", humidity,
                                   "isHoliday", "holidayName", source)
        VALUES (:id, :city, :date, :tempMax, :tempMin, :rainMm, :humidity,
                :isHoliday, :holidayName, :source)
        ON CONFLICT (city, date) DO UPDATE SET
            "tempMax" = excluded."tempMax", "tempMin" = excluded."tempMin",
            "rainMm" = excluded."rainMm", humidity = excluded.humidity,
            "isHoliday" = excluded."isHoliday", "holidayName" = excluded."holidayName",
            source = excluded.source
        """,
        rows,
    )


def upsert_forecasts(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    created = now_value()
    for r in rows:
        r.setdefault("id", new_id())
        r["createdAt"] = created
    execute(
        """
        INSERT INTO "Forecast" (id, "outletId", "dishId", date, low, likely, high,
                                "modelVersion", explanation, "createdAt")
        VALUES (:id, :outletId, :dishId, :date, :low, :likely, :high,
                :modelVersion, :explanation, :createdAt)
        ON CONFLICT ("dishId", date) DO UPDATE SET
            low = excluded.low, likely = excluded.likely, high = excluded.high,
            "modelVersion" = excluded."modelVersion", explanation = excluded.explanation,
            "createdAt" = excluded."createdAt"
        """,
        rows,
    )


def active_model_run(outlet_id: str) -> dict[str, Any] | None:
    return fetch_one(
        'SELECT * FROM "ModelRun" WHERE "outletId" = :o AND "isActive" = :t ORDER BY "trainedAt" DESC',
        {"o": outlet_id, "t": True},
    )


def model_runs(outlet_id: str) -> list[dict[str, Any]]:
    return fetch_all(
        'SELECT * FROM "ModelRun" WHERE "outletId" = :o ORDER BY "trainedAt" DESC', {"o": outlet_id}
    )


def record_model_run(row: dict[str, Any], promote: bool) -> None:
    row = {
        **row,
        "id": new_id(),
        "trainedAt": now_value(),
        "isActive": promote,
        "promotedAt": now_value() if promote else None,
    }
    with engine().begin() as conn:
        if promote:
            conn.execute(
                text('UPDATE "ModelRun" SET "isActive" = :f WHERE "outletId" = :o'),
                {"f": False, "o": row["outletId"]},
            )
        conn.execute(
            text(
                """
                INSERT INTO "ModelRun" (id, "outletId", version, "modelName", "trainedAt", "trainRows",
                                        mae, mape, coverage, "metricsJson", "isActive", "promotedAt")
                VALUES (:id, :outletId, :version, :modelName, :trainedAt, :trainRows,
                        :mae, :mape, :coverage, :metricsJson, :isActive, :promotedAt)
                """
            ),
            row,
        )
