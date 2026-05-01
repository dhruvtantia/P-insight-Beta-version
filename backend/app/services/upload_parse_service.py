"""
Upload parse service.

Owns the parse/preview contract for the upload wizard. It performs no database
writes and has no side effects.
"""

from app.ingestion.column_detector import REQUIRED_FIELDS, OPTIONAL_FIELDS, detect_columns
from app.ingestion.normalizer import missing_optional_columns, preview_rows
from app.schemas.upload import ParseResponse
from app.services.upload_file_utils import UploadServiceError, load_dataframe_from_upload


async def parse_upload_file(filename: str | None, content: bytes) -> ParseResponse:
    df = load_dataframe_from_upload(filename, content)
    if df.empty or len(df.columns) == 0:
        raise UploadServiceError(422, "The uploaded file is empty.")

    col_names = list(df.columns)
    result = detect_columns(col_names)

    return ParseResponse(
        column_names=col_names,
        detected_mapping=result.mapping,
        ambiguous_fields=result.ambiguous_fields,
        high_confidence=result.confidence,
        preview_rows=preview_rows(df, result.mapping, n=6),
        row_count=len(df),
        missing_optional=missing_optional_columns(result.mapping),
        required_fields=sorted(REQUIRED_FIELDS),
        optional_fields=sorted(OPTIONAL_FIELDS),
    )
