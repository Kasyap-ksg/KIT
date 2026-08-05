import os
import json
import uuid as uuid_mod
import asyncio
import base64
from typing import List, Dict, Any, Optional

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")

SYNTHETIC_DATA = {
    "firstName": "Akhleaditya",
    "lastName": "M",
    "email": "sample@sample.com",
    "confirmEmail": "sample@sample.com",
    "phone": "1234567890",
    "jobTitle": "Solution Lead",
    "company": "Sam's Hospitality LLC",
    "property": "The Sam Houston",
    "comments": "Testing journey validation",
    "name": "Akhleaditya M",
    "address": "123 Main Street",
    "city": "Houston",
    "state": "Texas",
    "zip": "77001",
    "country": "United States",
}


SCREEN_NAVIGATION_PROMPT = """You are an expert QA automation engineer controlling a Playwright browser on a live web application.

You are given:
1. A Figma PROTOTYPE screenshot showing the TARGET visual state of this screen
2. A screenshot of the CURRENT state of the live application  
3. Context about previously matched screens and what screens come NEXT in the prototype

YOUR ABSOLUTE #1 RULE: The goal is to make the live app LOOK EXACTLY LIKE the prototype screenshot — nothing more, nothing less. Do NOT go beyond what the prototype screen shows.

CRITICAL RULES:
1. NEVER submit a form or click a submit button UNLESS the NEXT prototype screen explicitly shows the result of that submission (e.g., a "Thank You" page, confirmation, or success message). If the current prototype screen shows a form WITH a submit button visible, that does NOT mean you should click it — the submit button is just part of the visual design of the form.

2. If the prototype shows a form page:
   - Fill ALL visible input fields with synthetic test data so the form looks populated
   - Select radio buttons, dropdown options, etc. that appear selected in the prototype
   - DO NOT click Submit/Send/Save — just populate the form to match the visual state
   - The only exception is if there is a NEXT prototype screen that shows a post-submission state

3. If the prototype shows a confirmation/success/thank-you page, THEN you need to submit the form to reach that state. But ONLY if the prototype explicitly shows this screen.

4. If the app already shows the same page/content as the prototype, set app_matches=true.

5. For form fields, use synthetic data keys: $firstName, $lastName, $email, $confirmEmail, $phone, $jobTitle, $company, $property, $comments, $name, $address, $city, $state, $zip, $country

6. For radio buttons, use the EXACT visible option text from the prototype.

7. For search/lookup fields (like company or property pickers), use searchAndSelect action.

8. If the page has a loading state, add a wait action first (2000-3000ms).

9. If you need to scroll to reveal content visible in the prototype, include scroll actions.

10. Be very precise with field labels — use EXACT text visible in the prototype.

Return ONLY valid JSON:
```json
{
  "screen_description": "what this prototype screen shows",
  "app_matches": false,
  "actions": [
    {
      "action": "fill|click|selectRadio|selectDropdown|searchAndSelect|scroll|wait",
      "target": "exact field label or button text visible in the prototype",
      "value": "text to enter or $fieldName for synthetic data",
      "description": "human readable description"
    }
  ]
}
```

Available actions:
- fill: Type into input field. target = field label text, value = $fieldName or literal text
- click: Click button/link/tab. target = visible text. NEVER use this to click Submit unless a NEXT prototype screen shows the post-submission result
- selectRadio: Select radio option. target = group label (optional), value = exact option text  
- selectDropdown: Select dropdown option. target = dropdown label, value = option text
- searchAndSelect: Type in search/lookup field, pick from results. target = field label, value = search term
- scroll: Scroll page. value = "down" or "up" or "bottom"
- wait: Pause for loading. value = milliseconds (e.g., "3000")

EXAMPLE — Prototype shows a "Request Access" form (and NO next screen shows a thank-you page):
```json
{
  "screen_description": "Request Access form with user details fields and submit button",
  "app_matches": false,
  "actions": [
    {"action": "wait", "target": "", "value": "2000", "description": "Wait for page to fully load"},
    {"action": "scroll", "target": "", "value": "down", "description": "Scroll to reveal form fields"},
    {"action": "selectRadio", "target": "", "value": "I am new to Hilton and I don't have Lobby credentials", "description": "Select the reason radio option"},
    {"action": "fill", "target": "First Name", "value": "$firstName", "description": "Fill first name field"},
    {"action": "fill", "target": "Last Name", "value": "$lastName", "description": "Fill last name field"},
    {"action": "fill", "target": "Email Address", "value": "$email", "description": "Fill email field"},
    {"action": "fill", "target": "Job Title", "value": "$jobTitle", "description": "Fill job title"},
    {"action": "searchAndSelect", "target": "Company", "value": "$company", "description": "Search and select company"},
    {"action": "scroll", "target": "", "value": "bottom", "description": "Scroll to see all fields"}
  ]
}
```
NOTE: No submit action in the example above — the prototype shows the form, not the result of submitting it.

EXAMPLE — Prototype screen 2 shows a "Thank You" confirmation after form submission (screen 1 was the form):
```json
{
  "screen_description": "Thank You confirmation page after form submission",
  "app_matches": false,
  "actions": [
    {"action": "click", "target": "Submit Request", "value": "", "description": "Submit the form to reach the thank you page"}
  ]
}
```"""


