"""Production defects → automatic regression learning."""
import os
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from uuid import UUID

import httpx

from server_py.database import get_db
from server_py.models.production_defect import ProductionDefect, RegressionLink
from server_py.models.project import Project
from server_py.models.test_suite import TestSuite, TestCase
from server_py.models.test_run import TestRun
from server_py.services.regression_service import generate_regression_scenarios
from server_py.services.risk_engine import safe_recompute as _risk_recompute

router = APIRouter(prefix="/api/defects", tags=["defects"])


JIRA_BASE_URL = os.environ.get("JIRA_BASE_URL", "")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL", "")
JIRA_API_TOKEN = os.environ.get("JIRA_API_TOKEN", "")


# ---------- Pydantic ----------

class DefectIn(BaseModel):
    project_id: str
    title: str
    description: Optional[str] = ""
    repro_steps: Optional[str] = ""
    severity: Optional[str] = "medium"
    page_url: Optional[str] = ""
    jira_key: Optional[str] = ""
    source: Optional[str] = "manual"


class ScenarioIn(BaseModel):
    kind: str = "repro"
    title: str
    gherkin: str


class ApproveIn(BaseModel):
    scenarios: List[ScenarioIn]
    rationale: Optional[str] = ""


# ---------- Serializers ----------

def _serialize_defect(d: ProductionDefect, db: Session) -> dict:
    links = db.query(RegressionLink).filter(RegressionLink.defect_id == d.id).all()
    test_case_ids = [str(l.test_case_id) for l in links]
    return {
        "id": str(d.id),
        "project_id": str(d.project_id),
        "jira_key": d.jira_key,
        "title": d.title,
        "description": d.description,
        "repro_steps": d.repro_steps,
        "severity": d.severity,
        "status": d.status,
        "source": d.source,
        "page_url": d.page_url,
        "rationale": d.rationale,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "regression_test_count": len(links),
        "regression_test_case_ids": test_case_ids,
    }


# ---------- CRUD ----------

