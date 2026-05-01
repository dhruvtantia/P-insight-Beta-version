"""
Upload workflow schemas.

These are the stable response contracts for the legacy two-step upload flow:
parse -> confirm. V2 upload-specific contracts live in upload_v2.py.
"""

from typing import Optional

from pydantic import BaseModel


class ParseResponse(BaseModel):
    """Result of the /parse step returned to the frontend for mapping/preview."""

    column_names:     list[str]
    detected_mapping: dict[str, Optional[str]]
    ambiguous_fields: list[str]
    high_confidence:  bool
    preview_rows:     list[dict]
    row_count:        int
    missing_optional: list[str]
    required_fields:  list[str]
    optional_fields:  list[str]


class ConfirmResponse(BaseModel):
    """Result of the /confirm step returned after saving the normalised portfolio."""

    success:                 bool
    filename:                str
    rows_accepted:           int
    rows_rejected:           int
    skipped_details:         list[dict]
    rows_fully_enriched:     int
    rows_partially_enriched: int
    rows_sector_unknown:     int
    rows_no_fundamentals:    int
    enriched_count:          int
    enrichment_note:         Optional[str]
    enrichment_details:      list[dict]
    holdings_parsed:         int
    message:                 str