JUDGE_VALIDATION_PROMPT = """You are an impartial LLM Judge reviewing the output of an AI design validation system. Your job is to verify and validate the findings, scores, and metrics produced by the analysis pipeline.

You will receive:
1. The Figma prototype screenshot (the design reference)
2. The live application screenshot (what was actually built)
3. The analysis results produced by the pipeline (structural findings + UX scores)

Your role:
- VERIFY each finding: Is it actually visible in the screenshots? Does the evidence match reality?
- VALIDATE scores: Are they reasonable given what you see? Flag any inflated or deflated scores.
- FILTER false positives: Remove findings that are incorrect or based on misinterpretation.
- IDENTIFY missed issues: Flag important design differences the pipeline missed.
- ASSESS app navigation success: Did the app actually reach the same state as the prototype? If the app shows an empty/loading page while the prototype shows a filled form, that's a MAJOR issue — the scores should be much lower.

Return JSON:
```json
{
  "judge_verdict": "validated|partially_validated|rejected",
  "adjusted_overall_score": <number 0-100>,
  "confidence": <number 0-100>,
  "app_state_correct": true/false,
  "app_state_issue": "description if app didn't reach the right state",
  "validated_findings": [
    {"finding": "description", "severity": "critical|major|minor", "verified": true/false, "judge_note": ""}
  ],
  "removed_findings": [
    {"finding": "original finding text", "reason": "why it was removed"}
  ],
  "missed_issues": [
    {"finding": "description of missed issue", "severity": "critical|major|minor"}
  ],
  "score_adjustments": {
    "original_score": <number>,
    "adjusted_score": <number>,
    "reason": "why the score was adjusted"
  }
}
```

Be strict and evidence-based. Only mark findings as verified if you can clearly see the issue in the screenshots. If the app didn't reach the correct state (e.g., form not filled, wrong page), set app_state_correct=false and significantly reduce the score."""


async def _take_step_screenshot(page, subfolder: str, step_name: str) -> str:
    os.makedirs(os.path.join(UPLOAD_DIR, subfolder), exist_ok=True)
    fname = f"{uuid_mod.uuid4()}.png"
    fpath = os.path.join(UPLOAD_DIR, subfolder, fname)
    await page.screenshot(path=fpath, full_page=False)
    return f"/uploads/{subfolder}/{fname}"


CURSOR_INJECT_JS = """(pos) => {
    let c = document.getElementById('__kit_cursor');
    if (!c) {
        c = document.createElement('div');
        c.id = '__kit_cursor';
        c.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 2L11 22L14.5 13.5L23 10L5 2Z" fill="rgba(59,130,246,0.95)" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>';
        c.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;transition:left 0.35s cubic-bezier(.4,0,.2,1),top 0.35s cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));';
        document.body.appendChild(c);
    }
    c.style.left = pos.x + 'px';
    c.style.top = pos.y + 'px';
    c.style.display = 'block';
}"""

CURSOR_CLICK_EFFECT_JS = """() => {
    const c = document.getElementById('__kit_cursor');
    if (!c) return;
    if (!document.getElementById('__kit_ring_style')) {
        const s = document.createElement('style');
        s.id = '__kit_ring_style';
        s.textContent = '@keyframes __kit_ring{0%{width:0;height:0;opacity:1}100%{width:44px;height:44px;opacity:0}}';
        document.head.appendChild(s);
    }
    const ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;z-index:999998;pointer-events:none;border:2.5px solid rgba(59,130,246,0.7);border-radius:50%;animation:__kit_ring 0.45s ease-out forwards;transform:translate(-50%,-50%);';
    ring.style.left = c.style.left;
    ring.style.top = c.style.top;
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 500);
}"""

