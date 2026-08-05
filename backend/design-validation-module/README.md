# Design Validation Module — KIT (Ksquare Intelligent Testing)

Self-contained module for AI-powered design validation that crawls Figma prototypes, navigates live apps, compares screenshots, and generates granular conformance reports.

---

## Architecture Overview

```
Figma URL + App URL
       │
       ▼
┌──────────────────────────────────────────────┐
│            SSE Streaming Pipeline             │
│                                               │
│  1. figma_crawl   → Playwright/API crawl     │
│  2. figma_tokens  → Extract design tokens    │
│  3. app_journey   → Navigate app (gpt-4o)    │
│  4. journey_comparison → Build conformance   │
│  5. pairing       → Match screen pairs       │
│  6. analysis      → Structural (gpt-4.1)     │
│                   → UX Analysis (gpt-5)      │
│  7. judge         → LLM Judge (gpt-5)        │
│  8. ux_flow       → Cross-screen (gpt-5)     │
│  9. done          → Final scores             │
└──────────────────────────────────────────────┘
       │
       ▼
 5 Fidelity Dimensions:
   Visual │ Layout │ Component │ Token/Theme │ UX Flow
```

## AI Model Map

| Model | Purpose | Where |
|-------|---------|-------|
| gpt-4o | Screen Navigation — generates Playwright actions to make app match each prototype screen | `services/journey_executor.py` → `analyze_screen_navigation()` |
| gpt-4.1 | Structural Comparison — deep DOM/CSS diff per screen (colors, typography, spacing, icons, images, components) | `routes/design_validation.py` → full validation loop |
| gpt-5 | UX + Visual Analysis — holistic UX assessment with fidelity scores across all 5 dimensions | `routes/design_validation.py` → full validation loop |
| gpt-5 | LLM Judge — independent validator that re-evaluates findings, filters false positives, adjusts scores | `services/journey_executor.py` → `run_judge_validation()` |
| gpt-5 | Cross-screen UX Flow — analyzes ALL screen pairs together for navigation consistency | `routes/design_validation.py` → full validation loop |
| gpt-4o | Manual single-page compare — used by the `/compare` endpoint (not part of full validation) | `routes/design_validation.py` → `compare_page()` |

## File Structure

```
design-validation-module/
├── README.md                              ← This file
├── requirements.txt                       ← Python dependencies
├── sql/
│   └── schema.sql                         ← Database tables (run once)
├── backend/
│   ├── models/
│   │   ├── __init__.py
│   │   └── design_validation.py           ← SQLAlchemy models
│   ├── routes/
│   │   ├── __init__.py
│   │   └── design_validation.py           ← All API endpoints (2394 lines)
│   └── services/
│       ├── __init__.py
│       └── journey_executor.py            ← Playwright journey engine (971 lines)
└── frontend/
    ├── pages/
    │   ├── design-validation.tsx           ← List page (296 lines)
    │   └── design-validation-detail.tsx    ← Detail page (2679 lines)
    ├── components/
    │   └── status-badge.tsx               ← Shared status badge component
    ├── types/
    │   └── design-validation.ts           ← All TypeScript interfaces
    ├── lib/
    │   └── queryClient.ts                 ← API request helper + React Query config
    └── hooks/
        └── (use your existing useToast hook)
```

---

## Integration Steps

### Step 1: Database Setup

Run the SQL schema against your PostgreSQL database:

```bash
psql $DATABASE_URL -f design-validation-module/sql/schema.sql
```

If you don't have an `applications` table, edit `schema.sql` line 4:
```sql
-- Change this:
application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
-- To this:
application_id UUID,
```

### Step 2: Python Dependencies

```bash
pip install -r design-validation-module/requirements.txt
playwright install chromium
```

### Step 3: Backend — Copy Files

```bash
# Copy to your FastAPI project's source directory
cp backend/models/design_validation.py  YOUR_PROJECT/models/
cp backend/services/journey_executor.py YOUR_PROJECT/services/
cp backend/routes/design_validation.py  YOUR_PROJECT/routes/
```

### Step 4: Backend — Fix Imports (3 files)

**`models/design_validation.py`** — line 15:
```python
# Change:
from server_py.database import Base
# To your project's Base:
from your_project.database import Base
```

