"""
Watchlist API Endpoints  [Phase 1]
------------------------------------
CRUD operations for the user's watchlist.

Phase 1 fields: ticker, name, tag, sector, target_price, notes
Phase 2 (planned): live price enrichment, analyst targets, 52-week data
"""

from fastapi import APIRouter, HTTPException
from app.core.dependencies import DbSession
from app.repositories.portfolio_repository import WatchlistRepository
from app.schemas.portfolio import WatchlistItem, WatchlistItemResponse

router = APIRouter(prefix="/watchlist", tags=["Watchlist"])


@router.get("/", response_model=list[WatchlistItemResponse], summary="Get watchlist")
async def get_watchlist(db: DbSession):
    repo = WatchlistRepository(db)
    return repo.get_all()


@router.post("/", response_model=WatchlistItemResponse, summary="Add to watchlist")
async def add_to_watchlist(item: WatchlistItem, db: DbSession):
    repo = WatchlistRepository(db)
    existing = repo.get_by_ticker(item.ticker.upper())
    if existing:
        raise HTTPException(status_code=409, detail=f"{item.ticker} is already in your watchlist.")
    return repo.add(
        ticker=item.ticker.upper(),
        name=item.name,
        tag=item.tag,
        sector=item.sector,
        target_price=item.target_price,
        notes=item.notes,
    )


@router.delete("/{ticker}", summary="Remove from watchlist")
async def remove_from_watchlist(ticker: str, db: DbSession):
    repo = WatchlistRepository(db)
    success = repo.remove(ticker.upper())
    if not success:
        raise HTTPException(status_code=404, detail=f"{ticker} not found in watchlist.")
    return {"success": True, "message": f"{ticker} removed from watchlist."}