CURSOR_LABEL_JS = """(args) => {
    let label = document.getElementById('__kit_action_label');
    if (!label) {
        label = document.createElement('div');
        label.id = '__kit_action_label';
        label.style.cssText = 'position:fixed;z-index:999997;pointer-events:none;background:rgba(15,23,42,0.85);color:white;font:600 12px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;padding:4px 10px;border-radius:6px;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.15);';
        document.body.appendChild(label);
    }
    label.textContent = args.text;
    label.style.left = (args.x + 28) + 'px';
    label.style.top = (args.y - 8) + 'px';
    label.style.display = 'block';
}"""

CURSOR_HIDE_JS = """() => {
    const c = document.getElementById('__kit_cursor');
    if (c) c.style.display = 'none';
    const l = document.getElementById('__kit_action_label');
    if (l) l.style.display = 'none';
}"""


async def _show_cursor_at(page, x: float, y: float, label: str = ""):
    try:
        await page.evaluate(CURSOR_INJECT_JS, {"x": x, "y": y})
        if label:
            await page.evaluate(CURSOR_LABEL_JS, {"x": x, "y": y, "text": label})
        await page.wait_for_timeout(100)
    except Exception:
        pass


async def _show_click_effect(page):
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


async def _find_target_bbox(page, action_data: dict, field_data: dict) -> Optional[dict]:
    action = action_data.get("action", "")
    target = action_data.get("target", "")
    value = action_data.get("value", "")

    if value and isinstance(value, str) and value.startswith("$"):
        key = value[1:]
        value = field_data.get(key, value)

    if action in ("wait", "scroll", "navigate"):
        return None

    el = None
    try:
        if action in ("click", "submit"):
            if target and target.startswith((".", "#", "[", "//", "button", "a", "input")):
                candidate = page.locator(target)
                if await candidate.count() > 0:
                    el = candidate.first
            if not el and target:
                for role in ["button", "link"]:
                    candidate = page.get_by_role(role, name=target, exact=False)
                    if await candidate.count() > 0:
                        el = candidate.first
                        break
            if not el and target:
                candidate = page.get_by_text(target, exact=False)
                if await candidate.count() > 0:
                    el = candidate.first

        elif action == "fill":
            if target and target.startswith((".", "#", "[", "input", "textarea")):
                candidate = page.locator(target)
                if await candidate.count() > 0:
                    el = candidate.first
            if not el and target:
                candidate = page.get_by_label(target, exact=False)
                if await candidate.count() > 0:
                    el = candidate.first
            if not el and target:
                candidate = page.get_by_placeholder(target, exact=False)
                if await candidate.count() > 0:
                    el = candidate.first

        elif action == "selectRadio":
            if value:
                candidate = page.get_by_text(value, exact=False)
                if await candidate.count() > 0:
                    el = candidate.first

        elif action == "searchAndSelect":
            if target:
                candidate = page.get_by_label(target, exact=False)
                if await candidate.count() > 0:
                    el = candidate.first
                if not el:
                    candidate = page.get_by_placeholder(target, exact=False)
                    if await candidate.count() > 0:
                        el = candidate.first

        elif action == "selectDropdown":
            if target:
                candidate = page.get_by_label(target, exact=False)
                if await candidate.count() > 0:
                    el = candidate.first

        if el:
            bbox = await el.bounding_box()
            if bbox:
                return {
                    "x": bbox["x"] + bbox["width"] / 2,
                    "y": bbox["y"] + bbox["height"] / 2,
                }
    except Exception:
        pass

    return None


