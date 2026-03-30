"""
Portfolio Optimization Engine — Phase 1
----------------------------------------
Pure optimization modules for Modern Portfolio Theory.

Layer structure:
  types.py           — Dataclass inputs/outputs (no I/O)
  expected_returns.py — μ estimation from price history
  covariance.py      — Σ estimation from returns
  objectives.py      — Pure portfolio math (return, vol, Sharpe)
  frontier.py        — Min-variance, max-Sharpe, efficient frontier
  optimizer_service.py — Orchestrator (fetches data, calls modules)
"""
