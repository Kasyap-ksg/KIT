# KIT — Windows Local Development & Setup Process Document

This document provides a step-by-step process for setting up, configuring, and running the **KIT (Ksquare Intelligent Testing)** enterprise AI QA platform on a Windows workstation.

KIT is a hybrid-architecture application containing:
1. **React + TypeScript + Vite** frontend.
2. **Node.js + Express BFF (Backend-For-Frontend)** running on port `5000` (handles API routing, static page serving, and proxies to the AI backend).
3. **Python + FastAPI AI Engine** running on port `8000` (manages domains, projects, test cases, AI-driven chat, and Design Validation).
4. **PostgreSQL** database for persistence.

---

## 1. Prerequisites (Windows Installation)

Ensure the following tools are installed on your Windows machine:

| Tool | Recommended Version | Windows Setup Instructions | Verification Command |
| :--- | :--- | :--- | :--- |
| **Node.js** | `20.x LTS` | Download and run the Windows Installer (`.msi`) from the [Node.js Official Website](https://nodejs.org/). | `node -v` |
| **npm** | `10.x` | Installed automatically with Node.js. | `npm -v` |
| **Python** | `3.11+` | Download from the [Python Official Website](https://www.python.org/). **CRITICAL**: Check the box **"Add Python to PATH"** during installation. | `python --version` |
| **uv** *(Recommended)* | Latest | Fast Python package installer. Run in PowerShell: <br>`powershell -ExecutionPolicy Bypass -c "iwr https://astral.sh/uv/install.ps1 | iex"` | `uv --version` |
| **PostgreSQL** | `14+` | Download and install from [EnterpriseDB](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads). Ensure the local PostgreSQL service is running. | Run `pg_isready` or check Services |
| **Git** | Latest | Download and run the installer from the [Git Website](https://git-scm.com/). | `git --version` |

---

## 2. Environment Configuration

The application reads configuration from a `.env` file at the root of the `kit-app` directory.

1. Locate the file: [\.env](file:///c:/Users/KasyapRangaCharyulu/Projects/kit-app/kit-app/.env)
2. Ensure the following critical configuration variables are set:

```ini
# --- Database ---
# Replace with your credentials or keep the remote database configuration if desired
DATABASE_URL=postgresql://devuser:Ksquare%40devuser123@34.47.214.73:5432/postgres

# --- Web server (Express BFF) ---
PORT=5000
NODE_ENV=development
SESSION_SECRET=kit-local-secret-k5q2r8x1m9p3n7v4

# --- Python AI backend ---
PY_API_PORT=8000
PY_API_URL=http://localhost:8000

# --- OpenAI (Required for AI Agents & Design Validation) ---
OPENAI_API_KEY=sk-svcacct-... # Ensure your valid key is here

# --- Uploads ---
UPLOAD_DIR=./uploads
```

> [!NOTE]
> The current environment is configured to connect to a remote PostgreSQL database on `34.47.214.73`. If you prefer a local database, install PostgreSQL locally and set `DATABASE_URL=postgresql://postgres:password@localhost:5432/kit` after creating a local database named `kit`.

---

## 3. Installation Steps (Windows)

Open **PowerShell** (or Git Bash) inside the `c:\Users\KasyapRangaCharyulu\Projects\kit-app\kit-app` directory and perform the following:

### Step A: Install Node.js Dependencies
Install all package dependencies for the React frontend and Express BFF:
```powershell
npm install
```

### Step B: Install Python Backend Dependencies
We recommend using **`uv`** as it is extremely fast and manages dependencies cleanly on Windows.

**Option 1: Using `uv` (Recommended)**
```powershell
uv sync
```
*This command reads `pyproject.toml` / `uv.lock` and automatically configures a virtual environment in `.venv/`.*

**Option 2: Using standard Python Virtual Environment (`venv`)**
If you choose not to use `uv`, run:
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
```
*(Note: Because the dependencies specify `psycopg2-binary`, you do not need PostgreSQL compilation headers installed on Windows).*

### Step C: Install Playwright Browsers
Playwright is used for screenshot comparison and browser test automation (Design Validation and Gherkin-to-actions pipelines).

1. Install Playwright browser binaries for Node:
   ```powershell
   npx playwright install chromium
   ```
2. Install Playwright browser binaries for the Python runtime:
   ```powershell
   # If using uv:
   uv run playwright install chromium
   
   # If using standard venv:
   .venv\Scripts\playwright install chromium
   ```

---

## 4. Database Setup & Migrations

Deploy the Drizzle schema changes directly to your database:
```powershell
npm run db:push
```
*If this is a fresh database instance and it prompts with a warning about destructive changes, you can force the push using:*
```powershell
npm run db:push -- --force
```

---

## 5. Starting the Stack on Windows

Since standard Unix `start.sh` files do not run natively in CMD/PowerShell without Git Bash, you have two options to run the stack on Windows:

### Option A: Using Two Terminals (PowerShell)

**Terminal 1 — Start the Python FastAPI AI Backend**
```powershell
# Activate venv and start uvicorn
.venv\Scripts\Activate.ps1
python -m uvicorn server_py.main:app --host 0.0.0.0 --port 8000
```
*(Alternative if using `uv`):*
```powershell
uv run uvicorn server_py.main:app --host 0.0.0.0 --port 8000
```

**Terminal 2 — Start the Node.js Express BFF & Vite Dev Server**
```powershell
npm run dev
```

---

### Option B: Using Git Bash on Windows

If you have Git Bash installed, you can execute the pre-configured bash script directly:
```bash
./start.sh
```
This script runs both servers concurrently and traps signals to shut them down together when you press `Ctrl+C`.

---

## 6. Verifying the Setup

Once both processes are running, verify your deployment:

1. **Web App Frontend**: Open [http://localhost:5000](http://localhost:5000) in your web browser. You should see the KIT Dashboard/App login.
2. **AI API documentation (FastAPI Swagger)**: Access the API documentation at [http://localhost:8000/docs](http://localhost:8000/docs). This confirms the Python FastAPI backend is healthy and responding.
3. **OpenAI Connectivity**: Access any AI-driven feature (e.g. Chat Assistant). If it succeeds, your `OPENAI_API_KEY` is fully verified.

---

## 7. Common Windows Troubleshooting

### 1. Script Execution Policy Error in PowerShell
If activating the virtual environment throws a script permission error:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.venv\Scripts\Activate.ps1
```

### 2. Port `5000` or `8000` already in use
To find and kill processes running on these ports on Windows:
```powershell
# Find Process ID (PID)
Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess
Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess

# Kill the process
Stop-Process -Id <PID> -Force
```

### 3. Missing `psycopg2` DLL execution errors
If Python throws an error import issue with `psycopg2`, make sure you installed standard dependencies using `uv sync` or `pip install -e .` which correctly fetches `psycopg2-binary`. Do not install `psycopg2` (without `-binary`) as it requires compilation.

### 4. Playwright Browser Executable Not Found
Ensure you ran **both** Playwright installation steps: `npx playwright install chromium` **and** the Python-side installation `.venv\Scripts\playwright install chromium`. The app calls Playwright from both environments.
