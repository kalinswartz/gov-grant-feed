# Gov Grant Feed

A self-hosted daily feed that scrapes government grant/proposal
opportunities from Grants.gov, SAM.gov, and FMCSA and displays
them in a searchable, filterable UI.

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Edit `.env`:
```env
PORT=3000

# Cron schedule (default = midnight every day)
CRON_SCHEDULE=0 0 * * *

# For testing every minute use:
# CRON_SCHEDULE=*/1 * * * *
```

### 3. Start the server
```bash
# Production
npm start

# Development (auto-restart)
npm run dev
```

### 4. Open the app
```
http://localhost:3000
```

---

## Cron Schedule Reference

| Schedule          | Expression      |
|-------------------|-----------------|
| Every minute      | `*/1 * * * *`   |
| Every 5 minutes   | `*/5 * * * *`   |
| Every hour        | `0 * * * *`     |
| Midnight daily    | `0 0 * * *`     |
| 6 AM daily        | `0 6 * * *`     |
| Mon–Fri at 8 AM   | `0 8 * * 1-5`   |

---

## API Endpoints

| Method | Endpoint                  | Description                        |
|--------|---------------------------|------------------------------------|
| GET    | `/api/opportunities`      | List all opportunities (paginated) |
| GET    | `/api/opportunities/:id`  | Get a single opportunity           |
| GET    | `/api/sources`            | Source names + counts              |
| GET    | `/api/stats`              | Summary stats                      |
| GET    | `/api/logs`               | Fetch run history                  |
| POST   | `/api/refresh`            | Manually trigger a scrape          |

### Query Parameters for `/api/opportunities`
| Param    | Default      | Description                          |
|----------|--------------|--------------------------------------|
| `page`   | `1`          | Page number                          |
| `limit`  | `20`         | Results per page (max 100)           |
| `search` | —            | Text search (title/summary/agency)   |
| `source` | —            | Filter by source name                |
| `sort`   | `fetched_at` | `fetched_at` or `close_date`         |

---

## Adding More Sources

Create a new file in `scrapers/`, for example `scrapers/dot_gov.js`:

```js
const axios = require("axios");

async function fetchDOT() {
  const results = [];
  // ... your scraping logic ...
  return results; // array of opportunity objects
}

module.exports = { fetchDOT };
```

Then register it in `scrapers/index.js`:

```js
const { fetchDOT } = require("./dot_gov");

const sources = [
  { name: "Grants.gov",  fn: () => fetchGrantsGov() },
  { name: "FMCSA",       fn: () => fetchFMCSA() },
  { name: "DOT",         fn: () => fetchDOT() },   // <-- add here
];
```

Each result object should have this shape:

```js
{
  source:      "DOT",
  external_id: "unique-string-per-source",
  title:       "Grant Title",
  summary:     "Short description...",
  url:         "https://...",
  posted_date: "2024-01-15",   // or null
  close_date:  "2024-03-01",   // or null
  agency:      "Dept. of Transportation",
  category:    "Grant",
  award_floor: "10000",        // string or null
  award_ceil:  "500000",       // string or null
}
```

---

## Notes


- **FMCSA scraping** uses HTML parsing and may break if DOT
  redesigns their pages. The scraper falls back gracefully.
- The SQLite database (`grants.db`) is created automatically
  in the project root on first run.
- All data is upserted — re-running the scraper won't
  create duplicates.