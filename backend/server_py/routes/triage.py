from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from server_py.database import get_db
from server_py.models.test_run import TestRun
from server_py.models.test_run_triage import TestRunTriage
from server_py.services.failure_triage import triage_run, serialize_triage

router = APIRouter(prefix="/api/triage", tags=["triage"])


@router.get("/run/{run_id}")
def get_triage(run_id: UUID, db: Session = Depends(get_db)):
    run = db.query(TestRun).filter(TestRun.id == run_id).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    triage = db.query(TestRunTriage).filter(TestRunTriage.run_id == run_id).first()
    if triage is None:
        return {"run_id": str(run_id), "triage": None, "available": False,
                "reason": "no-triage" if run.status not in ("failed", "error")
                else "not-yet-run"}
    return {"run_id": str(run_id), "triage": serialize_triage(triage), "available": True}


@router.post("/run/{run_id}")
def run_triage(run_id: UUID, db: Session = Depends(get_db)):
    run = db.query(TestRun).filter(TestRun.id == run_id).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in ("failed", "error"):
        raise HTTPException(status_code=400,
                            detail="Triage is only available for failed/error runs")
    triage = triage_run(str(run_id), db)
    if triage is None:
        raise HTTPException(status_code=500, detail="Triage failed to produce a result")
    return {"run_id": str(run_id), "triage": serialize_triage(triage), "available": True}
