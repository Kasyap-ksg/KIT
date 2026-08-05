from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from server_py.database import get_db
from server_py.models.domain import Domain

router = APIRouter(prefix="/api/domains", tags=["domains"])


class DomainCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    knowledge_docs: Optional[str] = ""


class DomainUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    knowledge_docs: Optional[str] = None


@router.get("")
def list_domains(db: Session = Depends(get_db)):
    domains = db.query(Domain).order_by(Domain.created_at.desc()).all()
    return [_serialize_domain(d, db) for d in domains]


@router.get("/{domain_id}")
def get_domain(domain_id: UUID, db: Session = Depends(get_db)):
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    return _serialize_domain(domain, db)


@router.post("", status_code=201)
def create_domain(data: DomainCreate, db: Session = Depends(get_db)):
    domain = Domain(name=data.name, description=data.description, knowledge_docs=data.knowledge_docs)
    db.add(domain)
    db.commit()
    db.refresh(domain)
    return _serialize_domain(domain, db)


@router.put("/{domain_id}")
def update_domain(domain_id: UUID, data: DomainUpdate, db: Session = Depends(get_db)):
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    if data.name is not None:
        domain.name = data.name
    if data.description is not None:
        domain.description = data.description
    if data.knowledge_docs is not None:
        domain.knowledge_docs = data.knowledge_docs
    db.commit()
    db.refresh(domain)
    return _serialize_domain(domain, db)


@router.delete("/{domain_id}", status_code=204)
def delete_domain(domain_id: UUID, db: Session = Depends(get_db)):
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    db.delete(domain)
    db.commit()
    return None


def _serialize_domain(domain: Domain, db: Session) -> dict:
    project_count = len(domain.projects) if domain.projects else 0
    return {
        "id": str(domain.id),
        "name": domain.name,
        "description": domain.description,
        "knowledge_docs": domain.knowledge_docs,
        "project_count": project_count,
        "created_at": domain.created_at.isoformat() if domain.created_at else None,
        "updated_at": domain.updated_at.isoformat() if domain.updated_at else None,
    }
