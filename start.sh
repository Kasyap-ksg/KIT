#!/bin/bash
cd backend
python -m uvicorn server_py.main:app --host 0.0.0.0 --port 8000 &
PYTHON_PID=$!
NODE_ENV=development npx tsx server/index.ts &
NODE_PID=$!
trap "kill $PYTHON_PID $NODE_PID 2>/dev/null" EXIT
wait