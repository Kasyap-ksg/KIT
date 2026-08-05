import os
import json
import re
import subprocess
import tempfile
import asyncio
import base64
import shutil
import time
import uuid as uuid_mod
import threading
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from server_py.database import get_db
from server_py.models.test_suite import TestCase, TestSuite
from server_py.models.project import Project
from server_py.services.journey_executor import (
    CURSOR_INJECT_JS, CURSOR_CLICK_EFFECT_JS,
    CURSOR_LABEL_JS, CURSOR_HIDE_JS,
)
from server_py.routes.jira import _get_auth

router = APIRouter(prefix="/api/test-execution", tags=["test_execution"])

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY") or os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL") or os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://api.openai.com/v1")

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCREENSHOTS_DIR = os.path.join(PROJECT_ROOT, "uploads", "test-screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)


def _get_openai_client():
    from openai import OpenAI
    return OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)


_DOM_EXTRACT_JS = """() => {
    const results = [];
    const selector = 'input, textarea, select, button, a, [role="button"], [role="link"], ' +
        '[role="textbox"], [role="combobox"], [role="listbox"], [role="checkbox"], ' +
        '[role="radio"], [role="tab"], [role="menuitem"], [contenteditable="true"], ' +
        'label, h1, h2, h3, form, [data-testid], [aria-label]';

    function crawlNode(root) {
        const allElements = root.querySelectorAll(selector);
        for (const el of allElements) {
            if (!el.offsetParent && el.tagName !== 'INPUT' && el.getAttribute('type') !== 'hidden') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;

            const info = {
                tag: el.tagName.toLowerCase(),
                type: el.getAttribute('type') || '',
                id: el.id || '',
                name: el.getAttribute('name') || '',
                class: el.className?.toString?.()?.slice(0, 100) || '',
                text: el.textContent?.trim()?.slice(0, 80) || '',
                placeholder: el.getAttribute('placeholder') || '',
                ariaLabel: el.getAttribute('aria-label') || '',
                role: el.getAttribute('role') || '',
                dataTestId: el.getAttribute('data-testid') || '',
                value: (el.tagName === 'INPUT' || el.tagName === 'SELECT') ? (el.value?.slice(0, 50) || '') : '',
                href: el.getAttribute('href')?.slice(0, 100) || '',
                visible: rect.width > 0 && rect.height > 0,
                position: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            };

            let labelText = '';
            const parent = el.closest('label');
            if (parent) {
                labelText = parent.textContent?.trim()?.slice(0, 80) || '';
            } else if (el.id) {
                try {
                    const lbl = (root === document ? document : root).querySelector('label[for="' + CSS.escape(el.id) + '"]')
                              || document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
                    if (lbl) labelText = lbl.textContent?.trim()?.slice(0, 80) || '';
                } catch(e) {}
            }
            info.associatedLabel = labelText;

            results.push(info);
        }
        root.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) crawlNode(el.shadowRoot);
        });
    }
    crawlNode(document);
    return results;
}"""


