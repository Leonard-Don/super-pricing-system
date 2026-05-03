# Third-Party Attribution

`super-pricing-system` is licensed under MIT (see `LICENSE`).
This document credits the open-source projects bundled into the runtime
distribution and notes their licenses. Build-only / development tooling
(linters, type checkers, formatters, test runners) is not listed here —
their licenses are bundled in the corresponding `pip` / `npm` package
trees.

The list below covers **runtime** dependencies declared in
`requirements.txt` and `frontend/package.json`'s `dependencies` block.
For exact pinned versions consult `requirements.lock` and
`frontend/package-lock.json`.

---

## Backend (Python, runtime)

### Web framework / API

| Project | License | Purpose |
|---------|---------|---------|
| [FastAPI](https://github.com/tiangolo/fastapi) | MIT | HTTP framework |
| [Uvicorn](https://github.com/encode/uvicorn) | BSD-3-Clause | ASGI server |
| [Pydantic](https://github.com/pydantic/pydantic) | MIT | Schema / validation |
| [python-multipart](https://github.com/Kludex/python-multipart) | Apache-2.0 | Form / file uploads |
| [websockets](https://github.com/python-websockets/websockets) | BSD-3-Clause | WebSocket server |

### Data processing

| Project | License | Purpose |
|---------|---------|---------|
| [pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause | DataFrame engine |
| [NumPy](https://github.com/numpy/numpy) | BSD-3-Clause | Array math |
| [SciPy](https://github.com/scipy/scipy) | BSD-3-Clause | Scientific computing |
| [scikit-learn](https://github.com/scikit-learn/scikit-learn) | BSD-3-Clause | ML primitives |

### Financial data adapters

| Project | License | Purpose |
|---------|---------|---------|
| [yfinance](https://github.com/ranaroussi/yfinance) | Apache-2.0 | Yahoo Finance OHLCV |
| [akshare](https://github.com/akfamily/akshare) | MIT | A股 / China market data |
| [ta](https://github.com/bukosabino/ta) | MIT | Technical-analysis indicators |
| [pandas-datareader](https://github.com/pydata/pandas-datareader) | BSD-3-Clause | Fama-French factor data |

### Visualization & reporting

| Project | License | Purpose |
|---------|---------|---------|
| [matplotlib](https://github.com/matplotlib/matplotlib) | PSF-based (matplotlib license) | Charts |
| [seaborn](https://github.com/mwaskom/seaborn) | BSD-3-Clause | Statistical plots |
| [reportlab](https://www.reportlab.com/) | BSD-3-Clause | PDF generation |
| [openpyxl](https://foss.heptapod.net/openpyxl/openpyxl) | MIT | Excel export |

### Async / infrastructure / messaging

| Project | License | Purpose |
|---------|---------|---------|
| [aiofiles](https://github.com/Tinche/aiofiles) | Apache-2.0 | Async file I/O |
| [aiohttp](https://github.com/aio-libs/aiohttp) | Apache-2.0 | Async HTTP client/server |
| [asyncio-throttle](https://github.com/hallazzang/asyncio-throttle) | MIT | Async rate limiting |
| [APScheduler](https://github.com/agronholm/apscheduler) | MIT | In-process scheduling |
| [Celery](https://github.com/celery/celery) | BSD-3-Clause | Optional distributed task queue |
| [redis-py](https://github.com/redis/redis-py) | MIT | Redis client |

### Storage / security / monitoring

| Project | License | Purpose |
|---------|---------|---------|
| [psycopg (v3)](https://github.com/psycopg/psycopg) | LGPL-3.0 | PostgreSQL driver |
| [cryptography](https://github.com/pyca/cryptography) | Apache-2.0 / BSD-3-Clause (dual) | Crypto primitives |
| [prometheus-client](https://github.com/prometheus/client_python) | Apache-2.0 | Metrics export |
| [psutil](https://github.com/giampaolo/psutil) | BSD-3-Clause | Process / system stats |

### Misc utilities

| Project | License | Purpose |
|---------|---------|---------|
| [requests](https://github.com/psf/requests) | Apache-2.0 | HTTP client |
| [python-dateutil](https://github.com/dateutil/dateutil) | Apache-2.0 / BSD-3-Clause (dual) | Datetime parsing |
| [python-dotenv](https://github.com/theskumar/python-dotenv) | BSD-3-Clause | `.env` loader |

---

## Frontend (JavaScript, runtime)

| Project | License | Purpose |
|---------|---------|---------|
| [React](https://github.com/facebook/react) | MIT | UI framework |
| [React DOM](https://github.com/facebook/react) | MIT | DOM renderer |
| [Ant Design](https://github.com/ant-design/ant-design) | MIT | Component library |
| [@ant-design/icons](https://github.com/ant-design/ant-design-icons) | MIT | Icon set |
| [Recharts](https://github.com/recharts/recharts) | MIT | Charts |
| [Lightweight Charts](https://github.com/tradingview/lightweight-charts) | Apache-2.0 | TradingView chart engine |
| [axios](https://github.com/axios/axios) | MIT | HTTP client |
| [dayjs](https://github.com/iamkun/dayjs) | MIT | Date utilities |
| [jsPDF](https://github.com/parallax/jsPDF) | MIT | PDF generation in browser |

> Build tooling (Create React App, Babel, webpack, ESLint, Jest, Playwright,
> etc.) is omitted by design. License texts ship inside the corresponding
> packages under `node_modules/<package>/LICENSE`.

---

## Notes on copyleft / weak-copyleft components

- **psycopg** is LGPL-3.0. Linking dynamically (the only mode this project
  uses) does **not** trigger the LGPL share-alike provision; modifying the
  driver itself would.
- **cryptography** is dual-licensed Apache-2.0 / BSD-3-Clause; either license
  satisfies redistribution.

If you redistribute a derived work that statically links any of the above,
verify the terms of the relevant license against your distribution model.

---

## Updating this file

When `requirements.txt` or `frontend/package.json` add a new runtime
dependency, append it here together with its license. License classifications
were verified against the upstream `LICENSE` file or PyPI / npm metadata
at the time of writing; check the upstream source for the authoritative
text.
