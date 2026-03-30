"""
Broker Connectors Package
--------------------------
Provides a clean abstraction layer for external portfolio data sources.

Architecture:
  BrokerConnector (ABC)     ← base.py
  ZerodhaConnector          ← zerodha.py   [scaffold]
  IBKRConnector             ← ibkr.py      [scaffold]
  CONNECTOR_REGISTRY        ← registry.py

BrokerService (services/broker_service.py) uses this package
to connect, sync, and disconnect broker accounts without coupling
the API layer to any specific broker implementation.
"""