async def _crawl_page_dom(url: str) -> dict:
    """Use Python Playwright to crawl a page and extract its real DOM structure.
    Performs a deep crawl: after initial load, clicks radio buttons and other
    interactive elements to reveal hidden form sections, then re-crawls."""
    from playwright.async_api import async_playwright

    dom_info = {"url": url, "elements": [], "screenshot_b64": "", "page_title": "", "error": ""}

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
            context = await browser.new_context(
                viewport={"width": 1280, "height": 900},
                ignore_https_errors=True,
                user_agent="Mozilla/120.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()

            try:
                await page.goto(url, wait_until="networkidle", timeout=25000)
            except Exception:
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                except Exception as nav_err:
                    dom_info["error"] = f"Navigation failed: {str(nav_err)[:200]}"
                    await browser.close()
                    return dom_info

            await page.wait_for_timeout(3000)
            dom_info["page_title"] = await page.title()

            initial_elements = await page.evaluate(_DOM_EXTRACT_JS)

            radio_buttons = [el for el in initial_elements if el.get("role") == "radio" or el.get("type") == "radio"]
            clickable_options = [el for el in initial_elements if el.get("role") in ("option", "tab", "radio") and el.get("visible")]

            if radio_buttons or clickable_options:
                targets = radio_buttons or clickable_options
                for target in targets[:3]:
                    try:
                        selector = None
                        if target.get("id"):
                            selector = f"#{target['id']}"
                        elif target.get("ariaLabel"):
                            selector = f'[aria-label="{target["ariaLabel"]}"]'
                        elif target.get("text") and len(target["text"]) < 60:
                            text = target["text"]
                            selector = f'text="{text}"'
                        elif target.get("name"):
                            selector = f'[name="{target["name"]}"]'

                        if selector:
                            await page.click(selector, timeout=3000)
                            await page.wait_for_timeout(2000)
                            break
                    except Exception:
                        continue

            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(1000)
            await page.evaluate("window.scrollTo(0, 0)")
            await page.wait_for_timeout(500)

            screenshot_bytes = await page.screenshot(full_page=True)
            dom_info["screenshot_b64"] = base64.b64encode(screenshot_bytes).decode("utf-8")

            elements = await page.evaluate(_DOM_EXTRACT_JS)
            dom_info["elements"] = elements[:200]

            await browser.close()

    except Exception as e:
        dom_info["error"] = str(e)[:300]

    return dom_info


def _crawl_page_sync(url: str) -> dict:
    """Synchronous wrapper for async page crawl."""
    try:
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(_crawl_page_dom(url))
        loop.close()
        return result
    except Exception as e:
        return {"url": url, "elements": [], "screenshot_b64": "", "page_title": "", "error": str(e)[:300]}


class GherkinGenerateRequest(BaseModel):
    instruction: Optional[str] = None


class StoryTestCaseRequest(BaseModel):
    project_id: str
    story_key: str
    story_summary: str
    story_description: Optional[str] = ""
    story_status: Optional[str] = ""
    story_priority: Optional[str] = "medium"
    sprint_id: Optional[int] = None
    sprint_name: Optional[str] = ""


@router.post("/story/get-or-create")
def get_or_create_story_test_case(data: StoryTestCaseRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == data.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    existing = db.query(TestCase).join(TestSuite, TestCase.test_suite_id == TestSuite.id).filter(
        TestCase.jira_story_key == data.story_key,
        TestSuite.project_id == data.project_id,
    ).first()

    if existing:
        updated = False
        if not existing.description and data.story_description:
            existing.description = data.story_description
            updated = True
        if data.story_summary and existing.title != data.story_summary:
            existing.title = data.story_summary
            updated = True
        if updated:
            db.commit()
            db.refresh(existing)
        return _serialize_test_case(existing)

    suite_name = data.sprint_name or f"JIRA Sprint Tests"
    suite = db.query(TestSuite).filter(
        TestSuite.project_id == data.project_id,
        TestSuite.name == suite_name,
    ).first()

    if not suite:
        suite = TestSuite(
            project_id=data.project_id,
            name=suite_name,
            suite_type="sprint",
            description=f"Automated test cases generated from JIRA sprint stories",
            status="draft",
        )
        db.add(suite)
        db.flush()

    case = TestCase(
        test_suite_id=suite.id,
        title=data.story_summary,
        description=data.story_description or "",
        priority=_map_priority(data.story_priority),
        status="draft",
        category="JIRA Story",
        jira_story_key=data.story_key,
    )
    db.add(case)
    suite.total_cases = (suite.total_cases or 0) + 1
    db.commit()
    db.refresh(case)
    return _serialize_test_case(case)


@router.get("/story/{project_id}/{story_key}")
def get_story_test_case(project_id: str, story_key: str, db: Session = Depends(get_db)):
    case = db.query(TestCase).join(TestSuite, TestCase.test_suite_id == TestSuite.id).filter(
        TestCase.jira_story_key == story_key,
        TestSuite.project_id == project_id,
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="No test case found for this story")
    return _serialize_test_case(case)


def _fetch_jira_description(story_key: str, project_id: str, db: Session) -> str:
    import httpx
    try:
        base_url, auth = _get_auth(db, project_id=project_id)
    except HTTPException:
        return ""
    
    if not base_url:
        return ""
    try:
        url = f"{base_url}/rest/api/3/issue/{story_key}?fields=description,summary"
        resp = httpx.get(url, auth=auth, headers={"Accept": "application/json"}, timeout=10.0)
        if resp.status_code != 200:
            return ""
        data = resp.json()
        desc_raw = data.get("fields", {}).get("description")
        if not desc_raw:
            return ""
        if isinstance(desc_raw, str):
            return desc_raw
        if isinstance(desc_raw, dict):
            parts = []
            for block in desc_raw.get("content", []):
                if block.get("type") == "paragraph":
                    for item in block.get("content", []):
                        if item.get("type") == "text":
                            parts.append(item.get("text", ""))
                elif block.get("type") in ("bulletList", "orderedList"):
                    for li in block.get("content", []):
                        for item in li.get("content", []):
                            if item.get("type") == "paragraph":
                                for t in item.get("content", []):
                                    if t.get("type") == "text":
                                        parts.append("- " + t.get("text", ""))
                elif block.get("type") == "heading":
                    for item in block.get("content", []):
                        if item.get("type") == "text":
                            parts.append("\n" + item.get("text", ""))
            return "\n".join(parts)
        return str(desc_raw)[:2000]
    except Exception:
        return ""


def _name_to_label(name: str) -> str:
    """Convert field name like 'Confirm_Email_Address' to 'Confirm Email'."""
    readable = re.sub(r'[_\-]+', ' ', name).strip()
    readable = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', readable)
    return readable.title()

def _crawl_dom_fields(app_url: str) -> str:
    if not app_url:
        return ""
    crawl = _crawl_page_sync(app_url)
    if not crawl.get("elements"):
        return ""
    fields = []
    seen_names = set()
    for el in crawl["elements"][:200]:
        tag = el.get("tag", "")
        if tag in ("input", "textarea", "select"):
            field_name = el.get("name", "")
            if field_name in seen_names:
                continue
            if field_name:
                seen_names.add(field_name)
            label = el.get("associatedLabel") or el.get("ariaLabel") or el.get("placeholder") or ""
            
            if field_name:
                display = label or _name_to_label(field_name)
            else:
                el_id = el.get("id", "")
                # Ignore auto-generated React/Next.js IDs like "139:0" or ":r1:" or just numbers
                if el_id and not re.search(r'(:|^\d+$)', el_id):
                    display = label or _name_to_label(el_id)
                else:
                    display = label
            if display:
                fields.append(f'  - {tag}: "{display}" (name="{field_name}", type="{el.get("type","")}")')
        elif tag == "button" or el.get("role") == "button":
            txt = el.get("text", "")
            if txt:
                fields.append(f'  - button: "{txt}"')
        elif tag == "label":
            txt = el.get("text", "")
            if txt and len(txt) < 60:
                fields.append(f'  - label: "{txt}"')
        elif el.get("role") in ("radio", "checkbox"):
            txt = el.get("ariaLabel") or el.get("text") or el.get("value") or ""
            if txt:
                fields.append(f'  - {el["role"]}: "{txt}"')
    if fields:
        return "\n\n## PAGE ELEMENTS (live DOM crawl of the application)\nThese are the ACTUAL form fields on the page. You MUST include ALL input fields in your Gherkin scenarios, especially for happy-path scenarios. Do not skip any field.\n" + "\n".join(fields[:50]) + "\n\nIMPORTANT: Use the exact field labels shown above. Fill EVERY visible input field in happy-path scenarios — missing even one field will cause form submission to fail."
    return ""


GHERKIN_MODEL = os.environ.get("OPENAI_GHERKIN_MODEL", "o3-mini")

GHERKIN_SYSTEM_PROMPT = (
    "You write Gherkin BDD scenarios for JIRA stories that are executed by KIT's deterministic regex parser. "
    "Use ONLY the step phrasings listed in the user prompt — any other phrasing is silently ignored at runtime and tests will pass with zero actions. "
    "Generate 4-6 scenarios covering the full form-submission flow described by the story (happy path with EVERY field filled, required-field validation, invalid email, invalid phone, alternate valid data). "
    "When the live DOM crawl is provided, use the EXACT labels from it; never invent field names. "
    "Output only the raw Feature file — no prose, no markdown fences."
)


def _build_gherkin_prompt(case: 'TestCase', project, story_desc: str, brd: str, app_url: str, dom_fields: str) -> str:
    return f"""You are a senior QA engineer creating an executable Gherkin BDD test suite from a JIRA user story.

## JIRA Story
- **Key**: {case.jira_story_key or ''}
- **Title**: {case.title}
- **Full Story Description**: {story_desc}
- **Preconditions**: {case.preconditions}
- **Test Steps**: {case.steps}
- **Expected Result**: {case.expected_result}
- **Application URL**: {app_url}
- **Priority**: {case.priority}
{f'- **Business Requirements**: {brd[:2000]}' if brd else ''}
{dom_fields}

## EXACT STEP PHRASING — REQUIRED

KIT's execution engine uses a regex parser, not Cucumber. Any step that does not match one of the patterns below is **silently dropped** at runtime. Use these phrasings verbatim — only the quoted strings vary.

Navigate:
  Given I navigate to "<url>"

Fill an input field (use either form):
  When I fill "First Name" with "John"
  When I type "John" into the "First Name" field

Leave a field empty (for validation tests):
  When I leave the "Email" field blank

Click a button or link:
  When I click "Submit"
  When I click the "Submit" button

Select a radio option:
  When I select the radio option "Yes, I have credentials"

Select an item from a typeahead / company search dropdown:
  When I select "Hilton Worldwide" from the company search results

Assertions:
  Then I should see "Thank You"
  Then I should see a confirmation message "Thank You"
  Then I should see a validation error for "Email"

## WHAT TO GENERATE

A Feature file with **4-6 scenarios** that test the full form-submission flow described in the story:

1. **Happy path** — select the initial option (Background), fill EVERY field found in the DOM crawl (or implied by the story), submit, assert the success page.
2. **Missing required fields** — leave at least 2 required fields blank, submit, assert a validation error appears.
3. **Invalid email format** — fill all fields but use `"notanemail"` for Email, submit, assert email validation error.
4. **Invalid phone number** — fill all fields but use `"abc"` for Phone, submit, assert phone validation error.
5. **Alternate happy path** — same flow with different valid test data.

## RULES

- Feature name describes the story purpose (e.g., "User Registration - No Lobby Credentials").
- Tags above the Feature line: `@{case.priority} @{case.jira_story_key or 'story'} @automated`.
- `Background:` navigates to the app URL and selects the initial radio option from the story.
- If the DOM crawl found field labels, use those EXACT labels — case, spacing, and punctuation matter.
- In the happy path, include a fill step for EVERY input field in the DOM crawl. Missing one usually causes the real form to reject submission.
- Use realistic, stable test data: `"John"`, `"Doe"`, `"john.doe@example.com"`, `"+1234567890"`, `"Hilton Worldwide"`. For "Confirm Email" fields, repeat the same email as Email.
- One action per step. No `Scenario Outline:` / `Examples:` tables.
- Every scenario ends with a `Then` that asserts a visible outcome.

Return ONLY the Feature file content. No commentary, no markdown fences.
"""


@router.post("/{case_id}/generate-gherkin")
def generate_gherkin(case_id: UUID, body: Optional[GherkinGenerateRequest] = None, db: Session = Depends(get_db)):
    case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Test case not found")

    suite = db.query(TestSuite).filter(TestSuite.id == case.test_suite_id).first()
    project = db.query(Project).filter(Project.id == suite.project_id).first() if suite else None
    app_url = project.app_url if project else ""
    brd = project.brd_document if project else ""
    instruction = body.instruction if body and body.instruction else None

    story_desc = case.description or ""
    if not story_desc and case.jira_story_key and project:
        story_desc = _fetch_jira_description(case.jira_story_key, project.id, db)
        if story_desc:
            case.description = story_desc
            db.commit()

    case_id_str = str(case.id)
    case_title = case.title or ""
    case_jira_key = case.jira_story_key or ""

    def event_stream():
        full_text = ""
        try:
            yield f"data: {json.dumps({'type': 'status', 'message': 'Crawling live application DOM...'})}\n\n"
            dom_fields = _crawl_dom_fields(app_url)
            crawl_summary = "DOM crawl returned fields" if dom_fields else "DOM crawl returned no fields (dynamic page) — will use story context"
            yield f"data: {json.dumps({'type': 'status', 'message': crawl_summary})}\n\n"

            prompt = _build_gherkin_prompt(case, project, story_desc, brd, app_url, dom_fields)
            if instruction:
                prompt += f"\n\n## ADDITIONAL INSTRUCTIONS FROM TESTER\n{instruction}"

            yield f"data: {json.dumps({'type': 'status', 'message': f'Streaming from {GHERKIN_MODEL}...'})}\n\n"

            client = _get_openai_client()
            stream = client.chat.completions.create(
                model=GHERKIN_MODEL,
                messages=[
                    {"role": "developer", "content": GHERKIN_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                stream=True,
            )
            for chunk in stream:
                try:
                    delta = chunk.choices[0].delta.content or ""
                except (AttributeError, IndexError):
                    delta = ""
                if delta:
                    full_text += delta
                    yield f"data: {json.dumps({'type': 'token', 'content': delta})}\n\n"
        except Exception as e:
            print(f"DEBUG GHERKIN ERROR: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'AI service error: {str(e)[:200]}'})}\n\n"
            return

        gherkin = full_text.strip()
        if gherkin.startswith("```"):
            lines = gherkin.split("\n")
            gherkin = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        if "Feature:" not in gherkin:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Model returned no Feature block — refusing to persist'})}\n\n"
            return

        try:
            db_case = db.query(TestCase).filter(TestCase.id == case_id).first()
            if not db_case:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Test case disappeared mid-stream'})}\n\n"
                return
            db_case.gherkin_script = gherkin
            db_case.gherkin_approved = ""
            db_case.status = "ready"
            try:
                pw_code = _generate_playwright_code(gherkin, app_url, case_jira_key or case_title or "test")
                db_case.playwright_code = pw_code
            except Exception:
                pw_code = ""
            db.commit()
        except Exception as e:
            db.rollback()
            yield f"data: {json.dumps({'type': 'error', 'message': f'Persist failed: {str(e)[:200]}'})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'done', 'gherkin_script': gherkin, 'playwright_code': pw_code or '', 'case_id': case_id_str})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{case_id}/approve-gherkin")
def approve_gherkin(case_id: UUID, db: Session = Depends(get_db)):
    case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Test case not found")
    if not case.gherkin_script:
        raise HTTPException(status_code=400, detail="No Gherkin to approve — generate it first")

    case.gherkin_approved = "yes"
    db.commit()
    db.refresh(case)
    return {"status": "approved", "case_id": str(case_id)}


@router.post("/{case_id}/generate-playwright")
def generate_playwright(case_id: UUID, db: Session = Depends(get_db)):
    case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Test case not found")

    suite = db.query(TestSuite).filter(TestSuite.id == case.test_suite_id).first()
    project = db.query(Project).filter(Project.id == suite.project_id).first() if suite else None
    app_url = project.app_url if project else "https://example.com"

    gherkin = case.gherkin_script
    if not gherkin:
        raise HTTPException(status_code=400, detail="Generate Gherkin first before generating Playwright code")

    playwright_code = _generate_playwright_code(gherkin, app_url, case.jira_story_key or case.title or "test")

    case.playwright_code = playwright_code
    db.commit()
    db.refresh(case)

    return {"playwright_code": playwright_code, "case_id": str(case_id)}


_live_execution_events: dict = {}

DOM_CRAWL_JS = """() => {
    const results = [];
    const allElements = document.querySelectorAll(
        'input, textarea, select, button, a, [role="button"], [role="link"], ' +
        '[role="textbox"], [role="combobox"], [role="listbox"], [role="checkbox"], ' +
        '[role="radio"], [role="tab"], [role="menuitem"], [contenteditable="true"], ' +
        'label, h1, h2, h3, form, [data-testid], [aria-label]'
    );
    for (const el of allElements) {
        if (!el.offsetParent && el.tagName !== 'INPUT' && el.getAttribute('type') !== 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const info = {
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type') || '',
            id: el.id || '',
            name: el.getAttribute('name') || '',
            text: el.textContent?.trim()?.slice(0, 80) || '',
            placeholder: el.getAttribute('placeholder') || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            role: el.getAttribute('role') || '',
            dataTestId: el.getAttribute('data-testid') || '',
            value: (el.tagName === 'INPUT' || el.tagName === 'SELECT') ? (el.value?.slice(0, 50) || '') : '',
            href: el.getAttribute('href')?.slice(0, 100) || '',
            visible: rect.width > 0 && rect.height > 0,
            position: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        };
        const label = el.closest('label') || document.querySelector('label[for="' + el.id + '"]');
        info.associatedLabel = label ? label.textContent?.trim()?.slice(0, 80) : '';
        results.push(info);
    }
    return results;
}"""


def _split_gherkin_scenarios(gherkin: str) -> list:
    """Split a multi-scenario Gherkin into individual scenarios, each with Background prepended."""
    lines = gherkin.strip().split("\n")
    background_lines = []
    feature_lines = []
    scenarios = []
    current_scenario = []
    in_background = False
    in_scenario = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("Feature:") or stripped.startswith("@"):
            if not in_background and not in_scenario:
                feature_lines.append(line)
                continue
        if stripped.startswith("Background:"):
            in_background = True
            in_scenario = False
            background_lines.append(line)
            continue
        if stripped.startswith("Scenario:") or stripped.startswith("Scenario Outline:"):
            if current_scenario:
                scenarios.append(current_scenario)
            current_scenario = [line]
            in_background = False
            in_scenario = True
            continue
        if in_background:
            background_lines.append(line)
        elif in_scenario:
            current_scenario.append(line)

    if current_scenario:
        scenarios.append(current_scenario)

    result = []
    for scenario_lines in scenarios:
        combined = feature_lines + background_lines + scenario_lines
        result.append("\n".join(combined))

    return result if result else [gherkin]


def _parse_gherkin_to_actions(gherkin: str) -> list:
    """Parse Gherkin steps directly into browser actions — no GPT needed.
    This ensures execution follows the Gherkin exactly."""
    actions = []
    lines = gherkin.strip().split("\n")

    fill_field_with_value = re.compile(
        r'(?:I |the user )(?:enter|fill|type|input|populate)s?\s+(?:in\s+|out\s+)?(?:the\s+)?(?:field\s+)?"([^"]+)"\s*(?:field|input)?\s*with\s+(?:the\s+)?(?:value\s+)?"([^"]+)"',
        re.IGNORECASE
    )
    fill_value_into_field = re.compile(
        r'(?:I |the user )(?:enter|fill|type|input|populate)s?\s+"([^"]+)"\s+(?:into|in|for)\s+(?:the\s+)?(?:field\s+)?(?:input\s+)?"([^"]+)"',
        re.IGNORECASE
    )
    leave_empty_pattern = re.compile(
        r'(?:I |the user )(?:leave|clear)\s+(?:the\s+)?"([^"]+)"\s+(?:field\s+)?(?:empty|blank|clear)',
        re.IGNORECASE
    )
    click_pattern = re.compile(
        r'(?:I |the user )(?:click|press|tap)s?\s+(?:the\s+)?(?:button\s+)?"([^"]+)"',
        re.IGNORECASE
    )
    click_pattern2 = re.compile(
        r'(?:I |the user )(?:click|press|tap)s?\s+(?:the\s+)?(?:button|link)\s+"([^"]+)"',
        re.IGNORECASE
    )
    click_pattern3 = re.compile(
        r'(?:I |the user )(?:click|press|tap)s?\s+"([^"]+)"',
        re.IGNORECASE
    )
    select_from_results_pattern = re.compile(
        r'(?:I |the user )(?:select)\s+"([^"]+)"\s+from\s+(?:the\s+)?(?:company\s+)?(?:search\s+)?(?:results?|dropdown|list|options)',
        re.IGNORECASE
    )
    select_company_pattern = re.compile(
        r'(?:I |the user )(?:select)\s+(?:the\s+)?(?:company\s+)?(?:result|option|item)\s+"([^"]+)"',
        re.IGNORECASE
    )
    select_radio_pattern = re.compile(
        r'(?:I |the user )(?:select|choose|click)s?\s+(?:the\s+)?(?:radio\s+)(?:option|button)\s+"([^"]+)"',
        re.IGNORECASE
    )
    select_option_pattern = re.compile(
        r'(?:I |the user )(?:select|choose|pick)s?\s+(?:the\s+)?(?:option\s+)?"([^"]+)"',
        re.IGNORECASE
    )
    navigate_pattern = re.compile(
        r'(?:I |the user )(?:navigate|go|visit|am on)s?\s+(?:to\s+)?(?:the\s+)?(?:application\s+)?(?:URL\s+)?(?:page\s+)?"([^"]+)"',
        re.IGNORECASE
    )
    assert_pattern = re.compile(
        r'(?:I should |the user should |should )see\s+(?:a\s+)?(?:validation\s+)?(?:error\s+)?(?:confirmation\s+)?(?:message\s+)?"([^"]+)"',
        re.IGNORECASE
    )
    assert_pattern2 = re.compile(
        r'(?:the\s+)?(?:text|message|page)\s+"([^"]+)"\s+(?:should be|is)\s+(?:visible|displayed)',
        re.IGNORECASE
    )
    wait_pattern = re.compile(
        r'(?:I |the user )wait',
        re.IGNORECASE
    )

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith(("Feature:", "Background:", "Scenario:", "@", "#", "As ", "I want", "So that")):
            continue
        if not stripped.startswith(("Given ", "When ", "And ", "Then ", "But ")):
            continue

        step_text = re.sub(r'^(Given|When|And|Then|But)\s+', '', stripped)

        m = navigate_pattern.search(step_text)
        if m:
            actions.append({"action": "goto", "target": m.group(1), "value": m.group(1), "description": step_text})
            continue

        m = fill_field_with_value.search(step_text)
        if m:
            field_name = re.sub(r'\s*(field|input|textbox|textarea)\s*$', '', m.group(1), flags=re.IGNORECASE).strip()
            actions.append({"action": "fill", "target": field_name, "value": m.group(2), "description": step_text})
            continue

        m = fill_value_into_field.search(step_text)
        if m:
            field_name = re.sub(r'\s*(field|input|textbox|textarea)\s*$', '', m.group(2), flags=re.IGNORECASE).strip()
            actions.append({"action": "fill", "target": field_name, "value": m.group(1), "description": step_text})
            continue

        m = leave_empty_pattern.search(step_text)
        if m:
            field_name = re.sub(r'\s*(field|input)\s*$', '', m.group(1), flags=re.IGNORECASE).strip()
            actions.append({"action": "fill", "target": field_name, "value": "", "description": step_text})
            continue

        m = assert_pattern.search(step_text)
        if m:
            actions.append({"action": "assertVisible", "target": m.group(1), "value": "", "description": step_text})
            continue

        m = assert_pattern2.search(step_text)
        if m:
            actions.append({"action": "assertVisible", "target": m.group(1), "value": "", "description": step_text})
            continue

        if "validation" in step_text.lower() or "error" in step_text.lower():
            quoted = re.findall(r'"([^"]+)"', step_text)
            if quoted:
                actions.append({"action": "assertVisible", "target": quoted[-1], "value": "", "description": step_text})
                continue
            if "should" in step_text.lower():
                actions.append({"action": "assertAnyError", "target": step_text, "value": "", "description": step_text})
                continue

        if "should" in step_text.lower() and ("confirmation" in step_text.lower() or "success" in step_text.lower() or "submitted" in step_text.lower() or "thank" in step_text.lower()):
            quoted = re.findall(r'"([^"]+)"', step_text)
            target = quoted[-1] if quoted else "submitted"
            actions.append({"action": "assertVisible", "target": target, "value": "", "description": step_text})
            continue

        m = select_from_results_pattern.search(step_text)
        if m:
            actions.append({"action": "selectSearchResult", "target": m.group(1), "value": "", "description": step_text})
            continue

        m = select_company_pattern.search(step_text)
        if m:
            actions.append({"action": "selectSearchResult", "target": m.group(1), "value": "", "description": step_text})
            continue

        m = select_radio_pattern.search(step_text)
        if m:
            actions.append({"action": "selectRadio", "target": m.group(1), "value": m.group(1), "description": step_text})
            continue

        m = select_option_pattern.search(step_text)
        if m:
            actions.append({"action": "click", "target": m.group(1), "value": "", "description": step_text})
            continue

        m = click_pattern2.search(step_text)
        if m:
            actions.append({"action": "click", "target": m.group(1), "value": "", "description": step_text})
            continue

        m = click_pattern.search(step_text)
        if m:
            actions.append({"action": "click", "target": m.group(1), "value": "", "description": step_text})
            continue

        m = click_pattern3.search(step_text)
        if m:
            actions.append({"action": "click", "target": m.group(1), "value": "", "description": step_text})
            continue

        if wait_pattern.search(step_text):
            actions.append({"action": "wait", "target": "", "value": "2000", "description": step_text})
            continue

        if "should" in step_text.lower():
            quoted = re.findall(r'"([^"]+)"', step_text)
            if quoted:
                actions.append({"action": "assertVisible", "target": quoted[-1], "value": "", "description": step_text})
                continue
            actions.append({"action": "assertVisible", "target": step_text.split("see")[-1].strip()[:40] if "see" in step_text.lower() else "success", "value": "", "description": step_text})
            continue

        quoted = re.findall(r'"([^"]+)"', step_text)
        if quoted:
            actions.append({"action": "click", "target": quoted[0], "value": "", "description": step_text})

    return actions


def _generate_playwright_code(gherkin: str, app_url: str, story_key: str) -> str:
    scenarios = _split_gherkin_scenarios(gherkin)
    feature_match = re.search(r'Feature:\s*(.+)', gherkin)
    feature_name = feature_match.group(1).strip() if feature_match else story_key

    def _esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")

    bg_match = re.search(r'Background:(.+?)(?=Scenario:|$)', gherkin, re.DOTALL)
    bg_actions = []
    if bg_match:
        bg_text = "Background:" + bg_match.group(1)
        bg_actions = _parse_gherkin_to_actions(bg_text)

    lines = [
        f"import {{ test, expect }} from '@playwright/test';",
        '',
        f"test.describe('{_esc(feature_name)}', () => {{",
        f"    test.beforeEach(async ({{ page }}) => {{",
        f"        await page.goto('{_esc(app_url)}', {{ waitUntil: 'domcontentloaded', timeout: 30000 }});",
    ]

    for action in bg_actions:
        atype = action["action"]
        target = _esc(action["target"])
        value = _esc(action["value"])
        if atype == "goto":
            pass
        elif atype == "click":
            lines.append(f"        await page.locator('label').filter({{ hasText: \"{target}\" }}).click();")
        elif atype == "selectRadio":
            radio_target = _esc(action["value"] or action["target"])
            lines.append(f"        await page.locator('label').filter({{ hasText: \"{radio_target}\" }}).click();")
        elif atype == "fill":
            lines.append(f"        await page.getByLabel('{target}').fill('{value}');")

    lines.append(f"    }});")
    lines.append('')

    for s_idx, scenario_gherkin in enumerate(scenarios):
        scenario_name_match = re.search(r'Scenario:\s*(.+)', scenario_gherkin)
        scenario_name = scenario_name_match.group(1).strip() if scenario_name_match else f"Scenario {s_idx+1}"

        all_actions = _parse_gherkin_to_actions(scenario_gherkin)
        bg_action_count = len(bg_actions)
        scenario_actions = all_actions[bg_action_count:] if bg_action_count > 0 else all_actions

        lines.append(f"    test('{_esc(scenario_name)}', async ({{ page }}) => {{")

        for action in scenario_actions:
            atype = action["action"]
            target = _esc(action["target"])
            value = _esc(action["value"])

            if atype == "goto":
                url = value or target
                lines.append(f"        await page.goto('{url}', {{ waitUntil: 'domcontentloaded', timeout: 30000 }});")
            elif atype == "fill":
                lines.append(f"        await page.getByLabel('{target}').fill('{value}');")
            elif atype == "click":
                if len(target) > 30:
                    lines.append(f"        await page.locator('label').filter({{ hasText: \"{target}\" }}).click();")
                else:
                    lines.append(f"        await page.getByRole('button', {{ name: '{target}' }}).click();")
            elif atype == "selectRadio":
                radio_target = value or target
                lines.append(f"        await page.locator('label').filter({{ hasText: \"{radio_target}\" }}).click();")
            elif atype == "selectDropdown":
                lines.append(f"        await page.getByLabel('{target}').selectOption({{ label: '{value}' }});")
            elif atype == "selectSearchResult":
                lines.append(f"        await page.locator('[role=\"option\"]').filter({{ hasText: '{target}' }}).click();")
            elif atype == "searchAndSelect":
                lines.append(f"        await page.getByLabel('{target}').fill('{value}');")
                lines.append(f"        await page.waitForTimeout(2000);")
                lines.append(f"        await page.locator('[role=\"option\"]').first().click();")
            elif atype in ("assertVisible", "assertText"):
                lines.append(f"        await expect(page.locator('text={target}')).toBeVisible({{ timeout: 30000 }});")
            elif atype == "assertAnyError":
                lines.append(f"        await expect(page.locator('.error-message, [role=\"alert\"], .slds-form-element__help').first()).toBeVisible({{ timeout: 10000 }});")
            elif atype == "wait":
                ms = value or "2000"
                lines.append(f"        await page.waitForTimeout({ms});")
            elif atype == "scroll":
                lines.append(f"        await page.evaluate(() => window.scrollBy(0, 400));")

        lines.append(f"    }});")
        lines.append('')

    lines.append('});')
    return '\n'.join(lines)


async def _execute_live_browser(case_id_str: str, app_url: str, gherkin: str, case_screenshot_dir: str):
    from playwright.async_api import async_playwright

    all_screenshots = []
    execution_log_lines = []
    step_errors = 0

    async def _move_cursor(page, x, y, label=""):
        try:
            await page.evaluate(CURSOR_INJECT_JS, {"x": x, "y": y})
            if label:
                await page.evaluate(CURSOR_LABEL_JS, {"x": x, "y": y, "text": label})
            await page.wait_for_timeout(300)
        except Exception:
            pass

    async def _click_effect(page):
        try:
            await page.evaluate(CURSOR_CLICK_EFFECT_JS)
            await page.wait_for_timeout(150)
        except Exception:
            pass

    async def _hide_cursor(page):
        try:
            await page.evaluate(CURSOR_HIDE_JS)
        except Exception:
            pass

    def _stream_progress(label, status="running"):
        _live_execution_events.setdefault(case_id_str, []).append({
            "type": "progress",
            "step": label,
            "status": status,
            "timestamp": time.time(),
        })

    live_screenshot_counter = [0]

    async def _stream_live_screenshot(page, step_label=""):
        try:
            live_screenshot_counter[0] += 1
            fname = f"live_{live_screenshot_counter[0]:04d}.png"
            fpath = os.path.join(case_screenshot_dir, fname)
            await page.screenshot(path=fpath, full_page=False)
            url = f"/uploads/test-screenshots/{case_id_str}/{fname}"
            _live_execution_events.setdefault(case_id_str, []).append({
                "type": "screenshot",
                "url": url,
                "step": step_label,
                "timestamp": time.time(),
            })
        except Exception:
            pass

    CRAWL_DOM_JS = """() => {
        const fields = [];
        const labels = [];
        const buttons = [];
        function crawlNode(root) {
            root.querySelectorAll('input, textarea, select').forEach(el => {
                const rect = el.getBoundingClientRect();
                let labelText = '';
                if (el.id) {
                    try {
                        const lbl = (root === document ? document : root).querySelector('label[for="' + CSS.escape(el.id) + '"]')
                                  || document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
                        if (lbl) labelText = lbl.textContent.trim();
                    } catch(e) {}
                }
                if (!labelText) {
                    const parent = el.closest('label');
                    if (parent) labelText = parent.textContent.trim();
                }
                if (!labelText && el.getAttribute('aria-label')) {
                    labelText = el.getAttribute('aria-label');
                }
                if (!labelText && el.placeholder) {
                    labelText = el.placeholder;
                }
                fields.push({
                    tag: el.tagName.toLowerCase(),
                    type: el.type || '',
                    name: el.name || '',
                    id: el.id || '',
                    ariaLabel: el.getAttribute('aria-label') || '',
                    placeholder: el.placeholder || '',
                    labelText: labelText,
                    value: el.value || '',
                    visible: rect.width > 0 && rect.height > 0,
                });
            });
            root.querySelectorAll('label').forEach(lbl => {
                const text = lbl.textContent.trim();
                if (text.length > 3 && text.length < 200) {
                    const input = lbl.querySelector('input, textarea');
                    labels.push({
                        text: text,
                        forAttr: lbl.getAttribute('for') || '',
                        hasInput: !!input,
                        inputType: input ? (input.type || '') : '',
                    });
                }
            });
            root.querySelectorAll('button, [role="button"], input[type="submit"]').forEach(btn => {
                const rect = btn.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) return;
                buttons.push({
                    text: btn.textContent.trim(),
                    type: btn.type || '',
                    name: btn.name || '',
                    ariaLabel: btn.getAttribute('aria-label') || '',
                });
            });
            root.querySelectorAll('*').forEach(el => {
                if (el.shadowRoot) crawlNode(el.shadowRoot);
            });
        }
        crawlNode(document);
        return { fields, labels, buttons };
    }"""

    async def _crawl_page_dom(page):
        try:
            dom_info = await page.evaluate(CRAWL_DOM_JS)
            return dom_info
        except Exception:
            return {"fields": [], "labels": [], "buttons": []}

    def _normalize(text):
        return re.sub(r'[^a-z0-9]', '', text.lower())

    def _build_field_map(dom_info):
        field_map = {}
        raw_fields = []
        for f in dom_info.get("fields", []):
            label = f.get("labelText", "")
            name = f.get("name", "")
            fid = f.get("id", "")
            aria = f.get("ariaLabel", "")
            placeholder = f.get("placeholder", "")
            best_id = name or fid or aria or placeholder
            if not best_id:
                continue
            raw_fields.append({"best_id": best_id, "name": name, "label": label, "id": fid, "aria": aria, "placeholder": placeholder})
            for text in [label, name, fid, aria, placeholder]:
                if text:
                    field_map[_normalize(text)] = best_id
            if name:
                parts = re.split(r'[_\-\s]+', name.lower())
                for part in parts:
                    if len(part) > 2:
                        norm_part = _normalize(part)
                        if norm_part not in field_map:
                            field_map[norm_part] = best_id
        field_map["_raw_fields"] = raw_fields
        return field_map

    def _fuzzy_find_field(field_map, target):
        norm = _normalize(target)
        if norm in field_map and norm != "_raw_fields":
            return field_map[norm]
        raw_fields = field_map.get("_raw_fields", [])
        for f in raw_fields:
            for attr in [f["name"], f["label"], f["id"], f["aria"], f["placeholder"]]:
                if attr and norm in _normalize(attr):
                    return f["best_id"]
                if attr and _normalize(attr) in norm:
                    return f["best_id"]
        return None

    def _text_variants(text):
        variants = [text]
        normalized = text.replace("\u2019", "'").replace("\u2018", "'")
        if normalized != text:
            variants.append(normalized)
        with_apos = text.replace("dont", "don't").replace("cant", "can't").replace("wont", "won't").replace("isnt", "isn't")
        if with_apos != text:
            variants.append(with_apos)
        no_apos = text.replace("'", "").replace("\u2019", "")
        if no_apos != text:
            variants.append(no_apos)
        return list(dict.fromkeys(variants))

    async def _find_element(page, target, action_type, field_map=None):
        if field_map is None:
            field_map = {}

        resolved_name = _fuzzy_find_field(field_map, target)

        if action_type in ("fill", "searchAndSelect"):
            strategies = []
            if resolved_name:
                strategies.append(lambda rn=resolved_name: page.get_by_label(rn, exact=False))
                strategies.append(lambda rn=resolved_name: page.locator(f'[name="{rn}"]'))
                strategies.append(lambda rn=resolved_name: page.locator(f'#{rn}'))

            strategies.extend([
                lambda: page.get_by_label(target, exact=False),
                lambda: page.get_by_placeholder(target, exact=False),
            ])

            name_variants = [
                target.replace(" ", "_"),
                target.replace(" ", "-"),
                target.lower().replace(" ", "_"),
            ]
            for nv in name_variants:
                strategies.append(lambda nv=nv: page.get_by_label(nv, exact=False))
                strategies.append(lambda nv=nv: page.locator(f'[name="{nv}"]'))

            strategies.extend([
                lambda: page.locator(f'input[aria-label*="{target}" i], textarea[aria-label*="{target}" i]'),
                lambda: page.locator(f'[data-testid*="{target}" i]'),
            ])

        elif action_type == "click":
            targets_to_try = _text_variants(target)
            strategies = []
            for t in targets_to_try:
                strategies.extend([
                    lambda t=t: page.locator('label').filter(has_text=t),
                    lambda t=t: page.get_by_role("button", name=t, exact=False),
                    lambda t=t: page.get_by_role("link", name=t, exact=False),
                    lambda t=t: page.get_by_text(t, exact=False),
                ])
            strategies.append(lambda: page.locator(f'[data-testid*="{target}" i]'))

        elif action_type in ("selectRadio",):
            targets_to_try = _text_variants(target)
            strategies = []
            for t in targets_to_try:
                strategies.extend([
                    lambda t=t: page.locator('label').filter(has_text=t),
                    lambda t=t: page.get_by_label(t, exact=False),
                    lambda t=t: page.get_by_text(t, exact=False),
                ])

        elif action_type == "selectDropdown":
            strategies = [
                lambda: page.get_by_label(target, exact=False),
                lambda: page.locator(f'select[name*="{target}" i]'),
            ]
        else:
            strategies = [
                lambda: page.get_by_text(target, exact=False),
                lambda: page.locator(f'[aria-label*="{target}" i]'),
            ]

        for make_locator in strategies:
            try:
                loc = make_locator()
                cnt = await loc.count()
                if cnt > 0:
                    first = loc.first
                    try:
                        await first.wait_for(state="visible", timeout=3000)
                        return first
                    except Exception:
                        return first
            except Exception:
                continue
        return None

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
            )
            context = await browser.new_context(
                viewport={"width": 1280, "height": 720},
                ignore_https_errors=True,
                record_video_dir=case_screenshot_dir,
                record_video_size={"width": 1280, "height": 720},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            page.set_default_timeout(15000)

            execution_log_lines.append("=== KIT Live Browser Execution ===")
            execution_log_lines.append(f"Target URL: {app_url}")
            _stream_progress("Navigating to application...")

            async def _navigate_to_app():
                try:
                    await page.goto(app_url, wait_until="domcontentloaded", timeout=30000)
                except Exception:
                    await page.goto(app_url, timeout=30000)
                await page.wait_for_timeout(3000)

            try:
                await _navigate_to_app()
            except Exception as nav_err:
                execution_log_lines.append(f"Navigation failed: {str(nav_err)[:200]}")
                await context.close()
                await browser.close()
                return {"status": "error", "screenshots": [], "videos": [], "log": "\n".join(execution_log_lines)}

            execution_log_lines.append(f"Page loaded: {await page.title()}")
            _stream_progress("Crawling page DOM...")
            await _stream_live_screenshot(page, "Page loaded")

            dom_info = await _crawl_page_dom(page)
            field_map = _build_field_map(dom_info)
            field_names = [f.get("name","") or f.get("id","") for f in dom_info.get("fields",[]) if f.get("name") or f.get("id")]
            execution_log_lines.append(f"DOM crawled: {len(dom_info.get('fields', []))} fields, {len(dom_info.get('labels', []))} labels, {len(dom_info.get('buttons', []))} buttons")
            execution_log_lines.append(f"Field names found: {field_names[:15]}")
            if field_map:
                execution_log_lines.append(f"Field map: {dict(list(field_map.items())[:10])}")
            _stream_progress("DOM crawled, starting tests...")

            scenarios = _split_gherkin_scenarios(gherkin)
            total_actions = 0
            scenario_results = []

            for s_idx, scenario_gherkin in enumerate(scenarios):
                scenario_name_match = re.search(r'Scenario:\s*(.+)', scenario_gherkin)
                scenario_name = scenario_name_match.group(1).strip() if scenario_name_match else f"Scenario {s_idx+1}"
                execution_log_lines.append(f"\n{'='*60}")
                execution_log_lines.append(f"SCENARIO {s_idx+1}/{len(scenarios)}: {scenario_name}")
                execution_log_lines.append(f"{'='*60}")

                _live_execution_events.setdefault(case_id_str, []).append({
                    "type": "scenario_start",
                    "scenario": scenario_name,
                    "index": s_idx + 1,
                    "total": len(scenarios),
                    "timestamp": time.time(),
                })

                if s_idx > 0:
                    try:
                        await _navigate_to_app()
                    except Exception as nav_err:
                        execution_log_lines.append(f"  Navigation failed: {str(nav_err)[:150]}")
                        scenario_results.append({"name": scenario_name, "status": "error", "errors": 1, "actions": 0})
                        step_errors += 1
                        continue
                    await _stream_live_screenshot(page, f"Scenario {s_idx+1} - Page loaded")
                    dom_info = await _crawl_page_dom(page)
                    field_map = _build_field_map(dom_info)

                actions = _parse_gherkin_to_actions(scenario_gherkin)
                execution_log_lines.append(f"  Parsed {len(actions)} actions from Gherkin")

                if not actions:
                    execution_log_lines.append(f"  No actions parsed from Gherkin")
                    scenario_results.append({"name": scenario_name, "status": "error", "errors": 1, "actions": 0})
                    step_errors += 1
                    continue

                total_actions += len(actions)
                scenario_errors = 0
                scenario_start_ts = time.time()

                for i, action in enumerate(actions):
                    action_type = action.get("action", "")
                    target = action.get("target", "")
                    value = action.get("value", "")
                    desc = action.get("description", f"{action_type} {target}")

                    execution_log_lines.append(f"\n  Step {i+1}/{len(actions)}: {desc}")
                    _stream_progress(f"S{s_idx+1} Step {i+1}/{len(actions)}: {desc}")

                    try:
                        if action_type == "wait":
                            ms = int(value or 2000)
                            await page.wait_for_timeout(ms)
                            execution_log_lines.append(f"    ✓ Waited {ms}ms")
                            continue

                        if action_type == "scroll":
                            direction = value or "down"
                            if direction == "bottom":
                                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                            elif direction == "up":
                                await page.evaluate("window.scrollBy(0, -400)")
                            else:
                                await page.evaluate("window.scrollBy(0, 400)")
                            await page.wait_for_timeout(400)
                            execution_log_lines.append(f"    ✓ Scrolled {direction}")
                            await _stream_live_screenshot(page, f"Scrolled {direction}")
                            continue

                        if action_type == "assertAnyError":
                            found_err = False
                            error_selectors = [
                                '[data-error-message]', '.error-message', '.field-error',
                                '.slds-form-element__help', '.form-error', '.validation-error',
                                '[role="alert"]', '.slds-has-error', '.has-error',
                                '.input-error', '.error', '.invalid-feedback',
                            ]
                            for sel in error_selectors:
                                try:
                                    loc = page.locator(sel)
                                    cnt = await loc.count()
                                    if cnt > 0:
                                        first_el = loc.first
                                        try:
                                            await first_el.wait_for(state="visible", timeout=2000)
                                        except Exception:
                                            pass
                                        box = await first_el.bounding_box()
                                        if box:
                                            await _move_cursor(page, box["x"] + box["width"]/2, box["y"] + box["height"]/2, "✓ Validation errors")
                                        execution_log_lines.append(f"    ✓ Found {cnt} error element(s) via '{sel}'")
                                        _stream_progress(f"✓ Validation errors found ({cnt})", "passed")
                                        await _stream_live_screenshot(page, "Validation errors visible")
                                        found_err = True
                                        break
                                except Exception:
                                    continue
                            if not found_err:
                                page_text = await page.inner_text("body")
                                page_lower = page_text.lower()
                                error_keywords = ["required", "invalid", "please enter", "this field", "cannot be blank", "must be", "is required", "complete this field"]
                                for kw in error_keywords:
                                    if kw in page_lower:
                                        execution_log_lines.append(f"    ✓ Found error text containing '{kw}'")
                                        _stream_progress(f"✓ Validation errors found", "passed")
                                        await _stream_live_screenshot(page, "Validation errors visible")
                                        found_err = True
                                        break
                            if not found_err:
                                execution_log_lines.append(f"    ✗ No validation errors found on page")
                                _stream_progress(f"✗ No validation errors found", "failed")
                                await _stream_live_screenshot(page, "No validation errors")
                                scenario_errors += 1
                                step_errors += 1
                            continue

                        if action_type in ("assertVisible", "assertText"):
                            await page.wait_for_timeout(2000)
                            found_assert = False
                            search_texts = []
                            for at in _text_variants(target):
                                search_texts.append(at)
                            words = target.split()
                            if len(words) > 3:
                                search_texts.append(" ".join(words[:4]))
                                search_texts.append(" ".join(words[:3]))
                            search_texts = list(dict.fromkeys(search_texts))

                            for at in search_texts:
                                try:
                                    found = page.get_by_text(at, exact=False).first
                                    await found.wait_for(state="visible", timeout=5000)
                                    box = await found.bounding_box()
                                    if box:
                                        await _move_cursor(page, box["x"] + box["width"]/2, box["y"] + box["height"]/2, f"✓ {target[:30]}")
                                    execution_log_lines.append(f"    ✓ Assertion passed: '{target}'")
                                    _stream_progress(f"✓ Found: {target[:40]}", "passed")
                                    await _stream_live_screenshot(page, f"Assert: {target[:30]}")
                                    found_assert = True
                                    break
                                except Exception:
                                    continue
                            if not found_assert:
                                try:
                                    page_text = await page.inner_text("body")
                                    page_lower = page_text.lower()
                                    target_lower = target.lower()
                                    if target_lower in page_lower:
                                        found_assert = True
                                    else:
                                        target_words = [w for w in target_lower.split() if len(w) > 3]
                                        if target_words and all(w in page_lower for w in target_words):
                                            found_assert = True
                                    if found_assert:
                                        execution_log_lines.append(f"    ✓ Assertion passed (text match): '{target}'")
                                        _stream_progress(f"✓ Found: {target[:40]}", "passed")
                                        await _stream_live_screenshot(page, f"Assert: {target[:30]}")
                                except Exception:
                                    pass
                            if not found_assert:
                                desc_lower = desc.lower()
                                is_error_assert = any(kw in desc_lower for kw in ["error", "validation", "invalid"])
                                is_success_assert = any(kw in desc_lower for kw in ["confirmation", "success", "thank", "submitted", "received"])

                                if is_error_assert:
                                    error_sels = ['.slds-form-element__help', '[role="alert"]', '.error-message', '.field-error', '.validation-error', '.has-error', '.slds-has-error', '.invalid-feedback']
                                    for es in error_sels:
                                        try:
                                            eloc = page.locator(es)
                                            ecnt = await eloc.count()
                                            if ecnt > 0:
                                                execution_log_lines.append(f"    ✓ Assertion passed (error elements found): {ecnt} via '{es}'")
                                                _stream_progress(f"✓ Validation error present", "passed")
                                                await _stream_live_screenshot(page, "Validation error visible")
                                                found_assert = True
                                                break
                                        except Exception:
                                            continue
                                    if not found_assert:
                                        try:
                                            page_text = await page.inner_text("body")
                                            error_keywords = ["complete this field", "required", "invalid", "please enter", "must be", "cannot be blank"]
                                            for ek in error_keywords:
                                                if ek in page_text.lower():
                                                    execution_log_lines.append(f"    ✓ Assertion passed (error keyword '{ek}' found in page)")
                                                    _stream_progress(f"✓ Validation error present", "passed")
                                                    await _stream_live_screenshot(page, "Validation error visible")
                                                    found_assert = True
                                                    break
                                        except Exception:
                                            pass

                                if is_success_assert and not found_assert:
                                    try:
                                        page_text = await page.inner_text("body")
                                        page_lower = page_text.lower()
                                        success_keywords = ["thank you", "thank", "request has been", "submitted", "received", "confirmation", "success"]
                                        for sk in success_keywords:
                                            if sk in page_lower:
                                                execution_log_lines.append(f"    ✓ Assertion passed (success keyword '{sk}' found)")
                                                _stream_progress(f"✓ Found: {sk}", "passed")
                                                await _stream_live_screenshot(page, f"Success: {sk}")
                                                found_assert = True
                                                break
                                    except Exception:
                                        pass
                                    if not found_assert:
                                        current_url = page.url
                                        if current_url != (value or ""):
                                            try:
                                                await page.wait_for_timeout(3000)
                                                page_text = await page.inner_text("body")
                                                page_lower = page_text.lower()
                                                for sk in ["thank", "success", "submitted", "received", "request"]:
                                                    if sk in page_lower:
                                                        execution_log_lines.append(f"    ✓ Assertion passed (success keyword '{sk}' on new page)")
                                                        _stream_progress(f"✓ Found: {sk}", "passed")
                                                        await _stream_live_screenshot(page, f"Success: {sk}")
                                                        found_assert = True
                                                        break
                                            except Exception:
                                                pass

                            if not found_assert:
                                execution_log_lines.append(f"    ✗ Assertion failed: '{target}' not visible")
                                _stream_progress(f"✗ Not found: {target[:40]}", "failed")
                                await _stream_live_screenshot(page, f"Assert FAILED: {target[:30]}")
                                scenario_errors += 1
                                step_errors += 1
                            continue

                        if action_type == "goto":
                            goto_url = value or target
                            await page.goto(goto_url, wait_until="domcontentloaded", timeout=25000)
                            await page.wait_for_timeout(3000)
                            execution_log_lines.append(f"    ✓ Navigated to {goto_url}")
                            _stream_progress(f"✓ Navigated", "passed")
                            await _stream_live_screenshot(page, f"Navigated to page")
                            dom_info = await _crawl_page_dom(page)
                            field_map = _build_field_map(dom_info)
                            continue

                        if action_type == "selectSearchResult":
                            locator = None
                        else:
                            search_target = target or value
                            resolved = _fuzzy_find_field(field_map, search_target)
                            if resolved:
                                execution_log_lines.append(f"    → Resolved '{search_target}' to field: '{resolved}'")
                            locator = await _find_element(page, search_target, action_type, field_map)

                            if not locator:
                                execution_log_lines.append(f"    ⚠ Element not found: '{search_target}' (resolved: {resolved}) — skipping")
                                _stream_progress(f"⚠ Not found: {search_target[:40]}", "skipped")
                                scenario_errors += 1
                                step_errors += 1
                                await _stream_live_screenshot(page, f"Not found: {search_target[:30]}")
                                continue

                        box = locator and await locator.bounding_box()
                        if box:
                            cx = box["x"] + box["width"] / 2
                            cy = box["y"] + box["height"] / 2

                            if cy > 600:
                                await page.evaluate(f"window.scrollBy(0, {int(cy - 300)})")
                                await page.wait_for_timeout(300)
                                box = await locator.bounding_box()
                                if box:
                                    cx = box["x"] + box["width"] / 2
                                    cy = box["y"] + box["height"] / 2

                            await _move_cursor(page, cx, cy, desc[:40])

                        if action_type == "fill":
                            try:
                                await locator.click(timeout=3000)
                                await page.wait_for_timeout(200)
                            except Exception:
                                pass
                            await locator.fill("")
                            await locator.fill(value)
                            await page.wait_for_timeout(300)
                            await _hide_cursor(page)
                            execution_log_lines.append(f"    ✓ Filled '{target}' = '{value}'")
                            _stream_progress(f"✓ Filled: {target[:30]}", "passed")
                            await _stream_live_screenshot(page, f"Filled: {target}")

                        elif action_type == "click":
                            await _click_effect(page)
                            await locator.click()
                            is_submit = any(kw in target.lower() for kw in ["submit", "send", "save", "confirm", "register", "sign up"])
                            wait_time = 5000 if is_submit else 2000
                            await page.wait_for_timeout(wait_time)
                            await _hide_cursor(page)
                            execution_log_lines.append(f"    ✓ Clicked '{target}'")
                            _stream_progress(f"✓ Clicked: {target[:30]}", "passed")
                            await _stream_live_screenshot(page, f"Clicked: {target}")
                            if not is_submit:
                                await page.evaluate("window.scrollBy(0, 300)")
                                await page.wait_for_timeout(1000)
                                dom_info_new = await _crawl_page_dom(page)
                                new_map = _build_field_map(dom_info_new)
                                if new_map:
                                    field_map.update(new_map)
                                await page.evaluate("window.scrollTo(0, 0)")
                                await page.wait_for_timeout(300)

                        elif action_type == "selectRadio":
                            radio_target = value or target
                            radio_loc = await _find_element(page, radio_target, "selectRadio", field_map)
                            if radio_loc:
                                rbox = await radio_loc.bounding_box()
                                if rbox:
                                    await _move_cursor(page, rbox["x"] + rbox["width"]/2, rbox["y"] + rbox["height"]/2, f"Select: {radio_target[:30]}")
                                await _click_effect(page)
                                await radio_loc.click()
                                await page.wait_for_timeout(2000)
                                await _hide_cursor(page)
                                execution_log_lines.append(f"    ✓ Selected radio: '{radio_target}'")
                                _stream_progress(f"✓ Selected: {radio_target[:30]}", "passed")
                                await _stream_live_screenshot(page, f"Selected radio: {radio_target}")
                                await page.evaluate("window.scrollBy(0, 400)")
                                await page.wait_for_timeout(1000)
                                dom_info_new = await _crawl_page_dom(page)
                                new_map = _build_field_map(dom_info_new)
                                if new_map:
                                    field_map.update(new_map)
                                await page.evaluate("window.scrollTo(0, 0)")
                                await page.wait_for_timeout(300)
                            else:
                                execution_log_lines.append(f"    ⚠ Radio not found: '{radio_target}'")
                                _stream_progress(f"⚠ Not found: {radio_target[:30]}", "skipped")
                                scenario_errors += 1
                                step_errors += 1

                        elif action_type == "selectDropdown":
                            try:
                                await locator.select_option(label=value)
                                await page.wait_for_timeout(300)
                                await _hide_cursor(page)
                                execution_log_lines.append(f"    ✓ Selected dropdown '{target}': '{value}'")
                                _stream_progress(f"✓ Selected: {value[:30]}", "passed")
                                await _stream_live_screenshot(page, f"Selected: {value}")
                            except Exception:
                                execution_log_lines.append(f"    ⚠ Dropdown failed: '{target}'")
                                _stream_progress(f"⚠ Dropdown failed: {target[:30]}", "skipped")
                                scenario_errors += 1
                                step_errors += 1

                        elif action_type == "searchAndSelect":
                            await locator.fill(value)
                            await page.wait_for_timeout(2000)
                            try:
                                result_loc = page.locator('[role="option"], [role="listbox"] li, .slds-listbox__option, .suggestion-item, .search-result').first
                                await result_loc.wait_for(state="visible", timeout=5000)
                                rbox = await result_loc.bounding_box()
                                if rbox:
                                    await _move_cursor(page, rbox["x"] + rbox["width"]/2, rbox["y"] + rbox["height"]/2, "Select result")
                                await _click_effect(page)
                                await result_loc.click()
                                await page.wait_for_timeout(500)
                                await _hide_cursor(page)
                                execution_log_lines.append(f"    ✓ Searched '{target}' for '{value}' and selected")
                                _stream_progress(f"✓ Searched: {target[:30]}", "passed")
                                await _stream_live_screenshot(page, f"Searched: {target}")
                            except Exception:
                                await _hide_cursor(page)
                                execution_log_lines.append(f"    ⚠ No search results for '{value}'")
                                _stream_progress(f"⚠ No results: {value[:30]}", "skipped")

                        elif action_type == "selectSearchResult":
                            search_name = target
                            found_result = False
                            result_selectors = [
                                f'[role="option"]:has-text("{search_name}")',
                                f'[role="listbox"] >> text="{search_name}"',
                                f'.slds-listbox__option:has-text("{search_name}")',
                                f'.search-result:has-text("{search_name}")',
                                f'li:has-text("{search_name}")',
                                f'a:has-text("{search_name}")',
                                f'[data-value="{search_name}"]',
                            ]
                            for sel in result_selectors:
                                try:
                                    rloc = page.locator(sel).first
                                    cnt = await rloc.count()
                                    if cnt > 0:
                                        await rloc.wait_for(state="visible", timeout=5000)
                                        rbox = await rloc.bounding_box()
                                        if rbox:
                                            await _move_cursor(page, rbox["x"] + rbox["width"]/2, rbox["y"] + rbox["height"]/2, f"Select: {search_name[:25]}")
                                        await _click_effect(page)
                                        await rloc.click()
                                        await page.wait_for_timeout(1500)
                                        await _hide_cursor(page)
                                        execution_log_lines.append(f"    ✓ Selected search result: '{search_name}'")
                                        _stream_progress(f"✓ Selected: {search_name[:30]}", "passed")
                                        await _stream_live_screenshot(page, f"Selected: {search_name[:25]}")
                                        found_result = True
                                        break
                                except Exception:
                                    continue

                            if not found_result:
                                combo_selectors = [
                                    'input[id*="combobox"]',
                                    'input[role="combobox"]',
                                    'input[role="searchbox"]',
                                    'input[aria-autocomplete="list"]',
                                    'input[role="textbox"][id*="combobox"]',
                                ]
                                combo_found_any = False
                                for cs in combo_selectors:
                                    cnt_check = await page.locator(cs).count()
                                    if cnt_check > 0:
                                        combo_found_any = True
                                        break
                                if not combo_found_any:
                                    try:
                                        await page.go_back(wait_until="domcontentloaded")
                                        await page.wait_for_timeout(3000)
                                        execution_log_lines.append(f"    → Navigated back to find lookup combobox")
                                    except Exception:
                                        pass
                                for cs in combo_selectors:
                                    try:
                                        combos = page.locator(cs)
                                        combo_cnt = await combos.count()
                                        tried = 0
                                        for ci in range(combo_cnt):
                                            combo_el = combos.nth(ci)
                                            if not await combo_el.is_visible():
                                                continue
                                            tried += 1
                                            if tried > 2:
                                                break
                                            await combo_el.click()
                                            await combo_el.fill(search_name.split()[0] if " " in search_name else search_name)
                                            await page.wait_for_timeout(2000)
                                            opt = page.locator(f'[role="option"]:has-text("{search_name}")')
                                            opt_cnt = await opt.count()
                                            if opt_cnt > 0:
                                                first_opt = opt.first
                                                obox = await first_opt.bounding_box()
                                                if obox:
                                                    await _move_cursor(page, obox["x"] + obox["width"]/2, obox["y"] + obox["height"]/2, f"Select: {search_name[:25]}")
                                                await _click_effect(page)
                                                await first_opt.click()
                                                await page.wait_for_timeout(1500)
                                                await _hide_cursor(page)
                                                execution_log_lines.append(f"    ✓ Selected from combobox: '{search_name}'")
                                                _stream_progress(f"✓ Selected: {search_name[:30]}", "passed")
                                                await _stream_live_screenshot(page, f"Selected: {search_name[:25]}")
                                                found_result = True
                                                break
                                            else:
                                                all_opts = page.locator('[role="option"]')
                                                all_cnt = await all_opts.count()
                                                if all_cnt > 0:
                                                    first_opt = all_opts.first
                                                    first_text = await first_opt.text_content()
                                                    if search_name.lower().split()[0] in (first_text or "").lower():
                                                        obox = await first_opt.bounding_box()
                                                        if obox:
                                                            await _move_cursor(page, obox["x"] + obox["width"]/2, obox["y"] + obox["height"]/2, f"Select: {search_name[:25]}")
                                                        await _click_effect(page)
                                                        await first_opt.click()
                                                        await page.wait_for_timeout(1500)
                                                        await _hide_cursor(page)
                                                        execution_log_lines.append(f"    ✓ Selected closest match from combobox: '{first_text[:50]}'")
                                                        _stream_progress(f"✓ Selected: {search_name[:30]}", "passed")
                                                        await _stream_live_screenshot(page, f"Selected: {search_name[:25]}")
                                                        found_result = True
                                                        break
                                                await combo_el.fill("")
                                                await page.wait_for_timeout(300)
                                    except Exception:
                                        continue
                                    if found_result:
                                        break

                            if not found_result:
                                try:
                                    text_loc = page.get_by_text(search_name, exact=False).first
                                    await text_loc.wait_for(state="visible", timeout=3000)
                                    rbox = await text_loc.bounding_box()
                                    if rbox:
                                        await _move_cursor(page, rbox["x"] + rbox["width"]/2, rbox["y"] + rbox["height"]/2, f"Select: {search_name[:25]}")
                                    await _click_effect(page)
                                    await text_loc.click()
                                    await page.wait_for_timeout(1500)
                                    await _hide_cursor(page)
                                    execution_log_lines.append(f"    ✓ Selected result by text: '{search_name}'")
                                    _stream_progress(f"✓ Selected: {search_name[:30]}", "passed")
                                    await _stream_live_screenshot(page, f"Selected: {search_name[:25]}")
                                    found_result = True
                                except Exception:
                                    pass
                            if not found_result:
                                execution_log_lines.append(f"    ⚠ Search result not found: '{search_name}'")
                                _stream_progress(f"⚠ Result not found: {search_name[:30]}", "skipped")
                                scenario_errors += 1
                                step_errors += 1
                                await _stream_live_screenshot(page, f"Not found: {search_name[:25]}")

                        else:
                            await _click_effect(page)
                            await locator.click()
                            await page.wait_for_timeout(500)
                            await _hide_cursor(page)
                            execution_log_lines.append(f"    ✓ {action_type} on '{target}'")
                            _stream_progress(f"✓ {action_type}: {target[:30]}", "passed")
                            await _stream_live_screenshot(page, f"{action_type}: {target}")

                    except Exception as e:
                        execution_log_lines.append(f"    ✗ Error: {str(e)[:150]}")
                        _stream_progress(f"✗ Error: {str(e)[:40]}", "failed")
                        scenario_errors += 1
                        step_errors += 1
                        try:
                            await _hide_cursor(page)
                            await _stream_live_screenshot(page, f"Error at step {i+1}")
                        except Exception:
                            pass

                s_status = "passed" if scenario_errors == 0 else "failed"
                scenario_duration_ms = int((time.time() - scenario_start_ts) * 1000)
                scenario_results.append({
                    "name": scenario_name,
                    "status": s_status,
                    "errors": scenario_errors,
                    "actions": len(actions),
                    "duration_ms": scenario_duration_ms,
                })
                execution_log_lines.append(f"\n  Result: {s_status.upper()} ({len(actions)} steps, {scenario_errors} errors)")
                _stream_progress(f"Scenario {s_idx+1}: {s_status.upper()}", s_status)

            await _hide_cursor(page)

            passed_scenarios = sum(1 for s in scenario_results if s["status"] == "passed")
            failed_scenarios = sum(1 for s in scenario_results if s["status"] != "passed")

            execution_log_lines.append(f"\n{'='*60}")
            execution_log_lines.append(f"EXECUTION SUMMARY")
            execution_log_lines.append(f"Scenarios: {len(scenario_results)} total, {passed_scenarios} passed, {failed_scenarios} failed")
            execution_log_lines.append(f"Total steps: {total_actions}, Errors: {step_errors}")
            for sr in scenario_results:
                icon = "✓" if sr["status"] == "passed" else "✗"
                execution_log_lines.append(f"  {icon} {sr['name']}: {sr['status'].upper()}")

            await context.close()
            await browser.close()

            video_urls = []
            for fname in os.listdir(case_screenshot_dir):
                if fname.endswith(".webm"):
                    video_urls.append(f"/uploads/test-screenshots/{case_id_str}/{fname}")

            status = "passed" if step_errors == 0 else "failed"

            return {
                "status": status,
                "screenshots": [],
                "videos": video_urls,
                "log": "\n".join(execution_log_lines),
                "summary": f"Scenarios: {passed_scenarios}/{len(scenario_results)} passed | Steps: {total_actions}, Errors: {step_errors}",
                "scenario_results": scenario_results,
            }

    except Exception as e:
        execution_log_lines.append(f"Fatal error: {str(e)}")
        return {
            "status": "error",
            "screenshots": all_screenshots,
            "videos": [],
            "log": "\n".join(execution_log_lines),
            "summary": "",
        }


_execution_locks: dict = {}


@router.post("/{case_id}/clear-lock")
async def clear_execution_lock(case_id: UUID):
    cid = str(case_id)
    _execution_locks.pop(cid, None)
    _live_execution_events.pop(cid, None)
    return {"cleared": True}


@router.post("/{case_id}/execute")
async def execute_playwright(case_id: UUID, db: Session = Depends(get_db)):
    case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Test case not found")

    gherkin = case.gherkin_script
    if not gherkin:
        raise HTTPException(status_code=400, detail="Generate and approve Gherkin first")

    if case.gherkin_approved != "yes":
        raise HTTPException(status_code=400, detail="Gherkin must be approved before execution")

    cid = str(case_id)
    lock_time = _execution_locks.get(cid)
    if lock_time:
        if isinstance(lock_time, (int, float)) and (time.time() - lock_time) > 300:
            _execution_locks.pop(cid, None)
            _live_execution_events.pop(cid, None)
        else:
            raise HTTPException(status_code=409, detail="Execution already in progress for this test case")

    suite = db.query(TestSuite).filter(TestSuite.id == case.test_suite_id).first()
    project = db.query(Project).filter(Project.id == suite.project_id).first() if suite else None
    app_url = project.app_url if project else ""

    if not app_url:
        raise HTTPException(status_code=400, detail="Project has no application URL configured")

    _execution_locks[cid] = time.time()
    prior_case_status = case.status
    case.status = "executing"
    case.execution_result = ""
    case.execution_log = ""
    db.commit()

    from server_py.models.test_run import TestRun, TestRunScenario
    from datetime import datetime, timezone
    from sqlalchemy.exc import IntegrityError
    run_started_at = datetime.now(timezone.utc)
    # Allocate run_number with a small retry loop. The unique constraint on
    # (test_case_id, run_number) guarantees monotonic numbering even under
    # concurrent execution; on collision we recompute and try again.
    test_run = None
    for _attempt in range(5):
        max_run = db.query(func.coalesce(func.max(TestRun.run_number), 0)).filter(
            TestRun.test_case_id == case.id
        ).scalar() or 0
        candidate = TestRun(
            test_case_id=case.id,
            project_id=project.id if project else None,
            suite_id=suite.id if suite else None,
            run_number=int(max_run) + 1,
            started_at=run_started_at,
            status="running",
            triggered_by="user",
        )
        db.add(candidate)
        try:
            db.commit()
            db.refresh(candidate)
            test_run = candidate
            break
        except IntegrityError:
            db.rollback()
    if test_run is None:
        # Release the execution lock and restore the prior case status so a
        # failed allocation doesn't leave the case stuck in "executing".
        _execution_locks.pop(cid, None)
        case.status = prior_case_status or "draft"
        db.commit()
        raise HTTPException(status_code=503, detail="Could not allocate run_number; please retry")

    case_screenshot_dir = os.path.join(SCREENSHOTS_DIR, cid)
    if os.path.exists(case_screenshot_dir):
        shutil.rmtree(case_screenshot_dir)
    os.makedirs(case_screenshot_dir, exist_ok=True)

    _live_execution_events[cid] = []

    try:
        result = await _execute_live_browser(cid, app_url, gherkin, case_screenshot_dir)
    except Exception as e:
        result = {"status": "error", "screenshots": [], "videos": [], "log": str(e), "summary": "", "scenario_results": []}
    finally:
        _execution_locks.pop(cid, None)
        if test_run.status == "running":
            test_run.status = result.get("status", "error")
            test_run.finished_at = datetime.now(timezone.utc)
            test_run.duration_ms = int((test_run.finished_at - run_started_at).total_seconds() * 1000)
            db.commit()

    case.execution_result = result["status"]
    case.execution_log = result["log"][:10000]
    case.status = "passed" if result["status"] == "passed" else "failed"

    try:
        pw_code = _generate_playwright_code(gherkin, app_url, case.jira_story_key or case.title or "test")
        case.playwright_code = pw_code
    except Exception:
        pass

    suite = db.query(TestSuite).filter(TestSuite.id == case.test_suite_id).first()
    if suite:
        _update_suite_counts(suite, db)

    # Commit the primary case + suite updates first so they cannot be undone by
    # an unrelated run-history persistence failure below.
    db.commit()
    db.refresh(case)

    try:
        run_finished_at = datetime.now(timezone.utc)
        duration_ms = int((run_finished_at - run_started_at).total_seconds() * 1000)
        scenario_results = result.get("scenario_results", []) or []
        passed_n = sum(1 for s in scenario_results if s.get("status") == "passed")
        failed_n = sum(1 for s in scenario_results if s.get("status") != "passed")
        total_steps = sum(int(s.get("actions", 0)) for s in scenario_results)
        total_errors = sum(int(s.get("errors", 0)) for s in scenario_results)
        videos = result.get("videos", []) or []

        test_run.finished_at = run_finished_at
        test_run.duration_ms = duration_ms
        test_run.status = result["status"]
        test_run.total_scenarios = len(scenario_results)
        test_run.passed_scenarios = passed_n
        test_run.failed_scenarios = failed_n
        test_run.total_steps = total_steps
        test_run.errors = total_errors
        test_run.video_path = videos[0] if videos else ""
        test_run.summary = (result.get("summary") or "")[:1000]
        full_log = result.get("log") or ""
        test_run.full_log = full_log
        test_run.log_excerpt = full_log[-60000:]

        for idx, sr in enumerate(scenario_results):
            db.add(TestRunScenario(
                run_id=test_run.id,
                name=str(sr.get("name", f"Scenario {idx+1}"))[:500],
                status=sr.get("status", "passed"),
                errors=int(sr.get("errors", 0)),
                actions=int(sr.get("actions", 0)),
                duration_ms=int(sr.get("duration_ms", 0) or 0),
                order_index=idx,
            ))
        db.commit()
    except Exception as e:
        import logging
        logging.exception("Failed to record test run for case %s: %s", case.id, e)
        db.rollback()

    # Auto-triage failures (best-effort; never blocks the user)
    try:
        if test_run.status in ("failed", "error"):
            from server_py.services.failure_triage import triage_run as _triage_run
            _triage_run(str(test_run.id), db)
    except Exception:
        import logging
        logging.exception("Auto-triage failed for run %s", test_run.id)
        db.rollback()

    # Recompute release risk (best-effort)
    try:
        from server_py.services.risk_engine import safe_recompute as _risk_recompute
        _risk_recompute(db, test_run.project_id, trigger="run_completed")
    except Exception:
        import logging
        logging.exception("Risk recompute failed for run %s", test_run.id)

    _live_execution_events.setdefault(str(case_id), []).append({
        "type": "done",
        "result": case.execution_result,
        "screenshots": result["screenshots"],
        "videos": result["videos"],
    })

    return {
        "case_id": str(case_id),
        "result": case.execution_result,
        "summary": result.get("summary", ""),
        "log": case.execution_log,
        "screenshots": result["screenshots"],
        "videos": result["videos"],
    }


@router.get("/{case_id}/screenshots")
def get_screenshots(case_id: UUID):
    case_dir = os.path.join(SCREENSHOTS_DIR, str(case_id))
    if not os.path.exists(case_dir):
        return {"screenshots": [], "videos": []}
    screenshots = []
    videos = []
    for f_name in sorted(os.listdir(case_dir)):
        url = f"/uploads/test-screenshots/{case_id}/{f_name}"
        if f_name.endswith(".png") and not f_name.startswith("live_"):
            screenshots.append(url)
        elif f_name.endswith(".webm"):
            videos.append(url)
    return {"screenshots": screenshots, "videos": videos}


def _cleanup_live_screenshots(case_id_str: str):
    case_dir = os.path.join(SCREENSHOTS_DIR, case_id_str)
    if os.path.exists(case_dir):
        for fname in os.listdir(case_dir):
            if fname.startswith("live_") and fname.endswith(".png"):
                try:
                    os.remove(os.path.join(case_dir, fname))
                except Exception:
                    pass


@router.get("/{case_id}/live-stream")
async def live_execution_stream(case_id: UUID):
    from fastapi.responses import StreamingResponse

    async def event_generator():
        cid = str(case_id)
        sent = 0
        timeout_counter = 0
        try:
            while timeout_counter < 600:
                events = _live_execution_events.get(cid, [])
                while sent < len(events):
                    evt = events[sent]
                    yield f"data: {json.dumps(evt)}\n\n"
                    sent += 1
                    if evt.get("type") == "done":
                        return
                await asyncio.sleep(0.5)
                timeout_counter += 0.5
                if int(timeout_counter) % 5 == 0:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'result': 'timeout'})}\n\n"
        finally:
            _live_execution_events.pop(cid, None)
            _cleanup_live_screenshots(cid)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{case_id}/self-heal")
def self_heal(case_id: UUID, db: Session = Depends(get_db)):
    case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Test case not found")

    if case.execution_result != "failed" and case.status != "failed":
        raise HTTPException(status_code=400, detail="Self-healing only applies to failed tests")

    if not case.gherkin_script or not case.execution_log:
        raise HTTPException(status_code=400, detail="No execution data to analyze for self-healing")

    suite = db.query(TestSuite).filter(TestSuite.id == case.test_suite_id).first()
    project = db.query(Project).filter(Project.id == suite.project_id).first() if suite else None
    app_url = project.app_url if project else ""

    dom_context = ""
    crawl_screenshot_b64 = ""
    if app_url:
        crawl = _crawl_page_sync(app_url)
        if crawl.get("elements"):
            dom_context = f"\n## LIVE PAGE DOM (Re-crawled from {app_url})\n"
            for el in crawl["elements"][:80]:
                parts = [f"<{el['tag']}"]
                if el.get("type"): parts.append(f'type="{el["type"]}"')
                if el.get("id"): parts.append(f'id="{el["id"]}"')
                if el.get("name"): parts.append(f'name="{el["name"]}"')
                if el.get("placeholder"): parts.append(f'placeholder="{el["placeholder"]}"')
                if el.get("ariaLabel"): parts.append(f'aria-label="{el["ariaLabel"]}"')
                if el.get("associatedLabel"): parts.append(f'label="{el["associatedLabel"]}"')
                if el.get("role"): parts.append(f'role="{el["role"]}"')
                if el.get("dataTestId"): parts.append(f'data-testid="{el["dataTestId"]}"')
                if el.get("text") and len(el["text"]) < 60: parts.append(f'text="{el["text"]}"')
                parts.append(">")
                dom_context += "- " + " ".join(parts) + "\n"
            dom_context += "\nUse EXACT field labels/names from the DOM above in your Gherkin steps.\n"
            crawl_screenshot_b64 = crawl.get("screenshot_b64", "")

    prompt = f"""You are a Self-Healing BDD Test Engine. A Gherkin test was executed against a live browser and FAILED.
Your job is to fix the **Gherkin script** so the next execution will succeed.

## IMPORTANT CONTEXT
The execution engine parses Gherkin steps using these patterns (any other phrasing is silently dropped):
- Fill fields: `I fill "Field Name" with "value"` or `I type "value" into the "Field Name" field`
- Click buttons: `I click "Button"` or `I click the "Button" button`
- Select radio: `I select the radio option "Option text"`
- Select from results: `I select "Item" from the company search results`
- Leave blank: `I leave the "Field Name" field blank`
- Assert visible: `I should see "text"` or `I should see a confirmation message "text"` or `I should see a validation error for "field"`
- Navigate: `I navigate to "url"`

## Failed Test
**Title**: {case.title}
**JIRA Story**: {case.jira_story_key}

## Current Gherkin (FAILED)
{case.gherkin_script}

## Execution Log (shows which steps failed and why)
{case.execution_log[:6000]}

## Application URL
{app_url}
{dom_context}

## Self-Healing Instructions

1. Analyze the execution log to identify which steps failed and why (e.g. "Not found: First Name" means the field label doesn't match the DOM).
2. Cross-reference failed selectors with the LIVE DOM above to find the correct field labels, names, or text.
3. Fix the Gherkin steps to use the exact labels/names from the DOM.
4. Common fixes:
   - Wrong field label → use the exact `label=` or `name=` from DOM (e.g. "Best Contact Number" not "Phone")
   - Missing fields → add steps for all required form fields shown in the DOM
   - Wrong button text → use exact button text from DOM
   - Timing issues → the engine handles timing automatically, no need for wait steps
   - Company search → use `I select "Company" from the company search results` pattern

Return ONLY the fixed Gherkin script. Keep the same Feature name, tags, Background, and Scenario structure.
No markdown fencing, no explanations — just the raw Gherkin text."""

    messages = [
        {"role": "system", "content": "You are an expert Self-Healing BDD Test Engine. Fix the Gherkin script based on the execution log failures and the live DOM. Return only the corrected Gherkin."},
    ]
    if crawl_screenshot_b64:
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{crawl_screenshot_b64}", "detail": "high"}},
            ],
        })
    else:
        messages.append({"role": "user", "content": prompt})

    try:
        client = _get_openai_client()
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.2,
            max_tokens=6000,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)[:200]}")

    healed_gherkin = resp.choices[0].message.content.strip()
    if healed_gherkin.startswith("```"):
        lines_raw = healed_gherkin.split("\n")
        healed_gherkin = "\n".join(lines_raw[1:-1] if lines_raw[-1].strip() == "```" else lines_raw[1:])

    previous_gherkin = case.gherkin_script or ""
    previous_pw = case.playwright_code or ""

    case.gherkin_script = healed_gherkin

    pw_code = _generate_playwright_code(healed_gherkin, app_url, case.jira_story_key or case.title or "test")
    case.playwright_code = pw_code

    healing_log = (
        f"Self-healing applied:\n"
        f"- Previous result: {case.execution_result}\n"
        f"- Errors analyzed from execution log\n"
        f"- Gherkin steps corrected to match live DOM selectors\n"
        f"- Playwright code regenerated from healed Gherkin\n"
        f"- Previous Gherkin preserved in healing log"
    )

    case.self_healing_log = f"--- Previous Gherkin ---\n{previous_gherkin[:3000]}\n\n--- Previous Playwright ---\n{previous_pw[:2000]}\n\n--- Healing Applied ---\n{healing_log}"
    case.execution_result = ""
    case.execution_log = ""
    case.status = "ready"
    db.commit()
    db.refresh(case)

    return {
        "case_id": str(case_id),
        "healed_gherkin": healed_gherkin,
        "healed_playwright": pw_code,
        "healing_log": healing_log,
    }


