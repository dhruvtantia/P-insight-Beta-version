"""
Post-upload workflow
--------------------
Coordinates side effects that happen after the base portfolio has been persisted.

The upload endpoint owns request parsing, row validation, and DB persistence.
This workflow owns downstream availability and background work:
  - update the uploaded-holdings in-memory cache,
  - save the canonical uploaded CSV,
  - schedule enrichment, price refresh, quant pre-warm, and history build.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Literal, Sequence

from fastapi import BackgroundTasks

from app.data_providers.file_provider import UPLOADS_PATH
from app.schemas.portfolio import HoldingBase
from app.services.upload_v2_service import update_memory_cache, run_background_enrichment

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class UploadCompleted:
    portfolio_id: int
    holdings:     Sequence[HoldingBase]
    filename:     str
    source:       Literal["uploaded"] = "uploaded"


class PostUploadWorkflow:
    def __init__(
        self,
        background_tasks: BackgroundTasks,
        db_factory: Callable,
        uploads_path: Path = UPLOADS_PATH,
        enrichment_task: Callable = run_background_enrichment,
    ):
        self.background_tasks = background_tasks
        self.db_factory = db_factory
        self.uploads_path = uploads_path
        self.enrichment_task = enrichment_task

    def run(self, event: UploadCompleted) -> None:
        """Run all post-upload side effects. Non-critical failures are logged."""
        update_memory_cache(list(event.holdings))
        self._save_canonical_csv(event)
        self._schedule_background_enrichment(event)

    def _save_canonical_csv(self, event: UploadCompleted) -> None:
        try:
            import pandas as pd

            self.uploads_path.mkdir(parents=True, exist_ok=True)
            pd.DataFrame(
                [
                    {
                        "ticker":        h.ticker,
                        "name":          h.name,
                        "quantity":      h.quantity,
                        "average_cost":  h.average_cost,
                        "current_price": h.current_price or h.average_cost,
                        "sector":        h.sector or "",
                        "asset_class":   h.asset_class or "Equity",
                        "currency":      h.currency or "INR",
                    }
                    for h in event.holdings
                ]
            ).to_csv(self.uploads_path / "portfolio_uploaded.csv", index=False)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Post-upload CSV save failed (non-fatal): %s", exc)

    def _schedule_background_enrichment(self, event: UploadCompleted) -> None:
        try:
            self.background_tasks.add_task(
                self.enrichment_task,
                event.portfolio_id,
                list(event.holdings),
                self.db_factory,
            )
            logger.info(
                "Scheduled post-upload enrichment for portfolio_id=%s (%d holdings)",
                event.portfolio_id,
                len(event.holdings),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not schedule post-upload enrichment (non-fatal): %s", exc)