**`routes/design_validation.py`** — lines 21-24:
```python
# Change:
from server_py.database import get_db
from server_py.models.design_validation import DesignValidation, ValidationPage
from server_py.models.application import Application
from server_py.services.journey_executor import navigate_app_to_screen, build_journey_report, run_judge_validation, SYNTHETIC_DATA, _show_cursor_at, _show_click_effect, _hide_cursor, _take_step_screenshot

# To:
from your_project.database import get_db
from your_project.models.design_validation import DesignValidation, ValidationPage
from your_project.models.application import Application  # Remove this line if you don't have an Application model
from your_project.services.journey_executor import navigate_app_to_screen, build_journey_report, run_judge_validation, SYNTHETIC_DATA, _show_cursor_at, _show_click_effect, _hide_cursor, _take_step_screenshot
```

If you **don't have an Application model**, also:
1. Remove `from your_project.models.application import Application` (line 23)
2. In `serialize_validation()` (line 96-118), remove the `Application` query block:
   ```python
   # Remove these lines (98-102):
   app_name = None
   if v.application_id and db:
       app = db.query(Application).filter(Application.id == v.application_id).first()
       if app:
           app_name = app.name
   # Replace with:
   app_name = None
   ```
3. In `create_validation()` (line 153-169), remove the Application check:
   ```python
   # Remove lines 155-159 (the application_id validation block)
   ```

### Step 5: Backend — Register Router

In your FastAPI `main.py`:

```python
from your_project.routes.design_validation import router as design_validation_router

app.include_router(design_validation_router)
```

### Step 6: Backend — Static Files for Uploads

The module saves screenshots and videos to an `uploads/` directory. Mount it:

```python
from fastapi.staticfiles import StaticFiles
import os

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
```

### Step 7: Backend — Environment Variables

Set these environment variables:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1  # or your proxy
```

### Step 8: Backend — Auto-Migration (Optional)

Add to your FastAPI startup event to handle schema upgrades:

```python
@app.on_event("startup")
def startup():
    from sqlalchemy import inspect, text
    from your_project.database import engine, Base

    Base.metadata.create_all(bind=engine)

    # Ensure video columns exist (migration for older installs)
    with engine.connect() as conn:
        inspector = inspect(engine)
        if "design_validations" in inspector.get_table_names():
            cols = [c["name"] for c in inspector.get_columns("design_validations")]
            if "figma_video_path" not in cols:
                conn.execute(text("ALTER TABLE design_validations ADD COLUMN figma_video_path VARCHAR(500) DEFAULT ''"))
            if "app_video_path" not in cols:
                conn.execute(text("ALTER TABLE design_validations ADD COLUMN app_video_path VARCHAR(500) DEFAULT ''"))
            conn.commit()