def _read_image_b64(image_path: str) -> str:
    if image_path.startswith("/uploads/"):
        full_path = os.path.join(UPLOAD_DIR, image_path[len("/uploads/"):])
    else:
        full_path = image_path
    with open(full_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def analyze_screen_navigation(client, prototype_screen: dict, app_screenshot_path: str, previous_screens: List[dict] = None, remaining_screens: List[dict] = None) -> dict:
    content_parts = []

    if previous_screens:
        prev_descs = []
        for i, ps in enumerate(previous_screens):
            prev_descs.append(f"Screen {i+1}: {ps.get('name', '')}")
        context = f"Previously matched {len(previous_screens)} screen(s): {'; '.join(prev_descs)}. The app has already been navigated past those states — do NOT repeat those actions."
        content_parts.append({"type": "text", "text": context})

    has_next_screen = remaining_screens and len(remaining_screens) > 0
    if has_next_screen:
        content_parts.append({"type": "text", "text": f"\nThere are {len(remaining_screens)} more prototype screen(s) after this one. A NEXT screen exists, so if the current screen shows a form, you may need to submit it only if the NEXT prototype screen shows a post-submission result (thank you, confirmation, etc.)."})
    else:
        content_parts.append({"type": "text", "text": "\nThis is the LAST prototype screen — there are NO more screens after this. DO NOT submit any form. Just fill the form fields to match the visual state and stop."})

    content_parts.append({"type": "text", "text": "\n--- TARGET: Figma Prototype Screen ---"})
    try:
        proto_b64 = _read_image_b64(prototype_screen.get("path", ""))
        content_parts.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{proto_b64}", "detail": "high"}})
    except Exception:
        content_parts.append({"type": "text", "text": "(prototype image unavailable)"})

    if has_next_screen:
        content_parts.append({"type": "text", "text": "\n--- NEXT PROTOTYPE SCREEN (for context only — do NOT navigate to this yet) ---"})
        try:
            next_b64 = _read_image_b64(remaining_screens[0].get("path", ""))
            content_parts.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{next_b64}", "detail": "low"}})
        except Exception:
            content_parts.append({"type": "text", "text": "(next screen image unavailable)"})

    content_parts.append({"type": "text", "text": "\n--- CURRENT: Live Application State ---"})
    try:
        app_b64 = _read_image_b64(app_screenshot_path)
        content_parts.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{app_b64}", "detail": "high"}})
    except Exception:
        content_parts.append({"type": "text", "text": "(app image unavailable)"})

    instruction = "\nAnalyze both screenshots. Generate ONLY the actions needed to make the live app match THIS prototype screen visually."
    if not has_next_screen:
        instruction += " This is the LAST screen — DO NOT click submit or any button that would navigate away from this page. Only fill form fields and select options."
    content_parts.append({"type": "text", "text": instruction})

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SCREEN_NAVIGATION_PROMPT},
            {"role": "user", "content": content_parts},
        ],
        max_completion_tokens=3000,
        temperature=0.1,
    )

    raw = response.choices[0].message.content or ""
    json_match = raw
    if "```json" in raw:
        json_match = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        json_match = raw.split("```")[1].split("```")[0].strip()

    try:
        result = json.loads(json_match)
    except json.JSONDecodeError:
        import re
        brace_match = re.search(r'\{[\s\S]*\}', raw)
        if brace_match:
            result = json.loads(brace_match.group())
        else:
            result = {"screen_description": "Parse Error", "app_matches": False, "actions": []}

    return result


