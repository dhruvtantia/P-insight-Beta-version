# Register all ORM models so SQLAlchemy sees them before create_all
from app.models import portfolio        # noqa: F401
from app.models import snapshot         # noqa: F401
from app.models import broker_connection  # noqa: F401
