"""
Isolated upload module candidate.

This module is intentionally internal. It does not replace the public V2 upload
routes. Instead, it wraps the existing V2 primitives behind explicit service
contracts so the candidate flow can be tested against V2 before any traffic is
switched to it.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

from fastapi import BackgroundTasks

from app.data_providers.file_provider import UPLOADS_PATH
from app.ingestion.column_detector import (
    OPTIONAL_FIELDS,
    REQUIRED_FIELDS,
    detect_columns,
)
from app.ingestion.normalizer import (
    missing_optional_columns,
    preview_rows,
    read_file_as_dataframe,
)
from app.schemas.portfolio import HoldingBase
from app.schemas.upload_v2 import (
    HoldingEnrichmentStatus,
    RejectedRow,
    V2ConfirmResponse,
    V2StatusResponse,
    WarningRow,
)
from app.services.post_upload_workflow import PostUploadWorkflow, UploadCompleted
from app.services.upload_v2_service import (
    build_v2_response,
    classify_rows_v2,
    get_enrichment_status,
    persist_base_portfolio,
    run_background_enrichment,
)


class UploadModuleContractError(ValueError):
    """Raised when the internal upload module receives an invalid contract."""


@dataclass(frozen=True)
class UploadParseRequest:
    file_path: Path


@dataclass(frozen=True)
class UploadParseResult:
    column_names: list[str]
    detected_mapping: dict[str, Optional[str]]
    ambiguous_fields: list[str]
    high_confidence: bool
    preview_rows: list[dict]
    row_count: int
    missing_optional: list[str]
    required_fields: list[str]
    optional_fields: list[str]


@dataclass(frozen=True)
class UploadConfirmRequest:
    file_path: Path
    filename: str
    column_mapping: dict[str, Optional[str]]
    schedule_background_work: bool = True


@dataclass(frozen=True)
class UploadValidationResult:
    accepted: list[HoldingBase]
    rejected: list[RejectedRow]
    warning_rows: list[WarningRow]
    total_rows: int

    @property
    def rows_valid(self) -> int:
        return max(len(self.accepted) - len(self.warning_rows), 0)

    @property
    def rows_valid_with_warning(self) -> int:
        return len(self.warning_rows)

    @property
    def rows_invalid(self) -> int:
        return len(self.rejected)


@dataclass(frozen=True)
class UploadEnrichmentJob:
    portfolio_id: int
    holdings: list[HoldingBase]
    filename: str


@dataclass(frozen=True)
class UploadConfirmResult:
    portfolio_id: int
    filename: str
    validation: UploadValidationResult
    enrichment_job: Optional[UploadEnrichmentJob]
    v2_response: V2ConfirmResponse


@dataclass(frozen=True)
class UploadModuleStatus:
    portfolio_id: int
    total_holdings: int
    enriched: int
    partial: int
    pending: int
    failed: int
    enrichment_complete: bool
    overall: str
    holdings: list[HoldingEnrichmentStatus]

    @classmethod
    def from_v2_status(cls, status: V2StatusResponse) -> "UploadModuleStatus":
        return cls(
            portfolio_id=status.portfolio_id,
            total_holdings=status.total_holdings,
            enriched=status.enriched,
            partial=status.partial,
            pending=status.pending,
            failed=status.failed,
            enrichment_complete=status.enrichment_complete,
            overall=status.overall,
            holdings=status.holdings,
        )


class IsolatedUploadModule:
    """
    Candidate upload module with stable internal contracts.

    The public V2 API remains the source of production behavior. This service
    exists so tests can compare the candidate module with V2 before replacement.
    """

    def __init__(
        self,
        db_factory: Callable,
        *,
        background_tasks: Optional[BackgroundTasks] = None,
        uploads_path: Path = UPLOADS_PATH,
        workflow_factory: Callable = PostUploadWorkflow,
        enrichment_task: Callable = run_background_enrichment,
    ) -> None:
        self.db_factory = db_factory
        self.background_tasks = background_tasks
        self.uploads_path = uploads_path
        self.workflow_factory = workflow_factory
        self.enrichment_task = enrichment_task

    def parse_file(self, request: UploadParseRequest) -> UploadParseResult:
        df = read_file_as_dataframe(request.file_path)
        if df.empty or len(df.columns) == 0:
            raise UploadModuleContractError("The uploaded file is empty.")

        detection = detect_columns(list(df.columns))
        return UploadParseResult(
            column_names=list(df.columns),
            detected_mapping=detection.mapping,
            ambiguous_fields=detection.ambiguous_fields,
            high_confidence=detection.confidence,
            preview_rows=preview_rows(df, detection.mapping, n=6),
            row_count=len(df),
            missing_optional=missing_optional_columns(detection.mapping),
            required_fields=sorted(REQUIRED_FIELDS),
            optional_fields=sorted(OPTIONAL_FIELDS),
        )

    def validate_file(self, request: UploadConfirmRequest) -> UploadValidationResult:
        self._validate_required_mapping(request.column_mapping)
        df = read_file_as_dataframe(request.file_path)
        if df.empty:
            raise UploadModuleContractError("The uploaded file has no data rows.")

        accepted, rejected, warning_rows = classify_rows_v2(df, request.column_mapping)
        return UploadValidationResult(
            accepted=accepted,
            rejected=rejected,
            warning_rows=warning_rows,
            total_rows=len(df),
        )

    def confirm(self, request: UploadConfirmRequest) -> UploadConfirmResult:
        validation = self.validate_file(request)
        if not validation.accepted:
            raise UploadModuleContractError(
                f"No valid rows could be parsed. {len(validation.rejected)} row(s) had errors."
            )

        db = self.db_factory()
        try:
            portfolio_id = persist_base_portfolio(
                validation.accepted,
                request.filename,
                db,
            )
        finally:
            db.close()

        enrichment_job = UploadEnrichmentJob(
            portfolio_id=portfolio_id,
            holdings=list(validation.accepted),
            filename=request.filename,
        )

        if request.schedule_background_work and self.background_tasks is not None:
            self._schedule_post_upload_workflow(enrichment_job)

        return UploadConfirmResult(
            portfolio_id=portfolio_id,
            filename=request.filename,
            validation=validation,
            enrichment_job=enrichment_job,
            v2_response=build_v2_response(
                portfolio_id=portfolio_id,
                filename=request.filename,
                accepted=validation.accepted,
                rejected=validation.rejected,
                warning_rows=validation.warning_rows,
                total_rows=validation.total_rows,
            ),
        )

    def get_status(self, portfolio_id: int) -> UploadModuleStatus:
        db = self.db_factory()
        try:
            return UploadModuleStatus.from_v2_status(get_enrichment_status(portfolio_id, db))
        finally:
            db.close()

    def _schedule_post_upload_workflow(self, job: UploadEnrichmentJob) -> None:
        workflow = self.workflow_factory(
            background_tasks=self.background_tasks,
            db_factory=self.db_factory,
            uploads_path=self.uploads_path,
            enrichment_task=self.enrichment_task,
        )
        workflow.run(
            UploadCompleted(
                portfolio_id=job.portfolio_id,
                holdings=job.holdings,
                filename=job.filename,
            )
        )

    @staticmethod
    def _validate_required_mapping(column_mapping: dict[str, Optional[str]]) -> None:
        missing_required = [field for field in REQUIRED_FIELDS if column_mapping.get(field) is None]
        if missing_required:
            raise UploadModuleContractError(
                f"Required columns are not mapped: {sorted(missing_required)}"
            )
