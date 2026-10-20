"""
Shared upload file validation and dataframe loading.

Endpoint handlers should not duplicate file-size checks, extension checks, temp
file handling, or "could not read file" error normalization.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pandas as pd
from pydantic import TypeAdapter, ValidationError

from app.core.public_errors import FailureReason
from app.ingestion.normalizer import read_file_as_dataframe

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
MAX_FILE_SIZE_MB = 10
_COLUMN_MAPPING = TypeAdapter(dict[str, str | None])


class UploadServiceError(Exception):
    """Typed service error that endpoints convert into HTTPException."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def parse_column_mapping(value: str) -> dict[str, str | None]:
    try:
        return _COLUMN_MAPPING.validate_json(value, strict=True)
    except ValidationError:
        raise UploadServiceError(
            422, "Invalid column_mapping JSON: expected an object mapping fields to column names or null."
        ) from None


def upload_filename(filename: str | None) -> str:
    return filename or "upload"


def validate_upload_filename(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise UploadServiceError(
            422,
            f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )
    return suffix


def load_dataframe_from_upload(filename: str | None, content: bytes) -> pd.DataFrame:
    suffix = validate_upload_filename(filename)
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise UploadServiceError(
            413,
            f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB} MB.",
        )

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(content)
        tmp.flush()
        tmp_path = Path(tmp.name)
    finally:
        tmp.close()

    try:
        return read_file_as_dataframe(tmp_path)
    except Exception as exc:
        raise UploadServiceError(422, FailureReason.FILE_READ.value) from exc
    finally:
        tmp_path.unlink(missing_ok=True)
