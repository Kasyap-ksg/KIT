import os
import re
import json
import html as html_mod
import uuid as uuid_mod
import base64
import shutil
import ipaddress
import socket
import io
import asyncio
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from openai import OpenAI
from server_py.database import get_db
from server_py.models.design_validation import DesignValidation, ValidationPage
from server_py.models.application import Application
from server_py.services.journey_executor import navigate_app_to_screen, execute_deterministic_journey, build_journey_report, run_judge_validation, generate_journey_from_prototype, SYNTHETIC_DATA, _show_cursor_at, _show_click_effect, _hide_cursor, _take_step_screenshot

router = APIRouter(prefix="/api/design-validations", tags=["design-validation"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
MAX_FILE_SIZE = 10 * 1024 * 1024

BLOCKED_IP_RANGES = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]
MAX_WAIT_SECONDS = 10
MAX_VIEWPORT_WIDTH = 2560
MAX_VIEWPORT_HEIGHT = 1600
MIN_VIEWPORT = 320
MAX_JOURNEY_SCREENS = 15
BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
BROWSER_ARGS = ["--no-sandbox", "--disable-blink-features=AutomationControlled"]


def validate_uuid(value: str, name: str = "id"):
    try:
        UUID(value)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail=f"Invalid {name}: {value}")


client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY") or os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY", ""),
    base_url=os.environ.get("OPENAI_BASE_URL") or os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://api.openai.com/v1"),
)


def _validate_url_safe(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL: no hostname")
    try:
        resolved = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail=f"Cannot resolve hostname: {hostname}")
    for family, _, _, _, sockaddr in resolved:
        ip = ipaddress.ip_address(sockaddr[0])
        for blocked in BLOCKED_IP_RANGES:
            if ip in blocked:
                raise HTTPException(status_code=400, detail="URL points to a private/internal network address")
    return url


class CreateValidationRequest(BaseModel):
    name: str
    application_id: Optional[str] = None
    figma_url: Optional[str] = ""
    app_url: Optional[str] = ""


class UpdateValidationRequest(BaseModel):
    name: Optional[str] = None
    figma_url: Optional[str] = None
    app_url: Optional[str] = None
    journey_mode: Optional[str] = None
    journey_steps: Optional[List[dict]] = None


def serialize_validation(v, db=None):
    pages = db.query(ValidationPage).filter(ValidationPage.validation_id == v.id).order_by(ValidationPage.created_at).all() if db else []
    app_name = None
    if v.application_id and db:
        app = db.query(Application).filter(Application.id == v.application_id).first()
        if app:
            app_name = app.name
    return {
        "id": str(v.id),
        "application_id": str(v.application_id) if v.application_id else None,
        "application_name": app_name,
        "name": v.name,
        "figma_url": v.figma_url or "",
        "app_url": v.app_url or "",
        "status": v.status,
        "overall_score": v.overall_score,
        "summary": v.summary or "",
        "figma_video_path": v.figma_video_path or "",
        "app_video_path": v.app_video_path or "",
        "journey_mode": v.journey_mode or "deterministic",
        "journey_steps": v.journey_steps or [],
        "created_at": v.created_at.isoformat() if v.created_at else None,
        "updated_at": v.updated_at.isoformat() if v.updated_at else None,
        "pages": [serialize_page(p) for p in pages],
    }


