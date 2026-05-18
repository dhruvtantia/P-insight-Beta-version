"""Feature-flag lookup helpers.

The current settings object already exposes feature booleans. This module gives
future routers/services a stable import path while the rebuild moves code into
module-local boundaries.
"""

from app.core.config import settings


def is_feature_enabled(feature_name: str) -> bool:
    normalized = feature_name.upper()
    attr_name = normalized if normalized.startswith("FEATURE_") else f"FEATURE_{normalized}"
    return bool(getattr(settings, attr_name, False))

