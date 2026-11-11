from datetime import timezone

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.User:
    credentials_exception = HTTPException(
        status_code=401, detail="Could not validate credentials"
    )
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise credentials_exception

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise credentials_exception

    # Session ended by a password reset: tokens issued before it are refused.
    # (Tokens from before this check existed carry no "iat" and are treated
    # as older than any reset.)
    if user.tokens_valid_after is not None:
        valid_after = user.tokens_valid_after.replace(tzinfo=timezone.utc).timestamp()
        if (payload.get("iat") or 0) < valid_after:
            raise credentials_exception

    # Session ended by "Log out".
    jti = payload.get("jti")
    if jti and db.query(models.RevokedToken.jti).filter(models.RevokedToken.jti == jti).first():
        raise credentials_exception
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != models.RoleEnum.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_mr(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != models.RoleEnum.MR.value:
        raise HTTPException(status_code=403, detail="MR access required")
    return user
