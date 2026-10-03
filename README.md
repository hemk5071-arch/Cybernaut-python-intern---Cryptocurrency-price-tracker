# CryptoPulse

CryptoPulse is a Flask dashboard that fetches the top 10 cryptocurrencies from the CoinMarketCap API, stores successful snapshots in SQLite, and presents live, cached, filtered, and historical market data.

## Features

- CoinMarketCap API data with a server-side API key
- SQLite snapshots and historical price API
- In-memory request cache with database fallback when live scraping fails
- Responsive dashboard with filters, alerts, summary metrics, Chart.js history, and CSV export
- REST endpoints: `/api/coins`, `/api/history/<coin_name>`, `/export/csv`, `/health`

## Architecture

`app.py` owns HTTP routes and validation. `scraper.py` owns the CoinMarketCap API client and caching. `db.py` owns parameterized SQLite access. The browser dashboard is split between `templates/index.html`, `static/style.css`, and `static/script.js`.

## Requirements and installation

- Python 3.10+
- A CoinMarketCap API key with access to the cryptocurrency listings endpoint
- Internet access to CoinMarketCap

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:CMC_API_KEY = "YOUR_ROTATED_COINMARKETCAP_API_KEY"
python app.py
```

Set the environment variable in the same PowerShell session before starting the app. Do not commit or share the key. If a key has been pasted into chat or another public place, revoke it and use a replacement.

## Open the dashboard

Open [http://127.0.0.1:5000/](http://127.0.0.1:5000/).

## API

- `GET /api/coins?min_price=100&min_change_pct=2&alert_threshold_pct=5` returns filtered coins, source (`live` or `cached`), and stale status.
- `GET /api/history/<coin_name>?limit=100` returns timestamped history. URL-encode names containing spaces.
- `GET /export/csv` downloads `crypto_prices.csv`.
- `GET /health` returns a simple service health response.

## Database

`crypto_tracker.db` is created on startup and ignored by Git. Every successful scrape writes one timestamped row per coin to `prices`. The latest complete timestamp is used for stale fallback; historical requests are limited to 1,000 records.

## Live updates

The server refreshes CoinMarketCap data at most once per minute and the dashboard polls every 30 seconds. Successful fetches are stored as historical snapshots. If the API key is missing, invalid, or the provider is unavailable, the app falls back to the latest stored snapshot and marks it as cached.

## Screenshots

_Add dashboard screenshots here after running the application._

## Troubleshooting

- If live data is unavailable, verify `CMC_API_KEY` is set in the same terminal session used to start the app and confirm the key has API access.
- If CoinMarketCap is unavailable, the dashboard reports cached data and continues serving the last stored snapshot.
- If the database is empty during an outage, the API returns an empty collection and the UI shows an unavailable state.

## Future enhancements

Watchlists, configurable scheduled jobs, notifications, more assets, Docker deployment, authentication, and cloud-hosted persistence can be added without changing the route or scraper boundaries.
