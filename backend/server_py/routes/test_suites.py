from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from server_py.database import get_db
from server_py.models.test_suite import TestSuite, TestCase

router = APIRouter(prefix="/api/test-suites", tags=["test_suites"])


class TestSuiteCreate(BaseModel):
    project_id: str
    name: str
    suite_type: str
    description: Optional[str] = ""


class TestSuiteUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


@router.get("")
def list_test_suites(project_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(TestSuite)
    if project_id:
        query = query.filter(TestSuite.project_id == project_id)
    suites = query.order_by(TestSuite.created_at.desc()).all()
    return [_serialize_suite(s) for s in suites]


@router.get("/{suite_id}")
def get_test_suite(suite_id: UUID, db: Session = Depends(get_db)):
    suite = db.query(TestSuite).filter(TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Test suite not found")
    return _serialize_suite_detail(suite, db)


@router.post("", status_code=201)
def create_test_suite(data: TestSuiteCreate, db: Session = Depends(get_db)):
    suite = TestSuite(
        project_id=data.project_id,
        name=data.name,
        suite_type=data.suite_type,
        description=data.description,
    )
    db.add(suite)
    db.commit()
    db.refresh(suite)
    return _serialize_suite(suite)


@router.put("/{suite_id}")
def update_test_suite(suite_id: UUID, data: TestSuiteUpdate, db: Session = Depends(get_db)):
    suite = db.query(TestSuite).filter(TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Test suite not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(suite, field, value)
    db.commit()
    db.refresh(suite)
    return _serialize_suite(suite)


@router.delete("/{suite_id}", status_code=204)
def delete_test_suite(suite_id: UUID, db: Session = Depends(get_db)):
    suite = db.query(TestSuite).filter(TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Test suite not found")
    db.delete(suite)
    db.commit()
    return None


def _update_suite_counts(suite_id: UUID, db: Session):
    suite = db.query(TestSuite).filter(TestSuite.id == suite_id).first()
    if not suite:
        return
    cases = db.query(TestCase).filter(TestCase.test_suite_id == suite_id).all()
    suite.total_cases = len(cases)
    suite.passed_cases = sum(1 for c in cases if c.status == "passed")
    suite.failed_cases = sum(1 for c in cases if c.status == "failed")
    db.commit()


def _serialize_suite(suite: TestSuite) -> dict:
    return {
        "id": str(suite.id),
        "project_id": str(suite.project_id),
        "name": suite.name,
        "suite_type": suite.suite_type,
        "description": suite.description,
        "status": suite.status,
        "total_cases": suite.total_cases,
        "passed_cases": suite.passed_cases,
        "failed_cases": suite.failed_cases,
        "created_at": suite.created_at.isoformat() if suite.created_at else None,
        "updated_at": suite.updated_at.isoformat() if suite.updated_at else None,
    }


def _serialize_suite_detail(suite: TestSuite, db: Session) -> dict:
    cases = db.query(TestCase).filter(TestCase.test_suite_id == suite.id).order_by(TestCase.created_at).all()
    base = _serialize_suite(suite)
    base["test_cases"] = [
        {
            "id": str(c.id),
            "title": c.title,
            "description": c.description,
            "preconditions": c.preconditions,
            "steps": c.steps,
            "expected_result": c.expected_result,
            "priority": c.priority,
            "status": c.status,
            "category": c.category,
            "playwright_code": c.playwright_code,
            "gherkin_script": c.gherkin_script,
            "execution_log": c.execution_log,
            "self_healing_log": c.self_healing_log,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in cases
    ]
    return base
