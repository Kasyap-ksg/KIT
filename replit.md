# KIT - Ksquare Intelligent Testing

## Overview

KIT is an AI-powered test management platform for QA engineers. It provides a hierarchical structure for organizing testing efforts: Organization → Domains → Projects → Test Suites → Test Cases. The platform integrates with JIRA for project management and offers an AI chat assistant for generating test scenarios and test cases. Key capabilities include analytics dashboards, cross-entity search, and an advanced AI-driven Design Validation feature that compares Figma designs with live application screenshots. The project aims to streamline QA processes, enhance collaboration, and automate test generation and validation, ultimately improving software quality and accelerating delivery.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Dual Backend Architecture

The application uses a hybrid backend:
-   **Node.js/Express**: Acts as the entry point, handling static file serving, Vite dev server, and proxying API requests to the Python backend. It also manages Replit integration modules.
-   **Python/FastAPI**: The primary API backend for all business logic, including domains, projects, test suites, test cases, AI chat, search, analytics, and design validation.

### Frontend Architecture

-   **React** with **TypeScript**, bundled by **Vite**.
-   **Routing**: `wouter`.
-   **State Management**: `@tanstack/react-query` for server state.
-   **UI Components**: `shadcn/ui` (New York style) built on Radix UI.
-   **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode).
-   **Charts**: `recharts` for data visualization.

### Key Features and Implementations

-   **Test Management**: Hierarchical organization of test entities (Domains, Projects, Applications, Test Suites, Test Cases).
-   **AI Chat Assistant**: Interactive AI for generating test scenarios and test cases within test suites, powered by OpenAI API.
-   **Design Validation**:
    -   Compares Figma designs with live application screenshots using GPT-4o vision.
    -   **Dual journey mode**: "Scripted Journey" (deterministic — user defines exact steps) or "AI-Driven" (auto-generates steps from prototype).
    -   Scripted Journey: User defines explicit steps (fill, click, submit, scroll, wait, selectRadio, selectDropdown, searchAndSelect) with capture points for Figma comparison. Steps are saved per-validation and persist.
    -   AI-Driven (Prototype-to-Steps): AI analyzes ALL Figma prototype screens at once, understands the complete journey, auto-generates Playwright steps, and executes them deterministically. Generated steps are saved back for reuse. Falls back to this mode when no scripted steps are defined.
    -   Shadow DOM support: JavaScript-based fallbacks for fill and selectRadio actions that traverse shadow DOM trees (for Salesforce Lightning/LWC pages).
    -   Utilizes Playwright for screenshot capture and app interaction.
    -   Performs deep DOM extraction and Figma design token extraction for comprehensive comparison.
    -   Employs a hybrid GPT-4.1 + GPT-5 pipeline for structural and UX assessment, with GPT-5 acting as an LLM-as-Judge to verify findings.
    -   Generates standalone HTML/CSS reports with side-by-side comparisons, color palettes, typography, and component analysis.
    -   Includes video recording of validation journeys for both Figma and the app.
-   **JIRA Integration**: Comprehensive integration for fetching projects, epics, stories, boards, and sprints. Enables linking JIRA stories to test cases.
-   **JIRA Story to Test Pipeline**: An automated pipeline to generate, approve, and execute tests from JIRA stories. It includes:
    -   BDD Gherkin generation (multi-scenario: 4-6 scenarios covering happy path, validation, edge cases).
    -   DOM-aware Gherkin: crawls the target app's DOM (including clicking radio buttons to reveal hidden sections) and uses actual page field names/labels.
    -   Gherkin-to-actions: direct regex parser (no GPT) converts Gherkin steps to browser actions (fill, click, selectRadio, assertVisible, goto, wait).
    -   Per-scenario independent execution: each scenario runs with a fresh page navigation to prevent state contamination.
    -   Live Browser Crawling: Python async Playwright with cursor injection (blue SVG cursor, click ring effects, action labels). Video recording for results, live screenshots streamed via SSE for real-time browser view during execution (cleaned up after SSE stream closes).
    -   Live view UI: Split-pane layout — main area shows live browser screenshots updating in real-time; sidebar shows execution log with progress/scenario events. No screenshots saved to results tab — video-only in reports.
    -   Playwright code generation: Direct conversion from Gherkin to TypeScript Playwright test code (no GPT). Generates proper `test.describe` with per-scenario tests, try/catch click fallbacks, proper string escaping, and assertions.
    -   Automated self-healing for failed selectors using GPT-4o.
    -   Batch execution: `/api/test-execution/batch-execute` endpoint runs multiple test cases sequentially.
    -   Test case title auto-sync: `get-or-create` endpoint auto-updates title from JIRA story summary.
    -   Execution lock: prevents concurrent runs on the same test case. Events cleaned up after SSE stream closes.
-   **Search**: SQL `ILIKE`-based search across all entity types.
-   **Database**: PostgreSQL is used with two ORM layers: Drizzle ORM (TypeScript) for Replit chat integration and SQLAlchemy (Python) for core business models.
-   **Replit Integrations**: Modules for chat, audio, image generation, and batch processing (Node.js side).

### Data Model Hierarchy

```
Domain
  └── Project
        ├── Application
        │     └── DesignValidation
        │           └── ValidationPage
        └── TestSuite
              ├── TestCase
              └── ChatMessage
```

## External Dependencies

-   **PostgreSQL**: Primary database.
-   **OpenAI API**: For AI-powered test case generation and design validation (GPT-4o, GPT-4.1, GPT-5 models).
-   **JIRA Cloud API**: For integration with JIRA projects, boards, sprints, and issues.
-   **Figma API**: Used by the Design Validation feature to fetch design files and frame images.
-   **Python Packages**: FastAPI, uvicorn, SQLAlchemy, OpenAI Python SDK, pydantic, httpx, Playwright.
-   **Node.js Packages**: Express 5, Drizzle ORM, Vite, React, shadcn/ui, TanStack Query, recharts, wouter, http-proxy-middleware.