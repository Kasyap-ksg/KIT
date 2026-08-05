import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml", ".rst"}


def _save_file(file_bytes: bytes, original_filename: str, subfolder: str) -> str:
    ext = os.path.splitext(original_filename)[1].lower()
    fname = f"{uuid.uuid4().hex}{ext}"
    dest_dir = os.path.join(UPLOAD_DIR, subfolder)
    os.makedirs(dest_dir, exist_ok=True)
    with open(os.path.join(dest_dir, fname), "wb") as f:
        f.write(file_bytes)
    return f"/uploads/{subfolder}/{fname}"


@router.post("/doc")
async def upload_doc(file: UploadFile = File(...)):
    """Upload a document for BRD/context. Returns text content for text files, URL for binary files."""
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    data = await file.read()
    ext = os.path.splitext(file.filename or "")[1].lower()
    url = _save_file(data, file.filename or "doc.bin", "docs")

    text_content = None
    if ext in TEXT_EXTENSIONS:
        try:
            text_content = data.decode("utf-8", errors="replace")
        except Exception:
            pass

    return {"url": url, "filename": file.filename, "text_content": text_content}


@router.post("/resource")
async def upload_resource(file: UploadFile = File(...)):
    """Upload a resource file (doc, PDF, spec). Returns the served URL."""
    if file.size and file.size > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    data = await file.read()
    url = _save_file(data, file.filename or "resource.bin", "resources")
    return {"url": url, "filename": file.filename}
