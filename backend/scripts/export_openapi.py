"""
Export the FastAPI OpenAPI schema to a stable JSON artifact.

Run from backend/:
    poetry run python scripts/export_openapi.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app


def export_openapi(output_path: Path) -> None:
    schema = app.openapi()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(schema, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Export FastAPI OpenAPI schema")
    parser.add_argument(
        "--output",
        default="openapi.json",
        help="Path to write the OpenAPI JSON schema. Defaults to backend/openapi.json.",
    )
    args = parser.parse_args()
    export_openapi(Path(args.output))


if __name__ == "__main__":
    main()
