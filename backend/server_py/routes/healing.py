from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from server_py.database import get_db
from server_py.models.healing_proposal import HealingProposal
from server_py.models.test_suite import TestCase
from server_py.services.healing_governance import (
    create_proposal,
    apply_proposal,
    reject_proposal,
    seed_demo_proposals,
)

router = APIRouter(prefix="/api/healing", tags=["healing"])


class CreateProposalIn(BaseModel):
    test_case_id: Optional[str] = None
    test_run_id: Optional[str] = None
    test_case_title: str = ""
    scenario_name: str = ""
    application_name: str = ""
    broken_action: str = "click"
    broken_selector: str = ""
    broken_value: str = ""
    error_message: str = ""
    dom_snippet: str = ""
    page_url: str = ""
    source: str = "manual"


class ReviewIn(BaseModel):
    reviewer: str = Field(default="qa-reviewer", max_length=120)
    notes: str = ""


def _serialize(p: HealingProposal, db: Optional[Session] = None) -> dict:
    test_suite_id = None
    if db is not None and p.test_case_id:
        tc = db.query(TestCase).filter(TestCase.id == p.test_case_id).first()
        if tc and tc.test_suite_id:
            test_suite_id = str(tc.test_suite_id)
    return {
        "id": str(p.id),
        "test_case_id": str(p.test_case_id) if p.test_case_id else None,
        "test_suite_id": test_suite_id,
        "test_run_id": str(p.test_run_id) if p.test_run_id else None,
        "test_case_title": p.test_case_title,
        "scenario_name": p.scenario_name,
        "application_name": p.application_name,
        "broken_action": p.broken_action,
        "broken_selector": p.broken_selector,
        "broken_value": p.broken_value,
        "error_message": p.error_message,
        "dom_snippet": p.dom_snippet,
        "page_url": p.page_url,
        "proposed_selector": p.proposed_selector,
        "proposed_action": p.proposed_action,
        "proposed_value": p.proposed_value,
        "ai_reasoning": p.ai_reasoning,
        "ai_confidence": p.ai_confidence,
        "risk_level": p.risk_level,
        "model": p.model,
        "alternates": p.alternates or [],
        "status": p.status,
        "reviewer": p.reviewer,
        "review_notes": p.review_notes,
        "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
        "applied_at": p.applied_at.isoformat() if p.applied_at else None,
        "application_diff": p.application_diff,
        "source": p.source,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/proposals")
def list_proposals(status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(HealingProposal)
    if status and status != "all":
        q = q.filter(HealingProposal.status == status)
    rows = q.order_by(HealingProposal.created_at.desc()).limit(200).all()
    counts_rows = db.query(HealingProposal.status).all()
    counts = {"pending": 0, "approved": 0, "applied": 0, "rejected": 0, "failed": 0, "total": 0}
    for (s,) in counts_rows:
        counts["total"] += 1
        if s in counts:
            counts[s] += 1
    return {"proposals": [_serialize(p, db) for p in rows], "counts": counts}


@router.get("/proposals/{proposal_id}")
def get_proposal(proposal_id: str, db: Session = Depends(get_db)):
    p = db.query(HealingProposal).filter(HealingProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(404, "Proposal not found")
    return _serialize(p, db)


@router.post("/proposals")
def create_proposal_endpoint(payload: CreateProposalIn, db: Session = Depends(get_db)):
    p = create_proposal(
        db,
        test_case_id=payload.test_case_id,
        test_run_id=payload.test_run_id,
        test_case_title=payload.test_case_title,
        scenario_name=payload.scenario_name,
        application_name=payload.application_name,
        broken_action=payload.broken_action,
        broken_selector=payload.broken_selector,
        broken_value=payload.broken_value,
        error_message=payload.error_message,
        dom_snippet=payload.dom_snippet,
        page_url=payload.page_url,
        source=payload.source,
    )
    return _serialize(p, db)


@router.post("/proposals/{proposal_id}/approve")
def approve(proposal_id: str, payload: ReviewIn, db: Session = Depends(get_db)):
    p = db.query(HealingProposal).filter(HealingProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(404, "Proposal not found")
    if p.status not in ("pending",):
        raise HTTPException(400, f"Cannot approve a proposal in status '{p.status}'")
    p = apply_proposal(db, p, reviewer=payload.reviewer or "qa-reviewer", notes=payload.notes or "")
    _recompute_for_proposal(db, p)
    return _serialize(p, db)


@router.post("/proposals/{proposal_id}/reject")
def reject(proposal_id: str, payload: ReviewIn, db: Session = Depends(get_db)):
    p = db.query(HealingProposal).filter(HealingProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(404, "Proposal not found")
    if p.status not in ("pending",):
        raise HTTPException(400, f"Cannot reject a proposal in status '{p.status}'")
    p = reject_proposal(db, p, reviewer=payload.reviewer or "qa-reviewer", notes=payload.notes or "")
    _recompute_for_proposal(db, p)
    return _serialize(p, db)


def _recompute_for_proposal(db: Session, p: HealingProposal) -> None:
    """Look up the project_id behind this healing proposal and recompute risk."""
    try:
        from server_py.models.test_suite import TestCase, TestSuite
        from server_py.services.risk_engine import safe_recompute as _risk_recompute
        if not p.test_case_id:
            return
        row = (
            db.query(TestSuite.project_id)
            .join(TestCase, TestCase.test_suite_id == TestSuite.id)
            .filter(TestCase.id == p.test_case_id)
            .first()
        )
        if row and row[0]:
            _risk_recompute(db, row[0], trigger=f"healing_{p.status}")
    except Exception:
        import logging
        logging.exception("Risk recompute failed for healing proposal %s", p.id)


@router.post("/seed-demo")
def seed_demo(count: int = 3, db: Session = Depends(get_db)):
    """Create N realistic demo proposals so a reviewer can immediately exercise the flow."""
    created = seed_demo_proposals(db, count=count)
    return {"created": [_serialize(p, db) for p in created], "count": len(created)}
