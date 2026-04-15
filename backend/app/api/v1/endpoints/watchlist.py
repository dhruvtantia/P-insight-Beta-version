"""
Watchlist API Endpoints
------------------------
CRUD + update operations for the user's watchlist.

Fields: ticker, name, tag, sector, target_price, notes
PATCH /{ticker} allows partial updates without delete-and-recreate.
"""

from fastapi import APIRouter, HTTPException
from app.core.dependencies import DbSession
from app.repositories.portfolio_repository import WatchlistRepository
from app.schemas.portfolio import WatchlistItem, WatchlistItemResponse, WatchlistItemUpdate

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


@router.patch("/{ticker}", response_model=WatchlistItemResponse, summary="Update watchlist entry")
async def update_watchlist_item(ticker: str, payload: WatchlistItemUpdate, db: DbSession):
    """
    Partially update a watchlist entry. Only fields present in the request body
    are changed — omitted fields are left as-is.

    Updatable fields: name, tag, sector, target_price, notes.
    Ticker cannot be changed (use delete + re-add instead).
    """
    repo = WatchlistRepository(db)
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    updated = repo.update(ticker.upper(), updates)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"{ticker} not found in watchlist.")
    return updated


@router.delete("/{ticker}", summary="Remove from watchlist")
async def remove_from_watchlist(ticker: str, db: DbSession):
    repo = WatchlistRepository(db)
    success = repo.remove(ticker.upper())
    if not success:
        raise HTTPException(status_code=404, detail=f"{ticker} not found in watchlist.")
    return {"success": True, "message": f"{ticker} removed from watchlist."}
