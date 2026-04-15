"""
Portfolio History Models
-------------------------
Two tables for pre-computed, reusable time-series data.

PortfolioHistory
  Daily portfolio total value, computed at upload time from:
    holdings × historical close prices (yfinance 1y window)
  One row per (portfolio, date).  Cleared and rebuilt on each upload/refresh.
  Assumes current quantities were held throughout — label this for the user.

BenchmarkHistory
  Daily close prices for a benchmark index (default: ^NSEI / Nifty 50).
  Stored once and reused across all portfolios.
  One row per (ticker, date).

Why a DB table instead of in-memory:
  The quant service already downloads 1y data at analytics-page visit time,
  but discards it.  Persisting here means:
    - zero repeated yfinance calls for Changes page, future dashboard widgets, etc.
    - data survives backend restarts
    - single "fetch once" pattern instead of page-driven re-fetches
"""

from sqlalchemy import Column, Integer, String, Float, ForeignKey, UniqueConstraint

from app.db.database import Base


class PortfolioHistory(Base):
    __tablename__ = "portfolio_history"

    id           = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(
        Integer,
        ForeignKey("portfolios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date         = Column(String(10), nullable=False)   # YYYY-MM-DD
    total_value  = Column(Float, nullable=False)

    __table_args__ = (
        UniqueConstraint("portfolio_id", "date", name="uq_portfolio_history_date"),
    )

    def __repr__(self) -> str:
        return (
            f"<PortfolioHistory portfolio={self.portfolio_id}"
            f" date={self.date} value={self.total_value:.0f}>"
        )


class BenchmarkHistory(Base):
    __tablename__ = "benchmark_history"

    id          = Column(Integer, primary_key=True, index=True)
    ticker      = Column(String(20), nullable=False, index=True)   # e.g. "^NSEI"
    date        = Column(String(10), nullable=False)               # YYYY-MM-DD
    close_price = Column(Float, nullable=False)

    __table_args__ = (
        UniqueConstraint("ticker", "date", name="uq_benchmark_history_date"),
    )

    def __repr__(self) -> str:
        return f"<BenchmarkHistory ticker={self.ticker} date={self.date} close={self.close_price:.2f}>"
