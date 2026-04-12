"""
Portfolio Manager Service
--------------------------
Business logic for portfolio CRUD: create, list, activate, rename, delete.
Also handles the upload→persist pipeline (called by the upload endpoint).

Keeps persistence logic separate from analytics (PortfolioService handles analytics).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.portfolio import Portfolio, Holding
from app.repositories.portfolio_repository import PortfolioRepository
from app.schemas.portfolio import HoldingBase
from app.schemas.portfolio_mgmt import (
    PortfolioMeta,
    PortfolioListResponse,
    ActivateResponse,
    DeleteResponse,
    RefreshResponse,
)

logger = logging.getLogger(__name__)


class PortfolioManagerService:

    def __init__(self, db: Session):
        self.db   = db
        self.repo = PortfolioRepository(db)

    # ─── Listing ──────────────────────────────────────────────────────────────

    def list_portfolios(self) -> PortfolioListResponse:
        all_p = (
            self.db.query(Portfolio)
            .order_by(Portfolio.updated_at.desc())
            .all()
        )
        active_id = next((p.id for p in all_p if p.is_active), None)
        return PortfolioListResponse(
            portfolios=[self._to_meta(p) for p in all_p],
            active_id=active_id,
        )

    def get_active(self) -> Optional[Portfolio]:
        return (
            self.db.query(Portfolio)
            .filter(Portfolio.is_active == True)
            .first()
        )

    def get_by_id(self, portfolio_id: int) -> Optional[Portfolio]:
        return self.db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()

    # ─── Activation ───────────────────────────────────────────────────────────

    def activate(self, portfolio_id: int) -> ActivateResponse:
        """Set portfolio_id as active. All others are deactivated."""
        target = self.get_by_id(portfolio_id)
        if target is None:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        prev_active = self.get_active()
        self.db.query(Portfolio).update({Portfolio.is_active: False})
        target.is_active = True
        target.updated_at = datetime.now(timezone.utc)
        self.db.commit()

        return ActivateResponse(
            success=True,
            activated_id=target.id,
            activated_name=target.name,
            previously_active=prev_active.id if prev_active else None,
        )

    # ─── Rename ───────────────────────────────────────────────────────────────

    def rename(self, portfolio_id: int, name: str) -> Optional[PortfolioMeta]:
        p = self.get_by_id(portfolio_id)
        if p is None:
            return None
        p.name = name.strip()
        p.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(p)
        return self._to_meta(p)

    # ─── Delete ───────────────────────────────────────────────────────────────

    def delete(self, portfolio_id: int) -> DeleteResponse:
        p = self.get_by_id(portfolio_id)
        if p is None:
            return DeleteResponse(
                success=False, deleted_id=portfolio_id, message="Portfolio not found"
            )
        was_active = p.is_active
        self.db.delete(p)
        self.db.commit()

        if was_active:
            latest = (
                self.db.query(Portfolio)
                .order_by(Portfolio.updated_at.desc())
                .first()
            )
            if latest:
                latest.is_active = True
                self.db.commit()

        return DeleteResponse(
            success=True,
            deleted_id=portfolio_id,
            message=f"Portfolio '{p.name}' deleted.",
        )

    # ─── Upload persist pipeline ──────────────────────────────────────────────

    def save_uploaded_portfolio(
        self,
        holdings: list[HoldingBase],
        filename: str,
        name: Optional[str] = None,
    ) -> Portfolio:
        """
        Persist a confirmed upload as a Portfolio + holdings in the DB.
        Sets is_active=True and deactivates all others.
        Returns the created Portfolio ORM object.
        """
        now = datetime.now(timezone.utc)
        portfolio_name = name or f"Upload — {filename}"

        self.db.query(Portfolio).update({Portfolio.is_active: False})

        meta = json.dumps({
            "filename":    filename,
            "row_count":   len(holdings),
            "import_time": now.isoformat(),
        })

        p = Portfolio(
            name=portfolio_name,
            source="uploaded",
            is_active=True,
            upload_filename=filename,
            description=f"Uploaded from {filename}",
            last_synced_at=now,
            source_metadata=meta,
        )
        self.db.add(p)
        self.db.flush()

        db_holdings = [
            Holding(
                portfolio_id=p.id,
                ticker=h.ticker,
                name=h.name,
                quantity=h.quantity,
                average_cost=h.average_cost,
                current_price=h.current_price,
                sector=h.sector,
                industry=getattr(h, "industry", None),
                purchase_date=getattr(h, "purchase_date", None),
                asset_class=h.asset_class or "Equity",
                currency=h.currency or "INR",
            )
            for h in holdings
        ]
        self.db.add_all(db_holdings)
        self.db.commit()
        self.db.refresh(p)

        logger.info(
            "Saved uploaded portfolio '%s' (id=%s) with %d holdings",
            p.name, p.id, len(db_holdings),
        )
        return p

    # ─── Refresh / re-import ─────────────────────────────────────────────────

    def refresh_portfolio(
        self,
        portfolio_id: int,
        holdings: list[HoldingBase],
        filename: str,
    ) -> tuple[Portfolio, Optional[int], Optional[int]]:
        """
        Replace an existing uploaded portfolio's holdings with new data.

        Steps:
          1. Capture a pre-refresh snapshot (preserves history)
          2. Delete existing holdings
          3. Insert new holdings
          4. Update source metadata + last_synced_at
          5. Capture a post-refresh snapshot
          6. Return (updated portfolio, pre_snap_id, post_snap_id)
        """
        from app.services.snapshot_service import SnapshotService

        p = self.get_by_id(portfolio_id)
        if p is None:
            raise ValueError(f"Portfolio {portfolio_id} not found")
        if p.source not in ("uploaded", "broker"):
            raise ValueError(f"Portfolio '{p.name}' (source={p.source}) is not refreshable")

        snap_svc = SnapshotService(self.db)
        now = datetime.now(timezone.utc)

        # 1. Pre-refresh snapshot (capture the "before" state)
        pre_snap_id: Optional[int] = None
        try:
            pre_snap = snap_svc.capture(p.id, label=f"Pre-refresh ({filename})")
            pre_snap_id = pre_snap.id
        except Exception as exc:
            logger.warning("Could not create pre-refresh snapshot: %s", exc)

        # 2. Replace all holdings
        self.db.query(Holding).filter(Holding.portfolio_id == p.id).delete()
        new_holdings = [
            Holding(
                portfolio_id=p.id,
                ticker=h.ticker,
                name=h.name,
                quantity=h.quantity,
                average_cost=h.average_cost,
                current_price=h.current_price,
                sector=h.sector,
                industry=getattr(h, "industry", None),
                purchase_date=getattr(h, "purchase_date", None),
                asset_class=h.asset_class or "Equity",
                currency=h.currency or "INR",
            )
            for h in holdings
        ]
        self.db.add_all(new_holdings)

        # 3. Update source metadata
        meta = json.dumps({
            "filename":     filename,
            "row_count":    len(holdings),
            "import_time":  now.isoformat(),
        })
        p.upload_filename  = filename
        p.last_synced_at   = now
        p.source_metadata  = meta
        p.updated_at       = now
        self.db.commit()
        self.db.refresh(p)

        # 4. Post-refresh snapshot
        post_snap_id: Optional[int] = None
        try:
            post_snap = snap_svc.capture(p.id, label=f"Post-refresh ({filename})")
            post_snap_id = post_snap.id
        except Exception as exc:
            logger.warning("Could not create post-refresh snapshot: %s", exc)

        logger.info(
            "Refreshed portfolio '%s' (id=%s): %d holdings from '%s'",
            p.name, p.id, len(new_holdings), filename,
        )
        return p, pre_snap_id, post_snap_id

    # ─── Post-import enrichment persistence ──────────────────────────────────

    def patch_holdings_enrichment(
        self,
        portfolio_id: int,
        records: "list",   # list[EnrichmentRecord] — imported lazily to avoid circulars
    ) -> int:
        """
        Persist enrichment results (sector, name, industry, and all metadata fields)
        back to the DB so the data survives backend restarts.

        Accepts a list of EnrichmentRecord objects (from sector_enrichment.py).
        Only non-None / non-empty values overwrite existing DB values.

        Returns the count of DB rows actually updated.
        """
        if not records:
            return 0

        holdings_by_ticker: dict[str, Holding] = {
            h.ticker: h
            for h in self.db.query(Holding).filter(Holding.portfolio_id == portfolio_id).all()
        }

        updated = 0
        for rec in records:
            db_h = holdings_by_ticker.get(rec.ticker)
            if db_h is None:
                continue
            changed = False

            # ── Resolved sector ────────────────────────────────────────────────
            if rec.sector_source and rec.sector_status not in ("from_file",):
                if not db_h.sector or db_h.sector == "Unknown":
                    db_h.sector = rec.sector_source
                    changed = True

            # ── Resolved name ──────────────────────────────────────────────────
            if rec.name_source and rec.name_status not in ("from_file", "ticker_fallback"):
                if not db_h.name or db_h.name == db_h.ticker:
                    db_h.name = rec.name_source
                    changed = True

            # ── Industry ───────────────────────────────────────────────────────
            if rec.industry_source and not db_h.industry:
                db_h.industry = rec.industry_source
                changed = True

            # ── Enrichment metadata (always written) ───────────────────────────
            db_h.normalized_ticker = rec.normalized_ticker
            db_h.sector_status     = rec.sector_status
            db_h.name_status       = rec.name_status
            db_h.enrichment_reason = rec.enrichment_reason
            changed = True   # always mark changed to persist metadata

            if changed:
                updated += 1

        if updated:
            self.db.commit()
            logger.info(
                "Patched %d/%d holdings with enrichment data (portfolio_id=%s)",
                updated, len(records), portfolio_id,
            )
        return updated

    # ─── Create manual portfolio ──────────────────────────────────────────────

    def create_manual(self, name: str, description: Optional[str] = None) -> Portfolio:
        """Create an empty manual portfolio (no holdings yet)."""
        p = Portfolio(
            name=name,
            source="manual",
            is_active=False,
            description=description,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)
        return p

    # ─── Internal helpers ─────────────────────────────────────────────────────

    def _to_meta(self, p: Portfolio) -> PortfolioMeta:
        num_holdings = (
            self.db.query(Holding)
            .filter(Holding.portfolio_id == p.id)
            .count()
        )
        return PortfolioMeta(
            id=p.id,
            name=p.name,
            source=p.source,
            is_active=p.is_active,
            description=p.description,
            upload_filename=p.upload_filename,
            num_holdings=num_holdings,
            last_synced_at=getattr(p, "last_synced_at", None),
            source_metadata=getattr(p, "source_metadata", None),
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
