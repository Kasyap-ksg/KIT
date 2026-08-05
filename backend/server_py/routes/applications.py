from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from server_py.database import get_db
from server_py.models.application import Application

router = APIRouter(prefix="/api/applications", tags=["applications"])


class ApplicationCreate(BaseModel):
    project_id: str
    name: str
    app_type: Optional[str] = "web"
    url: Optional[str] = ""
    description: Optional[str] = ""
    documentation_url: Optional[str] = ""
    codebase_url: Optional[str] = ""


class ApplicationUpdate(BaseModel):
    name: Optional[str] = None
    app_type: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    documentation_url: Optional[str] = None
    codebase_url: Optional[str] = None
    status: Optional[str] = None


@router.get("")
def list_applications(project_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Application)
    if project_id:
        query = query.filter(Application.project_id == project_id)
    apps = query.order_by(Application.created_at.desc()).all()
    return [_serialize_app(a) for a in apps]


@router.get("/{app_id}")
def get_application(app_id: UUID, db: Session = Depends(get_db)):
    app = db.query(Application).filter(Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return _serialize_app(app)


@router.post("", status_code=201)
def create_application(data: ApplicationCreate, db: Session = Depends(get_db)):
    app = Application(
        project_id=data.project_id,
        name=data.name,
        app_type=data.app_type,
        url=data.url,
        description=data.description,
        documentation_url=data.documentation_url,
        codebase_url=data.codebase_url,
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    return _serialize_app(app)


@router.put("/{app_id}")
def update_application(app_id: UUID, data: ApplicationUpdate, db: Session = Depends(get_db)):
    app = db.query(Application).filter(Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(app, field, value)
    db.commit()
    db.refresh(app)
    return _serialize_app(app)


@router.delete("/{app_id}", status_code=204)
def delete_application(app_id: UUID, db: Session = Depends(get_db)):
    app = db.query(Application).filter(Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    db.delete(app)
    db.commit()
    return None


def _serialize_app(app: Application) -> dict:
    return {
        "id": str(app.id),
        "project_id": str(app.project_id),
        "name": app.name,
        "app_type": app.app_type,
        "url": app.url,
        "description": app.description,
        "documentation_url": app.documentation_url,
        "codebase_url": app.codebase_url,
        "status": app.status,
        "created_at": app.created_at.isoformat() if app.created_at else None,
        "updated_at": app.updated_at.isoformat() if app.updated_at else None,
    }