async def execute_action(page, action_data: dict, field_data: dict) -> dict:
    action = action_data.get("action", "")
    target = action_data.get("target", "")
    value = action_data.get("value", "")
    description = action_data.get("description", f"{action} on {target}")

    if value and isinstance(value, str) and value.startswith("$"):
        key = value[1:]
        value = field_data.get(key, value)

    result = {
        "action": action,
        "target": target,
        "description": description,
        "status": "pending",
        "error": "",
    }

    try:
        if action == "navigate":
            result["status"] = "skipped"
            result["error"] = "Direct URL navigation disabled for security — use click actions instead"

        elif action == "click":
            clicked = False
            if target.startswith((".", "#", "[", "//", "button", "a", "input", "div", "span")):
                el = page.locator(target)
                if await el.count() > 0:
                    await el.first.scroll_into_view_if_needed()
                    await el.first.click(timeout=10000)
                    clicked = True

            if not clicked:
                el = page.get_by_role("button", name=target, exact=False)
                if await el.count() > 0:
                    await el.first.scroll_into_view_if_needed()
                    await el.first.click(timeout=10000)
                    clicked = True

            if not clicked:
                el = page.get_by_role("link", name=target, exact=False)
                if await el.count() > 0:
                    await el.first.scroll_into_view_if_needed()
                    await el.first.click(timeout=10000)
                    clicked = True

            if not clicked:
                el = page.get_by_text(target, exact=False)
                if await el.count() > 0:
                    await el.first.scroll_into_view_if_needed()
                    await el.first.click(timeout=10000)
                    clicked = True

            if not clicked:
                el = page.locator(f'[aria-label*="{target}" i]')
                if await el.count() > 0:
                    await el.first.scroll_into_view_if_needed()
                    await el.first.click(timeout=10000)
                    clicked = True

            if not clicked:
                result["status"] = "failed"
                result["error"] = f"Element not found: {target}"
            else:
                await page.wait_for_timeout(2000)

        elif action == "fill":
            filled = False
            if target and target.startswith((".", "#", "[", "input", "textarea")):
                el = page.locator(target)
                if await el.count() > 0:
                    await el.first.scroll_into_view_if_needed()
                    await el.first.click()
                    await el.first.fill(value)
                    filled = True

            if not filled and target:
                el = page.get_by_label(target, exact=False)
                if await el.count() > 0:
                    await el.first.scroll_into_view_if_needed()
                    await el.first.click()
                    await el.first.fill(value)
                    filled = True

            if not filled and target:
                el = page.get_by_placeholder(target, exact=False)
                if await el.count() > 0:
                    await el.first.scroll_into_view_if_needed()
                    await el.first.click()
                    await el.first.fill(value)
                    filled = True

            if not filled and target:
                el = page.locator(f'input[name*="{target}" i], textarea[name*="{target}" i]')
                if await el.count() > 0:
                    await el.first.scroll_into_view_if_needed()
                    await el.first.click()
                    await el.first.fill(value)
                    filled = True

            if not filled and target:
                label_el = page.locator(f'label:has-text("{target}")')
                if await label_el.count() > 0:
                    for_attr = await label_el.first.get_attribute("for")
                    if for_attr:
                        input_el = page.locator(f'#{for_attr}')
                        if await input_el.count() > 0:
                            await input_el.first.scroll_into_view_if_needed()
                            await input_el.first.click()
                            await input_el.first.fill(value)
                            filled = True
                    if not filled:
                        sibling = label_el.first.locator(".. >> input, .. >> textarea")
                        if await sibling.count() > 0:
                            await sibling.first.scroll_into_view_if_needed()
                            await sibling.first.click()
                            await sibling.first.fill(value)
                            filled = True

            if not filled:
                result["status"] = "failed"
                result["error"] = f"Input not found: {target}"
            else:
                await page.wait_for_timeout(500)

        elif action == "selectRadio":
            found = False
            if target and target.strip() and target.startswith((".", "#", "[", "input")):
                el = page.locator(target)
                if await el.count() > 0:
                    await el.first.scroll_into_view_if_needed()
                    await el.first.click(force=True)
                    await page.wait_for_timeout(1500)
                    found = True

            if not found and value:
                try:
                    text_el = page.get_by_text(value, exact=False)
                    if await text_el.count() > 0:
                        await text_el.first.scroll_into_view_if_needed()
                        await text_el.first.click()
                        await page.wait_for_timeout(1500)
                        found = True
                except Exception:
                    pass

            if not found and value:
                try:
                    label_el = page.locator(f'label:has-text("{value}")')
                    if await label_el.count() > 0:
                        await label_el.first.scroll_into_view_if_needed()
                        await label_el.first.click()
                        await page.wait_for_timeout(1500)
                        found = True
                except Exception:
                    pass

            if not found and value:
                try:
                    radio_el = page.locator(f'input[type="radio"][value="{value}"]')
                    if await radio_el.count() > 0:
                        await radio_el.first.scroll_into_view_if_needed()
                        await radio_el.first.click(force=True)
                        await page.wait_for_timeout(1500)
                        found = True
                except Exception:
                    pass

            if not found:
                result["status"] = "failed"
                result["error"] = f"Radio option not found: {value or target}"

        elif action == "selectDropdown":
            el = page.locator(target) if target else page.locator("select")
            if await el.count() > 0:
                await el.first.select_option(label=value, timeout=5000)
                await page.wait_for_timeout(1000)
            else:
                result["status"] = "failed"
                result["error"] = f"Dropdown not found: {target}"

        elif action == "searchAndSelect":
            search_el = None

            if target and target.startswith((".", "#", "[", "input")):
                el = page.locator(target)
                if await el.count() > 0:
                    search_el = el

            if not search_el and target:
                el = page.get_by_label(target, exact=False)
                if await el.count() > 0:
                    search_el = el

            if not search_el and target:
                el = page.get_by_placeholder(target, exact=False)
                if await el.count() > 0:
                    search_el = el

            if not search_el and target:
                label_el = page.locator(f'label:has-text("{target}")')
                if await label_el.count() > 0:
                    container = label_el.first.locator(".. >> input")
                    if await container.count() > 0:
                        search_el = container

            if search_el:
                await search_el.first.scroll_into_view_if_needed()
                await search_el.first.click()
                await search_el.first.fill(value)
                await page.wait_for_timeout(2500)

                option = page.locator(f'[role="option"]:has-text("{value}"), li:has-text("{value}"), .slds-listbox__option:has-text("{value}")')
                if await option.count() > 0:
                    await option.first.click()
                    await page.wait_for_timeout(1000)
                else:
                    listbox = page.locator('[role="listbox"] li, .dropdown-item, .autocomplete-option, [role="option"]')
                    if await listbox.count() > 0:
                        await listbox.first.click()
                        await page.wait_for_timeout(1000)
                    else:
                        await page.keyboard.press("Enter")
                        await page.wait_for_timeout(1000)
            else:
                result["status"] = "failed"
                result["error"] = f"Search field not found: {target}"

        elif action == "submit":
            submit_el = None
            if target and target.strip():
                if target.startswith((".", "#", "[", "button", "input")):
                    el = page.locator(target)
                    if await el.count() > 0:
                        submit_el = el
                if not submit_el:
                    el = page.get_by_role("button", name=target, exact=False)
                    if await el.count() > 0:
                        submit_el = el
                if not submit_el:
                    el = page.get_by_text(target, exact=False)
                    if await el.count() > 0:
                        submit_el = el

            if not submit_el:
                el = page.locator('button[type="submit"], input[type="submit"]')
                if await el.count() > 0:
                    submit_el = el

            if not submit_el:
                for btn_text in ["Submit", "Send", "Save", "Next", "Continue", "Request", "Apply", "Submit Request"]:
                    el = page.get_by_role("button", name=btn_text, exact=False)
                    if await el.count() > 0:
                        submit_el = el
                        break

            if submit_el:
                await submit_el.first.scroll_into_view_if_needed()
                await submit_el.first.click()
                await page.wait_for_timeout(3000)
                try:
                    await page.wait_for_load_state("networkidle", timeout=10000)
                except Exception:
                    pass
            else:
                result["status"] = "failed"
                result["error"] = "Submit button not found"

        elif action == "scroll":
            direction = value or "down"
            if direction == "down":
                await page.evaluate("window.scrollBy(0, 500)")
            elif direction == "up":
                await page.evaluate("window.scrollBy(0, -500)")
            elif direction == "bottom":
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            elif direction == "top":
                await page.evaluate("window.scrollTo(0, 0)")
            await page.wait_for_timeout(1000)

        elif action == "wait":
            ms = int(value) if value and str(value).isdigit() else 2000
            await page.wait_for_timeout(min(ms, 10000))

        else:
            result["status"] = "skipped"
            result["error"] = f"Unknown action: {action}"

        if result["status"] == "pending":
            result["status"] = "passed"

    except Exception as e:
        if result["status"] == "pending":
            result["status"] = "failed"
            result["error"] = str(e)[:200]

    return result


