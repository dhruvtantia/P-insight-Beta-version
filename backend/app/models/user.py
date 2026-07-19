"""
SQLAlchemy ORM Model — User (tenancy owner)
--------------------------------------------
One row per authenticated Supabase user. `supabase_user_id` is the Supabase
auth UUID (the JWT `sub` claim) and is the stable external identity; the
integer `id` is our internal foreign-key target used on owned tables
(portfolios, watchlist, broker_connections).

Rows are created lazily on first authenticated request (get-or-create in
app.core.auth), so we never need Supabase's service key to provision users.
"""

from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime, timezone

from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # Supabase auth user id (JWT `sub`) — stable external identity.
    supabase_user_id = Column(String(64), nullable=False, unique=True, index=True)
    email = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<User id={self.id} sub={self.supabase_user_id!r} email={self.email!r}>"
