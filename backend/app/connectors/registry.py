"""
Connector Registry
-------------------
Maps broker slug strings to connector classes and exposes
a list of all available connectors with their metadata.

To add a new connector:
  1. Create backend/app/connectors/my_broker.py with MyBrokerConnector(BrokerConnector)
  2. Add an entry to CONNECTOR_REGISTRY below
  3. The GET /brokers/ endpoint will automatically include it

Order in CONNECTOR_REGISTRY determines display order in the UI.
"""

from app.connectors.base import BrokerConnector, ConnectorInfo
from app.connectors.zerodha import ZerodhaConnector
from app.connectors.ibkr import IBKRConnector

# ─── Registry ─────────────────────────────────────────────────────────────────
# Maps broker_name slug → connector class (not instance — instantiate per-request)

CONNECTOR_REGISTRY: dict[str, type[BrokerConnector]] = {
    "zerodha": ZerodhaConnector,
    "ibkr":    IBKRConnector,
}


def list_connectors() -> list[ConnectorInfo]:
    """Return ConnectorInfo for every registered connector."""
    return [cls().get_info() for cls in CONNECTOR_REGISTRY.values()]


def get_connector(broker_name: str) -> BrokerConnector:
    """
    Instantiate and return a connector by broker slug.
    Raises KeyError if the broker_name is not registered.
    """
    cls = CONNECTOR_REGISTRY.get(broker_name)
    if cls is None:
        available = list(CONNECTOR_REGISTRY.keys())
        raise KeyError(
            f"Unknown broker '{broker_name}'. Available: {available}"
        )
    return cls()
