"""Governed self-healing service.

When a Playwright action fails because the selector no longer matches the live DOM,
this service uses an LLM to propose a healed selector and stores the suggestion as
a *pending* `HealingProposal`. A human reviewer must explicitly approve before the
fix is applied to the test case — this is the "governance" guardrail.
"""
import os
import json
import re
from typing import Optional, Dict, Any, List

from openai import OpenAI
from sqlalchemy.orm import Session

from server_py.models.healing_proposal import HealingProposal
from server_py.models.test_suite import TestCase, TestSuite
from server_py.models.project import Project


_MODEL = "gpt-4o"

_PROMPT = """You are a senior QA automation engineer. A Playwright test selector has broken
because the application's DOM changed. Propose the SAFEST possible healed selector.

Rules:
1. Prefer stable attributes in this order: data-testid, aria-label, role+name, id, placeholder, name attribute, text content. Avoid brittle CSS like nth-child or deep descendant chains.
2. The healed selector MUST be syntactically valid for Playwright.
3. Provide an honest confidence score (0-100). If you cannot find a credible match, use confidence < 40.
4. Provide a one-sentence reasoning explaining WHY this selector is safer than the original.
5. Provide a risk_level: "low" (data-testid / aria-label match), "medium" (text/role match), "high" (heuristic).
6. Provide up to 2 alternate selectors as fallbacks.

Return STRICT JSON with this shape:
{
  "proposed_selector": "string",
  "proposed_action": "click|fill|selectRadio|selectDropdown|submit|searchAndSelect",
  "proposed_value": "string (only for fill/selectRadio/selectDropdown; otherwise empty)",
  "confidence": 0-100,
  "risk_level": "low|medium|high",
  "reasoning": "one sentence",
  "alternates": [
    {"selector": "string", "reason": "string", "confidence": 0-100}
  ]
}
"""


def _client() -> Optional[OpenAI]:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return None
    return OpenAI(api_key=key)


def _truncate(s: str, n: int) -> str:
    if not s:
        return ""
    return s if len(s) <= n else s[:n] + "...[truncated]"