async def navigate_app_to_screen(client, page, prototype_screen: dict, previous_screens: List[dict], remaining_screens: List[dict], field_data: dict, eq, screen_index: int) -> dict:
    current_screenshot = await _take_step_screenshot(page, "app_nav", f"before_screen_{screen_index}")

    nav_plan = analyze_screen_navigation(
        client,
        prototype_screen,
        current_screenshot,
        previous_screens,
        remaining_screens,
    )

    screen_desc = nav_plan.get("screen_description", f"Screen {screen_index + 1}")
    actions = nav_plan.get("actions", [])
    app_matches = nav_plan.get("app_matches", False)

    is_last_screen = not remaining_screens or len(remaining_screens) == 0
    if is_last_screen:
        submit_button_phrases = {
            "submit", "submit request", "submit form", "send request",
            "send form", "save and submit", "place order", "confirm order",
        }
        filtered_actions = []
        for act in actions:
            act_type = act.get("action", "").lower()
            target_lower = act.get("target", "").lower().strip()
            if act_type == "submit":
                continue
            if act_type == "click" and target_lower in submit_button_phrases:
                continue
            filtered_actions.append(act)
        if len(filtered_actions) < len(actions):
            actions = filtered_actions

    action_results = []

    if app_matches and not actions:
        await eq.put({
            "step": f"Screen {screen_index + 1}: App already matches prototype — '{screen_desc}'",
            "phase": "app_journey",
        })
    elif not app_matches and not actions:
        await eq.put({
            "step": f"Screen {screen_index + 1}: AI could not determine actions for '{screen_desc}' — capturing current state",
            "phase": "app_journey",
        })
    else:
        await eq.put({
            "step": f"Screen {screen_index + 1}: Executing {len(actions)} action(s) to reach '{screen_desc}'",
            "phase": "app_journey",
        })

        initial_screenshot = await _take_step_screenshot(page, "app_live", f"init_{screen_index}")
        await eq.put({
            "app_live": {"image": initial_screenshot, "step_index": screen_index, "name": f"Screen {screen_index + 1}: Starting..."},
            "phase": "app_journey",
        })

        for ai, act in enumerate(actions):
            desc = act.get("description", act.get("action", ""))
            action_type = act.get("action", "")

            bbox = await _find_target_bbox(page, act, field_data)
            if bbox and action_type not in ("wait", "scroll"):
                action_label = f"{'✏️' if action_type == 'fill' else '🖱️'} {desc}"
                await _show_cursor_at(page, bbox["x"], bbox["y"], action_label)
                await page.wait_for_timeout(400)
                cursor_screenshot = await _take_step_screenshot(page, "app_live", f"cursor_{screen_index}_{ai}")
                await eq.put({
                    "app_live": {"image": cursor_screenshot, "step_index": screen_index, "name": f"→ {desc}"},
                    "step": f"  Action {ai + 1}/{len(actions)}: {desc}",
                    "phase": "app_journey",
                })
                await _show_click_effect(page)
                await page.wait_for_timeout(200)
            else:
                await eq.put({
                    "step": f"  Action {ai + 1}/{len(actions)}: {desc}",
                    "phase": "app_journey",
                })

            await _hide_cursor(page)

            act_result = await execute_action(page, act, field_data)
            action_results.append(act_result)

            if act_result["status"] == "failed":
                await eq.put({
                    "step": f"  ⚠ Action failed: {act_result['error']}",
                    "phase": "app_journey",
                })

            if action_type not in ("wait",):
                post_screenshot = await _take_step_screenshot(page, "app_live", f"after_{screen_index}_{ai}")
                status_icon = "✓" if act_result["status"] == "passed" else "✗"
                await eq.put({
                    "app_live": {"image": post_screenshot, "step_index": screen_index, "name": f"{status_icon} {desc}"},
                    "phase": "app_journey",
                })

    await _hide_cursor(page)
    await page.wait_for_timeout(2000)

    await page.evaluate("window.scrollTo(0, 0)")
    await page.wait_for_timeout(500)

    final_screenshot = await _take_step_screenshot(page, "app_steps", f"screen_{screen_index}")

    total = len(action_results)
    passed = sum(1 for r in action_results if r["status"] == "passed")
    failed = sum(1 for r in action_results if r["status"] == "failed")

    undetermined = not app_matches and not actions
    status_msg = (
        f"Screen {screen_index + 1} captured — {passed}/{total} actions passed"
        if total > 0
        else (f"Screen {screen_index + 1} captured (already matched)" if app_matches else f"Screen {screen_index + 1} captured (undetermined)")
    )

    await eq.put({
        "app_live": {"image": final_screenshot, "step_index": screen_index, "name": f"Screen {screen_index + 1}: {screen_desc}"},
        "step": status_msg,
        "phase": "app_journey",
    })

    return {
        "screen_index": screen_index,
        "screen_description": screen_desc,
        "screenshot": final_screenshot,
        "url": page.url,
        "actions_taken": action_results,
        "total_actions": total,
        "passed_actions": passed,
        "failed_actions": failed,
        "app_matched_already": app_matches,
        "undetermined": undetermined,
    }


