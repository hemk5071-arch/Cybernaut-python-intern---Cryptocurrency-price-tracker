"""SQLite persistence helpers for CryptoPulse."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).with_name("crypto_tracker.db")


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                name TEXT NOT NULL,
                symbol TEXT,
                price_usd REAL NOT NULL,
                change_24h_pct REAL,
                market_cap_usd TEXT
            )
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_prices_name_timestamp ON prices(name, timestamp)"
        )


def save_coins(coins: list[dict[str, Any]], timestamp: str | None = None) -> None:
    if not coins:
        return
    timestamp = timestamp or datetime.now(timezone.utc).isoformat()
    with get_connection() as connection:
        connection.executemany(
            """
            INSERT INTO prices (timestamp, name, symbol, price_usd, change_24h_pct, market_cap_usd)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    timestamp,
                    coin["name"],
                    coin.get("symbol"),
                    coin["price_usd"],
                    coin.get("change_24h_pct"),
                    coin.get("market_cap_usd"),
                )
                for coin in coins
            ],
        )


def get_latest_snapshot() -> list[dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute("SELECT MAX(timestamp) AS timestamp FROM prices").fetchone()
        if not row or not row["timestamp"]:
            return []
        rows = connection.execute(
            "SELECT timestamp, name, symbol, price_usd, change_24h_pct, market_cap_usd "
            "FROM prices WHERE timestamp = ? ORDER BY id",
            (row["timestamp"],),
        ).fetchall()
        return [dict(item) for item in rows]


def get_history_for_coin(name: str, limit: int = 100) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 1000))
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT timestamp, name, symbol, price_usd, change_24h_pct, market_cap_usd "
            "FROM prices WHERE name = ? ORDER BY timestamp DESC LIMIT ?",
            (name, limit),
        ).fetchall()
    return [dict(item) for item in reversed(rows)]


def get_available_names() -> list[str]:
    with get_connection() as connection:
        rows = connection.execute("SELECT DISTINCT name FROM prices ORDER BY name").fetchall()
    return [row["name"] for row in rows]
