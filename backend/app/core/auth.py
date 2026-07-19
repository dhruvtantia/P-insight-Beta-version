"""
Authentication & Tenancy — Supabase JWT verification
-----------------------------------------------------
Central identity layer. Every /api/v1 route resolves the current user through
`get_current_user` (or `get_current_user_id` for the common id-only case).

Two modes, controlled by settings.AUTH_ENABLED:

  - AUTH_ENABLED = False (local/dev/test default):
      No token required. `get_current_user` returns None and
      `get_current_user_id` returns None → services fall back to legacy
      single-user (global) behavior. Nothing breaks for local development.

  - AUTH_ENABLED = True (production):
      A valid Supabase access token (HS256, signed with SUPABASE_JWT_SECRET)
      is required in the `Authorization: Bearer <token>` header. The token's
      `sub` claim identifies the Supabase user; we get-or-create a local
      `users` row and return it. Missing/invalid tokens → 401.

Verification uses PyJWT with the project's JWT secret, which is Supabase's
default server-side verification path. A JWKS/asymmetric path can be added
later without changing the dependency's public shape.
"""

from __future__ import annotations

import logging
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)


class AuthError(HTTPException):
    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


def _extract_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise AuthError("Missing Authorization header")
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise AuthError("Malformed Authorization header; expected 'Bearer <token>'")
    return parts[1].strip()


def _decode_supabase_jwt(token: str) -> dict:
    """Verify a Supabase HS256 access token and return its claims."""
    if not settings.SUPABASE_JWT_SECRET:
        # Misconfiguration: auth is on but no secret to verify against.
        logger.error("AUTH_ENABLED is True but SUPABASE_JWT_SECRET is not set.")
        raise AuthError("Authentication is misconfigured on the server")
    try:
        return jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience=settings.SUPABASE_JWT_AUD,
        )
    except jwt.ExpiredSignatureError:
        raise AuthError("Token has expired")
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"Invalid token: {exc}")


def _get_or_create_user(db: Session, sub: str, email: Optional[str]) -> User:
    """Look up the local user for a Supabase `sub`, creating it on first sight."""
    user = db.query(User).filter(User.supabase_user_id == sub).first()
    if user is None:
        user = User(supabase_user_id=sub, email=email)
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Provisioned local user for Supabase sub=%s", sub)
    elif email and user.email != email:
        user.email = email
        db.commit()
    return user


def get_current_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
) -> Optional[User]:
    """
    Resolve the authenticated user.

    Returns None in legacy mode (AUTH_ENABLED False). Raises 401 when auth is
    enabled and the token is missing or invalid.
    """
    if not settings.AUTH_ENABLED:
        return None

    token = _extract_bearer_token(authorization)
    claims = _decode_supabase_jwt(token)
    sub = claims.get("sub")
    if not sub:
        raise AuthError("Token missing 'sub' claim")
    return _get_or_create_user(db, sub, claims.get("email"))


def get_current_user_id(
    user: Optional[User] = Depends(get_current_user),
) -> Optional[int]:
    """
    Convenience dependency: the current user's internal id, or None in legacy
    mode. Services treat a None user_id as 'unscoped' (legacy single-user).
    """
    return user.id if user is not None else None