def run_judge_validation(client, figma_b64: str, app_b64: str, analysis_result: dict, screen_name: str) -> dict:
    findings_summary = json.dumps(analysis_result, indent=2)[:6000]

    content_parts = [
        {"type": "text", "text": f"Review the analysis of screen '{screen_name}'. Here are the pipeline findings:\n\n{findings_summary}"},
        {"type": "text", "text": "\n--- Figma Prototype Screenshot ---"},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{figma_b64}", "detail": "high"}},
        {"type": "text", "text": "\n--- Live Application Screenshot ---"},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{app_b64}", "detail": "high"}},
    ]

    response = client.chat.completions.create(
        model="gpt-5",
        messages=[
            {"role": "system", "content": JUDGE_VALIDATION_PROMPT},
            {"role": "user", "content": content_parts},
        ],
        max_completion_tokens=4000,
        temperature=0.2,
    )

    raw = response.choices[0].message.content or ""
    json_match = raw
    if "```json" in raw:
        json_match = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        json_match = raw.split("```")[1].split("```")[0].strip()

    try:
        result = json.loads(json_match)
    except json.JSONDecodeError:
        import re
        brace_match = re.search(r'\{[\s\S]*\}', raw)
        if brace_match:
            try:
                result = json.loads(brace_match.group())
            except json.JSONDecodeError:
                result = {"judge_verdict": "error", "adjusted_overall_score": analysis_result.get("overall_score", 0), "confidence": 0}
        else:
            result = {"judge_verdict": "error", "adjusted_overall_score": analysis_result.get("overall_score", 0), "confidence": 0}

    return result


