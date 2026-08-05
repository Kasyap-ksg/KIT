#!/usr/bin/env bash
# One-shot local setup for KIT.
# Usage: ./scripts/local-setup.sh
set -euo pipefail

echo "==> Checking prerequisites"
command -v node >/dev/null  || { echo "Node.js 20+ required"; exit 1; }
command -v python3 >/dev/null || { echo "Python 3.11+ required"; exit 1; }
command -v psql >/dev/null  || echo "WARNING: psql not found — make sure Postgres is reachable via DATABASE_URL"

if [ ! -f .env ]; then
  echo "==> Creating .env from template"
  cp .env.example .env
  echo "    Edit .env to set DATABASE_URL, OPENAI_API_KEY, SESSION_SECRET"
fi

echo "==> Installing Node dependencies"
npm install

echo "==> Installing Python dependencies"
if command -v uv >/dev/null; then
  uv sync
else
  python3 -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install -e .
fi

echo "==> Installing Playwright browser (chromium)"
npx playwright install chromium || true

echo "==> Pushing database schema"
npm run db:push || npm run db:push -- --force || true

echo
echo "Setup complete. Start the app with:"
echo "  ./start.sh"
