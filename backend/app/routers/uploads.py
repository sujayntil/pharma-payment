"""Uploaded invoice photos, behind a login.

These files used to be served from a public folder (anyone with the link
could open them). Now a signed-in Admin can open any file, and an MR only a
file attached to one of their own invoices.
"""

import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/uploads", tags=["uploads"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")


@router.get("/{filename}")
def get_upload(
    filename: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    # A plain file name only: no folders, no "..", nothing outside UPLOAD_DIR.
    safe_name = os.path.basename(filename.replace("\\", "/"))
    if not safe_name or safe_name != filename or safe_name.startswith("."):
        raise HTTPException(404, "File not found")
    root = os.path.realpath(UPLOAD_DIR)
    path = os.path.realpath(os.path.join(root, safe_name))
    if os.path.dirname(path) != root or not os.path.isfile(path):
        raise HTTPException(404, "File not found")

    if user.role != models.RoleEnum.ADMIN.value:
        owned = (
            db.query(models.Invoice.id)
            .filter(models.Invoice.mr_id == user.id, models.Invoice.image_path.endswith(safe_name, autoescape=True))
            .first()
        )
        if not owned:
            raise HTTPException(404, "File not found")
    return FileResponse(path, headers={"Cache-Control": "private, no-store"})
