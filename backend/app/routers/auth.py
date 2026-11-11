from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, oauth2_scheme
from ..login_guard import client_address, ensure_not_locked, record_failure, record_success
from ..security import create_access_token, decode_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=schemas.UserOut)
def current_user(user: models.User = Depends(get_current_user)):
    return user


@router.post("/logout", status_code=204)
def logout(
    token: str = Depends(oauth2_scheme),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ends this session now: the token is refused from here on, instead of
    staying usable until it expires. Other devices stay signed in."""
    payload = decode_access_token(token)  # already validated by get_current_user
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # Housekeeping: revoked tokens that have expired anyway are no longer needed.
    db.query(models.RevokedToken).filter(models.RevokedToken.expires_at < now).delete()
    jti, exp = payload.get("jti"), payload.get("exp")
    if jti and exp and not db.get(models.RevokedToken, jti):
        db.add(models.RevokedToken(
            jti=jti,
            expires_at=datetime.fromtimestamp(exp, tz=timezone.utc).replace(tzinfo=None),
        ))
    db.commit()
    return Response(status_code=204)


@router.post("/login", response_model=schemas.Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    # Refuse early (429) while this employee code or address is locked out
    # after repeated wrong passwords.
    address = client_address(request)
    ensure_not_locked(db, form_data.username, address)
    # form_data.username holds the employee code here.
    user = (
        db.query(models.User)
        .filter(models.User.employee_code == form_data.username)
        .first()
    )
    if not user or not verify_password(form_data.password, user.password_hash):
        record_failure(db, form_data.username, address)
        raise HTTPException(status_code=401, detail="Invalid employee code or password")
    record_success(db, form_data.username)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return schemas.Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        name=user.name,
        user_id=user.id,
    )
