import os
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from uuid import UUID

from server_py.database import get_db
from server_py.models.project import Project
from server_py.models.jira_connection import JiraConnection

router = APIRouter(prefix="/api/jira", tags=["jira"])


def _get_auth(db: Session, project_id: str = None, project_key: str = None, connection_id: str = None):
    conn = None
    if connection_id:
        conn = db.query(JiraConnection).filter(JiraConnection.id == connection_id).first()
    else:
        project = None
        if project_id:
            project = db.query(Project).filter(Project.id == project_id).first()
        elif project_key:
            project = db.query(Project).filter(Project.jira_project_key == project_key).first()
            
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
            
        if not project.jira_connection_id:
            raise HTTPException(status_code=400, detail="JIRA connection not configured for this project")
            
        conn = db.query(JiraConnection).filter(JiraConnection.id == project.jira_connection_id).first()

    if not conn:
        raise HTTPException(status_code=500, detail="Configured JIRA connection not found")
        
    return conn.base_url, (conn.email, conn.api_token)


def _headers():
    return {"Accept": "application/json", "Content-Type": "application/json"}


@router.get("/status")
def jira_status(project_id: Optional[str] = None, connection_id: Optional[str] = None, db: Session = Depends(get_db)):
    if connection_id:
        conn = db.query(JiraConnection).filter(JiraConnection.id == connection_id).first()
        if conn:
            return {"configured": True, "base_url": conn.base_url}
    elif project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project and project.jira_connection_id:
            conn = db.query(JiraConnection).filter(JiraConnection.id == project.jira_connection_id).first()
            if conn:
                return {"configured": True, "base_url": conn.base_url}
    return {"configured": False, "base_url": None}


@router.get("/projects")
async def list_jira_projects(project_id: Optional[str] = None, connection_id: Optional[str] = None, db: Session = Depends(get_db)):
    if not project_id and not connection_id:
        raise HTTPException(status_code=400, detail="Must provide either project_id or connection_id")
    base_url, auth = _get_auth(db, project_id=project_id, connection_id=connection_id)
    url = f"{base_url}/rest/api/3/project/search?maxResults=50&orderBy=name"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, auth=auth, headers=_headers())
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="JIRA API request timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Cannot connect to JIRA: {str(e)[:200]}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"JIRA API error: {resp.text[:200]}")
    data = resp.json()
    projects = []
    for p in data.get("values", []):
        projects.append({
            "key": p.get("key", ""),
            "name": p.get("name", ""),
            "id": p.get("id", ""),
            "project_type": p.get("projectTypeKey", ""),
            "lead": p.get("lead", {}).get("displayName", "") if p.get("lead") else "",
            "avatar_url": p.get("avatarUrls", {}).get("48x48", ""),
            "url": f"{base_url}/browse/{p.get('key', '')}",
        })
    return {"projects": projects, "total": data.get("total", len(projects))}


@router.get("/projects/{project_key}")
async def get_jira_project(project_key: str, project_id: Optional[str] = None, db: Session = Depends(get_db)):
    base_url, auth = _get_auth(db, project_id=project_id, project_key=project_key)
    url = f"{base_url}/rest/api/3/project/{project_key}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, auth=auth, headers=_headers())
    except (httpx.TimeoutException, httpx.RequestError) as e:
        raise HTTPException(status_code=502, detail=f"JIRA connection error: {str(e)[:200]}")
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"JIRA project '{project_key}' not found")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"JIRA API error: {resp.text[:200]}")
    p = resp.json()
    return {
        "key": p.get("key", ""),
        "name": p.get("name", ""),
        "id": p.get("id", ""),
        "description": _extract_description(p.get("description")),
        "project_type": p.get("projectTypeKey", ""),
        "lead": p.get("lead", {}).get("displayName", "") if p.get("lead") else "",
        "avatar_url": p.get("avatarUrls", {}).get("48x48", ""),
        "url": f"{base_url}/browse/{p.get('key', '')}",
    }


