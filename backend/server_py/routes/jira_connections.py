from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from server_py.database import SessionLocal
from server_py.models.jira_connection import JiraConnection

router = APIRouter(prefix="/api/jira-connections", tags=["jira-connections"])


class JiraConnectionCreate(BaseModel):
    name: str
    base_url: str
    email: str
    api_token: str


class JiraConnectionResponse(BaseModel):
    id: str
    name: str
    base_url: str
    email: str

    class Config:
        from_attributes = True


@router.get("", response_model=List[JiraConnectionResponse])
def list_jira_connections():
    db = SessionLocal()
    try:
        connections = db.query(JiraConnection).order_by(JiraConnection.name).all()
        # Return string ID for pydantic serialization
        return [{"id": str(c.id), "name": c.name, "base_url": c.base_url, "email": c.email} for c in connections]
    finally:
        db.close()


@router.post("", response_model=JiraConnectionResponse)
def create_jira_connection(data: JiraConnectionCreate):
    db = SessionLocal()
    try:
        conn = JiraConnection(
            name=data.name,
            base_url=data.base_url.rstrip("/"),
            email=data.email,
            api_token=data.api_token,
        )
        db.add(conn)
        db.commit()
        db.refresh(conn)
        return {"id": str(conn.id), "name": conn.name, "base_url": conn.base_url, "email": conn.email}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create connection: {str(e)}")
    finally:
        db.close()


@router.delete("/{connection_id}")
def delete_jira_connection(connection_id: str):
    db = SessionLocal()
    try:
        conn = db.query(JiraConnection).filter(JiraConnection.id == connection_id).first()
        if not conn:
            raise HTTPException(status_code=404, detail="Jira Connection not found")
        db.delete(conn)
        db.commit()
        return {"status": "success"}
    finally:
        db.close()