def build_journey_report(figma_screens: List[dict], screen_results: List[dict]) -> dict:
    total_screens = len(screen_results)
    total_actions = sum(r.get("total_actions", 0) for r in screen_results)
    passed_actions = sum(r.get("passed_actions", 0) for r in screen_results)
    failed_actions = sum(r.get("failed_actions", 0) for r in screen_results)
    screens_matched = sum(
        1 for r in screen_results
        if not r.get("undetermined") and (r.get("app_matched_already") or (r.get("total_actions", 0) > 0 and r.get("failed_actions", 0) == 0))
    )

    if total_actions > 0:
        action_score = round((passed_actions / total_actions) * 100, 1)
    else:
        action_score = 100 if all(r.get("app_matched_already") for r in screen_results) else 0

    if total_screens > 0:
        screen_score = round((screens_matched / total_screens) * 100, 1)
    else:
        screen_score = 0

    overall = round(screen_score * 0.6 + action_score * 0.4, 1)

    if overall >= 80:
        verdict = "Strong conformance"
    elif overall >= 60:
        verdict = "Partial conformance — gaps found"
    elif overall >= 40:
        verdict = "Weak conformance — significant issues"
    else:
        verdict = "Major deviations from prototype"

    step_details = []
    for r in screen_results:
        si = r["screen_index"]
        proto_screen = figma_screens[si] if si < len(figma_screens) else None
        step_details.append({
            "step_index": si,
            "action": "screen_match",
            "description": r.get("screen_description", f"Screen {si + 1}"),
            "app_status": "passed" if (r.get("app_matched_already") or (r.get("total_actions", 0) > 0 and r.get("failed_actions", 0) == 0)) and not r.get("undetermined") else ("undetermined" if r.get("undetermined") else "partial"),
            "app_screenshot": r.get("screenshot", ""),
            "app_error": "",
            "proto_screenshot": proto_screen["path"] if proto_screen else "",
            "proto_screen_name": proto_screen["name"] if proto_screen else "",
            "actions_taken": r.get("actions_taken", []),
        })

    friction_points = []
    for r in screen_results:
        for act in r.get("actions_taken", []):
            if act["status"] == "failed":
                friction_points.append({
                    "step": r["screen_index"],
                    "action": act["action"],
                    "description": act["description"],
                    "error": act.get("error", ""),
                    "type": "interaction_failure",
                })

    return {
        "journey_name": "Prototype Journey Validation",
        "journey_description": f"Screen-by-screen validation of {total_screens} prototype screens",
        "summary": {
            "total_steps": total_screens,
            "passed": screens_matched,
            "failed": total_screens - screens_matched,
            "skipped": 0,
            "proto_screens": len(figma_screens),
            "total_actions": total_actions,
            "passed_actions": passed_actions,
            "failed_actions": failed_actions,
        },
        "scores": {
            "execution": action_score,
            "friction": screen_score,
            "overall": overall,
        },
        "verdict": verdict,
        "step_details": step_details,
        "friction_points": friction_points,
    }
