"""AI failure triage: produce a structured root-cause hypothesis for a failed
TestRun. Uses OpenAI gpt-4o with JSON-schema-constrained output.

Categories:
  selector_drift  - locator no longer matches an element on the page
  timing          - timeouts, race conditions, slow loads
  assertion      - explicit assertion mismatch (expected vs actual)
  network        - 4xx/5xx/connection refused/CORS/auth failures
  app_bug         - the app itself misbehaved (regression)
  env             - environment/config issue (missing var, fixture, browser launch)
  flake           - intermittent / non-deterministic failure
  unknown         - cannot determine

Suggested actions:
  self_heal | retry | file_bug | update_test | investigate
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from server_py.models.test_run import TestRun, TestRunScenario
from server_py.models.test_run_triage import TestRunTriage
from server_py.models.test_suite import TestCase

logger = logging.getLogger(__name__)


VALID_CATEGORIES = {
    "selector_drift", "timing", "assertion", "network",
    "app_bug", "env", "flake", "unknown",
}
VALID_ACTIONS = {"self_heal", "retry", "file_bug", "update_test", "investigate"}

TRIAGE_MODEL = "gpt-4o"

SYSTEM_PROMPT = """You are KIT's senior test failure triage analyst.
Given a Playwright execution log + Gherkin scenario, classify the most likely
root cause and explain it concisely. You must respond with strict JSON only.

Allowed categories (pick exactly one):
  selector_drift, timing, assertion, network, app_bug, env, flake, unknown

Allowed suggested_action (pick exactly one):
  self_heal      -> a locator likely just needs healing (selector_drift)
  retry          -> looks intermittent/timing (flake/timing)
  file_bug       -> looks like a real app regression (app_bug/assertion)
  update_test    -> the test expectation appears wrong/outdated
  investigate    -> insufficient signal to act automatically

confidence is an integer 0-100 (your calibrated confidence in the category).
evidence is a list (max 4) of {snippet, why}. snippet must be a short verbatim
line copied from the log (<=200 chars). why is a one-sentence justification.

