import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt  # PyJWT (maintained); same HS256 tokens as before, so existing logins keep working
from passlib.context import CryptContext

DEV_SECRET = "change-this-secret-key"
SECRET_KEY = os.getenv("SECRET_KEY", DEV_SECRET)
# On the live server (Render sets RENDER=true) a missing, default or short key
# would let anyone forge a login, so the server refuses to start instead.
if os.getenv("RENDER") and (SECRET_KEY == DEV_SECRET or len(SECRET_KEY) < 32):
    raise RuntimeError(
        "SECRET_KEY must be set in Render > Environment to a random value of at least 32 characters."
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12  # 12 hours ("Keep me signed in" off)
# "Keep me signed in": 30 days, renewed while the app is used (POST /auth/refresh).
REMEMBER_EXPIRE_MINUTES = 60 * 24 * 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(data: dict, expires_minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=expires_minutes)
    # iat: lets a password reset end every older session of that user.
    # jti: lets "Log out" end this one session before it expires.
    to_encode.update({"exp": expire, "iat": int(now.timestamp()), "jti": uuid.uuid4().hex})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# Passwords anyone could guess: the starter accounts' passwords and the most
# common ones. Signing in with one of these makes the person set a new
# password before they can use the app; they can't be chosen as a new one.
KNOWN_WEAK_PASSWORDS = {
    "admin123", "mr123", "admin", "admin@123", "admin1234", "password", "password1", "password123",
    "12345678", "123456789", "1234567890", "123456", "qwerty123", "qwertyuiop", "pharma123",
    "welcome123", "abc12345", "11111111", "00000000", "iloveyou", "changeme",
}
MIN_PASSWORD_LENGTH = 8


def is_weak_password(password: str, employee_code: str | None = None) -> bool:
    value = (password or "").strip().lower()
    code = (employee_code or "").strip().lower()
    return value in KNOWN_WEAK_PASSWORDS or (bool(code) and value in {code, f"{code}123", f"{code}@123"})


def password_problem(password: str, employee_code: str | None = None) -> str | None:
    """Why a new password can't be used, or None when it's fine."""
    if len(password or "") < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    if len(password.encode("utf-8")) > 72:
        return "Password must be 72 characters or fewer"
    if is_weak_password(password, employee_code):
        return "That password is too easy to guess. Choose another one."
    return None
