from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case as sql_case
from uuid import UUID
from datetime import datetime, timedelta, timezone
from typing import Optional
from server_py.database import get_db
from server_py.models.domain import Domain
from server_py.models.project import Project
from server_py.models.application import Application
from server_py.models.test_suite import TestSuite, TestCase
from server_py.models.test_run import TestRun, TestRunScenario
from server_py.models.test_run_triage import TestRunTriage
from server_py.services.failure_triage import serialize_triage

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/dashboard")
def dashboard_analytics(db: Session = Depends(get_db)):
    total_domains = db.query(func.count(Domain.id)).scalar() or 0
    total_projects = db.query(func.count(Project.id)).scalar() or 0
    total_apps = db.query(func.count(Application.id)).scalar() or 0
    total_suites = db.query(func.count(TestSuite.id)).scalar() or 0
    total_cases = db.query(func.count(TestCase.id)).scalar() or 0
    passed = db.query(func.count(TestCase.id)).filter(TestCase.status == "passed").scalar() or 0
    failed = db.query(func.count(TestCase.id)).filter(TestCase.status == "failed").scalar() or 0
    blocked = db.query(func.count(TestCase.id)).filter(TestCase.status == "blocked").scalar() or 0
    draft = db.query(func.count(TestCase.id)).filter(TestCase.status == "draft").scalar() or 0

    suite_types = db.query(TestSuite.suite_type, func.count(TestSuite.id)).group_by(TestSuite.suite_type).all()
    suite_breakdown = {st: count for st, count in suite_types}

    priority_dist = db.query(TestCase.priority, func.count(TestCase.id)).group_by(TestCase.priority).all()
    priority_breakdown = {p: count for p, count in priority_dist}

    return {
        "total_domains": total_domains,
        "total_projects": total_projects,
        "total_applications": total_apps,
        "total_test_suites": total_suites,
        "total_test_cases": total_cases,
        "passed_cases": passed,
        "failed_cases": failed,
        "blocked_cases": blocked,
        "draft_cases": draft,
        "suite_type_breakdown": suite_breakdown,
        "priority_breakdown": priority_breakdown,
    }


