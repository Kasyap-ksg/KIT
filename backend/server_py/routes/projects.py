from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from server_py.database import get_db
from server_py.models.project import Project
from server_py.models.application import Application
from server_py.models.test_suite import TestSuite

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    domain_id: str
    name: str
    description: Optional[str] = ""
    jira_project_key: Optional[str] = ""
    jira_url: Optional[str] = ""
    jira_connection_id: Optional[str] = None
    app_url: Optional[str] = ""
    brd_document: Optional[str] = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    jira_project_key: Optional[str] = None
    jira_url: Optional[str] = None
    jira_connection_id: Optional[str] = None
    app_url: Optional[str] = None
    brd_document: Optional[str] = None
    status: Optional[str] = None


@router.get("")
def list_projects(domain_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Project)
    if domain_id:
        query = query.filter(Project.domain_id == domain_id)
    projects = query.order_by(Project.created_at.desc()).all()
    return [_serialize_project(p) for p in projects]


@router.get("/{project_id}")
def get_project(project_id: UUID, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return _serialize_project_detail(project, db)


def _validate_url(url: str) -> bool:
    if not url:
        return True
    return url.startswith("http://") or url.startswith("https://")


@router.post("", status_code=201)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    from server_py.models.domain import Domain
    domain = db.query(Domain).filter(Domain.id == data.domain_id).first()
    if not domain:
        raise HTTPException(status_code=400, detail="Domain not found")
    if data.app_url and not _validate_url(data.app_url):
        raise HTTPException(status_code=400, detail="App URL must start with http:// or https://")
    if data.jira_url and not _validate_url(data.jira_url):
        raise HTTPException(status_code=400, detail="JIRA URL must start with http:// or https://")
    project = Project(
        domain_id=data.domain_id,
        name=data.name,
        description=data.description,
        jira_project_key=data.jira_project_key,
        jira_url=data.jira_url,
        jira_connection_id=data.jira_connection_id,
        app_url=data.app_url,
        brd_document=data.brd_document,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _serialize_project(project)


@router.put("/{project_id}")
def update_project(project_id: UUID, data: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return _serialize_project(project)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: UUID, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    return None


def _serialize_project(project: Project) -> dict:
    return {
        "id": str(project.id),
        "domain_id": str(project.domain_id),
        "name": project.name,
        "description": project.description,
        "jira_project_key": project.jira_project_key,
        "jira_url": project.jira_url,
        "jira_connection_id": str(project.jira_connection_id) if project.jira_connection_id else None,
        "app_url": project.app_url or "",
        "brd_document": project.brd_document,
        "status": project.status,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


def _serialize_project_detail(project: Project, db: Session) -> dict:
    apps = db.query(Application).filter(Application.project_id == project.id).all()
    suites = db.query(TestSuite).filter(TestSuite.project_id == project.id).all()
    base = _serialize_project(project)
    base["applications"] = [
        {
            "id": str(a.id),
            "name": a.name,
            "app_type": a.app_type,
            "url": a.url,
            "status": a.status,
        }
        for a in apps
    ]
    base["test_suites"] = [
        {
            "id": str(s.id),
            "name": s.name,
            "suite_type": s.suite_type,
            "status": s.status,
            "total_cases": s.total_cases,
            "passed_cases": s.passed_cases,
            "failed_cases": s.failed_cases,
        }
        for s in suites
    ]
    return base
