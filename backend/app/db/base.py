"""SQLAlchemy declarative base re-export.

Target modules should import Base from this path during the rebuild.
"""

from app.db.database import Base

__all__ = ["Base"]

