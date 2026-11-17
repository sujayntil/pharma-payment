from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .. import models, schemas
from ..audit import write_audit
from ..database import get_db
from ..deps import get_current_user, oauth2_scheme
from ..login_guard import client_address, ensure_not_locked, record_failure, record_success
from ..security import REMEMBER_EXPIRE_MINUTES, create_access_token, decode_access_token, verify_password

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
    write_audit(db, "signed_out", user)
    db.commit()
    return Response(status_code=204)


@router.post("/login", response_model=schemas.Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db),
    # "Keep me signed in": a 30-day session renewed while used. Off (and for
    # older apps that don't send it): 12 hours, as before.
    remember: bool = Form(False),
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
        # Audit log: who tried (when the code exists) and from where.
        write_audit(db, "sign_in_failed", user, new={"employee_code": (form_data.username or "")[:60], "address": address})
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid employee code or password")
    record_success(db, form_data.username)
    write_audit(db, "signed_in", user, new={"address": address})
    db.commit()

    token = _issue(user, remember)
    return schemas.Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        name=user.name,
        user_id=user.id,
        title=user.title or "KING",
    )


def _issue(user: models.User, remember: bool) -> str:
    claims = {"sub": str(user.id), "role": user.role, "rmb": bool(remember)}
    if remember:
        return create_access_token(claims, expires_minutes=REMEMBER_EXPIRE_MINUTES)
    return create_access_token(claims)


@router.post("/refresh")
def refresh(
    token: str = Depends(oauth2_scheme),
    user: models.User = Depends(get_current_user),
):
    """Renews a "Keep me signed in" session for another 30 days (the app
    calls this when opened). Sessions signed in without it are not renewed,
    so they still end after 12 hours. Sessions from before this option
    existed (no "rmb" in them) were kept on the device anyway, so they are
    renewed too. A password reset or Log out still ends the session: the old
    token is refused by get_current_user before this runs."""
    payload = decode_access_token(token)
    if payload.get("rmb") is False:
        raise HTTPException(status_code=400, detail="This session isn't kept signed in")
    return {"access_token": _issue(user, True), "token_type": "bearer"}
