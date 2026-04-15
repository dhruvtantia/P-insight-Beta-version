"""
Portfolio Repository — Data Access Layer
------------------------------------------
All database read/write operations for portfolios and holdings go here.
Services call repositories. Routes call services. Routes never touch the DB directly.

This pattern means:
  - Swapping databases = only update this file
  - Testing services = mock this file
  - Business logic never mixes with SQL
"""

from sqlalchemy.orm import Session
from typing import Optional

from app.models.portfolio import Portfolio, Holding, Watchlist
from app.schemas.portfolio import PortfolioCreate, HoldingCreate


class PortfolioRepository:
    """Handles all database operations for Portfolio and Holding models."""

    def __init__(self, db: Session):
        self.db = db

    # ─── Portfolio CRUD ───────────────────────────────────────────────────────

    def get_by_id(self, portfolio_id: int) -> Optional[Portfolio]:
        return self.db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()

    def get_all(self) -> list[Portfolio]:
        return self.db.query(Portfolio).all()

    def get_latest(self) -> Optional[Portfolio]:
        return (
            self.db.query(Portfolio)
            .order_by(Portfolio.updated_at.desc())
            .first()
        )

    def create(self, data: PortfolioCreate) -> Portfolio:
        portfolio = Portfolio(**data.model_dump())
        self.db.add(portfolio)
        self.db.commit()
        self.db.refresh(portfolio)
        return portfolio

    def delete(self, portfolio_id: int) -> bool:
        portfolio = self.get_by_id(portfolio_id)
        if not portfolio:
            return False
        self.db.delete(portfolio)
        self.db.commit()
        return True

    # ─── Holdings CRUD ────────────────────────────────────────────────────────

    def add_holding(self, portfolio_id: int, data: HoldingCreate) -> Holding:
        holding = Holding(portfolio_id=portfolio_id, **data.model_dump())
        self.db.add(holding)
        self.db.commit()
        self.db.refresh(holding)
        return holding

    def add_holdings_bulk(
        self, portfolio_id: int, holdings: list[HoldingCreate]
    ) -> list[Holding]:
        db_holdings = [
            Holding(portfolio_id=portfolio_id, **h.model_dump()) for h in holdings
        ]
        self.db.add_all(db_holdings)
        self.db.commit()
        return db_holdings

    def get_holdings_by_portfolio(self, portfolio_id: int) -> list[Holding]:
        return (
            self.db.query(Holding)
            .filter(Holding.portfolio_id == portfolio_id)
            .all()
        )

    def delete_holdings_for_portfolio(self, portfolio_id: int) -> int:
        count = (
            self.db.query(Holding)
            .filter(Holding.portfolio_id == portfolio_id)
            .delete()
        )
        self.db.commit()
        return count


class WatchlistRepository:
    """Handles all database operations for the Watchlist model. (Phase 2 scaffold)"""

    def __init__(self, db: Session):
        self.db = db

    def get_all(self) -> list[Watchlist]:
        return self.db.query(Watchlist).order_by(Watchlist.added_at.desc()).all()

    def get_by_ticker(self, ticker: str) -> Optional[Watchlist]:
        return self.db.query(Watchlist).filter(Watchlist.ticker == ticker).first()

    def add(
        self,
        ticker:       str,
        name:         Optional[str]   = None,
        tag:          Optional[str]   = "General",
        sector:       Optional[str]   = None,
        target_price: Optional[float] = None,
        notes:        Optional[str]   = None,
    ) -> Watchlist:
        item = Watchlist(
            ticker=ticker,
            name=name,
            tag=tag,
            sector=sector,
            target_price=target_price,
            notes=notes,
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def update(self, ticker: str, updates: dict) -> Optional["Watchlist"]:
        """Partially update a watchlist item. Only keys present in `updates` are changed."""
        item = self.get_by_ticker(ticker)
        if not item:
            return None
        allowed = {"name", "tag", "sector", "target_price", "notes"}
        for key, value in updates.items():
            if key in allowed:
                setattr(item, key, value)
        self.db.commit()
        self.db.refresh(item)
        return item

    def remove(self, ticker: str) -> bool:
        item = self.get_by_ticker(ticker)
        if not item:
            return False
        self.db.delete(item)
        self.db.commit()
        return True
