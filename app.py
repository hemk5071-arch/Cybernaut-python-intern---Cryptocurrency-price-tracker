"""Flask application for the CryptoPulse dashboard."""
from __future__ import annotations

import csv
import io
import logging
from typing import Any

from flask import Flask, jsonify, render_template, request, send_file

from db import get_history_for_coin, init_db
from scraper import fetch_coins_cached

logging.basicConfig(level=logging.INFO)
app = Flask(__name__)
init_db()


def _float_query(name: str) -> float | None:
    value = request.args.get(name)
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number") from exc


def _filtered_coins() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    result = fetch_coins_cached()
    min_price = _float_query("min_price")
    min_change = _float_query("min_change_pct")
    threshold = _float_query("alert_threshold_pct")
    threshold = 5.0 if threshold is None else threshold
    coins = [coin for coin in result["coins"] if
             (min_price is None or coin["price_usd"] >= min_price) and
             (min_change is None or (coin.get("change_24h_pct") or 0) >= min_change)]
    for coin in coins:
        coin["alert"] = (coin.get("change_24h_pct") or 0) >= threshold
    result["coins"] = coins
    result["alert_threshold_pct"] = threshold
    return coins, result


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/coins")
def api_coins():
    try:
        coins, result = _filtered_coins()
        return jsonify({"coins": coins, "source": result["source"], "stale": result["stale"],
                        "error": result.get("error"), "count": len(coins)})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        logging.exception("Coin API failed")
        return jsonify({"error": "Unable to retrieve cryptocurrency data"}), 500


@app.get("/api/history/<path:coin_name>")
def api_history(coin_name: str):
    try:
        limit = int(request.args.get("limit", 100))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400
    history = get_history_for_coin(coin_name, limit)
    if not history:
        return jsonify({"error": "Cryptocurrency history not found"}), 404
    return jsonify({"name": coin_name, "data": history})


@app.get("/export/csv")
def export_csv():
    try:
        coins, result = _filtered_coins()
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=["timestamp", "name", "symbol", "price_usd",
                                                     "change_24h_pct", "market_cap_usd"])
        writer.writeheader()
        from datetime import datetime, timezone
        timestamp = datetime.now(timezone.utc).isoformat()
        for coin in coins:
            writer.writerow({"timestamp": timestamp, **{key: coin.get(key, "") for key in writer.fieldnames if key != "timestamp"}})
        return send_file(io.BytesIO(output.getvalue().encode()), mimetype="text/csv",
                         as_attachment=True, download_name="crypto_prices.csv")
    except Exception:
        logging.exception("CSV export failed")
        return jsonify({"error": "Unable to generate CSV export"}), 500


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "CryptoPulse"})


if __name__ == "__main__":
    app.run(debug=False, host="127.0.0.1", port=5000)
