"""One external boundary for server failures; never echo infrastructure errors."""

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class PublicServiceError(HTTPException):
    """Reviewed static/typed client contract, never raw exception/provider text."""


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def safe_http_error(request: Request, exc: StarletteHTTPException):
        if exc.status_code < 500 or isinstance(exc, PublicServiceError):
            return await http_exception_handler(request, exc)
        # Do not log exception text, URLs, request bodies or credentials here.
        logger.error("HTTP server failure status=%s", exc.status_code)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": "Service unavailable" if exc.status_code == 503 else "Internal server error"},
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def safe_unhandled_error(request: Request, exc: Exception):
        logger.error("Unhandled server failure type=%s", type(exc).__name__)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