def serialize_page(p):
    return {
        "id": str(p.id),
        "validation_id": str(p.validation_id),
        "page_name": p.page_name,
        "figma_image_path": p.figma_image_path or "",
        "app_image_path": p.app_image_path or "",
        "compliance_score": p.compliance_score,
        "findings": p.findings or "",
        "status": p.status,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("")
def list_validations(application_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(DesignValidation).order_by(DesignValidation.created_at.desc())
    if application_id:
        query = query.filter(DesignValidation.application_id == application_id)
    validations = query.all()
    return [serialize_validation(v, db) for v in validations]


@router.get("/{validation_id}")
def get_validation(validation_id: str, db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    v = db.query(DesignValidation).filter(DesignValidation.id == validation_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Validation not found")
    return serialize_validation(v, db)


@router.post("")
def create_validation(data: CreateValidationRequest, db: Session = Depends(get_db)):
    if data.application_id:
        validate_uuid(data.application_id, "application_id")
        app = db.query(Application).filter(Application.id == data.application_id).first()
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")
    v = DesignValidation(
        name=data.name,
        application_id=data.application_id if data.application_id else None,
        figma_url=data.figma_url or "",
        app_url=data.app_url or "",
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return serialize_validation(v, db)


@router.patch("/{validation_id}")
def update_validation(validation_id: str, data: UpdateValidationRequest, db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    v = db.query(DesignValidation).filter(DesignValidation.id == validation_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Validation not found")
    if data.name is not None:
        v.name = data.name
    if data.figma_url is not None:
        v.figma_url = data.figma_url
    if data.app_url is not None:
        v.app_url = data.app_url
    if data.journey_mode is not None:
        v.journey_mode = data.journey_mode
    if data.journey_steps is not None:
        v.journey_steps = data.journey_steps
    db.commit()
    db.refresh(v)
    return serialize_validation(v, db)


@router.delete("/{validation_id}")
def delete_validation(validation_id: str, db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    v = db.query(DesignValidation).filter(DesignValidation.id == validation_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Validation not found")
    pages = db.query(ValidationPage).filter(ValidationPage.validation_id == v.id).all()
    for p in pages:
        for path in [p.figma_image_path, p.app_image_path]:
            if path:
                full = os.path.join(UPLOAD_DIR, path.lstrip("/uploads/"))
                if os.path.exists(full):
                    os.remove(full)
    db.query(ValidationPage).filter(ValidationPage.validation_id == v.id).delete()
    db.delete(v)
    db.commit()
    return {"ok": True}


@router.post("/{validation_id}/pages")
def add_page(validation_id: str, page_name: str = Form(...), db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    v = db.query(DesignValidation).filter(DesignValidation.id == validation_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Validation not found")
    page = ValidationPage(validation_id=v.id, page_name=page_name)
    db.add(page)
    db.commit()
    db.refresh(page)
    return serialize_page(page)


@router.delete("/{validation_id}/pages/{page_id}")
def delete_page(validation_id: str, page_id: str, db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    validate_uuid(page_id, "page_id")
    page = db.query(ValidationPage).filter(ValidationPage.id == page_id, ValidationPage.validation_id == validation_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    for path in [page.figma_image_path, page.app_image_path]:
        if path:
            full = os.path.join(UPLOAD_DIR, path.lstrip("/uploads/"))
            if os.path.exists(full):
                os.remove(full)
    db.delete(page)
    db.commit()
    return {"ok": True}


async def _validate_and_save_upload(file: UploadFile, subfolder: str) -> str:
    ext = os.path.splitext(file.filename or "image.png")[1].lower() or ".png"
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed. Use: {', '.join(ALLOWED_EXTENSIONS)}")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Max size: {MAX_FILE_SIZE // (1024*1024)}MB")
    filename = f"{uuid_mod.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, subfolder, filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(content)
    return f"/uploads/{subfolder}/{filename}"


@router.post("/{validation_id}/pages/{page_id}/upload-figma")
async def upload_figma_image(validation_id: str, page_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    validate_uuid(page_id, "page_id")
    page = db.query(ValidationPage).filter(ValidationPage.id == page_id, ValidationPage.validation_id == validation_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    page.figma_image_path = await _validate_and_save_upload(file, "figma")
    db.commit()
    db.refresh(page)
    return serialize_page(page)


@router.post("/{validation_id}/pages/{page_id}/upload-app")
async def upload_app_image(validation_id: str, page_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    validate_uuid(page_id, "page_id")
    page = db.query(ValidationPage).filter(ValidationPage.id == page_id, ValidationPage.validation_id == validation_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    page.app_image_path = await _validate_and_save_upload(file, "app")
    db.commit()
    db.refresh(page)
    return serialize_page(page)


COMPARISON_PROMPT = """You are a senior UI/UX design compliance and usability analyst performing a comprehensive design validation audit.

You will be given two images:
1. A FIGMA PROTOTYPE screen (the reference design - shown in presentation/prototype mode)
2. A LIVE APPLICATION screenshot (the actual built implementation)

You may also receive extracted DOM element data from the live application (computed styles, bounding boxes, colors). Use this measured data to provide precise, evidence-based findings.

Perform a rigorous analysis across these 5 FIDELITY DIMENSIONS:

## 1. VISUAL FIDELITY (Colors, Typography, Images, Icons)
- Color accuracy: provide EXACT hex codes for each element compared (e.g., "Header bg: Figma #1B3A5C vs App #1D3E60")
- Typography: provide exact font family, size (px), weight, line-height for each text element
- Images & media: placement, sizing with pixel dimensions, aspect ratio
- IMAGE CONTENT: Compare the actual photograph/illustration/media content — if the app uses a DIFFERENT image/photo than the prototype, FLAG THIS as a critical finding with description of what each image shows
- Icons: icon names, sizes in px, colors as hex codes
- Visual treatment: shadows, borders, border-radius in px, opacity values

## 2. LAYOUT FIDELITY (Grid, Spacing, Structure, Responsive)
- Grid system: column structure, gutters in px, max-width in px
- Spacing rhythm: provide exact px values for margins, padding, gaps (e.g., "Card padding: Figma 24px vs App 20px")
- Alignment: specific pixel offsets where misaligned
- Element dimensions: width x height in px for major components

## 3. COMPONENT FIDELITY (UI Elements, States, Interactions)
- Buttons: exact dimensions (width x height in px), border-radius, font size, padding
- Form elements: input height, border width, placeholder text
- Navigation: exact measurements and positioning
- Cards: exact padding, margin, border-radius values

## 4. TOKEN/THEME FIDELITY (Design System Consistency)
- Color tokens: list each color token with hex value from both Figma and App
- Spacing tokens: exact spacing scale values used
- Typography tokens: exact font specifications per level
- Border radius tokens: exact px values

## 5. UX FLOW FIDELITY (Navigation, Hierarchy, Usability)
- Navigation clarity, visual hierarchy, information architecture
- Accessibility: contrast ratios with specific values, touch target sizes in px
- Cognitive load assessment

CRITICAL: For EVERY finding, you MUST provide specific measurable evidence. Never say "slightly different" without exact values.

Respond in this EXACT JSON format:
{
  "overall_score": <0-100>,
  "design_fidelity_score": <0-100>,
  "ux_score": <0-100>,
  "fidelity_scores": {
    "visual": <0-100>,
    "layout": <0-100>,
    "component": <0-100>,
    "token_theme": <0-100>,
    "ux_flow": <0-100>
  },
  "categories": [
    {"name": "Visual Fidelity", "score": <0-100>, "findings": "<detailed findings with exact hex codes and measurements>"},
    {"name": "Layout Fidelity", "score": <0-100>, "findings": "<detailed findings with exact px measurements>"},
    {"name": "Component Fidelity", "score": <0-100>, "findings": "<detailed findings with component dimensions>"},
    {"name": "Token/Theme Fidelity", "score": <0-100>, "findings": "<detailed findings with token values>"},
    {"name": "UX Flow Fidelity", "score": <0-100>, "findings": "<detailed findings>"}
  ],
  "color_comparisons": [
    {"element": "<element name>", "figma_hex": "#XXXXXX", "app_hex": "#XXXXXX", "match": true|false}
  ],
  "dimension_comparisons": [
    {"component": "<component name>", "figma_dims": "<WxH>", "app_dims": "<WxH>", "diff_px": "<dW x dH>"}
  ],
  "typography_comparisons": [
    {"element": "<text element>", "figma_font": "<family size weight>", "app_font": "<family size weight>", "match": true|false}
  ],
  "spacing_comparisons": [
    {"element": "<element>", "property": "<padding|margin|gap>", "figma_value": "<value>", "app_value": "<value>"}
  ],
  "critical_issues": ["<issue with specific measurements>"],
  "minor_issues": ["<issue with specific measurements>"],
  "ux_findings": ["<UX finding>"],
  "recommendations": ["<actionable recommendation with specific values>"],
  "component_analysis": [
    {"component": "<name>", "design_match": "match|partial|mismatch", "notes": "<details with exact measurements>"}
  ],
  "summary": "<3-4 sentence comprehensive assessment covering all fidelity dimensions with key measurements>"
}

Be thorough, specific, and actionable. Every finding MUST include exact hex codes, pixel dimensions, or font specifications as evidence."""


UX_FLOW_PROMPT = """You are a senior UX analyst. You will be given screenshots of MULTIPLE screens from a Figma prototype and their corresponding live application implementations.

Analyze the overall UX FLOW across ALL screens together:
1. Navigation consistency: Do screens connect logically? Are navigation patterns consistent?
2. User journey coherence: Does the flow make sense from start to finish?
3. Visual consistency: Are design patterns, colors, typography consistent across screens?
4. State transitions: Are loading, empty, error states handled consistently?
5. Information architecture: Is the overall structure logical and intuitive?
6. Accessibility across flow: Are patterns accessible throughout?

Respond in this exact JSON format:
{
  "ux_flow_score": <0-100>,
  "flow_findings": [
    {"area": "<area name>", "score": <0-100>, "finding": "<detailed finding>"}
  ],
  "journey_issues": ["<issue 1>", "<issue 2>"],
  "consistency_notes": ["<note 1>", "<note 2>"],
  "flow_recommendations": ["<rec 1>", "<rec 2>"],
  "summary": "<3-4 sentence overall UX flow assessment across all screens>"
}

Be thorough and reference specific screens by name."""


@router.post("/{validation_id}/pages/{page_id}/compare")
def compare_page(validation_id: str, page_id: str, db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    validate_uuid(page_id, "page_id")
    page = db.query(ValidationPage).filter(ValidationPage.id == page_id, ValidationPage.validation_id == validation_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    if not page.figma_image_path or not page.app_image_path:
        raise HTTPException(status_code=400, detail="Both Figma and app images must be uploaded before comparison")

    figma_path = os.path.join(UPLOAD_DIR, page.figma_image_path.replace("/uploads/", ""))
    app_path = os.path.join(UPLOAD_DIR, page.app_image_path.replace("/uploads/", ""))

    if not os.path.exists(figma_path) or not os.path.exists(app_path):
        raise HTTPException(status_code=400, detail="Image files not found on disk")

    with open(figma_path, "rb") as f:
        figma_b64 = base64.b64encode(f.read()).decode("utf-8")
    with open(app_path, "rb") as f:
        app_b64 = base64.b64encode(f.read()).decode("utf-8")

    figma_ext = os.path.splitext(figma_path)[1].lstrip(".")
    app_ext = os.path.splitext(app_path)[1].lstrip(".")
    figma_mime = "image/jpeg" if figma_ext in ("jpg", "jpeg") else f"image/{figma_ext or 'png'}"
    app_mime = "image/jpeg" if app_ext in ("jpg", "jpeg") else f"image/{app_ext or 'png'}"

    def generate():
        full_response = ""
        try:
            stream = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": COMPARISON_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": f"Compare this Figma prototype screen for '{page.page_name}' with the actual application screenshot. Provide a comprehensive design validation report across all 5 fidelity dimensions."},
                            {"type": "image_url", "image_url": {"url": f"data:{figma_mime};base64,{figma_b64}", "detail": "high"}},
                            {"type": "image_url", "image_url": {"url": f"data:{app_mime};base64,{app_b64}", "detail": "high"}},
                        ],
                    },
                ],
                stream=True,
                max_completion_tokens=6000,
            )
            for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                content = delta.content if delta and delta.content else ""
                if content:
                    full_response += content
                    yield f"data: {json.dumps({'content': content})}\n\n"

            try:
                result = _parse_ai_json(full_response)
                page.compliance_score = result.get("overall_score", 0)
                page.findings = json.dumps(result)
                page.status = "compared"
                db.commit()

                validation = db.query(DesignValidation).filter(DesignValidation.id == validation_id).first()
                if validation:
                    all_pages = db.query(ValidationPage).filter(ValidationPage.validation_id == validation_id).all()
                    compared_pages = [p for p in all_pages if p.compliance_score is not None]
                    if compared_pages:
                        validation.overall_score = sum(p.compliance_score for p in compared_pages) / len(compared_pages)
                        validation.summary = result.get("summary", "")
                        validation.status = "completed" if len(compared_pages) == len(all_pages) else "in_progress"
                        db.commit()

            except (json.JSONDecodeError, IndexError):
                page.findings = full_response
                page.status = "compared"
                db.commit()

            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


FIGMA_API_BASE = "https://api.figma.com/v1"


def _extract_figma_file_key(url: str) -> str:
    patterns = [
        r"figma\.com/(?:file|design)/([a-zA-Z0-9]+)",
        r"figma\.com/proto/([a-zA-Z0-9]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise HTTPException(status_code=400, detail="Could not extract Figma file key from URL")


class FigmaFetchRequest(BaseModel):
    figma_url: str
    figma_token: Optional[str] = None
    figma_password: Optional[str] = None


class FigmaFrame(BaseModel):
    node_id: str
    name: str
    type: str


async def _figma_api_get(http: httpx.AsyncClient, url: str, token: str, password: Optional[str] = None, extra_params: Optional[dict] = None):
    headers = {"X-Figma-Token": token}
    params = extra_params or {}
    if password:
        params["password"] = password
    return await http.get(url, headers=headers, params=params)


@router.post("/figma/frames")
async def get_figma_frames(data: FigmaFetchRequest):
    if data.figma_token:
        file_key = _extract_figma_file_key(data.figma_url)
        async with httpx.AsyncClient(timeout=30.0) as http:
            resp = await _figma_api_get(http, f"{FIGMA_API_BASE}/files/{file_key}", data.figma_token, data.figma_password)

        if resp.status_code == 403:
            raise HTTPException(status_code=403, detail="Invalid Figma token or no access to this file.")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch Figma file. Check the URL and token.")

        file_data = resp.json()
        frames = []

        def walk_nodes(node, depth=0):
            if node.get("type") == "FRAME" and depth <= 2:
                frames.append({"node_id": node["id"], "name": node.get("name", "Untitled"), "type": node.get("type", "FRAME")})
            for child in node.get("children", []):
                walk_nodes(child, depth + 1)

        doc = file_data.get("document", {})
        for page_node in doc.get("children", []):
            walk_nodes(page_node)

        return {"file_name": file_data.get("name", ""), "frames": frames, "mode": "api"}
    else:
        return {"file_name": "", "frames": [], "mode": "browser", "message": "No API token provided."}


class FigmaImportRequest(BaseModel):
    figma_url: str
    figma_token: Optional[str] = None
    frame_ids: Optional[List[str]] = None
    frame_names: Optional[List[str]] = None
    figma_password: Optional[str] = None


@router.post("/{validation_id}/import-figma")
async def import_figma_frames(validation_id: str, data: FigmaImportRequest, db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    v = db.query(DesignValidation).filter(DesignValidation.id == validation_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Validation not found")

    if data.figma_token and data.frame_ids:
        file_key = _extract_figma_file_key(data.figma_url)
        ids_param = ",".join(data.frame_ids)
        async with httpx.AsyncClient(timeout=60.0) as http:
            resp = await _figma_api_get(http, f"{FIGMA_API_BASE}/images/{file_key}", data.figma_token, data.figma_password, {"ids": ids_param, "format": "png", "scale": 2})
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch Figma frame images.")

        images_data = resp.json()
        image_urls = images_data.get("images", {})
        created_pages = []
        os.makedirs(os.path.join(UPLOAD_DIR, "figma"), exist_ok=True)

        async with httpx.AsyncClient(timeout=60.0) as http:
            for i, frame_id in enumerate(data.frame_ids):
                img_url = image_urls.get(frame_id)
                if not img_url:
                    continue
                img_resp = await http.get(img_url)
                if img_resp.status_code != 200:
                    continue
                filename = f"{uuid_mod.uuid4()}.png"
                filepath = os.path.join(UPLOAD_DIR, "figma", filename)
                with open(filepath, "wb") as f:
                    f.write(img_resp.content)
                frame_name = data.frame_names[i] if i < len(data.frame_names) else f"Frame {i+1}"
                page = ValidationPage(validation_id=v.id, page_name=frame_name, figma_image_path=f"/uploads/figma/{filename}")
                db.add(page)
                db.commit()
                db.refresh(page)
                created_pages.append(serialize_page(page))

        return {"imported": len(created_pages), "pages": created_pages}
    else:
        return await _capture_figma_with_browser(v, data, db)


async def _launch_browser(playwright):
    return await playwright.chromium.launch(headless=True, args=BROWSER_ARGS)


async def _capture_figma_with_browser(v, data: FigmaImportRequest, db: Session):
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise HTTPException(status_code=500, detail="Playwright not available for browser capture.")

    os.makedirs(os.path.join(UPLOAD_DIR, "figma"), exist_ok=True)
    created_pages = []

    try:
        async with async_playwright() as p:
            browser = await _launch_browser(p)
            ctx = await browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2, user_agent=BROWSER_UA)
            pg = await ctx.new_page()
            await pg.goto(data.figma_url, wait_until="domcontentloaded", timeout=30000)
            await pg.wait_for_timeout(3000)

            if data.figma_password:
                try:
                    pw_input = pg.locator('input[type="password"], input[placeholder*="password" i], input[name="password"]')
                    if await pw_input.count() > 0:
                        await pw_input.first.fill(data.figma_password)
                        submit_btn = pg.locator('button:has-text("Continue"), button[type="submit"], button:has-text("Submit")')
                        if await submit_btn.count() > 0:
                            await submit_btn.first.click()
                        else:
                            await pw_input.first.press("Enter")
                        await pg.wait_for_timeout(15000)
                except Exception:
                    pass

            await pg.wait_for_timeout(3000)
            page_title = await pg.title()
            file_name = page_title.replace(" – Figma", "").replace(" - Figma", "").strip() or "Figma Design"
            filename = f"{uuid_mod.uuid4()}.png"
            filepath = os.path.join(UPLOAD_DIR, "figma", filename)
            await pg.screenshot(path=filepath, full_page=False)

            page_record = ValidationPage(validation_id=v.id, page_name=file_name, figma_image_path=f"/uploads/figma/{filename}")
            db.add(page_record)
            db.commit()
            db.refresh(page_record)
            created_pages.append(serialize_page(page_record))
            await browser.close()

        return {"imported": len(created_pages), "pages": created_pages}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Figma capture failed: {str(exc)[:200]}")


def _convert_to_proto_url(figma_url: str) -> str:
    url = figma_url
    url = re.sub(r"figma\.com/design/", "figma.com/proto/", url)
    url = re.sub(r"figma\.com/file/", "figma.com/proto/", url)
    if "scaling=" not in url:
        sep = "&" if "?" in url else "?"
        url += f"{sep}scaling=scale-down-width&content-scaling=fixed"
    return url


def _extract_node_id_from_url(url: str) -> str:
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    nids = params.get("node-id", [])
    return nids[0] if nids else ""


async def _save_screenshot(page, subfolder: str) -> str:
    os.makedirs(os.path.join(UPLOAD_DIR, subfolder), exist_ok=True)
    fname = f"{uuid_mod.uuid4()}.png"
    fpath = os.path.join(UPLOAD_DIR, subfolder, fname)
    await page.screenshot(path=fpath, full_page=(subfolder == "app"))
    return f"/uploads/{subfolder}/{fname}"


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _read_b64(path_str):
    fpath = os.path.join(UPLOAD_DIR, path_str.replace("/uploads/", ""))
    with open(fpath, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _parse_ai_json(raw):
    s = raw
    if "```json" in s:
        s = s.split("```json")[1].split("```")[0]
    elif "```" in s:
        s = s.split("```")[1].split("```")[0]
    return json.loads(s.strip())


async def _extract_page_elements(page):
    return await page.evaluate("""() => {
        const results = { elements: [], colors: [], typography: [], icons: [], images: [], html_structure: [] };
        const colorSet = new Map();
        const typographySet = new Map();

        function rgbToHex(r, g, b) {
            return '#' + [r, g, b].map(x => {
                const hex = Math.round(x).toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            }).join('');
        }

        function parseColor(colorStr) {
            if (!colorStr || colorStr === 'rgba(0, 0, 0, 0)' || colorStr === 'transparent') return null;
            const m = colorStr.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
            if (m) return rgbToHex(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
            return colorStr;
        }

        function getIconClasses(el) {
            const cls = el.className || '';
            const clsStr = typeof cls === 'string' ? cls : (cls.baseVal || '');
            const iconPatterns = [/fa-[a-z0-9-]+/g, /material-icons?/g, /icon-[a-z0-9-]+/g, /lucide-[a-z0-9-]+/g, /bi-[a-z0-9-]+/g, /ri-[a-z0-9-]+/g];
            const found = [];
            for (const pat of iconPatterns) {
                const matches = clsStr.match(pat);
                if (matches) found.push(...matches);
            }
            if (el.tagName === 'svg' || el.tagName === 'SVG') {
                const use = el.querySelector('use');
                if (use) {
                    const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
                    if (href) found.push(href);
                }
                const ariaLabel = el.getAttribute('aria-label');
                if (ariaLabel) found.push('svg:' + ariaLabel);
            }
            return found.length > 0 ? found : null;
        }

        const selectors = 'button, a, input, select, textarea, h1, h2, h3, h4, h5, h6, p, span, div, img, nav, header, footer, main, section, article, aside, ul, ol, li, form, label, table, th, td, svg, i, [role="button"], [role="link"], [role="navigation"], [role="banner"], [role="main"], [role="complementary"], [role="contentinfo"]';
        const elements = document.querySelectorAll(selectors);

        const MAX_ELEMENTS = 500;
        function getPseudoStyles(el, pseudo) {
            try {
                const ps = window.getComputedStyle(el, pseudo);
                const content = ps.getPropertyValue('content');
                if (!content || content === 'none' || content === 'normal') return null;
                return {
                    content: content.substring(0, 60),
                    display: ps.display,
                    color: parseColor(ps.color),
                    backgroundColor: parseColor(ps.backgroundColor),
                    fontSize: ps.fontSize,
                    position: ps.position !== 'static' ? ps.position : null,
                    width: ps.width,
                    height: ps.height,
                };
            } catch(e) { return null; }
        }
        const SENSITIVE_INPUT_TYPES = new Set(['password', 'hidden', 'token']);
        const SENSITIVE_NAME_PATTERNS = /password|secret|token|api.?key|auth|credential|ssn|credit.?card/i;
        function getFormState(el) {
            const tag = el.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                const inputType = (el.type || '').toLowerCase();
                const inputName = (el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('autocomplete') || '');
                const isSensitive = SENSITIVE_INPUT_TYPES.has(inputType) || SENSITIVE_NAME_PATTERNS.test(inputName);
                const state = {
                    type: el.type || null,
                    disabled: el.disabled || false,
                    readOnly: el.readOnly || false,
                    required: el.required || false,
                    placeholder: (el.placeholder || '').substring(0, 60),
                    hasValue: !!(el.value && el.value.length > 0),
                    valueLength: el.value ? el.value.length : 0,
                };
                if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) {
                    state.checked = el.checked;
                }
                if (tag === 'select') {
                    state.selectedIndex = el.selectedIndex;
                    state.options = Array.from(el.options).slice(0, 10).map(o => ({ value: o.value, text: o.text.substring(0, 40), selected: o.selected }));
                }
                return state;
            }
            if (tag === 'button') {
                return { type: el.type || 'submit', disabled: el.disabled || false };
            }
            return null;
        }

        for (const el of elements) {
            if (results.elements.length >= MAX_ELEMENTS) break;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.x > window.innerWidth || rect.y > window.innerHeight) continue;
            if (rect.bottom < 0 || rect.right < 0) continue;

            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || '').trim().substring(0, 80);

            const bgColor = parseColor(style.backgroundColor);
            const textColor = parseColor(style.color);
            const borderColor = parseColor(style.borderColor);

            if (bgColor) {
                if (!colorSet.has(bgColor)) colorSet.set(bgColor, []);
                colorSet.get(bgColor).push(tag + (text ? ': ' + text.substring(0, 30) : ''));
            }
            if (textColor) {
                if (!colorSet.has(textColor)) colorSet.set(textColor, []);
                colorSet.get(textColor).push('text: ' + tag);
            }
            if (borderColor && borderColor !== bgColor) {
                if (!colorSet.has(borderColor)) colorSet.set(borderColor, []);
                colorSet.get(borderColor).push('border: ' + tag);
            }

            const fontKey = style.fontFamily.split(',')[0].replace(/['"]/g, '').trim() + '|' + style.fontSize + '|' + style.fontWeight;
            if (!typographySet.has(fontKey)) {
                typographySet.set(fontKey, {
                    fontFamily: style.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    lineHeight: style.lineHeight,
                    letterSpacing: style.letterSpacing,
                    textTransform: style.textTransform !== 'none' ? style.textTransform : null,
                    usages: []
                });
            }
            typographySet.get(fontKey).usages.push(tag + (text ? ': ' + text.substring(0, 20) : ''));

            const iconClasses = getIconClasses(el);
            if (iconClasses) {
                results.icons.push({ tag: tag, classes: iconClasses, bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }, color: textColor });
            }

            if (tag === 'img') {
                results.images.push({ src: el.src || '', alt: el.alt || '', bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight });
            }

            const role = el.getAttribute('role');
            const ariaLabel = el.getAttribute('aria-label');
            const ariaExpanded = el.getAttribute('aria-expanded');
            const ariaChecked = el.getAttribute('aria-checked');
            const ariaSelected = el.getAttribute('aria-selected');
            const ariaDisabled = el.getAttribute('aria-disabled');
            const tabIndex = el.getAttribute('tabindex');
            const dataState = el.getAttribute('data-state');

            const pseudoBefore = getPseudoStyles(el, '::before');
            const pseudoAfter = getPseudoStyles(el, '::after');
            const formState = getFormState(el);

            const info = {
                tag: tag,
                text: text,
                role: role,
                ariaLabel: ariaLabel,
                ariaState: {},
                bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
                styles: {
                    backgroundColor: bgColor,
                    color: textColor,
                    borderColor: borderColor,
                    fontFamily: style.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    lineHeight: style.lineHeight,
                    letterSpacing: style.letterSpacing,
                    textTransform: style.textTransform !== 'none' ? style.textTransform : null,
                    padding: style.padding,
                    paddingTop: style.paddingTop,
                    paddingRight: style.paddingRight,
                    paddingBottom: style.paddingBottom,
                    paddingLeft: style.paddingLeft,
                    margin: style.margin,
                    borderRadius: style.borderRadius,
                    border: style.border !== 'none' ? style.border : null,
                    boxShadow: style.boxShadow !== 'none' ? style.boxShadow : null,
                    textShadow: style.textShadow !== 'none' ? style.textShadow : null,
                    opacity: style.opacity !== '1' ? style.opacity : null,
                    zIndex: style.zIndex !== 'auto' ? style.zIndex : null,
                    display: style.display,
                    position: style.position !== 'static' ? style.position : null,
                    flexDirection: style.display.includes('flex') ? style.flexDirection : null,
                    flexWrap: style.display.includes('flex') ? (style.flexWrap !== 'nowrap' ? style.flexWrap : null) : null,
                    alignItems: style.display.includes('flex') ? style.alignItems : null,
                    justifyContent: style.display.includes('flex') ? style.justifyContent : null,
                    gap: style.gap !== 'normal' ? style.gap : null,
                    gridTemplateColumns: style.display.includes('grid') ? style.gridTemplateColumns : null,
                    gridTemplateRows: style.display.includes('grid') ? style.gridTemplateRows : null,
                    gridGap: style.display.includes('grid') ? (style.gridGap !== 'normal' ? style.gridGap : null) : null,
                    width: style.width,
                    height: style.height,
                    minWidth: style.minWidth !== '0px' ? style.minWidth : null,
                    maxWidth: style.maxWidth !== 'none' ? style.maxWidth : null,
                    minHeight: style.minHeight !== '0px' ? style.minHeight : null,
                    maxHeight: style.maxHeight !== 'none' ? style.maxHeight : null,
                    transform: style.transform !== 'none' ? style.transform : null,
                    transition: style.transition !== 'all 0s ease 0s' ? style.transition : null,
                    overflow: (style.overflow !== 'visible') ? style.overflow : null,
                    cursor: style.cursor !== 'auto' ? style.cursor : null,
                    textDecoration: style.textDecoration !== 'none solid rgb(0, 0, 0)' ? style.textDecoration : null,
                    textAlign: style.textAlign,
                    verticalAlign: style.verticalAlign !== 'baseline' ? style.verticalAlign : null,
                    whiteSpace: style.whiteSpace !== 'normal' ? style.whiteSpace : null,
                    wordBreak: style.wordBreak !== 'normal' ? style.wordBreak : null,
                    outlineColor: style.outlineStyle !== 'none' ? parseColor(style.outlineColor) : null,
                    outlineWidth: style.outlineStyle !== 'none' ? style.outlineWidth : null,
                }
            };
            if (ariaExpanded !== null) info.ariaState.expanded = ariaExpanded;
            if (ariaChecked !== null) info.ariaState.checked = ariaChecked;
            if (ariaSelected !== null) info.ariaState.selected = ariaSelected;
            if (ariaDisabled !== null) info.ariaState.disabled = ariaDisabled;
            if (tabIndex !== null) info.ariaState.tabIndex = tabIndex;
            if (dataState !== null) info.ariaState.dataState = dataState;
            if (Object.keys(info.ariaState).length === 0) delete info.ariaState;
            if (pseudoBefore) info.pseudoBefore = pseudoBefore;
            if (pseudoAfter) info.pseudoAfter = pseudoAfter;
            if (formState) info.formState = formState;
            results.elements.push(info);
        }

        for (const [hex, usages] of colorSet) {
            results.colors.push({ hex: hex, usages: usages.slice(0, 5) });
        }

        for (const [key, data] of typographySet) {
            results.typography.push({ ...data, usages: data.usages.slice(0, 5) });
        }

        const buildStructure = (el, depth) => {
            if (depth > 5) return null;
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            if (!tag) return null;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return null;
            const role = el.getAttribute ? el.getAttribute('role') : null;
            const ariaLabel = el.getAttribute ? el.getAttribute('aria-label') : null;
            const ariaExpanded = el.getAttribute ? el.getAttribute('aria-expanded') : null;
            const id = el.id || null;
            const className = el.className && typeof el.className === 'string' ? el.className.substring(0, 80) : null;
            const children = [];
            if (el.children && depth < 5) {
                for (let i = 0; i < Math.min(el.children.length, 20); i++) {
                    const ch = buildStructure(el.children[i], depth + 1);
                    if (ch) children.push(ch);
                }
            }
            const node = { tag, childCount: el.children ? el.children.length : 0, children };
            if (role) node.role = role;
            if (ariaLabel) node.ariaLabel = ariaLabel;
            if (ariaExpanded !== null) node.ariaExpanded = ariaExpanded;
            if (id) node.id = id;
            if (className) node.className = className;
            return node;
        };
        const body = document.querySelector('body');
        if (body) {
            results.html_structure = [];
            for (let i = 0; i < Math.min(body.children.length, 20); i++) {
                const s = buildStructure(body.children[i], 0);
                if (s) results.html_structure.push(s);
            }
        }

        return results;
    }""")


async def _extract_figma_design_tokens(http, file_key, token, password=None):
    try:
        hdrs = {"X-Figma-Token": token}
        params = {"depth": 2}
        if password:
            params["password"] = password
        resp = await http.get(f"{FIGMA_API_BASE}/files/{file_key}", headers=hdrs, params=params)
        if resp.status_code != 200:
            return None

        file_data = resp.json()
        tokens = {"colors": [], "text_styles": [], "effects": [], "components": [], "spacing": []}

        styles_meta = file_data.get("styles", {})
        style_ids = list(styles_meta.keys())

        style_node_map = {}
        if style_ids:
            node_ids_param = ",".join(style_ids)
            node_params = {"ids": node_ids_param}
            if password:
                node_params["password"] = password
            try:
                node_resp = await http.get(f"{FIGMA_API_BASE}/files/{file_key}/nodes", headers=hdrs, params=node_params)
                if node_resp.status_code == 200:
                    nodes_data = node_resp.json().get("nodes", {})
                    for nid, nval in nodes_data.items():
                        if nval and nval.get("document"):
                            style_node_map[nid] = nval["document"]
            except Exception:
                pass

            for sid, smeta in styles_meta.items():
                stype = smeta.get("styleType", "")
                sname = smeta.get("name", "")
                sdesc = smeta.get("description", "")
                node_doc = style_node_map.get(sid, {})

                if stype == "FILL":
                    entry = {"name": sname, "description": sdesc, "style_id": sid}
                    fills = node_doc.get("fills", [])
                    for fill in fills:
                        if fill.get("type") == "SOLID" and fill.get("color"):
                            c = fill["color"]
                            r_val = int(c.get("r", 0) * 255)
                            g_val = int(c.get("g", 0) * 255)
                            b_val = int(c.get("b", 0) * 255)
                            entry["hex"] = f"#{r_val:02x}{g_val:02x}{b_val:02x}"
                            entry["opacity"] = fill.get("opacity", 1)
                            break
                        elif fill.get("type") == "GRADIENT_LINEAR":
                            stops = fill.get("gradientStops", [])
                            entry["gradient"] = [{"position": s.get("position"), "color": s.get("color")} for s in stops[:5]]
                            break
                    tokens["colors"].append(entry)

                elif stype == "TEXT":
                    entry = {"name": sname, "description": sdesc, "style_id": sid}
                    ts = node_doc.get("style", {})
                    if ts:
                        entry["fontFamily"] = ts.get("fontFamily", "")
                        entry["fontSize"] = ts.get("fontSize")
                        entry["fontWeight"] = ts.get("fontWeight")
                        entry["lineHeightPx"] = ts.get("lineHeightPx")
                        entry["letterSpacing"] = ts.get("letterSpacing")
                        entry["textAlignHorizontal"] = ts.get("textAlignHorizontal")
                        entry["textCase"] = ts.get("textCase")
                    tokens["text_styles"].append(entry)

                elif stype == "EFFECT":
                    entry = {"name": sname, "description": sdesc, "style_id": sid}
                    effects = node_doc.get("effects", [])
                    entry["values"] = []
                    for eff in effects[:5]:
                        eff_entry = {"type": eff.get("type", ""), "radius": eff.get("radius"), "visible": eff.get("visible", True)}
                        if eff.get("offset"):
                            eff_entry["offset"] = eff["offset"]
                        if eff.get("color"):
                            c = eff["color"]
                            eff_entry["color"] = f"rgba({int(c.get('r',0)*255)},{int(c.get('g',0)*255)},{int(c.get('b',0)*255)},{round(c.get('a',1),2)})"
                        entry["values"].append(eff_entry)
                    tokens["effects"].append(entry)

        doc = file_data.get("document", {})
        def extract_node_tokens(node, depth=0):
            if depth > 3:
                return
            ntype = node.get("type", "")

            fills = node.get("fills", [])
            for fill in fills:
                if fill.get("type") == "SOLID" and fill.get("color"):
                    c = fill["color"]
                    r_val = int(c.get("r", 0) * 255)
                    g_val = int(c.get("g", 0) * 255)
                    b_val = int(c.get("b", 0) * 255)
                    hex_val = f"#{r_val:02x}{g_val:02x}{b_val:02x}"
                    tokens["colors"].append({"name": node.get("name", ""), "hex": hex_val, "opacity": fill.get("opacity", 1), "node_type": ntype})

            if ntype == "TEXT":
                ts = node.get("style", {})
                tokens["text_styles"].append({
                    "name": node.get("name", ""),
                    "fontFamily": ts.get("fontFamily", ""),
                    "fontSize": ts.get("fontSize"),
                    "fontWeight": ts.get("fontWeight"),
                    "lineHeightPx": ts.get("lineHeightPx"),
                    "letterSpacing": ts.get("letterSpacing"),
                    "textAlignHorizontal": ts.get("textAlignHorizontal"),
                    "characters": (node.get("characters", ""))[:60],
                })

            effects = node.get("effects", [])
            for eff in effects:
                tokens["effects"].append({
                    "type": eff.get("type", ""),
                    "radius": eff.get("radius"),
                    "offset": eff.get("offset"),
                    "color": eff.get("color"),
                    "node_name": node.get("name", ""),
                })

            if ntype in ("FRAME", "COMPONENT", "INSTANCE"):
                layout_mode = node.get("layoutMode")
                if layout_mode:
                    tokens["spacing"].append({
                        "name": node.get("name", ""),
                        "layoutMode": layout_mode,
                        "itemSpacing": node.get("itemSpacing"),
                        "paddingTop": node.get("paddingTop"),
                        "paddingRight": node.get("paddingRight"),
                        "paddingBottom": node.get("paddingBottom"),
                        "paddingLeft": node.get("paddingLeft"),
                        "primaryAxisAlignItems": node.get("primaryAxisAlignItems"),
                        "counterAxisAlignItems": node.get("counterAxisAlignItems"),
                    })
                if node.get("name"):
                    tokens["components"].append({
                        "name": node.get("name", ""),
                        "type": ntype,
                        "cornerRadius": node.get("cornerRadius"),
                        "width": node.get("absoluteBoundingBox", {}).get("width"),
                        "height": node.get("absoluteBoundingBox", {}).get("height"),
                    })

            for child in node.get("children", []):
                extract_node_tokens(child, depth + 1)

        pages = doc.get("children", [])
        for page_node in pages[:3]:
            extract_node_tokens(page_node, 0)

        seen_colors = set()
        deduped_colors = []
        for c in tokens["colors"]:
            key = c.get("hex", c.get("name", ""))
            if key and key not in seen_colors:
                seen_colors.add(key)
                deduped_colors.append(c)
        tokens["colors"] = deduped_colors[:50]
        tokens["text_styles"] = tokens["text_styles"][:30]
        tokens["effects"] = tokens["effects"][:20]
        tokens["components"] = tokens["components"][:30]
        tokens["spacing"] = tokens["spacing"][:30]

        return tokens
    except Exception:
        return None


SCREEN_MATCH_PROMPT = """You are a UX navigation expert. You are given:
1. A screenshot of a Figma prototype screen (the target design)
2. A screenshot of the current state of a live web application

Determine what navigation action should be taken on the live application to reach the screen that corresponds to this prototype screen.

Analyze both screenshots carefully:
- What page/view does the prototype show? (e.g., a contact form, a product listing, a dashboard, a login page)
- What page/view is the app currently showing?
- If they already show the same type of page, respond with {"action": "none", "reason": "Already on matching screen"}
- If the app needs to navigate somewhere, provide a specific action

Respond in this exact JSON format:
{
    "action": "none|click|navigate|scroll",
    "target": "button text, link text, CSS selector, or URL to navigate to",
    "description": "human-readable description of what to do",
    "confidence": 0.0-1.0,
    "reason": "why this action will reach the target screen"
}

Actions:
- "none": App already shows the equivalent screen
- "click": Click a specific element (provide button/link text or CSS selector as target)
- "navigate": Navigate to a specific URL (provide full URL as target)
- "scroll": Scroll the page (provide "down" or "up" as target)

Be specific and use the exact text visible in the app screenshot for click targets."""


GPT41_STRUCTURAL_PROMPT = """You are a precision UI analysis engine. You receive:
1. A Figma prototype screenshot (the reference design)
2. A live application screenshot (the implementation)
3. Extracted DOM data from the live application (computed CSS, measurements, colors)
4. Figma design tokens when available (colors, typography, spacing, components)

Perform an exhaustive structural comparison. For EVERY finding, provide exact measured values from both sides.

Output sections:

## COLOR_DIFFS
For each color found, compare figma_hex vs app_hex. Include element context.

## TYPOGRAPHY_DIFFS
For each text style, compare font family, size (px), weight, line-height, letter-spacing.

## SPACING_DIFFS
Compare padding, margin, gap values for key components.

## LAYOUT_DIFFS
Compare element dimensions (width x height), positions, flex/grid properties.

## ICON_DIFFS
Compare every icon: which icons are present in each (name/glyph), sizes (px), colors (hex), and stroke weight. Flag missing icons, wrong icons, mis-sized icons, and color mismatches separately.

## IMAGE_DIFFS
Compare image content: what each image shows, dimensions, aspect ratios.

## COMPONENT_DIFFS
For each UI component (buttons, cards, inputs, nav items), compare all properties.

Respond in this exact JSON format:
{
    "color_diffs": [{"element": "<name>", "figma_value": "#hex", "app_value": "#hex", "match": true|false, "severity": "critical|major|minor"}],
    "typography_diffs": [{"element": "<text>", "property": "<prop>", "figma_value": "<val>", "app_value": "<val>", "match": true|false, "severity": "critical|major|minor"}],
    "spacing_diffs": [{"element": "<name>", "property": "<padding|margin|gap>", "figma_value": "<val>", "app_value": "<val>", "match": true|false, "severity": "critical|major|minor"}],
    "layout_diffs": [{"component": "<name>", "property": "<prop>", "figma_value": "<val>", "app_value": "<val>", "match": true|false, "severity": "critical|major|minor"}],
    "icon_diffs": [{"location": "<where>", "figma_icon": "<desc>", "app_icon": "<desc>", "figma_size": "<WxH>", "app_size": "<WxH>", "figma_color": "#hex", "app_color": "#hex", "match": true|false, "severity": "critical|major|minor"}],
    "image_diffs": [{"location": "<where>", "figma_image": "<desc>", "app_image": "<desc>", "match": true|false, "severity": "critical|major|minor"}],
    "component_diffs": [{"component": "<name>", "property": "<prop>", "figma_value": "<val>", "app_value": "<val>", "match": true|false, "severity": "critical|major|minor"}],
    "structural_score": <0-100>,
    "total_diffs": <count>,
    "critical_count": <count>,
    "major_count": <count>,
    "minor_count": <count>
}

Be exhaustive. Every finding MUST have exact measured values."""


GPT5_UX_PROMPT = """You are a senior UX design director performing a holistic review. You receive:
1. Figma prototype screenshot (reference design)
2. Live application screenshot (implementation)
3. Structural analysis findings from a detailed DOM comparison (the GPT-4.1 analysis)

Your role is HIGH-LEVEL UX assessment. Do NOT re-analyze individual pixel values — the structural analysis already covers that. Instead focus on:

1. **Visual Hierarchy**: Does the app maintain the same visual hierarchy as the design? Are primary CTAs equally prominent? Is the reading order preserved?
2. **Flow Coherence**: Does the screen feel like it belongs in the same journey as the design? Would users feel oriented?
3. **Interaction Patterns**: Are interactive affordances (buttons, links, form elements) equally discoverable?
4. **Accessibility**: Contrast ratios, touch/click target sizes, keyboard navigability indicators
5. **Emotional Design**: Does the app convey the same mood/tone? Color temperature, whitespace usage, visual density
6. **Information Architecture**: Is content organized the same way? Grouping, proximity, alignment patterns

Respond in this exact JSON format:
{
    "overall_score": <0-100>,
    "design_fidelity_score": <0-100>,
    "ux_score": <0-100>,
    "fidelity_scores": {
        "visual": <0-100>,
        "layout": <0-100>,
        "component": <0-100>,
        "token_theme": <0-100>,
        "icons": <0-100>,
        "ux_flow": <0-100>
    },
    "categories": [
        {"name": "Visual Fidelity", "score": <0-100>, "findings": "<detailed findings>"},
        {"name": "Layout Fidelity", "score": <0-100>, "findings": "<detailed findings>"},
        {"name": "Component Fidelity", "score": <0-100>, "findings": "<detailed findings>"},
        {"name": "Token/Theme Fidelity", "score": <0-100>, "findings": "<detailed findings>"},
        {"name": "Icon Fidelity", "score": <0-100>, "findings": "<icon usage, sizes, colors, missing/wrong icons>"},
        {"name": "UX Flow Fidelity", "score": <0-100>, "findings": "<detailed findings>"}
    ],
    "visual_hierarchy_assessment": "<assessment>",
    "flow_coherence_assessment": "<assessment>",
    "accessibility_findings": ["<finding>"],
    "emotional_design_notes": "<notes>",
    "critical_issues": ["<issue with evidence>"],
    "minor_issues": ["<issue with evidence>"],
    "ux_findings": ["<finding>"],
    "recommendations": ["<actionable recommendation>"],
    "component_analysis": [
        {"component": "<name>", "design_match": "match|partial|mismatch", "notes": "<details>"}
    ],
    "summary": "<3-4 sentence comprehensive assessment>"
}

Provide actionable, high-level insights that complement the structural analysis."""


def _esc(text):
    return html_mod.escape(str(text)) if text else ""


def _generate_diff_image_b64(figma_path: str, app_path: str) -> str:
    try:
        from PIL import Image, ImageChops, ImageEnhance, ImageDraw
        fpath_figma = os.path.join(UPLOAD_DIR, figma_path.replace("/uploads/", ""))
        fpath_app = os.path.join(UPLOAD_DIR, app_path.replace("/uploads/", ""))
        if not os.path.exists(fpath_figma) or not os.path.exists(fpath_app):
            return ""
        img_figma = Image.open(fpath_figma).convert("RGB")
        img_app = Image.open(fpath_app).convert("RGB")
        w = max(img_figma.width, img_app.width)
        h = max(img_figma.height, img_app.height)
        img_figma = img_figma.resize((w, h), Image.LANCZOS)
        img_app = img_app.resize((w, h), Image.LANCZOS)
        diff = ImageChops.difference(img_figma, img_app)
        diff_gray = diff.convert("L")
        threshold = 30
        mask = diff_gray.point(lambda p: 255 if p > threshold else 0)
        overlay = img_app.copy()
        red_layer = Image.new("RGB", (w, h), (255, 0, 0))
        overlay = Image.composite(red_layer, overlay, mask)
        blended = Image.blend(img_app, overlay, 0.5)
        draw = ImageDraw.Draw(blended)
        draw.text((10, 10), "RED = pixel differences", fill=(255, 0, 0))
        buf = io.BytesIO()
        blended.save(buf, format="PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        return ""


def _generate_html_report(validation, pages, db):
    html_parts = []
    html_parts.append("""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Design Validation Report — """ + _esc(validation.name or "Report") + """</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
.container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
.header { text-align: center; margin-bottom: 48px; padding: 40px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; border-radius: 16px; }
.header h1 { font-size: 28px; margin-bottom: 8px; }
.header p { opacity: 0.85; font-size: 14px; }
.overall-score { display: inline-block; font-size: 48px; font-weight: 800; background: rgba(255,255,255,0.2); padding: 12px 32px; border-radius: 12px; margin-top: 16px; }
.section { background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.section h2 { font-size: 20px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
.section h3 { font-size: 16px; margin-bottom: 12px; color: #475569; }
.screenshots { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.screenshots img { width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
.screenshots .label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px; }
.score-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
.score-card { text-align: center; padding: 16px 8px; border-radius: 10px; border: 2px solid #e2e8f0; }
.score-card .score { font-size: 28px; font-weight: 700; }
.score-card .label { font-size: 11px; color: #64748b; margin-top: 4px; }
.green { color: #16a34a; border-color: #bbf7d0; background: #f0fdf4; }
.yellow { color: #ca8a04; border-color: #fef08a; background: #fefce8; }
.red { color: #dc2626; border-color: #fecaca; background: #fef2f2; }
table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
th { background: #f8fafc; font-weight: 600; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.color-swatch { display: inline-block; width: 24px; height: 24px; border-radius: 4px; border: 1px solid #d1d5db; vertical-align: middle; margin-right: 8px; }
.match-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.match-yes { background: #dcfce7; color: #166534; }
.match-no { background: #fee2e2; color: #991b1b; }
.match-partial { background: #fef9c3; color: #854d0e; }
.issue-list { list-style: none; padding: 0; }
.issue-list li { padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; font-size: 13px; }
.issue-critical { background: #fef2f2; border-left: 3px solid #dc2626; }
.issue-minor { background: #fefce8; border-left: 3px solid #ca8a04; }
.issue-rec { background: #eff6ff; border-left: 3px solid #2563eb; }
.component-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
.component-card .name { font-weight: 600; font-size: 14px; }
.component-card .notes { font-size: 13px; color: #64748b; margin-top: 4px; }
.summary-text { font-size: 15px; color: #475569; padding: 16px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #4f46e5; }
.print-footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e8f0; }
@media print {
  body { background: white; }
  .section { box-shadow: none; border: 1px solid #e2e8f0; break-inside: avoid; }
  .header { background: #4f46e5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
@media (max-width: 1024px) {
  .screenshots { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 768px) {
  .screenshots { grid-template-columns: 1fr; }
  .score-grid { grid-template-columns: repeat(3, 1fr); }
}
</style>
</head>
<body>
<div class="container">
""")

    score_class = "green" if (validation.overall_score or 0) >= 80 else "yellow" if (validation.overall_score or 0) >= 60 else "red"
    html_parts.append(f"""<div class="header">
<h1>{_esc(validation.name or "Design Validation Report")}</h1>
<p>Generated from automated Figma vs Application comparison</p>
<div class="overall-score {score_class}" style="color: white; background: rgba(255,255,255,0.2);">{round(validation.overall_score or 0)}%</div>
<p style="margin-top: 8px; font-size: 12px;">Overall Design Fidelity Score</p>
</div>""")

    for page_record in pages:
        findings_str = page_record.findings or ""
        findings = None
        try:
            findings = json.loads(findings_str) if findings_str else None
        except (json.JSONDecodeError, ValueError):
            pass

        html_parts.append(f'<div class="section"><h2>{_esc(page_record.page_name)}</h2>')

        html_parts.append('<div class="screenshots">')
        for img_type, img_path, label in [("figma", page_record.figma_image_path, "Figma Prototype"), ("app", page_record.app_image_path, "Live Application")]:
            html_parts.append(f'<div><div class="label">{label}</div>')
            if img_path:
                try:
                    b64 = _read_b64(img_path)
                    html_parts.append(f'<img src="data:image/png;base64,{b64}" alt="{label}" />')
                except Exception:
                    html_parts.append(f'<p style="color:#94a3b8;">Image not available</p>')
            else:
                html_parts.append(f'<p style="color:#94a3b8;">No image</p>')
            html_parts.append('</div>')
        if page_record.figma_image_path and page_record.app_image_path:
            diff_b64 = _generate_diff_image_b64(page_record.figma_image_path, page_record.app_image_path)
            html_parts.append('<div><div class="label" style="color:#dc2626;">Pixel Difference Heatmap</div>')
            if diff_b64:
                html_parts.append(f'<img src="data:image/png;base64,{diff_b64}" alt="Difference Heatmap" style="border-color:#fca5a5;" />')
            else:
                html_parts.append('<p style="color:#94a3b8;">Diff generation failed</p>')
            html_parts.append('</div>')
        html_parts.append('</div>')

        if findings:
            fscores = findings.get("fidelity_scores", {})
            if fscores:
                html_parts.append('<div class="score-grid">')
                for key, label in [("visual", "Visual"), ("layout", "Layout"), ("component", "Component"), ("token_theme", "Token/Theme"), ("ux_flow", "UX Flow")]:
                    s = fscores.get(key)
                    if s is not None:
                        sc = "green" if s >= 80 else "yellow" if s >= 60 else "red"
                        html_parts.append(f'<div class="score-card {sc}"><div class="score">{round(s)}%</div><div class="label">{label}</div></div>')
                html_parts.append('</div>')

            colors = findings.get("color_comparisons", [])
            if colors:
                html_parts.append('<h3>Color Palette Comparison</h3><table><tr><th>Element</th><th>Figma</th><th>App</th><th>Status</th></tr>')
                for c in colors:
                    fhex = c.get("figma_hex", "")
                    ahex = c.get("app_hex", "")
                    match = c.get("match", False)
                    badge = '<span class="match-badge match-yes">Match</span>' if match else '<span class="match-badge match-no">Mismatch</span>'
                    html_parts.append(f'<tr><td>{_esc(c.get("element", ""))}</td><td><span class="color-swatch" style="background:{_esc(fhex)}"></span>{_esc(fhex)}</td><td><span class="color-swatch" style="background:{_esc(ahex)}"></span>{_esc(ahex)}</td><td>{badge}</td></tr>')
                html_parts.append('</table>')

            dims = findings.get("dimension_comparisons", [])
            if dims:
                html_parts.append('<h3>Component Dimensions</h3><table><tr><th>Component</th><th>Figma</th><th>App</th><th>Difference</th></tr>')
                for d in dims:
                    html_parts.append(f'<tr><td>{_esc(d.get("component", ""))}</td><td>{_esc(d.get("figma_dims", ""))}</td><td>{_esc(d.get("app_dims", ""))}</td><td>{_esc(d.get("diff_px", ""))}</td></tr>')
                html_parts.append('</table>')

            typo = findings.get("typography_comparisons", [])
            if typo:
                html_parts.append('<h3>Typography Comparison</h3><table><tr><th>Element</th><th>Figma</th><th>App</th><th>Status</th></tr>')
                for t in typo:
                    match = t.get("match", False)
                    badge = '<span class="match-badge match-yes">Match</span>' if match else '<span class="match-badge match-no">Mismatch</span>'
                    html_parts.append(f'<tr><td>{_esc(t.get("element", ""))}</td><td>{_esc(t.get("figma_font", ""))}</td><td>{_esc(t.get("app_font", ""))}</td><td>{badge}</td></tr>')
                html_parts.append('</table>')

            spacing = findings.get("spacing_comparisons", [])
            if spacing:
                html_parts.append('<h3>Spacing Comparison</h3><table><tr><th>Element</th><th>Property</th><th>Figma</th><th>App</th></tr>')
                for sp in spacing:
                    html_parts.append(f'<tr><td>{_esc(sp.get("element", ""))}</td><td>{_esc(sp.get("property", ""))}</td><td>{_esc(sp.get("figma_value", ""))}</td><td>{_esc(sp.get("app_value", ""))}</td></tr>')
                html_parts.append('</table>')

            comps = findings.get("component_analysis", [])
            if comps:
                html_parts.append('<h3>Component Analysis</h3>')
                for comp in comps:
                    dm = comp.get("design_match", "").lower()
                    badge_cls = "match-yes" if dm == "match" else "match-partial" if dm == "partial" else "match-no"
                    badge_text = _esc(comp.get("design_match", "Unknown"))
                    html_parts.append(f'<div class="component-card"><div class="name">{_esc(comp.get("component", ""))} <span class="match-badge {badge_cls}">{badge_text}</span></div><div class="notes">{_esc(comp.get("notes", ""))}</div></div>')

            crit = findings.get("critical_issues", [])
            minor = findings.get("minor_issues", [])
            recs = findings.get("recommendations", [])

            if crit:
                html_parts.append('<h3>Critical Issues</h3><ul class="issue-list">')
                for issue in crit:
                    html_parts.append(f'<li class="issue-critical">{_esc(issue)}</li>')
                html_parts.append('</ul>')
            if minor:
                html_parts.append('<h3>Minor Issues</h3><ul class="issue-list">')
                for issue in minor:
                    html_parts.append(f'<li class="issue-minor">{_esc(issue)}</li>')
                html_parts.append('</ul>')
            if recs:
                html_parts.append('<h3>Recommendations</h3><ul class="issue-list">')
                for rec in recs:
                    html_parts.append(f'<li class="issue-rec">{_esc(rec)}</li>')
                html_parts.append('</ul>')

            summary = findings.get("summary", "")
            if summary:
                html_parts.append(f'<div class="summary-text">{_esc(summary)}</div>')

        html_parts.append('</div>')

    if validation.summary:
        html_parts.append(f'<div class="section"><h2>Overall Summary</h2><div class="summary-text">{_esc(validation.summary)}</div></div>')

    html_parts.append(f"""<div class="print-footer">Design Validation Report &mdash; {_esc(validation.name or "Report")} &mdash; Generated automatically</div>
</div>
</body>
</html>""")

    return "".join(html_parts)


@router.get("/{validation_id}/report")
def get_validation_report(validation_id: str, db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    v = db.query(DesignValidation).filter(DesignValidation.id == validation_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Validation not found")
    pages = db.query(ValidationPage).filter(
        ValidationPage.validation_id == v.id
    ).order_by(ValidationPage.created_at).all()
    html_content = _generate_html_report(v, pages, db)
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html_content)


def _extract_node_id_from_figma_url(url: str) -> str:
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    nid = qs.get("node-id", [None])[0]
    return nid


def _find_page_by_node_id(doc: dict, target_node_id: str):
    normalized = target_node_id.replace("-", ":")
    for pg in doc.get("children", []):
        pg_id = pg.get("id", "")
        if pg_id == target_node_id or pg_id == normalized:
            return pg
        for child in pg.get("children", []):
            child_id = child.get("id", "")
            if child_id == target_node_id or child_id == normalized:
                return pg
    return None


async def _crawl_figma_api(eq, screens_list, figma_url, token, password, max_scr):
    try:
        file_key = _extract_figma_file_key(figma_url)
        node_id_from_url = _extract_node_id_from_figma_url(figma_url)
        await eq.put({"step": "Fetching Figma frames via API (high-quality)...", "phase": "figma_crawl"})
        hdrs = {"X-Figma-Token": token}
        params = {}
        if password:
            params["password"] = password
        async with httpx.AsyncClient(timeout=60.0) as http:
            params["depth"] = 2
            resp = await http.get(f"{FIGMA_API_BASE}/files/{file_key}", headers=hdrs, params=params)
            if resp.status_code != 200:
                await eq.put({"step": f"Figma API error ({resp.status_code}), falling back to browser", "phase": "figma_crawl"})
                return False
            file_data = resp.json()
            doc = file_data.get("document", {})

            target_page = None
            if node_id_from_url:
                target_page = _find_page_by_node_id(doc, node_id_from_url)

            frames = []
            top_level_types = {"FRAME", "COMPONENT", "COMPONENT_SET"}
            def collect_frames(node, depth=0):
                if node.get("type") in top_level_types and depth == 1:
                    frames.append({"id": node["id"], "name": node.get("name", "Untitled")})
                elif depth > 1:
                    return
                for ch in node.get("children", []):
                    collect_frames(ch, depth + 1)

            pages = doc.get("children", [])
            page_names = [p.get("name", "?") for p in pages]
            await eq.put({"step": f"File has {len(pages)} page(s): {', '.join(page_names[:5])}", "phase": "figma_crawl"})

            if target_page:
                await eq.put({"step": f"Targeting page: '{target_page.get('name', 'Page')}'", "phase": "figma_crawl"})
                collect_frames(target_page, depth=0)
            else:
                first_page = pages[0] if pages else None
                if first_page:
                    await eq.put({"step": f"Using first page: '{first_page.get('name', 'Page 1')}'", "phase": "figma_crawl"})
                    collect_frames(first_page, depth=0)

            if not frames and pages:
                await eq.put({"step": "No top-level frames found, trying all direct children...", "phase": "figma_crawl"})
                search_page = target_page or (pages[0] if pages else None)
                if search_page:
                    for ch in search_page.get("children", []):
                        frames.append({"id": ch["id"], "name": ch.get("name", "Untitled")})

            frames = frames[:max_scr]
            if not frames:
                await eq.put({"step": "No frames found via API", "phase": "figma_crawl"})
                return False
            frame_names = [f["name"] for f in frames]
            await eq.put({"step": f"Found {len(frames)} frame(s): {', '.join(frame_names[:5])}. Rendering at 2x...", "phase": "figma_crawl"})
            ids_param = ",".join([f["id"] for f in frames])
            img_params = {"ids": ids_param, "format": "png", "scale": "2"}
            if password:
                img_params["password"] = password
            img_resp = await http.get(f"{FIGMA_API_BASE}/images/{file_key}", headers=hdrs, params=img_params, timeout=60.0)
            if img_resp.status_code != 200:
                await eq.put({"step": "Failed to render Figma frames via API", "phase": "figma_crawl"})
                return False
            image_urls = img_resp.json().get("images", {})
            os.makedirs(os.path.join(UPLOAD_DIR, "figma"), exist_ok=True)
            for i, frame in enumerate(frames):
                img_url = image_urls.get(frame["id"])
                if not img_url:
                    continue
                try:
                    dl = await http.get(img_url, timeout=30.0)
                    if dl.status_code != 200:
                        continue
                    fname = f"{uuid_mod.uuid4()}.png"
                    fpath = os.path.join(UPLOAD_DIR, "figma", fname)
                    with open(fpath, "wb") as f:
                        f.write(dl.content)
                    img_path = f"/uploads/figma/{fname}"
                    sname = frame["name"] or f"Screen {i+1}"
                    screens_list.append({"name": sname, "path": img_path})
                    await eq.put({
                        "figma_live": {"image": img_path, "step_index": i, "name": sname},
                        "step": f"Figma API: rendered '{sname}' ({i+1}/{len(frames)})",
                        "phase": "figma_crawl",
                    })
                except Exception:
                    continue
        if len(screens_list) == 0:
            await eq.put({"step": "Figma API: no frames rendered, falling back to browser", "phase": "figma_crawl"})
            return False
        return True
    except Exception as e:
        await eq.put({"step": f"Figma API error: {str(e)[:120]}", "phase": "figma_crawl"})
        return False


class JourneyStepInput(BaseModel):
    action: str
    target: str = ""
    value: str = ""
    description: str = ""
    capture_after: bool = False
    capture_name: str = ""

class RunFullValidationRequest(BaseModel):
    figma_password: Optional[str] = None
    figma_token: Optional[str] = None
    http_username: Optional[str] = None
    http_password: Optional[str] = None
    app_urls: Optional[List[str]] = None
    viewport_width: Optional[int] = 1440
    viewport_height: Optional[int] = 900
    wait_seconds: Optional[int] = 5
    max_screens: Optional[int] = 10
    journey_mode: Optional[str] = "deterministic"
    journey_steps: Optional[List[JourneyStepInput]] = None


@router.post("/{validation_id}/run-full-validation")
async def run_full_validation(validation_id: str, data: RunFullValidationRequest, db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    v = db.query(DesignValidation).filter(DesignValidation.id == validation_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Validation not found")
    if not v.figma_url:
        raise HTTPException(status_code=400, detail="Figma URL is required")
    if not v.app_url:
        raise HTTPException(status_code=400, detail="Application URL is required")

    _validate_url_safe(v.app_url)
    parsed_figma = urlparse(v.figma_url)
    if parsed_figma.hostname and not parsed_figma.hostname.endswith("figma.com"):
        raise HTTPException(status_code=400, detail="Figma URL must be a figma.com domain")
    if data.app_urls:
        for au in data.app_urls:
            _validate_url_safe(au)

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise HTTPException(status_code=500, detail="Playwright not available")

    os.makedirs(os.path.join(UPLOAD_DIR, "figma"), exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "app"), exist_ok=True)

    vw = max(MIN_VIEWPORT, min(data.viewport_width or 1440, MAX_VIEWPORT_WIDTH))
    vh = max(MIN_VIEWPORT, min(data.viewport_height or 900, MAX_VIEWPORT_HEIGHT))
    wait_s = max(0, min(data.wait_seconds or 5, MAX_WAIT_SECONDS))
    max_screens = max(1, min(data.max_screens or 10, MAX_JOURNEY_SCREENS))

    async def stream_full():
        try:
            yield _sse({"step": "Starting prototype journey validation...", "phase": "init"})

            existing_pages = db.query(ValidationPage).filter(ValidationPage.validation_id == v.id).all()
            for ep in existing_pages:
                db.delete(ep)
            db.commit()

            figma_screens = []
            app_screens = []
            screen_records = []
            app_journey_results = []
            screen_results = []
            journey_plan = {}
            video_urls = {"figma": "", "app": ""}
            eq = asyncio.Queue()

            async with async_playwright() as p:
                browser = await _launch_browser(p)
                yield _sse({"step": "Launching parallel crawlers...", "phase": "browsers"})

                async def figma_worker():
                    try:
                        if data.figma_token:
                            ok = await _crawl_figma_api(eq, figma_screens, v.figma_url, data.figma_token, data.figma_password, max_screens)
                            if ok:
                                return

                        proto_url = _convert_to_proto_url(v.figma_url)
                        await eq.put({"step": f"Opening Figma prototype: {proto_url[:80]}...", "phase": "figma_crawl"})
                        figma_video_dir = os.path.join(UPLOAD_DIR, "videos", f"figma_{v.id}")
                        os.makedirs(figma_video_dir, exist_ok=True)
                        figma_ctx = await browser.new_context(
                            viewport={"width": vw, "height": vh},
                            device_scale_factor=2,
                            user_agent=BROWSER_UA,
                            record_video_dir=figma_video_dir,
                            record_video_size={"width": vw, "height": vh},
                        )
                        figma_pg = await figma_ctx.new_page()
                        await figma_pg.goto(proto_url, wait_until="domcontentloaded", timeout=45000)
                        await figma_pg.wait_for_timeout(4000)

                        if data.figma_password:
                            for pw_attempt in range(3):
                                pw_input = figma_pg.locator('input[type="password"]')
                                if await pw_input.count() > 0:
                                    await pw_input.first.fill(data.figma_password)
                                    submit_btns = figma_pg.locator('button:has-text("Continue"), button:has-text("Submit"), button[type="submit"]')
                                    if await submit_btns.count() > 0:
                                        await submit_btns.first.click()
                                    else:
                                        await pw_input.first.press("Enter")
                                    await eq.put({"step": f"Entering Figma password (attempt {pw_attempt+1})...", "phase": "figma_crawl"})
                                    await figma_pg.wait_for_timeout(8000)
                                    still_pw = figma_pg.locator('input[type="password"]')
                                    if await still_pw.count() == 0:
                                        await eq.put({"step": "Password accepted, loading prototype...", "phase": "figma_crawl"})
                                        await figma_pg.wait_for_timeout(8000)
                                        break
                                    else:
                                        await eq.put({"step": "Password field still visible, retrying...", "phase": "figma_crawl"})
                                else:
                                    break

                        try:
                            await figma_pg.wait_for_selector('[data-testid="fullscreen-frame"], [class*="prototype"], canvas, svg', timeout=10000)
                            await eq.put({"step": "Prototype frame loaded", "phase": "figma_crawl"})
                        except Exception:
                            await eq.put({"step": "Waiting for prototype content...", "phase": "figma_crawl"})

                        await figma_pg.wait_for_timeout(3000)
                        ftitle = await figma_pg.title()
                        sname = ftitle.replace(" – Figma", "").replace(" - Figma", "").replace(" – Prototype", "").strip() or "Screen 1"
                        first_path = await _save_screenshot(figma_pg, "figma")
                        figma_screens.append({"name": sname, "path": first_path})
                        await eq.put({"figma_live": {"image": first_path, "step_index": 0, "name": sname}, "step": f"Figma: captured '{sname}'", "phase": "figma_crawl"})

                        visited_nodes = set()
                        initial_node = _extract_node_id_from_url(figma_pg.url)
                        if initial_node:
                            visited_nodes.add(initial_node)

                        for _ in range(max_screens * 3):
                            if len(figma_screens) >= max_screens:
                                break
                            hotspots = await figma_pg.evaluate("""() => {
                                const results = []; const seen = new Set();
                                for (const el of document.querySelectorAll('*')) {
                                    const style = window.getComputedStyle(el);
                                    if (style.cursor === 'pointer' && el.offsetWidth > 15 && el.offsetHeight > 15) {
                                        const rect = el.getBoundingClientRect();
                                        if (rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0) {
                                            const key = Math.round(rect.x) + ',' + Math.round(rect.y);
                                            if (!seen.has(key)) { seen.add(key); results.push({x: rect.x + rect.width/2, y: rect.y + rect.height/2, w: rect.width, h: rect.height}); }
                                        }
                                    }
                                }
                                results.sort((a, b) => (b.w * b.h) - (a.w * a.h));
                                return results.slice(0, 20);
                            }""")
                            if not hotspots:
                                break
                            navigated = False
                            for hs in hotspots:
                                old_url = figma_pg.url
                                try:
                                    await _show_cursor_at(figma_pg, hs["x"], hs["y"], f"🖱️ Clicking hotspot")
                                    await figma_pg.wait_for_timeout(350)
                                    cursor_path = await _take_step_screenshot(figma_pg, "figma_live", f"cursor_{len(figma_screens)}")
                                    await eq.put({
                                        "figma_live": {"image": cursor_path, "step_index": len(figma_screens) - 1, "name": f"{figma_screens[-1]['name']} → clicking..."},
                                        "step": f"Figma: clicking hotspot at ({int(hs['x'])}, {int(hs['y'])})",
                                        "phase": "figma_crawl",
                                    })
                                    await _show_click_effect(figma_pg)
                                    await _hide_cursor(figma_pg)
                                    await figma_pg.mouse.click(hs["x"], hs["y"])
                                except Exception:
                                    continue
                                await figma_pg.wait_for_timeout(2000)
                                new_url = figma_pg.url
                                new_node = _extract_node_id_from_url(new_url)
                                if (new_node and new_node not in visited_nodes) or (new_url != old_url and not new_node):
                                    if new_node:
                                        visited_nodes.add(new_node)
                                    path = await _save_screenshot(figma_pg, "figma")
                                    nm = f"Screen {len(figma_screens) + 1}"
                                    figma_screens.append({"name": nm, "path": path})
                                    await eq.put({"figma_live": {"image": path, "step_index": len(figma_screens) - 1, "name": nm}, "step": f"Figma: navigated to '{nm}'", "phase": "figma_crawl"})
                                    navigated = True
                                    break
                            if not navigated:
                                break
                        figma_video_path = None
                        try:
                            figma_video_path = await figma_pg.video.path()
                        except Exception:
                            pass
                        await figma_ctx.close()
                        if figma_video_path and os.path.exists(str(figma_video_path)):
                            rel_path = os.path.relpath(str(figma_video_path), os.path.dirname(UPLOAD_DIR))
                            figma_vid_url = f"/{rel_path}"
                            video_urls["figma"] = figma_vid_url
                            await eq.put({"figma_video": figma_vid_url, "step": "Figma journey recording ready — click play to watch", "phase": "figma_crawl"})
                    except Exception as e:
                        await eq.put({"step": f"Figma error: {str(e)[:150]}", "phase": "figma_crawl"})
                    finally:
                        await eq.put({"_sentinel": "figma_done"})

                figma_task = asyncio.create_task(figma_worker())

                while True:
                    try:
                        event = await asyncio.wait_for(eq.get(), timeout=2.0)
                        if event.get("_sentinel") == "figma_done":
                            yield _sse({"step": f"Figma crawl complete: {len(figma_screens)} screen(s)", "phase": "figma_crawl", "total_figma_screens": len(figma_screens)})
                            break
                        yield _sse(event)
                    except asyncio.TimeoutError:
                        if figma_task.done():
                            break
                        continue

                while not eq.empty():
                    event = await eq.get()
                    if not event.get("_sentinel"):
                        yield _sse(event)

                await figma_task

                if len(figma_screens) < 1:
                    yield _sse({"step": "No prototype screens captured — skipping mirror analysis", "phase": "done"})
                    await browser.close()
                else:
                    figma_tokens = None
                    if data.figma_token:
                        try:
                            file_key = _extract_figma_file_key(v.figma_url)
                            async with httpx.AsyncClient(timeout=60.0) as http_client:
                                figma_tokens = await _extract_figma_design_tokens(http_client, file_key, data.figma_token, data.figma_password)
                            if figma_tokens:
                                yield _sse({"step": f"Extracted Figma design tokens: {len(figma_tokens.get('colors',[]))} colors, {len(figma_tokens.get('text_styles',[]))} text styles, {len(figma_tokens.get('components',[]))} components", "phase": "figma_tokens"})
                        except Exception as tok_err:
                            yield _sse({"step": f"Figma token extraction skipped: {str(tok_err)[:100]}", "phase": "figma_tokens"})

                    yield _sse({"step": f"Starting screen-by-screen app navigation for {len(figma_screens)} prototype screen(s)...", "phase": "app_journey"})

                    app_video_dir = os.path.join(UPLOAD_DIR, "videos", f"app_{v.id}")
                    os.makedirs(app_video_dir, exist_ok=True)
                    app_ctx_opts = {
                        "viewport": {"width": vw, "height": vh},
                        "device_scale_factor": 2,
                        "user_agent": BROWSER_UA,
                        "record_video_dir": app_video_dir,
                        "record_video_size": {"width": vw, "height": vh},
                    }
                    if data.http_username and data.http_password:
                        app_ctx_opts["http_credentials"] = {"username": data.http_username, "password": data.http_password}
                    app_ctx = await browser.new_context(**app_ctx_opts)
                    app_pg = await app_ctx.new_page()

                    screen_results = []
                    try:
                        first_url = v.app_url
                        yield _sse({"step": f"App: navigating to {first_url}", "phase": "app_journey"})
                        await app_pg.goto(first_url, wait_until="domcontentloaded", timeout=30000)
                        if wait_s > 0:
                            await app_pg.wait_for_timeout(wait_s * 1000)
                        try:
                            await app_pg.wait_for_load_state("networkidle", timeout=15000)
                        except Exception:
                            pass
                        await app_pg.wait_for_timeout(3000)

                        field_data = {**SYNTHETIC_DATA}

                        has_manual_steps = (data.journey_steps and len(data.journey_steps) > 0)
                        use_deterministic = (data.journey_mode == "deterministic" and has_manual_steps)

                        if data.journey_mode == "deterministic" and not has_manual_steps:
                            yield _sse({"step": "No scripted steps defined — AI will auto-generate steps from the prototype...", "phase": "app_journey"})

                        if use_deterministic:
                            yield _sse({"step": f"Deterministic mode: executing {len(data.journey_steps)} scripted step(s)...", "phase": "app_journey"})

                            steps_dicts = [s.model_dump() if hasattr(s, 'model_dump') else s.dict() for s in data.journey_steps]
                            screen_results = await execute_deterministic_journey(
                                app_pg, steps_dicts, field_data, eq, figma_screens,
                                dom_extractor=_extract_page_elements
                            )

                            while not eq.empty():
                                ev = await eq.get()
                                if not ev.get("_sentinel"):
                                    yield _sse(ev)

                            for sr in screen_results:
                                app_screens.append({
                                    "name": sr.get("screen_description", f"Screen {sr['screen_index']+1}"),
                                    "path": sr["screenshot"],
                                    "url": sr.get("url", ""),
                                    "dom_data": sr.get("dom_data"),
                                })

                        else:
                            yield _sse({"step": f"AI analyzing {len(figma_screens)} prototype screen(s) to generate journey steps...", "phase": "app_journey"})

                            journey_plan = generate_journey_from_prototype(client, figma_screens)
                            generated_steps = journey_plan.get("steps", [])
                            journey_desc = journey_plan.get("journey_description", "AI-generated journey")

                            yield _sse({
                                "step": f"AI generated {len(generated_steps)} step(s): {journey_desc[:100]}",
                                "phase": "app_journey",
                                "generated_steps": generated_steps,
                            })

                            if generated_steps:
                                screen_results = await execute_deterministic_journey(
                                    app_pg, generated_steps, field_data, eq, figma_screens,
                                    dom_extractor=_extract_page_elements
                                )

                                while not eq.empty():
                                    ev = await eq.get()
                                    if not ev.get("_sentinel"):
                                        yield _sse(ev)

                                for sr in screen_results:
                                    app_screens.append({
                                        "name": sr.get("screen_description", f"Screen {sr['screen_index']+1}"),
                                        "path": sr["screenshot"],
                                        "url": sr.get("url", ""),
                                        "dom_data": sr.get("dom_data"),
                                    })

                                try:
                                    gen_steps_json = json.dumps(generated_steps)
                                    v.journey_steps = gen_steps_json
                                    v.journey_mode = "deterministic"
                                    db.commit()
                                except Exception:
                                    pass
                            else:
                                yield _sse({"step": "AI could not generate journey steps from prototype. Try adding steps manually.", "phase": "app_journey"})

                        total_screens = len(screen_results)
                        matched = sum(1 for r in screen_results if r.get("failed_actions", 0) == 0)
                        yield _sse({
                            "step": f"App navigation complete — {matched}/{total_screens} screens matched successfully",
                            "phase": "app_journey",
                        })

                    except Exception as e:
                        yield _sse({"step": f"App journey error: {str(e)[:150]}", "phase": "app_journey"})
                    finally:
                        app_video_path = None
                        try:
                            app_video_path = await app_pg.video.path()
                        except Exception:
                            pass
                        await app_ctx.close()
                        if app_video_path and os.path.exists(str(app_video_path)):
                            rel_path = os.path.relpath(str(app_video_path), os.path.dirname(UPLOAD_DIR))
                            app_vid_url = f"/{rel_path}"
                            video_urls["app"] = app_vid_url
                            yield _sse({"app_video": app_vid_url, "step": "App journey recording ready — click play to watch", "phase": "app_journey"})

                    await browser.close()

            journey_report = None
            if screen_results:
                journey_report = build_journey_report(figma_screens, screen_results)
                yield _sse({
                    "journey_report": journey_report,
                    "step": f"Journey conformance: {journey_report['scores']['overall']}% — {journey_report['verdict']}",
                    "phase": "journey_comparison",
                })

            num_pairs = min(len(figma_screens), len(app_screens))
            yield _sse({
                "step": f"Browsers closed. Pairing {num_pairs} screen(s) for AI analysis...",
                "phase": "pairing",
                "total_figma": len(figma_screens),
                "total_app": len(app_screens),
                "total_pairs": num_pairs,
            })

            for i in range(num_pairs):
                fs = figma_screens[i]
                aps = app_screens[i] if i < len(app_screens) else {"name": "", "path": "", "url": ""}
                pair_name = fs["name"]

                page_record = ValidationPage(
                    validation_id=v.id,
                    page_name=pair_name,
                    figma_image_path=fs["path"],
                    app_image_path=aps.get("path", ""),
                )
                db.add(page_record)
                db.commit()
                db.refresh(page_record)
                screen_records.append(page_record)

                yield _sse({
                    "journey_step": {
                        "index": i,
                        "name": pair_name,
                        "figma_image": fs["path"],
                        "app_image": aps.get("path", ""),
                        "app_url": aps.get("url", ""),
                        "page_id": str(page_record.id),
                    },
                })

            yield _sse({
                "step": f"Running AI analysis on {len(screen_records)} screen pair(s)...",
                "phase": "analysis",
                "total_screens": len(screen_records),
            })

            def _build_dom_context(screen_dom_data):
                if not screen_dom_data:
                    return ""
                dom_summary_parts = []
                if screen_dom_data.get("colors"):
                    dom_summary_parts.append("EXTRACTED APP COLOR PALETTE:")
                    for c in screen_dom_data["colors"][:25]:
                        dom_summary_parts.append(f"  {c['hex']} — used by: {', '.join(c['usages'][:3])}")
                if screen_dom_data.get("typography"):
                    dom_summary_parts.append("\nEXTRACTED APP TYPOGRAPHY:")
                    for t in screen_dom_data["typography"][:15]:
                        dom_summary_parts.append(f"  {t.get('fontFamily','')} {t.get('fontSize','')} w{t.get('fontWeight','')} lh:{t.get('lineHeight','')} ls:{t.get('letterSpacing','')} — {', '.join(t.get('usages',[])[:3])}")
                if screen_dom_data.get("icons"):
                    dom_summary_parts.append("\nEXTRACTED APP ICONS:")
                    for ic in screen_dom_data["icons"][:15]:
                        dom_summary_parts.append(f"  {ic['tag']} classes: {', '.join(ic.get('classes',[]))} size: {ic.get('bounds',{}).get('width','?')}x{ic.get('bounds',{}).get('height','?')} color: {ic.get('color','')}")
                if screen_dom_data.get("images"):
                    dom_summary_parts.append("\nEXTRACTED APP IMAGES:")
                    for im in screen_dom_data["images"][:10]:
                        dom_summary_parts.append(f"  src: {im.get('src','')[:80]} alt: {im.get('alt','')} size: {im.get('bounds',{}).get('width','?')}x{im.get('bounds',{}).get('height','?')} natural: {im.get('naturalWidth','?')}x{im.get('naturalHeight','?')}")
                if screen_dom_data.get("elements"):
                    dom_summary_parts.append("\nEXTRACTED APP ELEMENT MEASUREMENTS:")
                    for el in screen_dom_data["elements"][:40]:
                        b = el.get("bounds", {}); s = el.get("styles", {})
                        parts = [f"{el['tag']}"]
                        if el.get("text"): parts.append(f'"{el["text"][:40]}"')
                        parts.append(f"bounds: {b.get('width',0)}x{b.get('height',0)} at ({b.get('x',0)},{b.get('y',0)})")
                        if s.get("fontSize"): parts.append(f"font: {s.get('fontFamily','')} {s['fontSize']} w{s.get('fontWeight','')}")
                        if s.get("backgroundColor"): parts.append(f"bg: {s['backgroundColor']}")
                        if s.get("color"): parts.append(f"color: {s['color']}")
                        if s.get("borderColor"): parts.append(f"border-color: {s['borderColor']}")
                        if s.get("padding") and s["padding"] != "0px": parts.append(f"padding: {s['padding']}")
                        if s.get("borderRadius") and s["borderRadius"] != "0px": parts.append(f"border-radius: {s['borderRadius']}")
                        if s.get("boxShadow"): parts.append(f"shadow: {s['boxShadow'][:60]}")
                        if s.get("gap"): parts.append(f"gap: {s['gap']}")
                        if s.get("display") and s["display"] in ("flex", "grid", "inline-flex", "inline-grid"):
                            parts.append(f"display: {s['display']}")
                            if s.get("flexDirection"): parts.append(f"flex-dir: {s['flexDirection']}")
                            if s.get("alignItems"): parts.append(f"align: {s['alignItems']}")
                        if el.get("pseudoBefore"):
                            pb = el["pseudoBefore"]; parts.append(f"::before({pb.get('content','')[:20]} color:{pb.get('color','')})")
                        if el.get("pseudoAfter"):
                            pa = el["pseudoAfter"]; parts.append(f"::after({pa.get('content','')[:20]} color:{pa.get('color','')})")
                        if el.get("formState"):
                            fs = el["formState"]; fs_parts = [f"type:{fs.get('type','')}"]
                            if fs.get("disabled"): fs_parts.append("disabled")
                            if fs.get("required"): fs_parts.append("required")
                            if fs.get("checked") is not None: fs_parts.append(f"checked:{fs['checked']}")
                            if fs.get("placeholder"): fs_parts.append(f'placeholder:"{fs["placeholder"][:20]}"')
                            parts.append(f"form[{' '.join(fs_parts)}]")
                        if el.get("ariaState"):
                            aria = el["ariaState"]; aria_parts = [f"{k}:{v}" for k, v in aria.items()]
                            parts.append(f"aria({' '.join(aria_parts)})")
                        dom_summary_parts.append(f"  {' | '.join(parts)}")
                if screen_dom_data.get("html_structure"):
                    dom_summary_parts.append("\nHTML STRUCTURE HIERARCHY:")
                    def _render_structure(nodes, indent=0):
                        for node in nodes[:20]:
                            prefix = "  " * indent
                            tag = node.get("tag", ""); role = node.get("role", "")
                            aria = node.get("ariaLabel", ""); nid = node.get("id", "")
                            cc = node.get("childCount", 0)
                            parts = [f"{prefix}<{tag}"]
                            if nid: parts.append(f'id="{nid}"')
                            if role: parts.append(f'role="{role}"')
                            if aria: parts.append(f'aria-label="{aria[:30]}"')
                            if node.get("ariaExpanded") is not None: parts.append(f'aria-expanded="{node["ariaExpanded"]}"')
                            parts.append(f"children={cc}")
                            dom_summary_parts.append(" ".join(parts) + ">")
                            if node.get("children"): _render_structure(node["children"], indent + 1)
                    _render_structure(screen_dom_data["html_structure"])
                return "\n".join(dom_summary_parts)

            def _build_figma_token_context(figma_tokens):
                if not figma_tokens:
                    return ""
                ft_parts = ["FIGMA DESIGN TOKENS:"]
                if figma_tokens.get("colors"):
                    ft_parts.append("\nFigma Colors:")
                    for fc in figma_tokens["colors"][:25]:
                        ft_parts.append(f"  {fc.get('name','')} — {fc.get('hex', fc.get('description',''))}" + (f" opacity:{fc.get('opacity','')}" if fc.get('opacity') and fc.get('opacity') != 1 else ""))
                if figma_tokens.get("text_styles"):
                    ft_parts.append("\nFigma Typography:")
                    for ft in figma_tokens["text_styles"][:15]:
                        ft_parts.append(f"  {ft.get('name','')} — {ft.get('fontFamily','')} {ft.get('fontSize','')}px w{ft.get('fontWeight','')} lh:{ft.get('lineHeightPx','')}px ls:{ft.get('letterSpacing','')}")
                if figma_tokens.get("spacing"):
                    ft_parts.append("\nFigma Spacing/Layout:")
                    for sp in figma_tokens["spacing"][:15]:
                        ft_parts.append(f"  {sp.get('name','')} — layout:{sp.get('layoutMode','')} spacing:{sp.get('itemSpacing','')} padding:{sp.get('paddingTop','')}/{sp.get('paddingRight','')}/{sp.get('paddingBottom','')}/{sp.get('paddingLeft','')}")
                if figma_tokens.get("effects"):
                    ft_parts.append("\nFigma Effects:")
                    for ef in figma_tokens["effects"][:10]:
                        ft_parts.append(f"  {ef.get('node_name','')} — {ef.get('type','')} radius:{ef.get('radius','')} offset:{ef.get('offset','')}")
                if figma_tokens.get("components"):
                    ft_parts.append("\nFigma Components:")
                    for cp in figma_tokens["components"][:15]:
                        ft_parts.append(f"  {cp.get('name','')} — {cp.get('type','')} {cp.get('width','?')}x{cp.get('height','?')} radius:{cp.get('cornerRadius','')}")
                return "\n".join(ft_parts)

            all_results = []
            all_b64_pairs = []
            screen_prep = []
            for si, pr in enumerate(screen_records):
                if not pr.figma_image_path or not pr.app_image_path:
                    continue
                try:
                    figma_b64 = _read_b64(pr.figma_image_path)
                    app_b64 = _read_b64(pr.app_image_path)
                except Exception:
                    continue
                pname = pr.page_name
                all_b64_pairs.append({"name": pname, "figma": figma_b64, "app": app_b64})
                screen_dom_data = app_screens[si].get("dom_data") if si < len(app_screens) else None
                dom_context = _build_dom_context(screen_dom_data)
                figma_token_context = _build_figma_token_context(figma_tokens)
                screen_prep.append({
                    "si": si, "pr": pr, "pname": pname,
                    "figma_b64": figma_b64, "app_b64": app_b64,
                    "dom_context": dom_context, "figma_token_context": figma_token_context,
                    "screen_dom_data": screen_dom_data,
                })

            PARALLEL_SCREENS = 2
            analysis_q: asyncio.Queue = asyncio.Queue()
            sem = asyncio.Semaphore(PARALLEL_SCREENS)
            results_map = {}

            async def _analyze_one(sp):
                si = sp["si"]; pr = sp["pr"]; pname = sp["pname"]
                figma_b64 = sp["figma_b64"]; app_b64 = sp["app_b64"]
                dom_context = sp["dom_context"]; figma_token_context = sp["figma_token_context"]
                screen_dom_data = sp["screen_dom_data"]
                async with sem:
                    await analysis_q.put({"step": f"▶ Worker started for screen {si+1}: {pname}", "phase": "analysis", "screen_index": si})
                    structural_user_text = f"Perform deep structural comparison of Figma prototype screen '{pname}' vs live application."
                    if dom_context: structural_user_text += f"\n\n{dom_context}"
                    if figma_token_context: structural_user_text += f"\n\n{figma_token_context}"

                    def _call_structural():
                        resp = client.chat.completions.create(
                            model="gpt-4.1",
                            messages=[
                                {"role": "system", "content": GPT41_STRUCTURAL_PROMPT},
                                {"role": "user", "content": [
                                    {"type": "text", "text": structural_user_text},
                                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{figma_b64}", "detail": "high"}},
                                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{app_b64}", "detail": "high"}},
                                ]},
                            ],
                            max_completion_tokens=6000,
                        )
                        return resp.choices[0].message.content or ""

                    await analysis_q.put({"step": f"  GPT-4.1 structural analysis: {pname}", "phase": "analysis", "screen_index": si, "analysis_layer": "structural"})
                    try:
                        structural_response = await asyncio.to_thread(_call_structural)
                    except Exception as se:
                        structural_response = ""
                        await analysis_q.put({"step": f"  ⚠ Structural call failed for '{pname}': {str(se)[:120]}", "phase": "analysis", "screen_index": si})
                    try:
                        structural_result = _parse_ai_json(structural_response)
                    except (json.JSONDecodeError, IndexError):
                        structural_result = {"structural_score": 0, "color_diffs": [], "typography_diffs": [], "spacing_diffs": [], "layout_diffs": [], "icon_diffs": [], "image_diffs": [], "component_diffs": []}
                    await analysis_q.put({"step": f"  ✓ Structural done for '{pname}' — {structural_result.get('total_diffs', len((structural_result.get('color_diffs') or [])) + len((structural_result.get('layout_diffs') or [])))} diffs", "phase": "analysis", "screen_index": si, "analysis_layer": "structural"})

                    structural_findings_text = json.dumps(structural_result, indent=2)[:4000]
                    ux_user_text = f"Review screen '{pname}' — prototype vs live app. Here are the structural analysis findings from the DOM comparison:\n\n{structural_findings_text}"

                    def _call_ux():
                        resp = client.chat.completions.create(
                            model="gpt-5",
                            messages=[
                                {"role": "system", "content": GPT5_UX_PROMPT},
                                {"role": "user", "content": [
                                    {"type": "text", "text": ux_user_text},
                                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{figma_b64}", "detail": "high"}},
                                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{app_b64}", "detail": "high"}},
                                ]},
                            ],
                            max_completion_tokens=6000,
                        )
                        return resp.choices[0].message.content or ""

                    await analysis_q.put({"step": f"  GPT-5 UX analysis: {pname}", "phase": "analysis", "screen_index": si, "analysis_layer": "ux"})
                    try:
                        full_response = await asyncio.to_thread(_call_ux)
                    except Exception as ue:
                        full_response = ""
                        await analysis_q.put({"step": f"  ⚠ UX call failed for '{pname}': {str(ue)[:120]}", "phase": "analysis", "screen_index": si})

                    try:
                        result = _parse_ai_json(full_response)
                    except (json.JSONDecodeError, IndexError):
                        await analysis_q.put({"_save_raw": True, "si": si, "pr_id": str(pr.id), "raw": full_response, "pname": pname})
                        return

                    result["structural_analysis"] = structural_result
                    if screen_dom_data:
                        result["extracted_dom_evidence"] = {
                            "colors": screen_dom_data.get("colors", [])[:25],
                            "typography": screen_dom_data.get("typography", [])[:15],
                            "icons": screen_dom_data.get("icons", [])[:15],
                            "images": screen_dom_data.get("images", [])[:10],
                            "element_count": len(screen_dom_data.get("elements", [])),
                            "elements_sample": screen_dom_data.get("elements", [])[:40],
                            "html_structure": screen_dom_data.get("html_structure", []),
                        }
                    if figma_tokens:
                        result["figma_design_tokens"] = {
                            "colors": figma_tokens.get("colors", [])[:25],
                            "text_styles": figma_tokens.get("text_styles", [])[:15],
                            "components": figma_tokens.get("components", [])[:15],
                            "spacing": figma_tokens.get("spacing", [])[:15],
                            "effects": figma_tokens.get("effects", [])[:10],
                        }

                    await analysis_q.put({"step": f"  ⚖ Judge validating: {pname}", "phase": "judge", "screen_index": si})
                    try:
                        judge_result = await asyncio.to_thread(run_judge_validation, client, figma_b64, app_b64, result, pname)
                        result["judge_validation"] = judge_result
                        if judge_result.get("adjusted_overall_score") is not None:
                            original_score = result.get("overall_score", 0)
                            adjusted_score = judge_result["adjusted_overall_score"]
                            result["original_score"] = original_score
                            result["overall_score"] = adjusted_score
                            judge_verdict = judge_result.get("judge_verdict", "unknown")
                            await analysis_q.put({"step": f"  ⚖ Judge verdict for '{pname}': {judge_verdict} — score {original_score}% → {adjusted_score}%", "phase": "judge", "screen_index": si})
                        else:
                            await analysis_q.put({"step": f"  ✓ Judge done for '{pname}'", "phase": "judge", "screen_index": si})
                    except Exception as judge_err:
                        await analysis_q.put({"step": f"  ⚠ Judge skipped for '{pname}': {str(judge_err)[:100]}", "phase": "judge", "screen_index": si})

                    await analysis_q.put({"_save_screen": True, "si": si, "pr_id": str(pr.id), "result": result, "pname": pname, "structural_score": structural_result.get("structural_score", 0)})

            yield _sse({"step": f"⚡ Spawning {min(PARALLEL_SCREENS, len(screen_prep))} parallel analysis worker(s) for {len(screen_prep)} screen(s)...", "phase": "analysis", "total_screens": len(screen_prep), "parallel_workers": min(PARALLEL_SCREENS, len(screen_prep))})
            for sp in screen_prep:
                yield _sse({
                    "step": f"📋 Queued screen {sp['si']+1}: {sp['pname']}",
                    "screen_index": sp["si"], "screen_name": sp["pname"],
                    "figma_image": sp["pr"].figma_image_path, "app_image": sp["pr"].app_image_path,
                    "page_id": str(sp["pr"].id), "phase": "analysis",
                })

            tasks = [asyncio.create_task(_analyze_one(sp)) for sp in screen_prep]
            gather_task = asyncio.gather(*tasks, return_exceptions=True)

            while not gather_task.done() or not analysis_q.empty():
                try:
                    ev = await asyncio.wait_for(analysis_q.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue
                if ev.get("_save_screen"):
                    si_e = ev["si"]; pr_id = ev["pr_id"]; result = ev["result"]; pname_e = ev["pname"]
                    pr_obj = db.query(ValidationPage).filter(ValidationPage.id == pr_id).first()
                    if pr_obj:
                        pr_obj.compliance_score = result.get("overall_score", 0)
                        pr_obj.findings = json.dumps(result)
                        pr_obj.status = "compared"
                        db.commit()
                    results_map[si_e] = result
                    yield _sse({"screen_done": True, "screen_index": si_e, "page_id": pr_id, "screen_name": pname_e, "score": result.get("overall_score", 0), "fidelity_scores": result.get("fidelity_scores", {}), "structural_score": ev.get("structural_score", 0), "judge_validation": result.get("judge_validation")})
                elif ev.get("_save_raw"):
                    si_e = ev["si"]; pr_id = ev["pr_id"]; raw = ev["raw"]; pname_e = ev["pname"]
                    pr_obj = db.query(ValidationPage).filter(ValidationPage.id == pr_id).first()
                    if pr_obj:
                        pr_obj.findings = raw
                        pr_obj.status = "compared"
                        db.commit()
                    yield _sse({"screen_done": True, "screen_index": si_e, "page_id": pr_id, "screen_name": pname_e, "score": None})
                else:
                    yield _sse(ev)

            await gather_task
            for k in sorted(results_map.keys()):
                all_results.append(results_map[k])

            if len(all_b64_pairs) >= 2:
                yield _sse({"step": "Running GPT-5 overall UX journey analysis across all screens...", "phase": "ux_flow"})

                ux_content_parts = [
                    {"type": "text", "text": f"Analyze the UX flow across {len(all_b64_pairs)} screens. For each pair I'm providing the Figma prototype and live app screenshot. Evaluate navigation consistency, visual coherence, and overall user journey quality.\n\nScreens: " + ", ".join([pair['name'] for pair in all_b64_pairs])}
                ]
                for pair in all_b64_pairs[:8]:
                    pn = pair['name']
                    ux_content_parts.append({"type": "text", "text": f"\n--- Screen: {pn} ---"})
                    ux_content_parts.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{pair['figma']}", "detail": "low"}})
                    ux_content_parts.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{pair['app']}", "detail": "low"}})

                ux_response = ""
                ux_stream = client.chat.completions.create(
                    model="gpt-5",
                    messages=[
                        {"role": "system", "content": UX_FLOW_PROMPT},
                        {"role": "user", "content": ux_content_parts},
                    ],
                    stream=True,
                    max_completion_tokens=3000,
                )

                for chunk in ux_stream:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    content = delta.content if delta and delta.content else ""
                    if content:
                        ux_response += content
                        yield _sse({"ux_flow_content": content})

                try:
                    ux_result = _parse_ai_json(ux_response)
                    yield _sse({"ux_flow_done": True, "ux_flow_result": ux_result})
                except (json.JSONDecodeError, IndexError):
                    yield _sse({"ux_flow_done": True, "ux_flow_raw": ux_response})

            if all_results:
                avg_score = sum(r.get("overall_score", 0) for r in all_results) / len(all_results)
                v.overall_score = round(avg_score, 1)
                v.summary = f"Analyzed {len(all_results)} screens. Average design fidelity: {round(avg_score)}%."
                if len(all_results) > 1:
                    scores_list = [f"{screen_records[i].page_name}: {r.get('overall_score', 0)}%" for i, r in enumerate(all_results)]
                    v.summary += " Per-screen: " + ", ".join(scores_list)
                if journey_report:
                    v.summary += f" Journey conformance: {journey_report['scores']['overall']}% ({journey_report['verdict']})."
            else:
                v.overall_score = 0
                v.summary = "No screens could be analyzed."
            v.status = "completed"
            if video_urls["figma"]:
                v.figma_video_path = video_urls["figma"]
            if video_urls["app"]:
                v.app_video_path = video_urls["app"]
            db.commit()

            done_payload = {"done": True, "total_screens": len(screen_records), "overall_score": v.overall_score, "phase": "done"}
            if journey_report:
                done_payload["journey_report"] = journey_report
            yield _sse(done_payload)

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield _sse({"error": str(e)[:500]})

    return StreamingResponse(stream_full(), media_type="text/event-stream")


class CaptureScreenshotRequest(BaseModel):
    url: str
    wait_seconds: Optional[int] = 3
    viewport_width: Optional[int] = 1440
    viewport_height: Optional[int] = 900
    full_page: Optional[bool] = True
    http_username: Optional[str] = None
    http_password: Optional[str] = None


@router.post("/{validation_id}/pages/{page_id}/capture-app")
async def capture_app_screenshot(validation_id: str, page_id: str, data: CaptureScreenshotRequest, db: Session = Depends(get_db)):
    validate_uuid(validation_id, "validation_id")
    validate_uuid(page_id, "page_id")
    page = db.query(ValidationPage).filter(ValidationPage.id == page_id, ValidationPage.validation_id == validation_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    _validate_url_safe(data.url)

    wait_s = max(0, min(data.wait_seconds or 3, MAX_WAIT_SECONDS))
    vw = max(MIN_VIEWPORT, min(data.viewport_width or 1440, MAX_VIEWPORT_WIDTH))
    vh = max(MIN_VIEWPORT, min(data.viewport_height or 900, MAX_VIEWPORT_HEIGHT))

    try:
        from playwright.async_api import async_playwright

        filename = f"{uuid_mod.uuid4()}.png"
        filepath = os.path.join(UPLOAD_DIR, "app", filename)
        os.makedirs(os.path.join(UPLOAD_DIR, "app"), exist_ok=True)

        async with async_playwright() as p_obj:
            browser = await p_obj.chromium.launch(headless=True)
            ctx_opts = {"viewport": {"width": vw, "height": vh}, "device_scale_factor": 2}
            if data.http_username and data.http_password:
                ctx_opts["http_credentials"] = {"username": data.http_username, "password": data.http_password}
            ctx = await browser.new_context(**ctx_opts)
            pg = await ctx.new_page()
            await pg.goto(data.url, wait_until="networkidle", timeout=30000)
            if wait_s > 0:
                await pg.wait_for_timeout(wait_s * 1000)
            await pg.screenshot(path=filepath, full_page=data.full_page)
            await browser.close()

        page.app_image_path = f"/uploads/app/{filename}"
        db.commit()
        db.refresh(page)
        return serialize_page(page)

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Screenshot capture failed. Please check the URL is accessible and credentials are correct.")