@router.post("/{case_id}/add-to-regression")
def add_to_regression_suite(case_id: UUID, db: Session = Depends(get_db)):
    case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Test case not found")

    suite = db.query(TestSuite).filter(TestSuite.id == case.test_suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Test suite not found")

    regression = db.query(TestSuite).filter(
        TestSuite.project_id == suite.project_id,
        TestSuite.suite_type == "regression",
    ).first()

    if not regression:
        regression = TestSuite(
            project_id=suite.project_id,
            name="Automated Regression Suite",
            suite_type="regression",
            description="Auto-generated regression suite from sprint test cases",
            status="draft",
        )
        db.add(regression)
        db.flush()

    existing = db.query(TestCase).filter(
        TestCase.test_suite_id == regression.id,
        TestCase.jira_story_key == case.jira_story_key,
    ).first()

    if existing:
        existing.gherkin_script = case.gherkin_script
        existing.playwright_code = case.playwright_code
        existing.title = case.title
        existing.description = case.description
        db.commit()
        return {"status": "updated", "regression_suite_id": str(regression.id), "case_id": str(existing.id)}

    regression_case = TestCase(
        test_suite_id=regression.id,
        title=case.title,
        description=case.description,
        preconditions=case.preconditions,
        steps=case.steps,
        expected_result=case.expected_result,
        priority=case.priority,
        status="ready",
        category="Regression",
        jira_story_key=case.jira_story_key,
        gherkin_script=case.gherkin_script,
        playwright_code=case.playwright_code,
    )
    db.add(regression_case)
    regression.total_cases = (regression.total_cases or 0) + 1
    db.commit()

    return {"status": "added", "regression_suite_id": str(regression.id), "case_id": str(regression_case.id)}


class BulkGenerateRequest(BaseModel):
    case_ids: list[str]


@router.post("/bulk-generate-gherkin")
def bulk_generate_gherkin(data: BulkGenerateRequest, db: Session = Depends(get_db)):
    results = []
    for cid in data.case_ids:
        try:
            r = generate_gherkin(UUID(cid), None, db)
            results.append({"case_id": cid, "status": "success"})
        except Exception as e:
            results.append({"case_id": cid, "status": "error", "error": str(e)})
    return {"results": results}


@router.post("/bulk-generate-playwright")
def bulk_generate_playwright(data: BulkGenerateRequest, db: Session = Depends(get_db)):
    results = []
    for cid in data.case_ids:
        try:
            r = generate_playwright(UUID(cid), db)
            results.append({"case_id": cid, "status": "success"})
        except Exception as e:
            results.append({"case_id": cid, "status": "error", "error": str(e)})
    return {"results": results}


@router.get("/{case_id}/code")
def get_test_code(case_id: UUID, db: Session = Depends(get_db)):
    case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Test case not found")
    return _serialize_test_case(case)


def _serialize_test_case(case: TestCase) -> dict:
    return {
        "case_id": str(case.id),
        "test_suite_id": str(case.test_suite_id),
        "title": case.title,
        "description": case.description or "",
        "preconditions": case.preconditions or "",
        "steps": case.steps or "",
        "expected_result": case.expected_result or "",
        "priority": case.priority or "medium",
        "status": case.status or "draft",
        "category": case.category or "",
        "jira_story_key": case.jira_story_key or "",
        "gherkin_script": case.gherkin_script or "",
        "gherkin_approved": case.gherkin_approved or "",
        "playwright_code": case.playwright_code or "",
        "execution_result": case.execution_result or "",
        "execution_log": case.execution_log or "",
        "self_healing_log": case.self_healing_log or "",
    }


def _map_priority(jira_priority: str) -> str:
    mapping = {
        "highest": "critical",
        "high": "high",
        "medium": "medium",
        "low": "low",
        "lowest": "low",
    }
    return mapping.get((jira_priority or "").lower(), "medium")


def _update_suite_counts(suite: TestSuite, db: Session):
    cases = db.query(TestCase).filter(TestCase.test_suite_id == suite.id).all()
    suite.total_cases = len(cases)
    suite.passed_cases = sum(1 for c in cases if c.status == "passed")
    suite.failed_cases = sum(1 for c in cases if c.status == "failed")


class BatchExecuteRequest(BaseModel):
    case_ids: list[str]


@router.post("/batch-execute")
async def batch_execute(data: BatchExecuteRequest, db: Session = Depends(get_db)):
    results = []
    for cid_str in data.case_ids:
        try:
            cid = UUID(cid_str)
            result = await execute_playwright(cid, db)
            results.append({"case_id": cid_str, "status": "completed", "result": result.get("result", "")})
        except HTTPException as e:
            results.append({"case_id": cid_str, "status": "skipped", "reason": e.detail})
        except Exception as e:
            results.append({"case_id": cid_str, "status": "error", "reason": str(e)[:200]})
    return {"results": results}
