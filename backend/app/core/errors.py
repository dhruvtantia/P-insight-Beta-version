"""Shared application error primitives.

Phase 1 will wire these into FastAPI exception handlers so every module returns
the same response envelope. Module-specific errors should subclass AppError.
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ErrorCode(str, Enum):
    VALIDATION_ERROR = "VALIDATION_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    CONFLICT = "CONFLICT"
    USAGE_LIMIT_REACHED = "USAGE_LIMIT_REACHED"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class AppError(Exception):
    """Base exception for expected application errors."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    request_id: str | None = None


class ErrorEnvelope(BaseModel):
    error: ErrorDetail