```

### Step 9: Frontend — Copy Files

```bash
cp frontend/pages/design-validation.tsx      YOUR_FRONTEND/src/pages/
cp frontend/pages/design-validation-detail.tsx YOUR_FRONTEND/src/pages/
cp frontend/components/status-badge.tsx       YOUR_FRONTEND/src/components/
```

### Step 10: Frontend — Merge Types

Copy the types from `frontend/types/design-validation.ts` into your project's type definitions file. If you already have a `types/index.ts`, append these interfaces there.

### Step 11: Frontend — Fix Imports

Both page files use these import aliases. Map them to your project:

| Module Import | What It Is | Your Project Equivalent |
|---|---|---|
| `@/components/ui/*` | Shadcn UI components | Your Shadcn setup |
| `@/components/status-badge` | Status badge (included) | Copy and import from your components dir |
| `@/components/empty-state` | Empty state component | Create or remove (only used in list page) |
| `@/hooks/use-toast` | Toast notification hook | Your toast/notification system |
| `@/lib/queryClient` | `apiRequest` + `queryClient` | Your API helper (included as reference) |
| `@/types` | TypeScript interfaces | Your types file |

### Step 12: Frontend — Add Routes

In your router (e.g., `App.tsx`):

```tsx
import DesignValidationPage from "./pages/design-validation";
import DesignValidationDetailPage from "./pages/design-validation-detail";

// Add these routes:
<Route path="/design-validation" component={DesignValidationPage} />
<Route path="/design-validation/:id" component={DesignValidationDetailPage} />
```

### Step 13: Frontend — Add Sidebar Link

Add a navigation link to your sidebar:

```tsx
import { Palette } from "lucide-react";

<Link href="/design-validation">
  <Palette className="h-4 w-4" />
  Design Validation
</Link>
```

---

## API Endpoints Reference

All endpoints use prefix `/api/design-validations`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all validations |
| GET | `/:id` | Get single validation with pages |
| POST | `/` | Create new validation |
| PATCH | `/:id` | Update validation name/URLs |
| DELETE | `/:id` | Delete validation and all pages |
| POST | `/:id/pages` | Add a page manually |
| DELETE | `/:id/pages/:pageId` | Delete a page |
| POST | `/:id/pages/:pageId/upload-figma` | Upload Figma screenshot |
| POST | `/:id/pages/:pageId/upload-app` | Upload app screenshot |
| POST | `/:id/pages/:pageId/compare` | Run single-page AI comparison (SSE) |
| POST | `/:id/pages/:pageId/capture-app` | Capture app screenshot via Playwright |
| POST | `/figma/frames` | Fetch Figma frame list via API |
| POST | `/:id/import-figma` | Import Figma frames as pages |
| POST | `/:id/run-full-validation` | Run full prototype journey validation (SSE) |
| GET | `/:id/report` | Download HTML report |

## SSE Event Format

The full validation endpoint (`/run-full-validation`) streams Server-Sent Events:

```
data: {"step": "...", "phase": "figma_crawl"}
data: {"figma_live": {"image": "/uploads/figma/xxx.png", "step_index": 0, "name": "Screen 1"}}
data: {"app_live": {"image": "/uploads/app_live/xxx.png", "step_index": 0, "name": "Filling form..."}}
data: {"journey_report": {...}, "phase": "journey_comparison"}
data: {"content": "...", "analysis_layer": "structural"}
data: {"content": "...", "analysis_layer": "ux"}
data: {"screen_done": true, "score": 72, "fidelity_scores": {...}}
data: {"ux_flow_done": true, "ux_flow_result": {...}}
data: {"done": true, "overall_score": 72}
```

## Synthetic Test Data

The journey executor fills forms with this data:

```python
{
    "firstName": "Akhleaditya",
    "lastName": "M",
    "email": "sample@sample.com",
    "phone": "1234567890",
    "jobTitle": "Solution Lead",
    "company": "Sam's Hospitality LLC",
    "property": "The Sam Houston",
    "comments": "Testing journey validation",
}
```

To customize, edit `SYNTHETIC_DATA` in `services/journey_executor.py`.

---

## Troubleshooting

### Images not loading
- Ensure `uploads/` directory is mounted as static files at `/uploads`
- Check that `UPLOAD_DIR` in both `routes/design_validation.py` and `services/journey_executor.py` points to the correct absolute path
- Both files compute it as: `os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")`
- If your directory structure is different, update this path in BOTH files

### Playwright errors
- Run `playwright install chromium` after pip install
- On Linux, you may need system deps: `playwright install-deps chromium`

### OpenAI errors
- Verify `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` are set
- The module uses models: `gpt-4o`, `gpt-4.1`, `gpt-5` — ensure your API key has access

### Fidelity dimension boxes not clickable
- This is controlled by the `expandedDim` state in `design-validation-detail.tsx`
- The boxes use `onClick={() => setExpandedDim(isExpanded ? null : dim.key)}`
- If clicks don't work, check for CSS `pointer-events: none` or z-index issues in your layout
- The `FidelityDashboard` component is defined inline around line 1780

### Scores different between runs
- Each AI run produces different scores — this is expected behavior
- The per-dimension scores (e.g., 90/85/85/90/75) are per-screen scores inside `findings`
- The card-level score (e.g., 72%) is the judge-adjusted overall score
- These are intentionally different: per-dimension vs overall weighted average

### Frontend not connecting to backend
- Ensure your frontend dev server proxies `/api/**` to your FastAPI server
- Example Vite proxy config:
  ```ts
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
    }
  }
  ```

---

## Required Shadcn UI Components

Install these if you don't already have them:

```bash
npx shadcn-ui@latest add card button input label skeleton badge progress
npx shadcn-ui@latest add checkbox dialog separator tabs accordion
```

## Required npm Packages

```bash
npm install @tanstack/react-query wouter lucide-react
npm install @hookform/resolvers zod react-hook-form  # if using forms
```
