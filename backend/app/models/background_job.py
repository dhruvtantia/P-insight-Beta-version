"""
Background Job ORM Models
-------------------------
Durable status rows for asynchronous workflows kicked off by API requests.

This is intentionally small for the modular monolith: FastAPI BackgroundTasks
still executes the work, while this table makes scheduling/running/completion
observable across requests and backend restarts.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.database import Base


class BackgroundJob(Base):
    __tablename__ = "background_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_type = Column(String(80), nullable=False, index=True)
    owner_type = Column(String(50), nullable=False, index=True)
    owner_id = Column(Integer, nullable=False, index=True)

    status = Column(String(20), nullable=False, default="queued", index=True)
    stage = Column(String(80), nullable=True)
    message = Column(Text, nullable=True)
    error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<BackgroundJob id={self.id} type={self.job_type!r} "
            f"owner={self.owner_type}:{self.owner_id} status={self.status!r}>"
        )

    stages = relationship(
        "BackgroundJobStage",
        back_populates="job",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="BackgroundJobStage.id",
    )


class BackgroundJobStage(Base):
    __tablename__ = "background_job_stages"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(
        Integer,
        ForeignKey("background_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stage = Column(String(80), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="queued", index=True)
    message = Column(Text, nullable=True)
    error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    job = relationship("BackgroundJob", back_populates="stages")

    def __repr__(self) -> str:
        return (
            f"<BackgroundJobStage job_id={self.job_id} "
            f"stage={self.stage!r} status={self.status!r}>"
        )
