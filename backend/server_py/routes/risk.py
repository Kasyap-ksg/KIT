"""Release Risk Engine — executive go/no-go endpoints."""
from datetime import datetime, timedelta, timezone
from html import escape as _h
from typing import Optional, List, Dict, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from server_py.database import get_db
from server_py.models.project import Project
from server_py.models.release_risk import ReleaseRiskSnapshot
from server_py.models.production_defect import ProductionDefect, RegressionLink
from server_py.models.test_suite import TestCase, TestSuite
from server_py.models.healing_proposal import HealingProposal
from server_py.models.project_risk_config import ProjectRiskConfig
from server_py.services.risk_engine import (
    DEFAULT_WEIGHTS,
    VALID_WEIGHT_FACTORS,
    compute_risk,
    recompute_and_persist,
    serialize_snapshot,
    _resolve_weights,
)
from pydantic import BaseModel, Field


class WeightsIn(BaseModel):
    weights: Dict[str, int] = Field(..., description="Map of factor -> non-negative integer weight")


router = APIRouter(prefix="/api", tags=["risk"])


def _band_color(band: str) -> str:
    return {"LOW": "#0F8A5F", "MEDIUM": "#C68A1E", "HIGH": "#B23A3A"}.get(band, "#88A9C3")


STALE_AFTER_SECONDS = 60


def _ensure_latest(db: Session, project_id: UUID) -> ReleaseRiskSnapshot:
    """Return the latest snapshot, recomputing on demand if missing or stale.

    Event hooks keep snapshots fresh after each run/defect/healing event;
    this provides a belt-and-braces "computed on demand" guarantee on read
    by recomputing if the latest snapshot is older than STALE_AFTER_SECONDS.
    """
    snap = (
        db.query(ReleaseRiskSnapshot)
        .filter(ReleaseRiskSnapshot.project_id == project_id)
        .order_by(desc(ReleaseRiskSnapshot.computed_at))
        .first()
    )
    if snap is None:
        return recompute_and_persist(db, project_id, trigger="auto_initial")
    computed_at = snap.computed_at
    if computed_at is not None:
        if computed_at.tzinfo is None:
            computed_at = computed_at.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - computed_at).total_seconds()
        if age > STALE_AFTER_SECONDS:
            try:
                return recompute_and_persist(db, project_id, trigger="auto_on_read")
            except Exception:
                return snap
    return snap


# ---------- Read endpoints ----------

@router.get("/projects/{project_id}/risk")
def get_current_risk(project_id: UUID, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")
    snap = _ensure_latest(db, project_id)
    payload = serialize_snapshot(snap)
    payload["project_name"] = proj.name
    return payload


@router.get("/projects/{project_id}/risk/history")
def risk_history(
    project_id: UUID,
    days: int = Query(30, ge=1, le=180),
    db: Session = Depends(get_db),
):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(ReleaseRiskSnapshot)
        .filter(
            ReleaseRiskSnapshot.project_id == project_id,
            ReleaseRiskSnapshot.computed_at >= cutoff,
        )
        .order_by(ReleaseRiskSnapshot.computed_at.asc())
        .all()
    )
    if not rows:
        snap = _ensure_latest(db, project_id)
        rows = [snap]
    return {
        "project_id": str(project_id),
        "project_name": proj.name,
        "snapshots": [serialize_snapshot(r) for r in rows],
    }