@router.get("")
def list_defects(project_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(ProductionDefect)
    if project_id:
        q = q.filter(ProductionDefect.project_id == project_id)
    rows = q.order_by(ProductionDefect.created_at.desc()).all()
    return [_serialize_defect(d, db) for d in rows]


@router.get("/stats")
def defect_stats(db: Session = Depends(get_db)):
    """KPI tile data for the dashboard."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    total = db.query(func.count(ProductionDefect.id)).scalar() or 0
    learned = db.query(func.count(ProductionDefect.id)).filter(
        ProductionDefect.status == "regression_added"
    ).scalar() or 0
    # Count defects whose regression protection was added in the last 30 days
    # (i.e., have at least one RegressionLink created within the cutoff window)
    learned_30d = db.query(func.count(func.distinct(RegressionLink.defect_id))).filter(
        RegressionLink.created_at >= cutoff,
    ).scalar() or 0
    regression_tests = db.query(func.count(RegressionLink.id)).scalar() or 0
    return {
        "total_defects": int(total),
        "defects_learned": int(learned),
        "defects_learned_30d": int(learned_30d),
        "regression_tests_generated": int(regression_tests),
    }


@router.get("/{defect_id}")
def get_defect(defect_id: UUID, db: Session = Depends(get_db)):
    d = db.query(ProductionDefect).filter(ProductionDefect.id == defect_id).first()
    if not d:
        raise HTTPException(404, "Defect not found")
    return _serialize_defect(d, db)


@router.post("", status_code=201)
def create_defect(payload: DefectIn, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == payload.project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")
    d = ProductionDefect(
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description or "",
        repro_steps=payload.repro_steps or "",
        severity=(payload.severity or "medium").lower(),
        page_url=payload.page_url or "",
        jira_key=payload.jira_key or "",
        source=(payload.source or "manual").lower(),
        status="captured",
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    _risk_recompute(db, d.project_id, trigger="defect_captured")
    return _serialize_defect(d, db)


@router.delete("/{defect_id}", status_code=204)
def delete_defect(defect_id: UUID, db: Session = Depends(get_db)):
    d = db.query(ProductionDefect).filter(ProductionDefect.id == defect_id).first()
    if not d:
        raise HTTPException(404, "Defect not found")
    db.delete(d)
    db.commit()
    return None


# ---------- AI Generation ----------

@router.post("/{defect_id}/generate")
def generate_scenarios(defect_id: UUID, db: Session = Depends(get_db)):
    d = db.query(ProductionDefect).filter(ProductionDefect.id == defect_id).first()
    if not d:
        raise HTTPException(404, "Defect not found")
    result = generate_regression_scenarios(
        title=d.title,
        description=d.description or "",
        repro_steps=d.repro_steps or "",
        severity=d.severity or "medium",
        page_url=d.page_url or "",
        jira_key=d.jira_key or "",
    )
    if not d.rationale:
        d.rationale = result.get("rationale", "")
        db.commit()
    return {
        "defect_id": str(d.id),
        "rationale": result.get("rationale", ""),
        "scenarios": result.get("scenarios", []),
        "model": result.get("model", ""),
    }


# ---------- Approve & attach to regression suite ----------

def _get_or_create_regression_suite(db: Session, project_id: str) -> TestSuite:
    suite = db.query(TestSuite).filter(
        TestSuite.project_id == project_id,
        TestSuite.suite_type == "regression",
    ).order_by(TestSuite.created_at.asc()).first()
    if suite:
        return suite
    suite = TestSuite(
        project_id=project_id,
        name="Regression Suite (auto)",
        suite_type="regression",
        description="Auto-managed suite of tests born from production defects. Each test permanently protects against a real escaped bug.",
        status="approved",
    )
    db.add(suite)
    db.commit()
    db.refresh(suite)
    return suite


@router.post("/{defect_id}/approve")
def approve_scenarios(defect_id: UUID, payload: ApproveIn, db: Session = Depends(get_db)):
    d = db.query(ProductionDefect).filter(ProductionDefect.id == defect_id).first()
    if not d:
        raise HTTPException(404, "Defect not found")
    if not payload.scenarios:
        raise HTTPException(400, "At least one scenario is required")

    suite = _get_or_create_regression_suite(db, str(d.project_id))
    badge = d.jira_key or f"DEF-{str(d.id)[:8]}"

    created_links = []
    for s in payload.scenarios:
        title = (s.title or "").strip() or f"Regression for {badge}"
        gherkin = (s.gherkin or "").strip()
        if not gherkin:
            continue
        case_title = f"{title}  ·  Born from {badge}"
        tc = TestCase(
            test_suite_id=suite.id,
            title=case_title[:500],
            description=f"Auto-generated regression test for production defect {badge}.\n\n{d.title}",
            preconditions="See defect repro steps",
            steps=d.repro_steps or "",
            expected_result="The previously reported defect does not reproduce.",
            priority="high" if d.severity in ("critical", "high") else "medium",
            status="ready",
            category="Regression",
            gherkin_script=gherkin,
            gherkin_approved="yes",
            jira_story_key=d.jira_key or "",
        )
        db.add(tc)
        db.flush()
        link = RegressionLink(
            defect_id=d.id,
            test_case_id=tc.id,
            scenario_kind=(s.kind or "repro").lower(),
        )
        db.add(link)
        created_links.append({
            "test_case_id": str(tc.id),
            "test_case_title": tc.title,
            "scenario_kind": link.scenario_kind,
        })

    if not created_links:
        raise HTTPException(400, "No valid scenarios provided")

    if payload.rationale:
        d.rationale = payload.rationale
    d.status = "regression_added"

    # Refresh suite case count
    suite.total_cases = db.query(func.count(TestCase.id)).filter(TestCase.test_suite_id == suite.id).scalar() or 0
    db.commit()
    db.refresh(d)
    _risk_recompute(db, d.project_id, trigger="defect_regression_added")

    return {
        "defect": _serialize_defect(d, db),
        "regression_suite_id": str(suite.id),
        "regression_suite_name": suite.name,
        "created": created_links,
    }


# ---------- Lineage ----------

@router.get("/{defect_id}/lineage")
def defect_lineage(defect_id: UUID, db: Session = Depends(get_db)):
    d = db.query(ProductionDefect).filter(ProductionDefect.id == defect_id).first()
    if not d:
        raise HTTPException(404, "Defect not found")

    links = db.query(RegressionLink).filter(RegressionLink.defect_id == d.id).all()
    tests_payload = []
    overall_status = "unverified"
    most_recent_run_at = None
    streak_days = 0

    now_utc = datetime.now(timezone.utc)

    for link in links:
        tc = db.query(TestCase).filter(TestCase.id == link.test_case_id).first()
        if not tc:
            continue
        runs = db.query(TestRun).filter(
            TestRun.test_case_id == tc.id
        ).order_by(TestRun.started_at.desc()).limit(50).all()
        run_rows = [{
            "id": str(r.id),
            "status": r.status,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "duration_ms": r.duration_ms or 0,
        } for r in runs]
        last = run_rows[0] if run_rows else None
        if last and last["started_at"]:
            try:
                ts = datetime.fromisoformat(last["started_at"].replace("Z", "+00:00"))
                if not most_recent_run_at or ts > most_recent_run_at:
                    most_recent_run_at = ts
            except Exception:
                pass

        # Day-based pass streak: count distinct calendar days (UTC) with at
        # least one passing run, walking back from today, broken by any
        # failed/error run on a day or by a gap with no runs.
        case_streak_days = 0
        if runs:
            # Bucket runs by date with worst-case status (fail beats pass)
            day_status: dict = {}
            for r in runs:
                if not r.started_at:
                    continue
                day = r.started_at.astimezone(timezone.utc).date()
                cur = day_status.get(day)
                if cur == "failed":
                    continue
                if r.status in ("failed", "error"):
                    day_status[day] = "failed"
                elif r.status == "passed" and cur != "failed":
                    day_status[day] = "passed"
                else:
                    day_status.setdefault(day, "other")
            today = now_utc.date()
            cursor = today
            while True:
                s = day_status.get(cursor)
                if s == "passed":
                    case_streak_days += 1
                    cursor = cursor - timedelta(days=1)
                else:
                    break
        if case_streak_days > streak_days:
            streak_days = case_streak_days

        # Overall: red if most recent failed, green if any passing streak >=1, else grey
        if last:
            if last["status"] in ("failed", "error"):
                overall_status = "regressed"
            elif overall_status != "regressed":
                overall_status = "protected"

        tests_payload.append({
            "link_id": str(link.id),
            "scenario_kind": link.scenario_kind,
            "test_case_id": str(tc.id),
            "test_case_title": tc.title,
            "test_suite_id": str(tc.test_suite_id),
            "runs": run_rows,
            "current_status": tc.status,
            "pass_streak_days": case_streak_days,
        })

    timeline = [{
        "label": "Defect captured",
        "at": d.created_at.isoformat() if d.created_at else None,
        "kind": "defect",
        "detail": f"Severity {d.severity} · source {d.source}",
    }]
    if links:
        timeline.append({
            "label": f"{len(links)} regression test{'s' if len(links) != 1 else ''} generated",
            "at": min((l.created_at for l in links if l.created_at), default=d.updated_at).isoformat() if links else None,
            "kind": "tests",
            "detail": d.rationale or "Permanent protection added to the regression suite.",
        })
    if most_recent_run_at:
        timeline.append({
            "label": f"Last verification run",
            "at": most_recent_run_at.isoformat(),
            "kind": "run",
            "detail": f"Pass streak: {streak_days}",
        })

    return {
        "defect": _serialize_defect(d, db),
        "overall_status": overall_status,
        "pass_streak_days": streak_days,
        "tests": tests_payload,
        "timeline": timeline,
    }


# ---------- Reusable badge helper ----------

@router.get("/badge/by-test-case/{test_case_id}")
def badge_for_test_case(test_case_id: UUID, db: Session = Depends(get_db)):
    """Returns the 'Born from PROD-X' badge data for a test case, if any."""
    link = db.query(RegressionLink).filter(RegressionLink.test_case_id == test_case_id).first()
    if not link:
        return {"has_badge": False}
    d = db.query(ProductionDefect).filter(ProductionDefect.id == link.defect_id).first()
    if not d:
        return {"has_badge": False}
    return {
        "has_badge": True,
        "defect_id": str(d.id),
        "label": d.jira_key or f"DEF-{str(d.id)[:8]}",
        "title": d.title,
        "severity": d.severity,
        "scenario_kind": link.scenario_kind,
    }


# ---------- JIRA bug pull ----------

@router.get("/jira/bugs/{project_key}")
async def list_jira_bugs(project_key: str):
    if not (JIRA_BASE_URL and JIRA_EMAIL and JIRA_API_TOKEN):
        raise HTTPException(500, "JIRA credentials not configured")
    jql = f'project="{project_key}" AND issuetype=Bug AND statusCategory!=Done ORDER BY priority DESC, created DESC'
    url = f"{JIRA_BASE_URL}/rest/api/3/search?jql={jql}&maxResults=50&fields=summary,status,priority,description,created"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, auth=(JIRA_EMAIL, JIRA_API_TOKEN), headers={"Accept": "application/json"})
    except (httpx.TimeoutException, httpx.RequestError) as e:
        raise HTTPException(502, f"JIRA connection error: {str(e)[:200]}")
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, f"JIRA API error: {resp.text[:200]}")
    data = resp.json()

    def _extract_desc(desc):
        if not desc:
            return ""
        if isinstance(desc, str):
            return desc
        if isinstance(desc, dict):
            parts = []
            for block in desc.get("content", []):
                if block.get("type") == "paragraph":
                    for inline in block.get("content", []):
                        if inline.get("type") == "text":
                            parts.append(inline.get("text", ""))
            return " ".join(parts)
        return ""

    bugs = []
    for issue in data.get("issues", []):
        f = issue.get("fields", {})
        bugs.append({
            "key": issue.get("key", ""),
            "summary": f.get("summary", ""),
            "description": _extract_desc(f.get("description")),
            "status": f.get("status", {}).get("name", "") if f.get("status") else "",
            "priority": f.get("priority", {}).get("name", "") if f.get("priority") else "",
            "created": f.get("created", ""),
            "url": f"{JIRA_BASE_URL}/browse/{issue.get('key', '')}",
        })
    return {"bugs": bugs, "total": data.get("total", len(bugs))}
