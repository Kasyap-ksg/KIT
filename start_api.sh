#!/bin/bash
cd backend
exec python -m uvicorn server_py.main:app --host 0.0.0.0 --port 8000
