# KIT — Local Development Guide

KIT (Ksquare Intelligent Testing) is an enterprise AI QA platform with a
React + Vite frontend, an Express/Vite dev server, a Python FastAPI backend
for the AI agents, and PostgreSQL for storage.

This guide gets the whole stack running on your machine.

---

## 1. Prerequisites

Install these once:

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.x LTS | `node -v` |
| npm | 10.x | ships with Node |
| Python | 3.11+ | `python3 --version` |
| PostgreSQL | 14+ | local server or Docker |
| uv (recommended) | latest | `pip install uv` — fast Python deps |
| Playwright browsers | — | installed via a command below |

macOS quick install:
```bash
brew install node@20 python@3.11 postgresql@15
brew services start postgresql@15
pip install uv
```

Ubuntu quick install:
```bash
sudo apt install -y nodejs npm python3.11 python3.11-venv postgresql
sudo systemctl start postgresql
pip install uv
```

---

## 2. Get the code

```bash
tar -xzf kit-app.tar.gz
cd kit-app
```

---

## 3. Create the database

```bash
createdb kit
# or, with psql:
# psql -U postgres -c "CREATE DATABASE kit;"
```

---

## 4. Configure environment

Copy the template and fill in values:

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

- `DATABASE_URL` — e.g. `postgresql://postgres:postgres@localhost:5432/kit`
- `OPENAI_API_KEY` — your OpenAI key (used by the AI agents)
- `SESSION_SECRET` — any long random string
- `JIRA_API_TOKEN` — only if you want JIRA sync; safe to leave blank otherwise

---

## 5. Install dependencies

**Node:**
```bash
npm install
```

**Python (with uv — recommended):**
```bash
uv sync
```

Or with plain pip:
```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e .
```

**Playwright browsers (needed for live execution / design validation):**
```bash
npx playwright install chromium
# Python side too:
uv run playwright install chromium     # or: python -m playwright install chromium
```

---

## 6. Run database migrations / push schema

```bash
npm run db:push
```

If it warns about destructive changes on a fresh DB:
```bash
npm run db:push -- --force
```

(Optional) Seed demo data:
```bash
# tarball includes hilton-seed-data/ — see scripts/ for any seed runner you wire up
```

---

## 7. Start the app

The included `start.sh` boots both the FastAPI agent backend (port 8000)
and the Express + Vite dev server (port 5000) together:

```bash
./start.sh
```

Or run them in separate terminals:

```bash
# Terminal 1 — Python AI backend
./start_api.sh

# Terminal 2 — Web app (frontend + Express BFF)
npm run dev
```

Open http://localhost:5000

---

## 8. Project layout

```
kit-app/
├── client/              React + Vite frontend
│   └── src/
│       ├── pages/       route-level views
│       ├── components/  shared UI (shadcn-based)
│       └── lib/         queryClient, helpers
├── server/              Express BFF (TypeScript)
│   ├── routes.ts        proxies /api/* to FastAPI where needed
│   └── vite.ts          dev server integration
├── server_py/           Python FastAPI — the AI agents
│   ├── main.py
│   ├── models/          SQLAlchemy models
│   ├── routes/          REST endpoints
│   └── services/        agent implementations
│       ├── triage.py
│       ├── risk_engine.py
│       ├── journey_executor.py
│       └── healing*.py
├── shared/              schema shared between TS and Python
├── scripts/             dev/ops scripts
├── attached_assets/     uploaded assets, screenshots, design refs
├── uploads/             runtime upload dir (created on first run)
├── package.json
├── pyproject.toml
└── start.sh
```

---

## 9. Common commands

| What | Command |
|---|---|
| Start everything | `./start.sh` |
| Frontend + Express only | `npm run dev` |
| Python backend only | `./start_api.sh` |
| Type-check TS | `npm run check` |
| Push DB schema | `npm run db:push` |
| Production build | `npm run build && npm start` |

---

## 10. Troubleshooting

**Port 5000 / 8000 already in use** — kill the stragglers:
```bash
lsof -ti:5000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

**`psycopg2` install fails** — install PG headers first:
```bash
# macOS
brew install libpq && brew link --force libpq
# Ubuntu
sudo apt install -y libpq-dev python3.11-dev
```

**Playwright errors about missing browser** — re-run:
```bash
npx playwright install --with-deps chromium
```

**`OPENAI_API_KEY` errors** — AI features (triage, risk, design validation,
test generation) need a key. The rest of the app runs without one.

**DB connection refused** — confirm Postgres is running and the `DATABASE_URL`
matches your local credentials.

---

## 11. Where to start hacking

- **Add an AI agent:** drop a file in `server_py/services/`, expose it from
  `server_py/routes/`. Keep IO Pydantic-typed.
- **Add a page:** create `client/src/pages/<name>.tsx` and register it in
  `client/src/App.tsx` (uses `wouter`).
- **Schema change:** edit `shared/schema.ts` and the matching SQLAlchemy
  model in `server_py/models/`, then `npm run db:push`.

See `replit.md` for higher-level architectural notes.