Be precise. Prefer specific over generic. Don't invent log content.
Output schema:
{
  "category": "...",
  "confidence": 0-100,
  "hypothesis": "<= 2 sentences",
  "evidence": [{"snippet": "...", "why": "..."}, ...],
  "suggested_action": "...",
  "suggested_action_detail": "<= 1 sentence"
}
"""


def _get_openai_client():
    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL") or os.environ.get(
        "AI_INTEGRATIONS_OPENAI_BASE_URL", "https://api.openai.com/v1"
    )
    if not api_key:
        return None
    from openai import OpenAI
    return OpenAI(api_key=api_key, base_url=base_url)


def _truncate_log(log: str, max_chars: int = 16000) -> str:
    """Keep the tail of the log (where failure context lives)."""
    if not log:
        return ""
    if len(log) <= max_chars:
        return log
    head = log[:1500]
    tail = log[-(max_chars - 1500):]
    return f"{head}\n\n... [{len(log) - max_chars} chars trimmed] ...\n\n{tail}"


def _build_user_prompt(run: TestRun, case: Optional[TestCase],
                       failed_scenarios: list[TestRunScenario]) -> str:
    parts = []
    parts.append(f"Test case: {case.title if case else '(unknown)'}")
    if case and case.jira_story_key:
        parts.append(f"JIRA: {case.jira_story_key}")
    parts.append(f"Run #{run.run_number}  status={run.status}  "
                 f"scenarios={run.total_scenarios} failed={run.failed_scenarios} "
                 f"errors={run.errors}  duration={run.duration_ms}ms")
    if failed_scenarios:
        parts.append("\nFailed scenarios:")
        for s in failed_scenarios[:6]:
            parts.append(f"  - {s.name}  (errors={s.errors}, actions={s.actions})")
    gherkin_text = ""
    if case is not None:
        gherkin_text = getattr(case, "gherkin_script", "") or getattr(case, "gherkin_scenarios", "") or ""
    if gherkin_text:
        parts.append(f"\nGherkin:\n{gherkin_text[:4000]}")
    log = _truncate_log(run.full_log or run.log_excerpt or "")
    parts.append(f"\nExecution log (tail):\n{log}")
    return "\n".join(parts)


def _coerce_result(raw: Dict[str, Any]) -> Dict[str, Any]:
    cat = str(raw.get("category", "unknown")).strip().lower()
    if cat not in VALID_CATEGORIES:
        cat = "unknown"
    action = str(raw.get("suggested_action", "investigate")).strip().lower()
    if action not in VALID_ACTIONS:
        action = "investigate"
    try:
        conf = int(raw.get("confidence", 0))
    except (TypeError, ValueError):
        conf = 0
    conf = max(0, min(100, conf))
    evidence = raw.get("evidence") or []
    cleaned_evidence = []
    if isinstance(evidence, list):
        for item in evidence[:6]:
            if isinstance(item, dict):
                snippet = str(item.get("snippet", ""))[:240]
                why = str(item.get("why", ""))[:240]
                if snippet or why:
                    cleaned_evidence.append({"snippet": snippet, "why": why})
    return {
        "category": cat,
        "confidence": conf,
        "hypothesis": str(raw.get("hypothesis", ""))[:1200],
        "evidence": cleaned_evidence,
        "suggested_action": action,
        "suggested_action_detail": str(raw.get("suggested_action_detail", ""))[:400],
    }


def triage_run(run_id: str, db: Session) -> Optional[TestRunTriage]:
    """Run AI triage for the given run id. Idempotent on (run_id) — replaces
    any existing triage row. Returns the persisted row, or None if the run
    can't be found / wasn't a failure."""
    run: Optional[TestRun] = db.query(TestRun).filter(TestRun.id == run_id).first()
    if run is None:
        return None
    if run.status not in ("failed", "error"):
        return None

    case = db.query(TestCase).filter(TestCase.id == run.test_case_id).first()
    failed_scenarios = (
        db.query(TestRunScenario)
        .filter(TestRunScenario.run_id == run.id, TestRunScenario.status != "passed")
        .order_by(TestRunScenario.order_index.asc())
        .all()
    )

    existing = db.query(TestRunTriage).filter(TestRunTriage.run_id == run.id).first()

    client = _get_openai_client()
    if client is None:
        result = {
            "category": "unknown",
            "confidence": 0,
            "hypothesis": "AI triage unavailable: OpenAI key not configured.",
            "evidence": [],
            "suggested_action": "investigate",
            "suggested_action_detail": "Configure OPENAI_API_KEY to enable triage.",
        }
        return _persist(db, existing, run.id, result, model="", error="no-api-key")

    try:
        user_prompt = _build_user_prompt(run, case, failed_scenarios)
        resp = client.chat.completions.create(
            model=TRIAGE_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=900,
        )
        content = (resp.choices[0].message.content or "{}").strip()
        raw = json.loads(content)
        result = _coerce_result(raw)
        return _persist(db, existing, run.id, result, model=TRIAGE_MODEL, error="")
    except Exception as exc:  # noqa: BLE001 - we want to record the failure
        logger.exception("Triage failed for run %s", run.id)
        fallback = {
            "category": "unknown",
            "confidence": 0,
            "hypothesis": "AI triage encountered an error and could not classify this failure.",
            "evidence": [],
            "suggested_action": "investigate",
            "suggested_action_detail": "Click 'Re-run triage' to try again.",
        }
        return _persist(db, existing, run.id, fallback, model=TRIAGE_MODEL,
                        error=str(exc)[:500])


def _persist(db: Session, existing: Optional[TestRunTriage], run_id,
             result: Dict[str, Any], model: str, error: str) -> TestRunTriage:
    if existing is None:
        existing = TestRunTriage(run_id=run_id)
        db.add(existing)
    existing.category = result["category"]
    existing.confidence = result["confidence"]
    existing.hypothesis = result["hypothesis"]
    existing.evidence = result["evidence"]
    existing.suggested_action = result["suggested_action"]
    existing.suggested_action_detail = result["suggested_action_detail"]
    existing.model = model
    existing.error = error
    db.commit()
    db.refresh(existing)
    return existing


def serialize_triage(t: TestRunTriage) -> Dict[str, Any]:
    return {
        "id": str(t.id),
        "run_id": str(t.run_id),
        "category": t.category,
        "confidence": t.confidence,
        "hypothesis": t.hypothesis,
        "evidence": t.evidence or [],
        "suggested_action": t.suggested_action,
        "suggested_action_detail": t.suggested_action_detail,
        "model": t.model,
        "error": t.error,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
