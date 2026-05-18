"""
Post-upload workflow
--------------------
Coordinates side effects that happen after the base portfolio has been persisted.

The upload endpoint owns request parsing, row validation, and DB persistence.
This workflow owns downstream availability and background work:
  - save the canonical uploaded CSV,
  - schedule enrichment, price refresh, quant pre-warm, and history build.
"""

from __future__ import annotations

import logging
import inspect
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Literal, Sequence

from fastapi import BackgroundTasks

from app.data_providers.file_provider import UPLOADS_PATH
from app.schemas.portfolio import HoldingBase
from app.services.background_job_service import BackgroundJobService, BackgroundJobStageRecorder
from app.services.upload_v2_service import run_background_enrichment

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
        job_id: int | None = None
        try:
            db = self.db_factory()
            try:
                job = BackgroundJobService(db).create_job(
                    job_type="upload_enrichment",
                    owner_type="portfolio",
                    owner_id=event.portfolio_id,
                    stage="queued",
                    message=f"Queued enrichment for {len(event.holdings)} holding(s).",
                )
                job_id = job.id
            finally:
                db.close()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not create background job row (non-fatal): %s", exc)

        try:
            task = (
                self._run_enrichment_with_job
                if job_id is not None
                else self.enrichment_task
            )
            task_args = (
                (job_id, event)
                if job_id is not None
                else (event.portfolio_id, list(event.holdings), self.db_factory)
            )
            self.background_tasks.add_task(
                task,
                *task_args,
            )
            logger.info(
                "Scheduled post-upload enrichment for portfolio_id=%s (%d holdings)",
                event.portfolio_id,
                len(event.holdings),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not schedule post-upload enrichment (non-fatal): %s", exc)
            if job_id is not None:
                self._mark_job_failed(job_id, "schedule_failed", str(exc))

    async def _run_enrichment_with_job(self, job_id: int, event: UploadCompleted) -> None:
        self._mark_job_running(
            job_id,
            "enrichment",
            f"Running enrichment for {len(event.holdings)} holding(s).",
        )
        stage_recorder = BackgroundJobStageRecorder(
            job_id=job_id,
            db_factory=self.db_factory,
        )
        stage_recorder.running("workflow", "Post-upload workflow started.")
        try:
            kwargs = {}
            if self._supports_stage_recorder():
                kwargs["stage_recorder"] = stage_recorder
            await self.enrichment_task(
                event.portfolio_id,
                list(event.holdings),
                self.db_factory,
                **kwargs,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Post-upload enrichment failed for portfolio_id=%s", event.portfolio_id
            )
            stage_recorder.failed("workflow", str(exc))
            self._mark_job_failed(job_id, "enrichment", str(exc))
            return

        stage_recorder.succeeded("workflow", "Post-upload workflow completed.")
        self._mark_job_succeeded(
            job_id,
            "complete",
            f"Finished enrichment workflow for {len(event.holdings)} holding(s).",
        )

    def _supports_stage_recorder(self) -> bool:
        try:
            signature = inspect.signature(self.enrichment_task)
        except (TypeError, ValueError):
            return False
        for parameter in signature.parameters.values():
            if parameter.kind == inspect.Parameter.VAR_KEYWORD:
                return True
            if parameter.name == "stage_recorder":
                return True
        return False

    def _mark_job_running(self, job_id: int, stage: str, message: str) -> None:
        try:
            db = self.db_factory()
            try:
                BackgroundJobService(db).mark_running(job_id, stage=stage, message=message)
            finally:
                db.close()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not mark background job running: %s", exc)

    def _mark_job_succeeded(self, job_id: int, stage: str, message: str) -> None:
        try:
            db = self.db_factory()
            try:
                BackgroundJobService(db).mark_succeeded(job_id, stage=stage, message=message)
            finally:
                db.close()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not mark background job succeeded: %s", exc)

    def _mark_job_failed(self, job_id: int, stage: str, error: str) -> None:
        try:
            db = self.db_factory()
            try:
                BackgroundJobService(db).mark_failed(job_id, stage=stage, error=error)
            finally:
                db.close()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not mark background job failed: %s", exc)
