"""
Background Job Service
----------------------
Small persistence boundary for workflows that continue after request return.
"""

from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.background_job import BackgroundJob, BackgroundJobStage

logger = logging.getLogger(__name__)


class BackgroundJobService:
    def __init__(self, db: Session):
        self.db = db

    def create_job(
        self,
        *,
        job_type: str,
        owner_type: str,
        owner_id: int,
        stage: str = "queued",
        message: str | None = None,
    ) -> BackgroundJob:
        job = BackgroundJob(
            job_type=job_type,
            owner_type=owner_type,
            owner_id=owner_id,
            status="queued",
            stage=stage,
            message=message,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def mark_running(self, job_id: int, *, stage: str, message: str | None = None) -> None:
        job = self._get_job(job_id)
        if job is None:
            return
        now = datetime.now(timezone.utc)
        job.status = "running"
        job.stage = stage
        job.message = message
        job.started_at = job.started_at or now
        job.updated_at = now
        self.db.commit()

    def mark_succeeded(self, job_id: int, *, stage: str, message: str | None = None) -> None:
        job = self._get_job(job_id)
        if job is None:
            return
        now = datetime.now(timezone.utc)
        job.status = "succeeded"
        job.stage = stage
        job.message = message
        job.error = None
        job.completed_at = now
        job.updated_at = now
        self.db.commit()

    def mark_failed(self, job_id: int, *, stage: str, error: str) -> None:
        job = self._get_job(job_id)
        if job is None:
            return
        now = datetime.now(timezone.utc)
        job.status = "failed"
        job.stage = stage
        job.error = error
        job.completed_at = now
        job.updated_at = now
        self.db.commit()

    def create_stage(
        self,
        job_id: int,
        *,
        stage: str,
        status: str = "queued",
        message: str | None = None,
    ) -> BackgroundJobStage:
        job_stage = BackgroundJobStage(
            job_id=job_id,
            stage=stage,
            status=status,
            message=message,
        )
        now = datetime.now(timezone.utc)
        if status == "running":
            job_stage.started_at = now
        elif status in {"succeeded", "failed", "skipped"}:
            job_stage.started_at = now
            job_stage.completed_at = now
        self.db.add(job_stage)
        self.db.commit()
        self.db.refresh(job_stage)
        return job_stage

    def mark_stage_running(
        self,
        job_id: int,
        *,
        stage: str,
        message: str | None = None,
    ) -> None:
        job_stage = self._get_or_create_stage(job_id, stage)
        now = datetime.now(timezone.utc)
        job_stage.status = "running"
        job_stage.message = message
        job_stage.error = None
        job_stage.started_at = job_stage.started_at or now
        job_stage.updated_at = now
        self.db.commit()

    def mark_stage_succeeded(
        self,
        job_id: int,
        *,
        stage: str,
        message: str | None = None,
    ) -> None:
        job_stage = self._get_or_create_stage(job_id, stage)
        now = datetime.now(timezone.utc)
        job_stage.status = "succeeded"
        job_stage.message = message
        job_stage.error = None
        job_stage.started_at = job_stage.started_at or now
        job_stage.completed_at = now
        job_stage.updated_at = now
        self.db.commit()

    def mark_stage_failed(self, job_id: int, *, stage: str, error: str) -> None:
        job_stage = self._get_or_create_stage(job_id, stage)
        now = datetime.now(timezone.utc)
        job_stage.status = "failed"
        job_stage.error = error
        job_stage.started_at = job_stage.started_at or now
        job_stage.completed_at = now
        job_stage.updated_at = now
        self.db.commit()

    def mark_stage_skipped(
        self,
        job_id: int,
        *,
        stage: str,
        message: str | None = None,
    ) -> None:
        job_stage = self._get_or_create_stage(job_id, stage)
        now = datetime.now(timezone.utc)
        job_stage.status = "skipped"
        job_stage.message = message
        job_stage.started_at = job_stage.started_at or now
        job_stage.completed_at = now
        job_stage.updated_at = now
        self.db.commit()

    def get_latest_for_owner(
        self,
        *,
        job_type: str,
        owner_type: str,
        owner_id: int,
    ) -> Optional[BackgroundJob]:
        return (
            self.db.query(BackgroundJob)
            .filter(
                BackgroundJob.job_type == job_type,
                BackgroundJob.owner_type == owner_type,
                BackgroundJob.owner_id == owner_id,
            )
            .order_by(BackgroundJob.created_at.desc(), BackgroundJob.id.desc())
            .first()
        )

    def list_stages(self, job_id: int) -> list[BackgroundJobStage]:
        return (
            self.db.query(BackgroundJobStage)
            .filter(BackgroundJobStage.job_id == job_id)
            .order_by(BackgroundJobStage.id.asc())
            .all()
        )

    def _get_job(self, job_id: int) -> Optional[BackgroundJob]:
        return self.db.query(BackgroundJob).filter(BackgroundJob.id == job_id).first()

    def _get_or_create_stage(self, job_id: int, stage: str) -> BackgroundJobStage:
        job_stage = (
            self.db.query(BackgroundJobStage)
            .filter(
                BackgroundJobStage.job_id == job_id,
                BackgroundJobStage.stage == stage,
            )
            .order_by(BackgroundJobStage.id.desc())
            .first()
        )
        if job_stage is not None:
            return job_stage
        job_stage = BackgroundJobStage(job_id=job_id, stage=stage, status="queued")
        self.db.add(job_stage)
        return job_stage


class BackgroundJobStageRecorder:
    def __init__(self, *, job_id: int, db_factory):
        self.job_id = job_id
        self.db_factory = db_factory

    def running(self, stage: str, message: str | None = None) -> None:
        self._record("mark_stage_running", stage, message=message)

    def succeeded(self, stage: str, message: str | None = None) -> None:
        self._record("mark_stage_succeeded", stage, message=message)

    def failed(self, stage: str, error: str) -> None:
        self._record("mark_stage_failed", stage, error=error)

    def skipped(self, stage: str, message: str | None = None) -> None:
        self._record("mark_stage_skipped", stage, message=message)

    def _record(self, method_name: str, stage: str, **kwargs) -> None:
        try:
            db = self.db_factory()
            try:
                service = BackgroundJobService(db)
                method = getattr(service, method_name)
                method(self.job_id, stage=stage, **kwargs)
            finally:
                db.close()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not record background job stage %s: %s", stage, exc)
