"""Convert a production defect into Gherkin regression scenarios.

The AI returns 1-3 scenarios:
  - the exact failing reproduction (negative)
  - a positive variant (the happy path that should still work)
  - an optional edge variant
plus a one-line "what this protects against" rationale.
"""
import os
import json
import re
from typing import Dict, Any, List, Optional

from openai import OpenAI


_MODEL = "gpt-4o"

_PROMPT = """You are a senior QA automation engineer turning a production defect into a permanent regression test.

You will receive a defect with a title, description, reproduction steps, and severity.

Return STRICT JSON:
{
  "rationale": "one sentence — what this regression test will catch if the bug ever returns",
  "scenarios": [
    {"kind": "repro",    "title": "string", "gherkin": "Feature: ...\\n  Scenario: ...\\n    Given ...\\n    When ...\\n    Then ..."},
    {"kind": "positive", "title": "string", "gherkin": "..."},
    {"kind": "edge",     "title": "string", "gherkin": "..."}
  ]
}

Rules:
1. Always include a "repro" scenario that asserts the BUG behavior is FIXED (i.e. the new correct behavior).
2. Include a "positive" scenario that exercises the happy path of the same feature so we don't over-fit to the bug.
3. Include an "edge" scenario for a closely related boundary case — only if it adds real coverage; otherwise omit it.
4. Each Gherkin block must be syntactically valid and use Given/When/Then.
5. Keep titles short and human-readable.
6. The rationale must be one plain English sentence a Director of QE would understand.
"""


def _client() -> Optional[OpenAI]:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return None
    return OpenAI(api_key=key)


def generate_regression_scenarios(
    *,
    title: str,
    description: str = "",
    repro_steps: str = "",
    severity: str = "medium",
    page_url: str = "",
    jira_key: str = "",
) -> Dict[str, Any]:
    """Generate regression scenarios from a defect. Falls back to a deterministic
    template if no API key is configured so the demo still works offline."""
    client = _client()
    payload = {
        "title": title,
        "description": description,
        "repro_steps": repro_steps,
        "severity": severity,
        "page_url": page_url,
        "jira_key": jira_key,
    }

    if client is None:
        return _fallback(payload)

    try:
        resp = client.chat.completions.create(
            model=_MODEL,
            response_format={"type": "json_object"},
            temperature=0.2,
            messages=[
                {"role": "system", "content": _PROMPT},
                {"role": "user", "content": json.dumps(payload)},
            ],
        )
        raw = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
    except Exception as e:
        out = _fallback(payload)
        out["rationale"] = f"{out['rationale']} (AI unavailable: {str(e)[:120]})"
        return out

    scenarios = data.get("scenarios") or []
    cleaned: List[Dict[str, str]] = []
    for s in scenarios[:3]:
        kind = str(s.get("kind") or "repro").lower()
        if kind not in ("repro", "positive", "edge"):
            kind = "repro"
        cleaned.append({
            "kind": kind,
            "title": str(s.get("title") or "").strip()[:300] or f"{kind.title()} scenario",
            "gherkin": str(s.get("gherkin") or "").strip(),
        })
    if not cleaned:
        return _fallback(payload)

    return {
        "rationale": str(data.get("rationale") or "").strip() or _default_rationale(title, jira_key),
        "scenarios": cleaned,
        "model": _MODEL,
    }


def _default_rationale(title: str, jira_key: str) -> str:
    label = jira_key or "this defect"
    return f"Catches regressions of {label}: {title[:140]}"


def _slug(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", " ", s).strip().title()


def _fallback(payload: Dict[str, Any]) -> Dict[str, Any]:
    title = payload.get("title") or "Production defect"
    repro = payload.get("repro_steps") or payload.get("description") or "Reproduce the reported issue"
    feature = _slug(title)[:80] or "Production Defect"
    repro_lines = [ln.strip() for ln in (repro or "").splitlines() if ln.strip()][:6] or ["Follow the documented reproduction"]
    given = repro_lines[0]
    when = repro_lines[1] if len(repro_lines) > 1 else "the user performs the reported action"
    then_ok = "the application behaves correctly and the original defect does not occur"

    repro_g = (
        f"Feature: Regression — {feature}\n"
        f"  Scenario: The reported defect no longer occurs\n"
        f"    Given {given}\n"
        f"    When {when}\n"
        f"    Then {then_ok}"
    )
    positive_g = (
        f"Feature: Regression — {feature}\n"
        f"  Scenario: Happy path still works\n"
        f"    Given a typical valid input for this feature\n"
        f"    When the user completes the standard flow\n"
        f"    Then the expected outcome is produced without errors"
    )
    return {
        "rationale": _default_rationale(title, payload.get("jira_key", "")),
        "scenarios": [
            {"kind": "repro", "title": "Defect no longer reproducible", "gherkin": repro_g},
            {"kind": "positive", "title": "Happy path remains working", "gherkin": positive_g},
        ],
        "model": "deterministic-fallback",
    }