@router.get("/projects/{project_key}/epics")
async def get_jira_epics(project_key: str, project_id: Optional[str] = None, db: Session = Depends(get_db)):
    base_url, auth = _get_auth(db, project_id=project_id, project_key=project_key)
    jql = f'project="{project_key}" AND issuetype=Epic ORDER BY created DESC'
    url = f"{base_url}/rest/api/3/search?jql={jql}&maxResults=100&fields=summary,status,priority,assignee"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, auth=auth, headers=_headers())
    except (httpx.TimeoutException, httpx.RequestError) as e:
        raise HTTPException(status_code=502, detail=f"JIRA connection error: {str(e)[:200]}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"JIRA API error: {resp.text[:200]}")
    data = resp.json()
    epics = []
    for issue in data.get("issues", []):
        fields = issue.get("fields", {})
        epics.append({
            "key": issue.get("key", ""),
            "summary": fields.get("summary", ""),
            "status": fields.get("status", {}).get("name", "") if fields.get("status") else "",
            "priority": fields.get("priority", {}).get("name", "") if fields.get("priority") else "",
            "assignee": fields.get("assignee", {}).get("displayName", "") if fields.get("assignee") else "",
            "url": f"{base_url}/browse/{issue.get('key', '')}",
        })
    return {"epics": epics, "total": data.get("total", len(epics))}


@router.get("/projects/{project_key}/stories")
async def get_jira_stories(project_key: str, epic_key: Optional[str] = None, project_id: Optional[str] = None, db: Session = Depends(get_db)):
    base_url, auth = _get_auth(db, project_id=project_id, project_key=project_key)
    jql = f'project="{project_key}" AND issuetype=Story'
    if epic_key:
        jql += f' AND "Epic Link"="{epic_key}"'
    jql += " ORDER BY created DESC"
    url = f"{base_url}/rest/api/3/search?jql={jql}&maxResults=200&fields=summary,status,priority,assignee,description"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, auth=auth, headers=_headers())
    except (httpx.TimeoutException, httpx.RequestError) as e:
        raise HTTPException(status_code=502, detail=f"JIRA connection error: {str(e)[:200]}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"JIRA API error: {resp.text[:200]}")
    data = resp.json()
    stories = []
    for issue in data.get("issues", []):
        fields = issue.get("fields", {})
        stories.append({
            "key": issue.get("key", ""),
            "summary": fields.get("summary", ""),
            "description": _extract_description(fields.get("description")),
            "status": fields.get("status", {}).get("name", "") if fields.get("status") else "",
            "priority": fields.get("priority", {}).get("name", "") if fields.get("priority") else "",
            "assignee": fields.get("assignee", {}).get("displayName", "") if fields.get("assignee") else "",
            "url": f"{base_url}/browse/{issue.get('key', '')}",
        })
    return {"stories": stories, "total": data.get("total", len(stories))}


@router.get("/projects/{project_key}/boards")
async def get_jira_boards(project_key: str, project_id: Optional[str] = None, db: Session = Depends(get_db)):
    base_url, auth = _get_auth(db, project_id=project_id, project_key=project_key)
    url = f"{base_url}/rest/agile/1.0/board?projectKeyOrId={project_key}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, auth=auth, headers=_headers())
    except (httpx.TimeoutException, httpx.RequestError) as e:
        raise HTTPException(status_code=502, detail=f"JIRA connection error: {str(e)[:200]}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"JIRA API error: {resp.text[:200]}")
    data = resp.json()
    boards = []
    for b in data.get("values", []):
        boards.append({
            "id": b.get("id"),
            "name": b.get("name", ""),
            "type": b.get("type", ""),
            "project_key": b.get("location", {}).get("projectKey", ""),
        })
    return {"boards": boards, "total": data.get("total", len(boards))}


@router.get("/boards/{board_id}/sprints")
async def get_board_sprints(board_id: int, state: Optional[str] = None, project_id: str = None, db: Session = Depends(get_db)):
    if not project_id:
        raise HTTPException(status_code=400, detail="project_id is required")
    base_url, auth = _get_auth(db, project_id=project_id)
    params = "?maxResults=50"
    if state:
        params += f"&state={state}"
    url = f"{base_url}/rest/agile/1.0/board/{board_id}/sprint{params}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, auth=auth, headers=_headers())
    except (httpx.TimeoutException, httpx.RequestError) as e:
        raise HTTPException(status_code=502, detail=f"JIRA connection error: {str(e)[:200]}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"JIRA API error: {resp.text[:200]}")
    data = resp.json()
    sprints = []
    for s in data.get("values", []):
        sprints.append({
            "id": s.get("id"),
            "name": s.get("name", ""),
            "state": s.get("state", ""),
            "start_date": s.get("startDate", ""),
            "end_date": s.get("endDate", ""),
            "complete_date": s.get("completeDate", ""),
            "goal": s.get("goal", ""),
        })
    return {"sprints": sprints, "total": data.get("total", len(sprints))}


@router.get("/sprints/{sprint_id}/issues")
async def get_sprint_issues(sprint_id: int, project_id: str = None, db: Session = Depends(get_db)):
    if not project_id:
        raise HTTPException(status_code=400, detail="project_id is required")
    base_url, auth = _get_auth(db, project_id=project_id)
    url = f"{base_url}/rest/agile/1.0/sprint/{sprint_id}/issue?maxResults=100&fields=summary,status,priority,assignee,issuetype,description"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, auth=auth, headers=_headers())
    except (httpx.TimeoutException, httpx.RequestError) as e:
        raise HTTPException(status_code=502, detail=f"JIRA connection error: {str(e)[:200]}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"JIRA API error: {resp.text[:200]}")
    data = resp.json()
    issues = []
    for issue in data.get("issues", []):
        fields = issue.get("fields", {})
        issues.append({
            "key": issue.get("key", ""),
            "summary": fields.get("summary", ""),
            "description": _extract_description(fields.get("description")),
            "issue_type": fields.get("issuetype", {}).get("name", "") if fields.get("issuetype") else "",
            "status": fields.get("status", {}).get("name", "") if fields.get("status") else "",
            "status_category": fields.get("status", {}).get("statusCategory", {}).get("name", "") if fields.get("status") else "",
            "priority": fields.get("priority", {}).get("name", "") if fields.get("priority") else "",
            "assignee": fields.get("assignee", {}).get("displayName", "") if fields.get("assignee") else "",
            "assignee_avatar": fields.get("assignee", {}).get("avatarUrls", {}).get("32x32", "") if fields.get("assignee") else "",
            "url": f"{base_url}/browse/{issue.get('key', '')}",
        })
    return {"issues": issues, "total": data.get("total", len(issues))}


def _extract_description(desc) -> str:
    if not desc:
        return ""
    if isinstance(desc, str):
        return desc
    if isinstance(desc, dict):
        parts = []
        for block in desc.get("content", []):
            if block.get("type") == "paragraph":
                for inline in block.get("content", []):
                    if inline.get("type") == "text":
                        parts.append(inline.get("text", ""))
        return " ".join(parts)
    return str(desc)
