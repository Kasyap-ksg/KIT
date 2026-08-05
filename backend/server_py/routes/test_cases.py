from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from server_py.database import get_db
from server_py.models.test_suite import TestCase, TestSuite

router = APIRouter(prefix="/api/test-cases", tags=["test_cases"])


class TestCaseCreate(BaseModel):
    test_suite_id: str
    title: str
    description: Optional[str] = ""
    preconditions: Optional[str] = ""
    steps: Optional[str] = ""
    expected_result: Optional[str] = ""
    priority: Optional[str] = "medium"
    category: Optional[str] = ""


class TestCaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    preconditions: Optional[str] = None
    steps: Optional[str] = None
    expected_result: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None


class TestCaseBulkCreate(BaseModel):
    test_suite_id: str
    test_cases: list[TestCaseCreate]


@router.get("")
def list_test_cases(test_suite_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(TestCase)
    if test_suite_id:
        query = query.filter(TestCase.test_suite_id == test_suite_id)
    cases = query.order_by(TestCase.created_at).all()
    return [_serialize_case(c) for c in cases]


@router.get("/{case_id}")
def get_test_case(case_id: UUID, db: Session = Depends(get_db)):
    case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Test case not found")
    return _serialize_case(case)


@router.post("", status_code=201)
def create_test_case(data: TestCaseCreate, db: Session = Depends(get_db)):
    case = TestCase(
        test_suite_id=data.test_suite_id,
        title=data.title,
        description=data.description,
        preconditions=data.preconditions,
        steps=data.steps,
        expected_result=data.expected_result,
        priority=data.priority,
        category=data.category,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    _update_suite_counts(data.test_suite_id, db)
    return _serialize_case(case)


@router.post("/bulk", status_code=201)
def bulk_create_test_cases(data: TestCaseBulkCreate, db: Session = Depends(get_db)):
    cases = []
    for tc_data in data.test_cases:
        case = TestCase(
            test_suite_id=data.test_suite_id,
            title=tc_data.title,
            description=tc_data.description,
            preconditions=tc_data.preconditions,
            steps=tc_data.steps,
            expected_result=tc_data.expected_result,
            priority=tc_data.priority,
            category=tc_data.category,
        )
        db.add(case)
        cases.append(case)
    db.commit()
    for c in cases:
        db.refresh(c)
    _update_suite_counts(data.test_suite_id, db)
    return [_serialize_case(c) for c in cases]


@router.put("/{case_id}")
def update_test_case(case_id: UUID, data: TestCaseUpdate, db: Session = Depends(get_db)):
    case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Test case not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(case, field, value)
    db.commit()
    db.refresh(case)
    _update_suite_counts(str(case.test_suite_id), db)
    return _serialize_case(case)


@router.delete("/{case_id}", status_code=204)
def delete_test_case(case_id: UUID, db: Session = Depends(get_db)):
    case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Test case not found")
    suite_id = str(case.test_suite_id)
    db.delete(case)
    db.commit()
    _update_suite_counts(suite_id, db)
    return None


def _update_suite_counts(suite_id: str, db: Session):
    suite = db.query(TestSuite).filter(TestSuite.id == suite_id).first()
    if not suite:
        return
    cases = db.query(TestCase).filter(TestCase.test_suite_id == suite_id).all()
    suite.total_cases = len(cases)
    suite.passed_cases = sum(1 for c in cases if c.status == "passed")
    suite.failed_cases = sum(1 for c in cases if c.status == "failed")
    db.commit()


def _serialize_case(case: TestCase) -> dict:
    return {
        "id": str(case.id),
        "test_suite_id": str(case.test_suite_id),
        "title": case.title,
        "description": case.description,
        "preconditions": case.preconditions,
        "steps": case.steps,
        "expected_result": case.expected_result,
        "priority": case.priority,
        "status": case.status,
        "category": case.category,
        "gherkin_script": case.gherkin_script or "",
        "playwright_code": case.playwright_code or "",
        "execution_result": case.execution_result or "",
        "execution_log": case.execution_log or "",
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
    }