def _range_to_window(range_str: str):
    now = datetime.now(timezone.utc)
    if range_str == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, now, 24, "hour"
    if range_str == "30d":
        start = (now - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
        return start, now, 30, "day"
    start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start, now, 7, "day"


@router.get("/overview")
def analytics_overview(
    range_key: str = Query("7d", alias="range", pattern="^(today|7d|30d)$"),
    project_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
):
    start, end, buckets, granularity = _range_to_window(range_key)

    failed_statuses = {"failed", "error"}
    base_filter = [TestRun.started_at >= start, TestRun.started_at <= end]
    if project_id:
        base_filter.append(TestRun.project_id == project_id)
    terminal_filter = base_filter + [TestRun.status.in_(("passed", "failed", "error"))]

    # ---- Totals: pushed to SQL ----
    is_passed = sql_case((TestRun.status == "passed", 1), else_=0)
    is_failed = sql_case((TestRun.status == "failed", 1), else_=0)
    is_error = sql_case((TestRun.status == "error", 1), else_=0)
    totals_row = (
        db.query(
            func.count(TestRun.id),
            func.coalesce(func.sum(is_passed), 0),
            func.coalesce(func.sum(is_failed), 0),
            func.coalesce(func.sum(is_error), 0),
            func.coalesce(func.avg(TestRun.duration_ms), 0),
        )
        .filter(*terminal_filter)
        .one()
    )
    total_runs, passed_runs, failed_runs, error_runs, avg_dur = (int(x) for x in totals_row)
    pass_rate = round((passed_runs / total_runs * 100), 1) if total_runs > 0 else 0.0
    avg_duration_ms = int(avg_dur)

    # ---- Trend: pushed to SQL via date_trunc ----
    trunc_unit = "hour" if granularity == "hour" else "day"
    bucket_col = func.date_trunc(trunc_unit, TestRun.started_at)
    trend_rows = (
        db.query(
            bucket_col.label("bucket"),
            func.coalesce(func.sum(is_passed), 0),
            func.coalesce(func.sum(is_failed + is_error), 0),
        )
        .filter(*terminal_filter)
        .group_by(bucket_col)
        .all()
    )
    trend_map = {row[0]: (int(row[1]), int(row[2])) for row in trend_rows}

    trend = []
    if granularity == "day":
        bucket_start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        for i in range(buckets):
            day_start = bucket_start + timedelta(days=i)
            d_passed, d_failed = trend_map.get(day_start, (0, 0))
            trend.append({
                "label": day_start.strftime("%b %d"),
                "iso": day_start.isoformat(),
                "passed": d_passed,
                "failed": d_failed,
                "total": d_passed + d_failed,
            })
    else:
        for i in range(24):
            hour_start = start + timedelta(hours=i)
            if hour_start > end:
                break
            h_passed, h_failed = trend_map.get(hour_start, (0, 0))
            trend.append({
                "label": hour_start.strftime("%H:00"),
                "iso": hour_start.isoformat(),
                "passed": h_passed,
                "failed": h_failed,
                "total": h_passed + h_failed,
            })

    # ---- Per-case aggregation: pushed to SQL (GROUP BY test_case_id) ----
    is_failed_term = sql_case((TestRun.status.in_(("failed", "error")), 1), else_=0)
    case_rows = (
        db.query(
            TestRun.test_case_id,
            func.count(TestRun.id),
            func.coalesce(func.sum(is_passed), 0),
            func.coalesce(func.sum(is_failed_term), 0),
            func.coalesce(func.avg(TestRun.duration_ms), 0),
            func.max(TestRun.started_at),
        )
        .filter(*terminal_filter)
        .group_by(TestRun.test_case_id)
        .all()
    )
    case_stats: dict = {
        str(row[0]): {
            "runs": int(row[1]),
            "passed": int(row[2]),
            "failed": int(row[3]),
            "avg_duration_ms": int(row[4] or 0),
            "last_run": row[5],
        }
        for row in case_rows
    }

    # All case ids referenced in the window (terminal + in-flight) for the
    # recent feed and the per-case lookup.
    case_id_rows = (
        db.query(TestRun.test_case_id)
        .filter(*base_filter)
        .distinct()
        .all()
    )
    case_ids = list({str(row[0]) for row in case_id_rows} | set(case_stats.keys()))
    case_lookup: dict = {}
    if case_ids:
        cases = db.query(TestCase).filter(TestCase.id.in_(case_ids)).all()
        suite_ids = list({c.test_suite_id for c in cases if c.test_suite_id})
        suites = db.query(TestSuite).filter(TestSuite.id.in_(suite_ids)).all() if suite_ids else []
        suite_map = {str(s.id): s for s in suites}
        proj_ids = list({s.project_id for s in suites})
        projects = db.query(Project).filter(Project.id.in_(proj_ids)).all() if proj_ids else []
        proj_map = {str(p.id): p for p in projects}
        for c in cases:
            su = suite_map.get(str(c.test_suite_id))
            pr = proj_map.get(str(su.project_id)) if su else None
            case_lookup[str(c.id)] = {
                "id": str(c.id),
                "title": c.title,
                "suite_id": str(c.test_suite_id) if c.test_suite_id else None,
                "suite_name": su.name if su else None,
                "project_id": str(su.project_id) if su else None,
                "project_name": pr.name if pr else None,
                "priority": c.priority,
                "jira_story_key": c.jira_story_key,
            }

    flakiest = []
    slowest = []
    MIN_RUNS_FOR_FLAKY = 2
    for cid, s in case_stats.items():
        info = case_lookup.get(cid, {"id": cid, "title": "Unknown"})
        # Flakiness = instability (mix of pass+fail in window). 50% = maximally unstable.
        instability = 0.0
        if s["runs"] >= MIN_RUNS_FOR_FLAKY and s["passed"] > 0 and s["failed"] > 0:
            fail_rate = s["failed"] / s["runs"]
            instability = round((1 - abs(fail_rate - 0.5) * 2) * 100, 1)
        fail_rate_pct = round((s["failed"] / s["runs"] * 100), 1) if s["runs"] > 0 else 0
        entry = {
            **info,
            "runs": s["runs"],
            "passed": s["passed"],
            "failed": s["failed"],
            "flakiness_pct": instability,
            "fail_rate_pct": fail_rate_pct,
            "avg_duration_ms": s["avg_duration_ms"],
            "last_run_at": s["last_run"].isoformat() if s["last_run"] else None,
        }
        if instability > 0:
            flakiest.append(entry)
        slowest.append(entry)

    flakiest.sort(key=lambda x: (-x["flakiness_pct"], -x["runs"]))
    slowest.sort(key=lambda x: -x["avg_duration_ms"])

    # MTTR — mean time between a failed terminal run and the next passed run.
    # We only need (case_id, status, started_at) tuples for cases that had at
    # least one failure in the window, so we let SQL do the heavy lifting.
    failing_case_ids = [cid for cid, s in case_stats.items() if s["failed"] > 0]
    mttr_samples_ms: list[int] = []
    if failing_case_ids:
        seq_rows = (
            db.query(TestRun.test_case_id, TestRun.status, TestRun.started_at)
            .filter(*terminal_filter, TestRun.test_case_id.in_(failing_case_ids))
            .order_by(TestRun.test_case_id, TestRun.started_at)
            .all()
        )
        current_case = None
        last_fail_at = None
        for cid, status, started_at in seq_rows:
            if cid != current_case:
                current_case = cid
                last_fail_at = None
            if status in failed_statuses and last_fail_at is None:
                last_fail_at = started_at
            elif status == "passed" and last_fail_at is not None:
                delta_ms = int((started_at - last_fail_at).total_seconds() * 1000)
                if delta_ms >= 0:
                    mttr_samples_ms.append(delta_ms)
                last_fail_at = None
    mttr_ms = int(sum(mttr_samples_ms) / len(mttr_samples_ms)) if mttr_samples_ms else 0

    # Recent runs feed (include running rows so users see in-flight executions).
    # SQL ORDER BY + LIMIT keeps this O(20) regardless of window size.
    recent_rows = (
        db.query(TestRun)
        .filter(*base_filter)
        .order_by(desc(TestRun.started_at))
        .limit(20)
        .all()
    )
    recent_run_ids = [r.id for r in recent_rows]
    triage_lookup = {}
    if recent_run_ids:
        for t in db.query(TestRunTriage).filter(TestRunTriage.run_id.in_(recent_run_ids)).all():
            triage_lookup[str(t.run_id)] = serialize_triage(t)
    recent_feed = []
    for r in recent_rows:
        info = case_lookup.get(str(r.test_case_id), {"title": "Unknown", "project_name": None, "suite_name": None})
        recent_feed.append({
            "run_id": str(r.id),
            "case_id": str(r.test_case_id),
            "case_title": info.get("title"),
            "project_name": info.get("project_name"),
            "suite_name": info.get("suite_name"),
            "status": r.status,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "duration_ms": r.duration_ms or 0,
            "total_scenarios": r.total_scenarios,
            "passed_scenarios": r.passed_scenarios,
            "failed_scenarios": r.failed_scenarios,
            "summary": r.summary,
            "triage": triage_lookup.get(str(r.id)),
        })

    # Today tally + active project count: SQL aggregates.
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_row = (
        db.query(
            func.coalesce(func.sum(is_passed), 0),
            func.coalesce(func.sum(is_failed_term), 0),
        )
        .filter(*terminal_filter, TestRun.started_at >= today_start)
        .one()
    )
    today_passed = int(today_row[0])
    today_failed = int(today_row[1])

    active_projects = (
        db.query(func.count(func.distinct(TestRun.project_id)))
        .filter(*terminal_filter, TestRun.project_id.isnot(None))
        .scalar()
        or 0
    )

    return {
        "range": range_key,
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "totals": {
            "runs": total_runs,
            "passed": passed_runs,
            "failed": failed_runs,
            "errors": error_runs,
            "pass_rate": pass_rate,
            "avg_duration_ms": avg_duration_ms,
            "active_projects": active_projects,
            "today_runs": today_passed + today_failed,
            "today_passed": today_passed,
            "today_failed": today_failed,
            "flaky_tests": len(flakiest),
            "mttr_ms": mttr_ms,
            "mttr_samples": len(mttr_samples_ms),
        },
        "trend": trend,
        "flakiest": flakiest[:5],
        "slowest": slowest[:5],
        "recent_runs": recent_feed,
    }


@router.get("/run/{run_id}")
def run_detail(run_id: UUID, db: Session = Depends(get_db)):
    r = db.query(TestRun).filter(TestRun.id == run_id).first()
    if not r:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Run not found")
    case = db.query(TestCase).filter(TestCase.id == r.test_case_id).first()
    triage_row = db.query(TestRunTriage).filter(TestRunTriage.run_id == r.id).first()
    return {
        "id": str(r.id),
        "test_case_id": str(r.test_case_id),
        "case_title": case.title if case else "Unknown",
        "status": r.status,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        "duration_ms": r.duration_ms or 0,
        "total_scenarios": r.total_scenarios,
        "passed_scenarios": r.passed_scenarios,
        "failed_scenarios": r.failed_scenarios,
        "errors": r.errors,
        "summary": r.summary or "",
        "log": r.log_excerpt or "",
        "video_path": r.video_path or "",
        "log_excerpt": r.log_excerpt or "",
        "full_log": r.full_log or r.log_excerpt or "",
        "scenarios": [
            {"name": s.name, "status": s.status, "errors": s.errors, "actions": s.actions, "order_index": s.order_index}
            for s in sorted(r.scenarios, key=lambda x: x.order_index)
        ],
        "triage": serialize_triage(triage_row) if triage_row else None,
    }


@router.get("/test-case/{case_id}/runs")
def case_runs(case_id: UUID, limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    runs = (
        db.query(TestRun)
        .filter(TestRun.test_case_id == case_id)
        .order_by(desc(TestRun.started_at))
        .limit(limit)
        .all()
    )
    run_ids = [r.id for r in runs]
    triage_by_run = {}
    if run_ids:
        for t in db.query(TestRunTriage).filter(TestRunTriage.run_id.in_(run_ids)).all():
            triage_by_run[str(t.run_id)] = serialize_triage(t)
    return [
        {
            "id": str(r.id),
            "run_number": r.run_number,
            "status": r.status,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "duration_ms": r.duration_ms or 0,
            "total_scenarios": r.total_scenarios,
            "passed_scenarios": r.passed_scenarios,
            "failed_scenarios": r.failed_scenarios,
            "total_steps": r.total_steps,
            "errors": r.errors,
            "summary": r.summary,
            "video_path": r.video_path,
            "triage": triage_by_run.get(str(r.id)),
            "scenarios": [
                {"name": s.name, "status": s.status, "errors": s.errors, "actions": s.actions, "order_index": s.order_index}
                for s in sorted(r.scenarios, key=lambda x: x.order_index)
            ],
        }
        for r in runs
    ]


@router.get("/project/{project_id}")
def project_analytics(project_id: UUID, db: Session = Depends(get_db)):
    suites = db.query(TestSuite).filter(TestSuite.project_id == project_id).all()
    suite_stats = []
    total_cases = 0
    total_passed = 0
    total_failed = 0

    for s in suites:
        cases = db.query(TestCase).filter(TestCase.test_suite_id == s.id).all()
        passed = sum(1 for c in cases if c.status == "passed")
        failed = sum(1 for c in cases if c.status == "failed")
        total_cases += len(cases)
        total_passed += passed
        total_failed += failed
        suite_stats.append({
            "id": str(s.id),
            "name": s.name,
            "suite_type": s.suite_type,
            "status": s.status,
            "total_cases": len(cases),
            "passed": passed,
            "failed": failed,
            "blocked": sum(1 for c in cases if c.status == "blocked"),
        })

    apps = db.query(Application).filter(Application.project_id == project_id).all()

    return {
        "project_id": str(project_id),
        "total_suites": len(suites),
        "total_cases": total_cases,
        "total_passed": total_passed,
        "total_failed": total_failed,
        "pass_rate": round((total_passed / total_cases * 100) if total_cases > 0 else 0, 1),
        "suite_stats": suite_stats,
        "total_applications": len(apps),
    }
