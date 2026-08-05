from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_, cast, String
from server_py.database import get_db
from server_py.models.domain import Domain
from server_py.models.project import Project
from server_py.models.application import Application
from server_py.models.test_suite import TestSuite, TestCase

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
def search(q: str = "", db: Session = Depends(get_db)):
    if not q or len(q) < 2:
        return {"results": []}

    pattern = f"%{q}%"
    results = []

    domains = db.query(Domain).filter(
        or_(Domain.name.ilike(pattern), Domain.description.ilike(pattern))
    ).limit(5).all()
    for d in domains:
        results.append({"type": "domain", "id": str(d.id), "name": d.name, "description": d.description or ""})

    projects = db.query(Project).filter(
        or_(Project.name.ilike(pattern), Project.description.ilike(pattern), Project.jira_project_key.ilike(pattern))
    ).limit(5).all()
    for p in projects:
        results.append({"type": "project", "id": str(p.id), "name": p.name, "description": p.description or "", "domain_id": str(p.domain_id)})

    apps = db.query(Application).filter(
        or_(Application.name.ilike(pattern), Application.description.ilike(pattern))
    ).limit(5).all()
    for a in apps:
        results.append({"type": "application", "id": str(a.id), "name": a.name, "description": a.description or "", "project_id": str(a.project_id)})

    suites = db.query(TestSuite).filter(
        or_(TestSuite.name.ilike(pattern), TestSuite.description.ilike(pattern))
    ).limit(5).all()
    for s in suites:
        results.append({"type": "test_suite", "id": str(s.id), "name": s.name, "suite_type": s.suite_type, "project_id": str(s.project_id)})

    cases = db.query(TestCase).filter(
        or_(TestCase.title.ilike(pattern), TestCase.description.ilike(pattern), TestCase.steps.ilike(pattern))
    ).limit(10).all()
    for c in cases:
        results.append({"type": "test_case", "id": str(c.id), "name": c.title, "description": c.description or "", "test_suite_id": str(c.test_suite_id)})

    return {"results": results}
