"""Release Risk Engine.

Computes a transparent weighted Release Risk Score (0-100, higher = riskier)
from signals other parts of KIT already produce:

    · Critical-test pass rate     (test_runs joined to test_cases.priority)
    · Flakiness                   (tests that flip pass <-> fail in last 14d)
    · Fresh production defects    (production_defects in last 7d)
    · Self-healing churn          (healing_proposals applied/pending in last 7d)
    · Failure recency             (most recent failed run on a critical test)

Each signal contributes a weighted 0-100 sub-score. The total is the
weighted average. Recommendation thresholds are deliberately strict for an
executive go/no-go view — we'd rather flag MEDIUM and let leadership decide
than understate risk.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from server_py.models.test_suite import TestCase, TestSuite
from server_py.models.test_run import TestRun
from server_py.models.test_run_triage import TestRunTriage
from server_py.models.healing_proposal import HealingProposal
from server_py.models.production_defect import ProductionDefect
from server_py.models.release_risk import ReleaseRiskSnapshot
from server_py.models.project import Project
from server_py.models.project_risk_config import ProjectRiskConfig


VALID_WEIGHT_FACTORS = (
    "critical_pass",
    "flakiness",
    "fresh_defects",
    "healing_churn",
    "failure_recency",
    "triage_severity",
)


def _resolve_weights(db: Session, project_id: UUID, override: Optional[Dict[str, int]] = None) -> Dict[str, int]:
    """Resolve weights: explicit override > per-project config > defaults. Always full keys."""
    if override:
        merged = {**DEFAULT_WEIGHTS, **{k: int(v) for k, v in override.items() if k in VALID_WEIGHT_FACTORS}}
        return merged
    cfg = db.query(ProjectRiskConfig).filter(ProjectRiskConfig.project_id == project_id).first()
    if cfg and isinstance(cfg.weights, dict) and cfg.weights:
        merged = {**DEFAULT_WEIGHTS}
        for k, v in cfg.weights.items():
            if k in VALID_WEIGHT_FACTORS:
                try:
                    merged[k] = max(0, int(v))
                except (TypeError, ValueError):
                    pass
        return merged
    return dict(DEFAULT_WEIGHTS)


# Default weights — sum doesn't need to == 100 (we normalize) but kept tidy.
DEFAULT_WEIGHTS = {
    "critical_pass": 30,
    "flakiness": 15,
    "fresh_defects": 20,
    "healing_churn": 10,
    "failure_recency": 10,
    "triage_severity": 15,
}

WINDOW_DAYS_RUNS = 14
WINDOW_DAYS_DEFECTS = 7
WINDOW_DAYS_HEALING = 7


def _band_for(score: int) -> str:
    if score >= 60:
        return "HIGH"
    if score >= 30:
        return "MEDIUM"
    return "LOW"


def _recommendation_for(band: str) -> str:
    # Strict contract: "Safe to ship" | "Ship with caveats" | "Hold"
    return {
        "LOW": "Safe to ship",
        "MEDIUM": "Ship with caveats",
        "HIGH": "Hold",
    }[band]


def _signal_band(sub_score: int) -> str:
    # Per-signal banding mirrors overall thresholds for a consistent UX.
    if sub_score >= 60:
        return "HIGH"
    if sub_score >= 30:
        return "MEDIUM"
    return "LOW"


def _critical_pass_signal(db: Session, project_id: UUID, since: datetime) -> Dict[str, Any]:
    """Critical-test pass rate. 100% pass = 0 risk, 0% pass = 100 risk."""
    rows = (
        db.query(TestRun.status, func.count(TestRun.id))
        .join(TestCase, TestCase.id == TestRun.test_case_id)
        .filter(
            TestRun.project_id == project_id,
            TestCase.priority.in_(("critical", "high")),
            TestRun.started_at >= since,
            TestRun.status.in_(("passed", "failed", "error")),
        )
        .group_by(TestRun.status)
        .all()
    )
    total = sum(int(c) for _, c in rows)
    passed = sum(int(c) for s, c in rows if s == "passed")
    failed = total - passed
    if total == 0:
        # No data — cannot vouch for safety. Treat as elevated MEDIUM.
        return {
            "factor": "critical_pass",
            "label": "Critical tests",
            "raw": "no data",
            "sub_score": 50,
            "detail": "No critical/high-priority test runs in the last 14 days.",
        }
    pass_rate = passed / total
    sub_score = int(round((1 - pass_rate) * 100))
    return {
        "factor": "critical_pass",
        "label": "Critical tests",
        "raw": f"{int(round(pass_rate * 100))}% pass ({passed}/{total})",
        "sub_score": sub_score,
        "detail": f"{failed} critical/high-priority failure{'s' if failed != 1 else ''} in last 14 days.",
    }


def _flakiness_signal(db: Session, project_id: UUID, since: datetime) -> Dict[str, Any]:
    """A test is flaky if it has both a pass and a fail in the window."""
    pairs = (
        db.query(TestRun.test_case_id, TestRun.status)
        .filter(
            TestRun.project_id == project_id,
            TestRun.started_at >= since,
            TestRun.status.in_(("passed", "failed", "error")),
        )
        .all()
    )
    by_case: Dict[str, set] = {}
    for cid, status in pairs:
        by_case.setdefault(str(cid), set()).add("pass" if status == "passed" else "fail")
    flaky = sum(1 for s in by_case.values() if "pass" in s and "fail" in s)
    total_cases = len(by_case)
    if total_cases == 0:
        return {
            "factor": "flakiness",
            "label": "Flakiness",
            "raw": "0 flaky",
            "sub_score": 0,
            "detail": "No executed tests yet — cannot detect flakiness.",
        }
    flaky_pct = flaky / total_cases
    # Anything > 25% flaky is HIGH-risk noise.
    sub_score = min(100, int(round(flaky_pct * 400)))
    return {
        "factor": "flakiness",
        "label": "Flakiness",
        "raw": f"{flaky} flaky test{'s' if flaky != 1 else ''}",
        "sub_score": sub_score,
        "detail": f"{flaky} of {total_cases} tests flipped pass↔fail in last 14 days.",
    }


def _fresh_defects_signal(db: Session, project_id: UUID, since: datetime) -> Dict[str, Any]:
    rows = (
        db.query(ProductionDefect.severity, func.count(ProductionDefect.id))
        .filter(
            ProductionDefect.project_id == project_id,
            ProductionDefect.created_at >= since,
        )
        .group_by(ProductionDefect.severity)
        .all()
    )
    by_sev = {s: int(c) for s, c in rows}
    crit = by_sev.get("critical", 0)
    high = by_sev.get("high", 0)
    med = by_sev.get("medium", 0)
    low = by_sev.get("low", 0)
    total = crit + high + med + low
    # Severity-weighted: a critical = 50, high = 30, medium = 12, low = 4 risk pts.
    raw_pts = crit * 50 + high * 30 + med * 12 + low * 4
    sub_score = min(100, raw_pts)
    summary = (
        f"{total} new defect{'s' if total != 1 else ''} in last 7 days"
        if total
        else "0 new defects in last 7 days"
    )
    detail_bits = []
    if crit:
        detail_bits.append(f"{crit} critical")
    if high:
        detail_bits.append(f"{high} high")
    if med:
        detail_bits.append(f"{med} medium")
    if low:
        detail_bits.append(f"{low} low")
    detail = " · ".join(detail_bits) if detail_bits else "Production stayed quiet."
    return {
        "factor": "fresh_defects",
        "label": "Fresh production defects",
        "raw": summary,
        "sub_score": sub_score,
        "detail": detail,
    }


def _healing_churn_signal(db: Session, project_id: UUID, since: datetime) -> Dict[str, Any]:
    # Healing proposals are linked to test_cases — we go via the suite to project.
    rows = (
        db.query(HealingProposal.status, func.count(HealingProposal.id))
        .join(TestCase, TestCase.id == HealingProposal.test_case_id)
        .join(TestSuite, TestSuite.id == TestCase.test_suite_id)
        .filter(
            TestSuite.project_id == project_id,
            HealingProposal.created_at >= since,
        )
        .group_by(HealingProposal.status)
        .all()
    )
    by_status = {s: int(c) for s, c in rows}
    pending = by_status.get("pending", 0)
    applied = by_status.get("applied", 0)
    rejected = by_status.get("rejected", 0)
    total = pending + applied + rejected
    # Lots of selector churn = the app surface is shifting. Pending = unaddressed risk.
    sub_score = min(100, pending * 18 + applied * 6 + rejected * 2)
    return {
        "factor": "healing_churn",
        "label": "Self-healing churn",
        "raw": f"{total} event{'s' if total != 1 else ''} in last 7 days",
        "sub_score": sub_score,
        "detail": f"{pending} pending · {applied} auto-applied · {rejected} rejected.",
    }


def _failure_recency_signal(db: Session, project_id: UUID, now: datetime) -> Dict[str, Any]:
    last_failed = (
        db.query(func.max(TestRun.started_at))
        .join(TestCase, TestCase.id == TestRun.test_case_id)
        .filter(
            TestRun.project_id == project_id,
            TestCase.priority.in_(("critical", "high")),
            TestRun.status.in_(("failed", "error")),
        )
        .scalar()
    )
    if last_failed is None:
        return {
            "factor": "failure_recency",
            "label": "Failure recency",
            "raw": "no recent failures",
            "sub_score": 0,
            "detail": "No critical/high failures recorded.",
        }
    if last_failed.tzinfo is None:
        last_failed = last_failed.replace(tzinfo=timezone.utc)
    age_hours = max(0, (now - last_failed).total_seconds() / 3600)
    # < 1h = 100, 24h = 50, > 7d = ~0
    if age_hours < 1:
        sub_score = 100
    elif age_hours < 24:
        sub_score = int(round(100 - ((age_hours - 1) * (50 / 23))))
    elif age_hours < 168:  # 7 days
        sub_score = int(round(50 - ((age_hours - 24) * (50 / 144))))
    else:
        sub_score = max(0, int(round(50 - (age_hours - 24) / 6)))
        sub_score = max(0, min(sub_score, 10))
    if age_hours < 1:
        rel = "minutes ago"
    elif age_hours < 24:
        rel = f"{int(age_hours)}h ago"
    else:
        rel = f"{int(age_hours / 24)}d ago"
    return {
        "factor": "failure_recency",
        "label": "Failure recency",
        "raw": f"last critical fail {rel}",
        "sub_score": sub_score,
        "detail": f"Last critical/high failure was {rel}.",
    }


def _triage_severity_signal(db: Session, project_id: UUID, since: datetime) -> Dict[str, Any]:
    """AI-triage severity over recent runs.

    Uses TestRunTriage rows joined to TestRun for this project in the window.
    Categories that indicate genuine product risk are weighted higher than
    flake/infra/unknown. Confidence acts as a multiplier (0.5 floor) so
    low-confidence triages don't dominate.
    """
    rows = (
        db.query(TestRunTriage.category, TestRunTriage.confidence, TestCase.priority)
        .join(TestRun, TestRun.id == TestRunTriage.run_id)
        .join(TestCase, TestCase.id == TestRun.test_case_id)
        .filter(
            TestRun.project_id == project_id,
            TestRun.started_at >= since,
        )
        .all()
    )
    if not rows:
        return {
            "factor": "triage_severity",
            "label": "AI triage severity",
            "raw": "no triage in window",
            "sub_score": 0,
            "detail": "No AI triage reports in last 14 days.",
        }

    # Category severity weights (normalized 0..1)
    severe = {"regression", "real_failure", "product_bug", "real_bug", "product_defect"}
    medium = {"environment", "data", "timing", "unknown"}
    benign = {"flake", "flaky", "infrastructure", "infra", "test_bug"}

    total = 0.0
    counted = 0
    severe_count = 0
    for cat, conf, prio in rows:
        c = (cat or "unknown").lower()
        if c in severe:
            base = 90
            severe_count += 1
        elif c in benign:
            base = 10
        elif c in medium:
            base = 50
        else:
            base = 40
        # Critical/high priority amplifies
        if (prio or "").lower() in ("critical", "high"):
            base = min(100, int(base * 1.2))
        # Confidence multiplier with 0.5 floor
        cmult = max(0.5, (conf or 50) / 100.0)
        total += base * cmult
        counted += 1

    sub_score = int(round(min(100, total / counted))) if counted else 0
    return {
        "factor": "triage_severity",
        "label": "AI triage severity",
        "raw": f"{counted} triage reports · {severe_count} severe",
        "sub_score": sub_score,
        "detail": f"{counted} AI triage reports in last 14 days; {severe_count} flagged as regressions/product bugs.",
    }


def compute_risk(db: Session, project_id: UUID, weights: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
    """Pure function — does NOT persist. Returns the snapshot shape.

    Weights resolve in this order: explicit `weights` arg > per-project
    ProjectRiskConfig > DEFAULT_WEIGHTS.
    """
    w = _resolve_weights(db, project_id, weights)
    now = datetime.now(timezone.utc)
    since_runs = now - timedelta(days=WINDOW_DAYS_RUNS)
    since_defects = now - timedelta(days=WINDOW_DAYS_DEFECTS)
    since_healing = now - timedelta(days=WINDOW_DAYS_HEALING)

    signals = [
        _critical_pass_signal(db, project_id, since_runs),
        _flakiness_signal(db, project_id, since_runs),
        _fresh_defects_signal(db, project_id, since_defects),
        _healing_churn_signal(db, project_id, since_healing),
        _failure_recency_signal(db, project_id, now),
        _triage_severity_signal(db, project_id, since_runs),
    ]

    total_weight = sum(w[s["factor"]] for s in signals)
    weighted_sum = sum(s["sub_score"] * w[s["factor"]] for s in signals)
    score = int(round(weighted_sum / total_weight)) if total_weight else 0
    band = _band_for(score)
    recommendation = _recommendation_for(band)

    reasons = []
    for s in signals:
        contribution = round((s["sub_score"] * w[s["factor"]]) / total_weight, 1) if total_weight else 0
        reasons.append({
            "factor": s["factor"],
            "label": s["label"],
            "weight": w[s["factor"]],
            "raw": s["raw"],
            "sub_score": s["sub_score"],
            "contribution": contribution,
            "band": _signal_band(s["sub_score"]),
            "detail": s["detail"],
        })
    # Top drivers = highest contribution first.
    reasons.sort(key=lambda r: r["contribution"], reverse=True)

    return {
        "project_id": str(project_id),
        "score": score,
        "band": band,
        "recommendation": recommendation,
        "reasons": reasons,
        "computed_at": now.isoformat(),
    }


def recompute_and_persist(db: Session, project_id: UUID, trigger: str = "manual") -> ReleaseRiskSnapshot:
    payload = compute_risk(db, project_id)
    snap = ReleaseRiskSnapshot(
        project_id=project_id,
        score=payload["score"],
        band=payload["band"],
        recommendation=payload["recommendation"],
        reasons=payload["reasons"],
        trigger=trigger,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


def safe_recompute(db: Session, project_id: Optional[UUID], trigger: str) -> None:
    """Best-effort recompute — never raises. Intended for hook use after run/defect/heal."""
    if not project_id:
        return
    try:
        recompute_and_persist(db, project_id, trigger=trigger)
    except Exception:
        import logging
        logging.exception("safe_recompute failed for project %s (%s)", project_id, trigger)
        try:
            db.rollback()
        except Exception:
            pass


def serialize_snapshot(s: ReleaseRiskSnapshot) -> Dict[str, Any]:
    return {
        "id": str(s.id),
        "project_id": str(s.project_id),
        "score": int(s.score),
        "band": s.band,
        "recommendation": s.recommendation,
        "reasons": s.reasons or [],
        "computed_at": s.computed_at.isoformat() if s.computed_at else None,
        "trigger": s.trigger,
    }
