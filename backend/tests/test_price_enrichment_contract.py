import pandas as pd
from types import SimpleNamespace


def test_persist_price_outcomes_preserves_uploaded_current_price_on_provider_failure():
    from app.db.database import SessionLocal
    from app.models.portfolio import Holding, Portfolio
    from app.services.price_enrichment_service import persist_price_outcomes

    db = SessionLocal()
    try:
        portfolio = Portfolio(name="Uploaded Price", source="uploaded", is_active=True)
        db.add(portfolio)
        db.flush()
        db.add(
            Holding(
                portfolio_id=portfolio.id,
                ticker="INFY",
                name="Infosys",
                quantity=4,
                average_cost=1400,
                current_price=1500,
                price_status="uploaded_current_price",
                price_source="uploaded_csv",
            )
        )
        db.commit()

        persist_price_outcomes(
            db=db,
            portfolio_id=portfolio.id,
            requested_tickers=["INFY"],
            prices={},
            failure_reason="yfinance unavailable",
        )

        holding = db.query(Holding).filter(Holding.ticker == "INFY").one()
        assert holding.current_price == 1500
        assert holding.price_status == "uploaded_current_price"
        assert holding.price_source == "uploaded_csv"
        assert holding.price_failure_reason is None
    finally:
        db.close()


def test_persist_price_outcomes_overwrites_successful_live_price_only():
    from app.db.database import SessionLocal
    from app.models.portfolio import Holding, Portfolio
    from app.services.price_enrichment_service import persist_price_outcomes

    db = SessionLocal()
    try:
        portfolio = Portfolio(name="Mixed Prices", source="uploaded", is_active=True)
        db.add(portfolio)
        db.flush()
        db.add_all(
            [
                Holding(
                    portfolio_id=portfolio.id,
                    ticker="TCS",
                    name="TCS",
                    quantity=2,
                    average_cost=3500,
                    current_price=None,
                ),
                Holding(
                    portfolio_id=portfolio.id,
                    ticker="BADTICKER",
                    name="Bad Ticker",
                    quantity=3,
                    average_cost=100,
                    current_price=None,
                ),
            ]
        )
        db.commit()

        persist_price_outcomes(
            db=db,
            portfolio_id=portfolio.id,
            requested_tickers=["TCS", "BADTICKER"],
            prices={"TCS": 3210.5},
        )

        by_ticker = {
            holding.ticker: holding
            for holding in db.query(Holding).filter(Holding.portfolio_id == portfolio.id).all()
        }
        assert by_ticker["TCS"].current_price == 3210.5
        assert by_ticker["TCS"].price_status == "live"
        assert by_ticker["TCS"].price_source == "yfinance"
        assert by_ticker["TCS"].price_timestamp is not None
        assert by_ticker["TCS"].price_failure_reason is None
        assert by_ticker["BADTICKER"].current_price is None
        assert by_ticker["BADTICKER"].price_status == "missing"
        assert by_ticker["BADTICKER"].price_source == "yfinance"
        assert by_ticker["BADTICKER"].price_timestamp is not None
        assert by_ticker["BADTICKER"].price_failure_reason is None
    finally:
        db.close()


def test_persist_price_outcomes_marks_unpriced_rows_provider_failed_when_provider_fails():
    from app.db.database import SessionLocal
    from app.models.portfolio import Holding, Portfolio
    from app.services.price_enrichment_service import persist_price_outcomes

    db = SessionLocal()
    try:
        portfolio = Portfolio(name="Provider Failure", source="uploaded", is_active=True)
        db.add(portfolio)
        db.flush()
        db.add(
            Holding(
                portfolio_id=portfolio.id,
                ticker="BADTICKER",
                name="Bad Ticker",
                quantity=3,
                average_cost=100,
                current_price=None,
            )
        )
        db.commit()

        persist_price_outcomes(
            db=db,
            portfolio_id=portfolio.id,
            requested_tickers=["BADTICKER"],
            prices={},
            failure_reason="live price fetch timed out after 25s",
        )

        holding = db.query(Holding).filter(Holding.ticker == "BADTICKER").one()
        assert holding.current_price is None
        assert holding.price_status == "provider_failed"
        assert holding.price_source == "yfinance"
        assert holding.price_timestamp is not None
        assert holding.price_failure_reason == "live price fetch timed out after 25s"
    finally:
        db.close()


def test_live_price_batch_resolves_bare_indian_ticker(monkeypatch):
    import app.data_providers.live_provider as live_provider

    captured = {}

    def fake_download(tickers, **_kwargs):
        captured["tickers"] = tickers
        return pd.DataFrame(
            [[3210.5, None, None]],
            columns=pd.MultiIndex.from_product([["Close"], ["TCS.NS", "TCS.BO", "TCS"]]),
        )

    monkeypatch.setattr(live_provider, "YFINANCE_AVAILABLE", True)
    if hasattr(live_provider, "yf"):
        monkeypatch.setattr(live_provider.yf, "download", fake_download)
    else:
        monkeypatch.setattr(live_provider, "yf", SimpleNamespace(download=fake_download))

    prices = live_provider._fetch_live_prices_batch(["TCS"])

    assert captured["tickers"] == ["TCS.NS", "TCS.BO", "TCS"]
    assert prices == {"TCS": 3210.5}


def test_live_price_batch_resolves_bo_ticker_before_ns(monkeypatch):
    import app.data_providers.live_provider as live_provider

    captured = {}

    def fake_download(tickers, **_kwargs):
        captured["tickers"] = tickers
        return pd.DataFrame(
            [[None, 875.25]],
            columns=pd.MultiIndex.from_product([["Close"], ["SBIN.BO", "SBIN.NS"]]),
        )

    monkeypatch.setattr(live_provider, "YFINANCE_AVAILABLE", True)
    if hasattr(live_provider, "yf"):
        monkeypatch.setattr(live_provider.yf, "download", fake_download)
    else:
        monkeypatch.setattr(live_provider, "yf", SimpleNamespace(download=fake_download))

    prices = live_provider._fetch_live_prices_batch(["SBIN.BO"])

    assert captured["tickers"] == ["SBIN.BO", "SBIN.NS"]
    assert prices == {"SBIN.BO": 875.25}


def test_live_price_batch_keeps_non_indian_dotted_ticker_bounded(monkeypatch):
    import app.data_providers.live_provider as live_provider

    captured = {}

    def fake_download(tickers, **_kwargs):
        captured["tickers"] = tickers
        return pd.DataFrame({"Close": [412.2]})

    monkeypatch.setattr(live_provider, "YFINANCE_AVAILABLE", True)
    if hasattr(live_provider, "yf"):
        monkeypatch.setattr(live_provider.yf, "download", fake_download)
    else:
        monkeypatch.setattr(live_provider, "yf", SimpleNamespace(download=fake_download))

    prices = live_provider._fetch_live_prices_batch(["BRK.B"])

    assert captured["tickers"] == ["BRK.B"]
    assert prices == {"BRK.B": 412.2}