@router.get("/projects/{project_id}/risk/drivers")
def top_drivers(project_id: UUID, db: Session = Depends(get_db)):
    """Top 5 actionable risk drivers — recent failed critical runs, fresh defects, pending healing — with deep-links."""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")
    now = datetime.now(timezone.utc)
    drivers: List[Dict[str, Any]] = []

    # Fresh defects
    defects = (
        db.query(ProductionDefect)
        .filter(
            ProductionDefect.project_id == project_id,
            ProductionDefect.created_at >= now - timedelta(days=7),
        )
        .order_by(ProductionDefect.created_at.desc())
        .limit(5)
        .all()
    )
    for d in defects:
        drivers.append({
            "kind": "defect",
            "title": d.title,
            "subtitle": f"{d.severity.upper()} · {(d.jira_key or 'manual')}",
            "severity": d.severity,
            "href": f"/projects/{project_id}/defects?focus={d.id}",
            "at": d.created_at.isoformat() if d.created_at else None,
        })

    # Pending healing proposals
    healings = (
        db.query(HealingProposal)
        .join(TestCase, TestCase.id == HealingProposal.test_case_id)
        .join(TestSuite, TestSuite.id == TestCase.test_suite_id)
        .filter(
            TestSuite.project_id == project_id,
            HealingProposal.status == "pending",
        )
        .order_by(HealingProposal.created_at.desc())
        .limit(5)
        .all()
    )
    for p in healings:
        drivers.append({
            "kind": "healing",
            "title": p.test_case_title or "Selector heal pending",
            "subtitle": f"Risk {p.risk_level} · confidence {p.ai_confidence}%",
            "severity": p.risk_level or "medium",
            "href": f"/self-healing?focus={p.id}",
            "at": p.created_at.isoformat() if p.created_at else None,
        })

    # Failing critical/high test cases (test-case driver path with deep-link)
    from server_py.models.test_run import TestRun
    from server_py.models.test_run_triage import TestRunTriage
    failing_runs = (
        db.query(TestRun, TestCase, TestRunTriage)
        .join(TestCase, TestCase.id == TestRun.test_case_id)
        .outerjoin(TestRunTriage, TestRunTriage.run_id == TestRun.id)
        .filter(
            TestRun.project_id == project_id,
            TestRun.started_at >= now - timedelta(days=14),
            TestRun.status.in_(("failed", "error")),
            TestCase.priority.in_(("critical", "high")),
        )
        .order_by(TestRun.started_at.desc())
        .limit(10)
        .all()
    )
    seen_cases: set = set()
    for run, tc, triage in failing_runs:
        if tc.id in seen_cases:
            continue
        seen_cases.add(tc.id)
        cat = (triage.category if triage else None) or "untriaged"
        drivers.append({
            "kind": "test",
            "title": tc.title or "Failing test",
            "subtitle": f"{tc.priority.upper()} · {cat}",
            "severity": "high" if tc.priority == "critical" else "medium",
            "href": f"/test-suites/{tc.test_suite_id}?case={tc.id}",
            "at": run.started_at.isoformat() if run.started_at else None,
        })
        if len([d for d in drivers if d["kind"] == "test"]) >= 5:
            break

    drivers.sort(key=lambda x: (x["at"] or ""), reverse=True)
    return {"drivers": drivers[:5]}


# ---------- Recompute (manual / hooks) ----------