def propose_healed_selector(
    *,
    broken_action: str,
    broken_selector: str,
    broken_value: str = "",
    error_message: str = "",
    dom_snippet: str = "",
    page_url: str = "",
) -> Dict[str, Any]:
    """Call the LLM to propose a healed selector. Returns a dict with proposed_*,
    confidence, risk_level, reasoning, alternates. Falls back to a heuristic
    suggestion when no API key is configured."""
    client = _client()
    if client is None:
        return _heuristic_proposal(broken_action, broken_selector, broken_value, dom_snippet)

    user_payload = {
        "broken_action": broken_action,
        "broken_selector": broken_selector,
        "broken_value": broken_value,
        "error_message": _truncate(error_message, 600),
        "dom_snippet": _truncate(dom_snippet, 4000),
        "page_url": page_url,
    }

    try:
        resp = client.chat.completions.create(
            model=_MODEL,
            response_format={"type": "json_object"},
            temperature=0.1,
            messages=[
                {"role": "system", "content": _PROMPT},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
        )
        raw = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
    except Exception as e:
        return {
            "proposed_selector": broken_selector,
            "proposed_action": broken_action,
            "proposed_value": broken_value,
            "confidence": 0,
            "risk_level": "high",
            "reasoning": f"AI proposer failed: {str(e)[:160]}",
            "alternates": [],
            "model": _MODEL,
        }

    return {
        "proposed_selector": str(data.get("proposed_selector") or "").strip(),
        "proposed_action": str(data.get("proposed_action") or broken_action).strip(),
        "proposed_value": str(data.get("proposed_value") or broken_value or "").strip(),
        "confidence": int(max(0, min(100, int(data.get("confidence") or 0)))),
        "risk_level": str(data.get("risk_level") or "medium").lower(),
        "reasoning": str(data.get("reasoning") or "").strip(),
        "alternates": data.get("alternates") or [],
        "model": _MODEL,
    }


def _heuristic_proposal(action: str, selector: str, value: str, dom: str) -> Dict[str, Any]:
    """Offline fallback when no OpenAI key is set — looks for a data-testid / aria-label
    in the supplied DOM snippet that mentions any token from the broken selector or value."""
    haystack = f"{selector} {value}".lower()
    tokens = [t for t in re.split(r"[^a-z0-9]+", haystack) if len(t) > 2]
    proposal = ""
    for t in tokens:
        m = re.search(rf'data-testid="([^"]*{re.escape(t)}[^"]*)"', dom or "", re.IGNORECASE)
        if m:
            proposal = f'[data-testid="{m.group(1)}"]'
            break
        m = re.search(rf'aria-label="([^"]*{re.escape(t)}[^"]*)"', dom or "", re.IGNORECASE)
        if m:
            proposal = f'[aria-label="{m.group(1)}"]'
            break
    if not proposal:
        proposal = selector
        confidence = 5
    else:
        confidence = 55
    return {
        "proposed_selector": proposal,
        "proposed_action": action,
        "proposed_value": value,
        "confidence": confidence,
        "risk_level": "medium" if confidence >= 50 else "high",
        "reasoning": "Heuristic match in DOM snippet (no AI key configured).",
        "alternates": [],
        "model": "heuristic",
    }


def create_proposal(
    db: Session,
    *,
    test_case_id: Optional[str] = None,
    test_run_id: Optional[str] = None,
    test_case_title: str = "",
    scenario_name: str = "",
    application_name: str = "",
    broken_action: str = "click",
    broken_selector: str = "",
    broken_value: str = "",
    error_message: str = "",
    dom_snippet: str = "",
    page_url: str = "",
    source: str = "auto",
) -> HealingProposal:
    """Create + persist a HealingProposal. Never raises — failures are recorded on the row."""
    if not test_case_title and test_case_id:
        tc = db.query(TestCase).filter(TestCase.id == test_case_id).first()
        if tc:
            test_case_title = tc.title or ""

    suggestion = propose_healed_selector(
        broken_action=broken_action,
        broken_selector=broken_selector,
        broken_value=broken_value,
        error_message=error_message,
        dom_snippet=dom_snippet,
        page_url=page_url,
    )

    p = HealingProposal(
        test_case_id=test_case_id,
        test_run_id=test_run_id,
        test_case_title=test_case_title or "",
        scenario_name=scenario_name or "",
        application_name=application_name or "",
        broken_action=broken_action or "click",
        broken_selector=broken_selector or "",
        broken_value=broken_value or "",
        error_message=_truncate(error_message, 4000),
        dom_snippet=_truncate(dom_snippet, 8000),
        page_url=page_url or "",
        proposed_selector=suggestion["proposed_selector"],
        proposed_action=suggestion["proposed_action"],
        proposed_value=suggestion["proposed_value"],
        ai_reasoning=suggestion["reasoning"],
        ai_confidence=suggestion["confidence"],
        risk_level=suggestion["risk_level"],
        model=suggestion["model"],
        alternates=suggestion["alternates"],
        status="pending",
        source=source,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def apply_proposal(db: Session, proposal: HealingProposal, reviewer: str = "qa-reviewer", notes: str = "") -> HealingProposal:
    """Approve + apply a proposal: patches the linked TestCase's playwright_code by
    replacing every occurrence of the broken selector with the proposed selector,
    and appends a self-healing audit entry. The mutation is best-effort — if the
    selector can't be found in the code we still mark the proposal `applied` and
    record a note in `application_diff`."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    diff_lines: List[str] = []

    if proposal.test_case_id:
        tc = db.query(TestCase).filter(TestCase.id == proposal.test_case_id).first()
        if tc:
            old_code = tc.playwright_code or ""
            new_code = old_code
            if proposal.broken_selector and proposal.broken_selector in old_code:
                new_code = old_code.replace(proposal.broken_selector, proposal.proposed_selector)
                diff_lines.append(f"- {proposal.broken_selector}")
                diff_lines.append(f"+ {proposal.proposed_selector}")
            else:
                diff_lines.append(f"# selector '{proposal.broken_selector[:80]}' not found in code; healing recorded for runtime overrides only")

            if new_code != old_code:
                tc.playwright_code = new_code

            audit = {
                "proposal_id": str(proposal.id),
                "broken": proposal.broken_selector,
                "healed": proposal.proposed_selector,
                "reviewer": reviewer,
                "applied_at": datetime.now(timezone.utc).isoformat(),
                "confidence": proposal.ai_confidence,
                "risk": proposal.risk_level,
            }
            existing_log = tc.self_healing_log or ""
            try:
                log_arr = json.loads(existing_log) if existing_log.strip().startswith("[") else []
            except Exception:
                log_arr = []
            log_arr.append(audit)
            tc.self_healing_log = json.dumps(log_arr, indent=2)

    proposal.status = "applied"
    proposal.reviewer = reviewer
    proposal.review_notes = notes
    proposal.reviewed_at = now
    proposal.applied_at = now
    proposal.application_diff = "\n".join(diff_lines) if diff_lines else ""
    db.commit()
    db.refresh(proposal)
    return proposal


def reject_proposal(db: Session, proposal: HealingProposal, reviewer: str = "qa-reviewer", notes: str = "") -> HealingProposal:
    from datetime import datetime, timezone
    proposal.status = "rejected"
    proposal.reviewer = reviewer
    proposal.review_notes = notes
    proposal.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(proposal)
    return proposal


# ---------------------------------------------------------------------------
# Demo seeder
# ---------------------------------------------------------------------------

def _demo_playwright(title: str, broken_selector: str, action: str, value: str, page_url: str) -> str:
    """Realistic Playwright snippet so the patch in apply_proposal produces a visible diff."""
    if action == "fill":
        action_line = f"  await page.locator('{broken_selector}').fill('{value}');"
    elif action == "click":
        action_line = f"  await page.locator('{broken_selector}').click();"
    elif action == "selectRadio":
        action_line = f"  await page.locator('{broken_selector}').check();"
    elif action == "submit":
        action_line = f"  await page.locator('{broken_selector}').click();"
    else:
        action_line = f"  await page.locator('{broken_selector}').click();"
    return (
        f"import {{ test, expect }} from '@playwright/test';\n\n"
        f"test('{title}', async ({{ page }}) => {{\n"
        f"  await page.goto('{page_url}');\n"
        f"{action_line}\n"
        f"  await expect(page).toHaveURL(/.*success/);\n"
        f"}});\n"
    )


DEMO_SCENARIOS = [
    {
        "test_case_title": "Hospitality — Submit Contact Request",
        "scenario_name": "Submit valid contact form",
        "application_name": "Hospitality Website",
        "broken_action": "click",
        "broken_selector": 'button.submit-btn-primary',
        "broken_value": "",
        "error_message": "Timeout 30000ms exceeded waiting for selector 'button.submit-btn-primary'",
        "page_url": "https://demo.hilton.example.com/contact",
        "dom_snippet": (
            '<form data-testid="contact-form">\n'
            '  <input data-testid="input-firstName" placeholder="First Name" />\n'
            '  <input data-testid="input-lastName" placeholder="Last Name" />\n'
            '  <input data-testid="input-email" placeholder="Email" />\n'
            '  <button data-testid="button-submit-contact" aria-label="Submit Request" class="btn primary-cta">Submit Request</button>\n'
            '</form>'
        ),
    },
    {
        "test_case_title": "Banking — Transfer Funds Between Accounts",
        "scenario_name": "Initiate same-bank transfer",
        "application_name": "Online Banking",
        "broken_action": "fill",
        "broken_selector": '#amt',
        "broken_value": "500.00",
        "error_message": "selector '#amt' resolved to hidden <input> — the page now uses #transfer-amount",
        "page_url": "https://bank.example.com/transfers/new",
        "dom_snippet": (
            '<div class="transfer-form">\n'
            '  <label for="transfer-amount">Amount (USD)</label>\n'
            '  <input id="transfer-amount" data-testid="input-amount" name="amount" type="number" />\n'
            '  <select data-testid="select-fromAccount" name="from"></select>\n'
            '  <button data-testid="button-confirm-transfer">Continue</button>\n'
            '</div>'
        ),
    },
    {
        "test_case_title": "E-commerce — Add Item to Cart",
        "scenario_name": "Add product from PDP",
        "application_name": "Storefront",
        "broken_action": "click",
        "broken_selector": '.product-page .add-cart',
        "broken_value": "",
        "error_message": "Element <button class='add-cart'> not found — page redesigned with new structure",
        "page_url": "https://store.example.com/p/sku-12345",
        "dom_snippet": (
            '<section class="pdp-actions">\n'
            '  <button data-testid="button-add-to-cart" aria-label="Add to Cart" class="cta-btn cta-primary">Add to Cart</button>\n'
            '  <button data-testid="button-add-to-wishlist" aria-label="Add to Wishlist">♡</button>\n'
            '</section>'
        ),
    },
]


def _ensure_demo_suite(db: Session) -> Optional[TestSuite]:
    """Find an existing demo suite or create one under the first available project so
    healing proposals link to a real, navigable test case the customer can open."""
    suite = db.query(TestSuite).filter(TestSuite.name == "KIT Self-Healing Demo Suite").first()
    if suite:
        return suite
    project = db.query(Project).first()
    if not project:
        return None
    suite = TestSuite(
        project_id=project.id,
        name="KIT Self-Healing Demo Suite",
        suite_type="regression",
        description="Auto-generated suite that hosts the demo test cases used to showcase governed self-healing.",
        status="executing",
    )
    db.add(suite)
    db.commit()
    db.refresh(suite)
    return suite


def _ensure_demo_test_case(db: Session, suite: TestSuite, spec: Dict[str, Any]) -> TestCase:
    """Idempotently create the demo test case for a scenario."""
    tc = (
        db.query(TestCase)
        .filter(TestCase.test_suite_id == suite.id)
        .filter(TestCase.title == spec["test_case_title"])
        .first()
    )
    code = _demo_playwright(
        spec["test_case_title"],
        spec["broken_selector"],
        spec["broken_action"],
        spec["broken_value"],
        spec["page_url"],
    )
    if tc:
        # Ensure the broken selector is present in the code so the patch produces a real diff.
        if spec["broken_selector"] not in (tc.playwright_code or ""):
            tc.playwright_code = code
            db.commit()
            db.refresh(tc)
        return tc
    tc = TestCase(
        test_suite_id=suite.id,
        title=spec["test_case_title"],
        description=f"Demo test case used for the Self-Healing governance walkthrough — {spec['application_name']}.",
        preconditions="The application is deployed and reachable.",
        steps=f"1. Navigate to {spec['page_url']}\n2. Perform '{spec['broken_action']}' on the target element.\n3. Verify success.",
        expected_result="Action succeeds and the user is redirected to the success page.",
        priority="high",
        status="failed",
        category="Self-Healing Demo",
        playwright_code=code,
        execution_log=spec["error_message"],
    )
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return tc


def seed_demo_proposals(db: Session, count: int = 3) -> List[HealingProposal]:
    suite = _ensure_demo_suite(db)
    created: List[HealingProposal] = []
    for spec in DEMO_SCENARIOS[:max(1, min(count, len(DEMO_SCENARIOS)))]:
        tc_id: Optional[str] = None
        if suite is not None:
            tc = _ensure_demo_test_case(db, suite, spec)
            tc_id = str(tc.id)
        p = create_proposal(
            db,
            test_case_id=tc_id,
            test_case_title=spec["test_case_title"],
            scenario_name=spec["scenario_name"],
            application_name=spec["application_name"],
            broken_action=spec["broken_action"],
            broken_selector=spec["broken_selector"],
            broken_value=spec["broken_value"],
            error_message=spec["error_message"],
            dom_snippet=spec["dom_snippet"],
            page_url=spec["page_url"],
            source="demo",
        )
        created.append(p)
    return created
