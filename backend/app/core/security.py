from datetime import datetime, timedelta, timezone
from typing import Annotated
import jwt
from jwt.exceptions import InvalidTokenError
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError, VerificationError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.database import get_db, set_actor_context
from app.models.entities import AuthSession, User, utcnow

password_hasher = PasswordHasher()
bearer = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return password_hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return password_hasher.verify(hashed, plain)
    except (InvalidHashError, VerifyMismatchError, VerificationError):
        return False


def make_access_token(user: User, session_id: str) -> str:
    settings = get_settings()
    if len(settings.jwt_secret) < 32:
        raise RuntimeError("JWT_SECRET must be set to at least 32 characters in backend/.env")
    now = datetime.now(timezone.utc)
    return jwt.encode({
        "sub": user.id,
        "jti": session_id,
        "iss": "earnscore-api",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }, settings.jwt_secret, algorithm="HS256")


def get_auth_context(
    auth: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> tuple[User, AuthSession]:
    """Always validate the database user AND the server-side token session."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid session",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if auth is None or auth.scheme.lower() != "bearer":
        raise unauthorized
    try:
        claims = jwt.decode(
            auth.credentials, get_settings().jwt_secret,
            algorithms=["HS256"], issuer="earnscore-api",
            options={"require": ["sub", "jti", "exp", "iat", "iss"]},
        )
        user_id = claims["sub"]
        session_id = claims["jti"]
        if not isinstance(user_id, str) or not isinstance(session_id, str):
            raise unauthorized
    except (InvalidTokenError, KeyError, TypeError):
        raise unauthorized from None
    user = db.get(User, user_id)
    session = db.get(AuthSession, session_id)
    expires_at = session.expires_at if session is not None else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if (user is None or not user.is_active or session is None or
            session.user_id != user_id or session.revoked_at is not None or
            expires_at is None or expires_at <= utcnow()):
        raise unauthorized
    set_actor_context(db, user.id, user.role)
    return user, session


def current_user(
    context: Annotated[tuple[User, AuthSession], Depends(get_auth_context)],
) -> User:
    return context[0]


def require_role(role: str):
    def dependency(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role != role:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dependency