@router.get("/projects/{project_id}/risk/weights")
def get_weights(project_id: UUID, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")
    cfg = db.query(ProjectRiskConfig).filter(ProjectRiskConfig.project_id == project_id).first()
    effective = _resolve_weights(db, project_id)
    return {
        "defaults": dict(DEFAULT_WEIGHTS),
        "configured": (cfg.weights if cfg else None),
        "effective": effective,
        "factors": list(VALID_WEIGHT_FACTORS),
    }


@router.put("/projects/{project_id}/risk/weights")
def put_weights(project_id: UUID, payload: WeightsIn, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")
    cleaned: Dict[str, int] = {}
    for k, v in (payload.weights or {}).items():
        if k not in VALID_WEIGHT_FACTORS:
            raise HTTPException(400, f"Unknown weight factor: {k}")
        try:
            iv = int(v)
        except (TypeError, ValueError):
            raise HTTPException(400, f"Weight for {k} must be an integer")
        if iv < 0:
            raise HTTPException(400, f"Weight for {k} must be non-negative")
        cleaned[k] = iv
    if not cleaned:
        raise HTTPException(400, "At least one weight is required")
    if sum(cleaned.get(f, DEFAULT_WEIGHTS[f]) for f in VALID_WEIGHT_FACTORS) <= 0:
        raise HTTPException(400, "Effective weights must sum to a positive value")

    cfg = db.query(ProjectRiskConfig).filter(ProjectRiskConfig.project_id == project_id).first()
    if cfg is None:
        cfg = ProjectRiskConfig(project_id=project_id, weights=cleaned)
        db.add(cfg)
    else:
        cfg.weights = cleaned
    db.commit()
    db.refresh(cfg)
    # Recompute so the latest snapshot reflects the new weights
    snap = recompute_and_persist(db, project_id, trigger="weights_updated")
    return {
        "weights": cfg.weights,
        "effective": _resolve_weights(db, project_id),
        "snapshot": serialize_snapshot(snap),
    }


@router.post("/projects/{project_id}/risk/recompute")
def recompute(project_id: UUID, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")
    snap = recompute_and_persist(db, project_id, trigger="manual")
    return serialize_snapshot(snap)


# ---------- Exportable HTML report ----------

@router.get("/projects/{project_id}/risk/report", response_class=HTMLResponse)
def export_report(project_id: UUID, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")
    snap = _ensure_latest(db, project_id)
    drivers_payload = top_drivers(project_id, db)
    drivers = drivers_payload["drivers"]
    band_color = _band_color(snap.band)
    score = int(snap.score)
    # SVG gauge dimensions
    radius = 90
    circumference = 2 * 3.14159 * radius
    dash = (score / 100) * circumference
    when = (snap.computed_at or datetime.now(timezone.utc)).strftime("%b %d, %Y · %H:%M UTC")

    def _safe_pct(v: Any) -> float:
        try:
            f = float(v)
        except (TypeError, ValueError):
            return 0.0
        return max(0.0, min(100.0, f))

    reasons_html = "".join(
        f"""
        <div class="reason">
          <div class="reason-head">
            <span class="reason-label">{_h(str(r.get('label', '')))}</span>
            <span class="reason-band reason-band-{_h(str(r.get('band', 'low')).lower())}">{_h(str(r.get('band', '')))}</span>
          </div>
          <div class="reason-bar"><span style="width:{_safe_pct(r.get('sub_score'))}%"></span></div>
          <div class="reason-meta">
            <span>{_h(str(r.get('raw', '')))}</span>
            <span class="muted">weight {_h(str(r.get('weight', '')))} · contribution {_h(str(r.get('contribution', '')))}</span>
          </div>
          <div class="reason-detail">{_h(str(r.get('detail', '')))}</div>
        </div>
        """
        for r in (snap.reasons or [])
    )

    def _safe_kind(k: Any) -> str:
        s = str(k or "").lower()
        return s if s in ("defect", "healing", "test") else "other"

    drivers_html = (
        "".join(
            f"""
            <li class="driver">
              <span class="driver-kind driver-kind-{_safe_kind(d.get('kind'))}">{_h(_safe_kind(d.get('kind')).upper())}</span>
              <div>
                <div class="driver-title"><a href="{_h(str(d.get('href', '#')))}">{_h(str(d.get('title', '')))}</a></div>
                <div class="driver-sub muted">{_h(str(d.get('subtitle', '')))}</div>
              </div>
            </li>
            """
            for d in drivers
        )
        if drivers
        else '<li class="muted">No active risk drivers — every signal is calm.</li>'
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Release Readiness Report — {proj.name}</title>
<style>
  :root {{
    --royal: #091235; --navy: #14202E; --midnight: #2B4257; --bluegray: #88A9C3;
    --bg: #F7F8FB; --card: #FFFFFF; --border: #E3E8F0; --text: #0E172A; --muted: #5B6B82;
  }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 32px; }}
  .page {{ max-width: 880px; margin: 0 auto; }}
  .eyebrow {{ font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }}
  h1 {{ font-size: 28px; margin: 4px 0 4px; letter-spacing: -0.01em; }}
  .when {{ color: var(--muted); font-size: 12px; }}
  .card {{ background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 28px; margin-top: 20px; }}
  .hero {{ display: flex; gap: 32px; align-items: center; }}
  .gauge {{ flex-shrink: 0; }}
  .gauge .score {{ font-size: 44px; font-weight: 700; fill: {band_color}; }}
  .gauge .of {{ font-size: 12px; fill: var(--muted); }}
  .ring-track {{ stroke: #E8ECF3; }}
  .ring-fill {{ stroke: {band_color}; transition: stroke-dashoffset .6s ease; }}
  .verdict {{ display: inline-block; background: {band_color}; color: white; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; }}
  .recommendation {{ font-size: 22px; font-weight: 600; margin-top: 8px; color: var(--royal); }}
  .summary {{ color: var(--muted); margin-top: 6px; font-size: 13px; line-height: 1.55; }}
  h2 {{ font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--royal); margin: 0 0 14px; }}
  .reason {{ padding: 12px 0; border-bottom: 1px solid var(--border); }}
  .reason:last-child {{ border-bottom: none; }}
  .reason-head {{ display: flex; justify-content: space-between; align-items: center; }}
  .reason-label {{ font-weight: 600; font-size: 13px; }}
  .reason-band {{ font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; letter-spacing: 0.06em; }}
  .reason-band-low {{ background: #E8F5EE; color: #0F8A5F; }}
  .reason-band-medium {{ background: #FBF1DC; color: #95680B; }}
  .reason-band-high {{ background: #FBE3E3; color: #8A1F1F; }}
  .reason-bar {{ background: #EEF2F7; height: 6px; border-radius: 999px; margin-top: 8px; overflow: hidden; }}
  .reason-bar span {{ display: block; height: 100%; background: linear-gradient(90deg, var(--midnight), {band_color}); border-radius: 999px; }}
  .reason-meta {{ display: flex; justify-content: space-between; font-size: 11px; margin-top: 6px; }}
  .reason-detail {{ font-size: 12px; color: var(--midnight); margin-top: 4px; }}
  .muted {{ color: var(--muted); }}
  .driver {{ display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); align-items: center; }}
  .driver:last-child {{ border-bottom: none; }}
  .driver-kind {{ font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 4px; letter-spacing: 0.06em; }}
  .driver-kind-defect {{ background: #FBE3E3; color: #8A1F1F; }}
  .driver-kind-healing {{ background: #E0EAF5; color: #1F3D6B; }}
  .driver-title {{ font-weight: 600; font-size: 13px; }}
  .driver-sub {{ font-size: 11px; }}
  ul {{ list-style: none; padding: 0; margin: 0; }}
  .footer {{ margin-top: 28px; font-size: 11px; color: var(--muted); text-align: center; }}
</style>
</head>
<body>
<div class="page">
  <div class="eyebrow">Release Readiness · {_h(proj.name or "")}</div>
  <h1>Executive Risk Report</h1>
  <div class="when">{when}</div>

  <div class="card hero">
    <svg class="gauge" width="220" height="220" viewBox="0 0 220 220">
      <circle class="ring-track" cx="110" cy="110" r="{radius}" fill="none" stroke-width="14" />
      <circle class="ring-fill" cx="110" cy="110" r="{radius}" fill="none" stroke-width="14"
              stroke-linecap="round"
              stroke-dasharray="{circumference:.2f}"
              stroke-dashoffset="{(circumference - dash):.2f}"
              transform="rotate(-90 110 110)" />
      <text class="score" x="110" y="118" text-anchor="middle">{score}</text>
      <text class="of" x="110" y="138" text-anchor="middle">RISK / 100</text>
    </svg>
    <div>
      <span class="verdict">{_h(snap.band or "")}</span>
      <div class="recommendation">{_h(snap.recommendation or "")}</div>
      <div class="summary">
        Computed from {len(snap.reasons or [])} weighted signals across critical-test pass rate, flakiness, fresh production defects,
        self-healing churn, and failure recency. Higher score means more risk in shipping today.
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Why this score</h2>
    {reasons_html}
  </div>

  <div class="card">
    <h2>Top risk drivers</h2>
    <ul>{drivers_html}</ul>
  </div>

  <div class="footer">KIT · Ksquare Intelligent Testing · transparent weighted-sum model</div>
</div>
</body>
</html>"""
    return HTMLResponse(content=html)
