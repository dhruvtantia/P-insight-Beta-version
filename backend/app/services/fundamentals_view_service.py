"""
Fundamentals View Service
--------------------------
Single backend owner for all fundamentals computation:
  - Threshold constants (single source of truth for both backend and frontend)
  - Portfolio-weighted metrics computation
  - Threshold schema builder

Threshold constants are shipped to the frontend in every /analytics/ratios
response under the `thresholds` key. The frontend reads them and never
hardcodes them independently.

Design principle:
  If a threshold value changes (e.g. PE_FAIR_MAX adjusted for Indian market
  rerating), you change ONE Python constant here. The change propagates
  automatically to both backend commentary logic and the frontend's
  traffic-light coloring on next API call.
"""

import math
import logging
from typing import Optional

from app.schemas.portfolio import (
    FinancialRatioResponse,
    WeightedFundamentals,
    FundamentalsThresholds,
)

logger = logging.getLogger(__name__)

# ── P/E ratio thresholds ──────────────────────────────────────────────────────
PE_CHEAP        = 15.0   # below        → 'good'    (Cheap)
PE_FAIR_MAX     = 30.0   # 15 ≤ x < 30 → 'neutral' (Fair)
PE_ELEVATED_MAX = 50.0   # 30 ≤ x < 50 → 'warning' (Elevated); ≥ 50 → 'danger'

# ── PEG ratio thresholds ──────────────────────────────────────────────────────
PEG_UNDERVALUED = 1.0    # below        → 'good'    (Undervalued)
PEG_FAIR_MAX    = 2.0    # 1 ≤ x < 2   → 'neutral' (Fair)
PEG_PREMIUM_MAX = 3.0    # 2 ≤ x < 3   → 'warning' (Premium); ≥ 3 → 'danger'

# ── P/B ratio thresholds ──────────────────────────────────────────────────────
PB_BELOW_BOOK   = 1.0    # below        → 'good'    (Below Book)
PB_FAIR_MAX     = 4.0    # 1 ≤ x < 4   → 'neutral' (Fair)
PB_PREMIUM_MAX  = 10.0   # 4 ≤ x < 10  → 'warning' (Premium); ≥ 10 → 'danger'

# ── ROE thresholds (%) ────────────────────────────────────────────────────────
ROE_EXCELLENT   = 25.0   # ≥ 25         → 'good'    (Excellent)
ROE_GOOD        = 15.0   # ≥ 15         → 'good'    (Good)
ROE_MODERATE    = 8.0    # ≥ 8          → 'warning' (Moderate); < 8 → 'danger'

# ── ROA thresholds (%) ────────────────────────────────────────────────────────
ROA_EXCELLENT   = 15.0   # ≥ 15         → 'good'    (Excellent)
ROA_GOOD        = 8.0    # ≥ 8          → 'good'    (Good)
ROA_MODERATE    = 3.0    # ≥ 3          → 'warning' (Moderate); < 3 → 'danger'

# ── Margin thresholds — operating & net (%) ───────────────────────────────────
MARGIN_STRONG   = 20.0   # ≥ 20         → 'good'    (Strong)
MARGIN_MODERATE = 10.0   # ≥ 10         → 'neutral' (Moderate)
MARGIN_THIN     = 5.0    # ≥ 5          → 'warning' (Thin); < 5 → 'danger'

# ── Revenue / earnings growth thresholds (%) ─────────────────────────────────
GROWTH_HIGH     = 20.0   # ≥ 20         → 'good'    (High)
GROWTH_HEALTHY  = 8.0    # ≥ 8          → 'good'    (Healthy)
GROWTH_SLOW     = 0.0    # ≥ 0          → 'warning' (Slow); < 0 → 'danger'

# ── D/E ratio thresholds ──────────────────────────────────────────────────────
DTE_CONSERVATIVE = 0.5   # ≤ 0.5        → 'good'    (Conservative)
DTE_MODERATE     = 1.5   # ≤ 1.5        → 'neutral' (Moderate)
DTE_LEVERAGED    = 2.5   # ≤ 2.5        → 'warning' (Leveraged); > 2.5 → 'danger'

# ── Dividend yield thresholds (%) ─────────────────────────────────────────────
DIV_YIELD_HIGH     = 3.0  # ≥ 3.0       → 'good'    (High Yield)
DIV_YIELD_MODERATE = 1.0  # ≥ 1.0       → 'neutral' (Moderate); < 1.0 → 'neutral' (Low)

# ── Portfolio-level insight thresholds ────────────────────────────────────────
# Used by /analytics/commentary (backend) and lib/insights.ts (frontend).
# If these change, the commentary engine and frontend insight rules both update.
INSIGHT_PE_EXPENSIVE    = 30.0   # wtd PE >  this → "Premium Valuation" warning
INSIGHT_PE_CHEAP        = 18.0   # wtd PE ≤  this → "Attractively Valued" positive
INSIGHT_PEG_EXPENSIVE   = 2.0    # wtd PEG > this → "Growth Premium" info
INSIGHT_ROE_STRONG      = 20.0   # wtd ROE ≥ this → "Strong ROE" positive
INSIGHT_ROE_WEAK        = 12.0   # wtd ROE < this → "Below-Average ROE" warning
INSIGHT_MARGIN_THIN     = 10.0   # wtd net margin < this → "Thin Margins" info
INSIGHT_DIV_YIELD_SOLID = 2.0    # wtd div yield ≥ this → "Solid Income" positive
INSIGHT_DIV_YIELD_LOW   = 0.5    # wtd div yield < this → "Low Dividend" info


# ── Per-metric sanity limits for weighted aggregation ─────────────────────────
# Values outside these bounds are excluded from weighted averages.
# This prevents clearly bogus yfinance values (e.g. PE of 5000 for a company
# in brief EPS recovery, or negative PB for a distressed company) from
# pulling portfolio-level signals into misleading territory.
#
# Format: metric_name → (min_inclusive, max_inclusive)
# None = no limit on that side.
#
# Design notes:
#   - PE:  negative means loss-making (no PE by convention), cap at 300 for sanity.
#           Some high-quality growth stocks can legitimately hit PE 150–200.
#   - PEG: can be negative (loss-making) — cap at both ends.
#   - PB:  negative book value happens (financial companies in distress); exclude.
#   - D/E: banks naturally excluded by nulls; cap extreme non-bank leverage.
#   - Growth: ±95%/+2000% are plausible for recovery, so wide but not unlimited.

_SANITY_LIMITS: dict[str, tuple[Optional[float], Optional[float]]] = {
    "pe_ratio":         (0.0,    300.0),   # Negative PE → loss-making, exclude from avg
    "forward_pe":       (0.0,    300.0),   # Same
    "pb_ratio":         (0.0,     30.0),   # Negative PB = distressed, exclude; >30 = data error
    "ev_ebitda":        (0.0,    200.0),   # Negative EV/EBITDA unusual; >200 suspicious
    "peg_ratio":        (-5.0,    15.0),   # Wide range to allow loss-making / super-growth
    "dividend_yield":   (0.0,     30.0),   # >30% yield is almost certainly a data error
    "roe":              (-100.0, 200.0),   # >200% ROE is suspicious (leverage artefact)
    "roa":              (-100.0, 100.0),
    "operating_margin": (-100.0, 100.0),
    "profit_margin":    (-100.0, 100.0),
    "revenue_growth":   (-95.0,  500.0),   # >500% usually means very small base or error
    "earnings_growth":  (-95.0, 2000.0),   # EPS recovery from near-zero can be huge
    "debt_to_equity":   (0.0,     20.0),   # >20x D/E is extreme leverage; likely data error
}


# ── Schema builder ────────────────────────────────────────────────────────────

def build_thresholds() -> FundamentalsThresholds:
    """
    Assemble all threshold constants into the serialisable schema object
    that is shipped in every /analytics/ratios response.
    Frontend reads this; it never hardcodes its own threshold values.
    """
    return FundamentalsThresholds(
        # P/E
        pe_cheap        = PE_CHEAP,
        pe_fair_max     = PE_FAIR_MAX,
        pe_elevated_max = PE_ELEVATED_MAX,
        # PEG
        peg_undervalued = PEG_UNDERVALUED,
        peg_fair_max    = PEG_FAIR_MAX,
        peg_premium_max = PEG_PREMIUM_MAX,
        # P/B
        pb_below_book   = PB_BELOW_BOOK,
        pb_fair_max     = PB_FAIR_MAX,
        pb_premium_max  = PB_PREMIUM_MAX,
        # ROE
        roe_excellent   = ROE_EXCELLENT,
        roe_good        = ROE_GOOD,
        roe_moderate    = ROE_MODERATE,
        # ROA
        roa_excellent   = ROA_EXCELLENT,
        roa_good        = ROA_GOOD,
        roa_moderate    = ROA_MODERATE,
        # Margin
        margin_strong   = MARGIN_STRONG,
        margin_moderate = MARGIN_MODERATE,
        margin_thin     = MARGIN_THIN,
        # Growth
        growth_high     = GROWTH_HIGH,
        growth_healthy  = GROWTH_HEALTHY,
        growth_slow     = GROWTH_SLOW,
        # D/E
        dte_conservative = DTE_CONSERVATIVE,
        dte_moderate     = DTE_MODERATE,
        dte_leveraged    = DTE_LEVERAGED,
        # Div yield
        div_yield_high     = DIV_YIELD_HIGH,
        div_yield_moderate = DIV_YIELD_MODERATE,
        # Insight-level thresholds (portfolio-aggregate signals)
        insight_pe_expensive    = INSIGHT_PE_EXPENSIVE,
        insight_pe_cheap        = INSIGHT_PE_CHEAP,
        insight_peg_expensive   = INSIGHT_PEG_EXPENSIVE,
        insight_roe_strong      = INSIGHT_ROE_STRONG,
        insight_roe_weak        = INSIGHT_ROE_WEAK,
        insight_margin_thin     = INSIGHT_MARGIN_THIN,
        insight_div_yield_solid = INSIGHT_DIV_YIELD_SOLID,
        insight_div_yield_low   = INSIGHT_DIV_YIELD_LOW,
    )


# ── Weighted metrics computation ──────────────────────────────────────────────

def compute_weighted_metrics(
    ratios: list[FinancialRatioResponse],
    weights: dict[str, float],
) -> WeightedFundamentals:
    """
    Compute portfolio-weighted average fundamentals.

    Weighting strategy:
      - weight_i = market_value_i / total_portfolio_value
      - If a holding has null for a metric, it is excluded from that metric's average
      - Weights are re-normalised among non-null contributors so nulls don't bias toward zero
      - coverage[key] = count of holdings that contributed a non-null value
      - Values outside _SANITY_LIMITS are excluded and counted in outliers_excluded

    Bank holdings naturally have null ev_ebitda / operating_margin / debt_to_equity —
    this is correct, not missing data. They are rightly excluded from those metric averages.
    """

    def wtd_avg(metric_name: str) -> tuple[float | None, int, int]:
        """Returns (weighted_avg, included_count, outlier_count)."""
        weighted_sum = 0.0
        weight_sum   = 0.0
        count        = 0
        outliers     = 0

        limits = _SANITY_LIMITS.get(metric_name)
        lo = limits[0] if limits else None
        hi = limits[1] if limits else None

        for r in ratios:
            val = getattr(r, metric_name, None)
            if val is None:
                continue
            try:
                fval = float(val)
            except (TypeError, ValueError):
                continue
            if not math.isfinite(fval):
                continue
            # Sanity-limit check — log and skip outliers
            if lo is not None and fval < lo:
                logger.debug(
                    "Outlier excluded: %s.%s = %s (below min %s)",
                    r.ticker, metric_name, fval, lo,
                )
                outliers += 1
                continue
            if hi is not None and fval > hi:
                logger.debug(
                    "Outlier excluded: %s.%s = %s (above max %s)",
                    r.ticker, metric_name, fval, hi,
                )
                outliers += 1
                continue
            w = weights.get(r.ticker, 0.0)
            weighted_sum += w * fval
            weight_sum   += w
            count        += 1

        if count == 0 or weight_sum == 0:
            return None, 0, outliers
        # Re-normalise: divide by weight_sum (sum of non-null holders' weights only)
        return round(weighted_sum / weight_sum, 4), count, outliers

    pe,         pe_n,         pe_out         = wtd_avg("pe_ratio")
    fwd_pe,     fwd_pe_n,     fwd_pe_out     = wtd_avg("forward_pe")
    pb,         pb_n,         pb_out         = wtd_avg("pb_ratio")
    ev_ebitda,  ev_ebitda_n,  ev_ebitda_out  = wtd_avg("ev_ebitda")
    peg,        peg_n,        peg_out        = wtd_avg("peg_ratio")
    div_yield,  div_yield_n,  div_yield_out  = wtd_avg("dividend_yield")
    roe,        roe_n,        roe_out        = wtd_avg("roe")
    roa,        roa_n,        roa_out        = wtd_avg("roa")
    op_margin,  op_margin_n,  op_margin_out  = wtd_avg("operating_margin")
    pr_margin,  pr_margin_n,  pr_margin_out  = wtd_avg("profit_margin")
    rev_growth, rev_growth_n, rev_growth_out = wtd_avg("revenue_growth")
    ear_growth, ear_growth_n, ear_growth_out = wtd_avg("earnings_growth")
    dte,        dte_n,        dte_out        = wtd_avg("debt_to_equity")

    outliers_excluded = {
        k: v for k, v in {
            "pe":               pe_out,
            "forward_pe":       fwd_pe_out,
            "pb":               pb_out,
            "ev_ebitda":        ev_ebitda_out,
            "peg":              peg_out,
            "div_yield":        div_yield_out,
            "roe":              roe_out,
            "roa":              roa_out,
            "operating_margin": op_margin_out,
            "profit_margin":    pr_margin_out,
            "revenue_growth":   rev_growth_out,
            "earnings_growth":  ear_growth_out,
            "debt_to_equity":   dte_out,
        }.items()
        if v > 0  # only include metrics that actually had outliers excluded
    }

    return WeightedFundamentals(
        wtd_pe               = pe,
        wtd_forward_pe       = fwd_pe,
        wtd_pb               = pb,
        wtd_ev_ebitda        = ev_ebitda,
        wtd_peg              = peg,
        wtd_div_yield        = div_yield,
        wtd_roe              = roe,
        wtd_roa              = roa,
        wtd_operating_margin = op_margin,
        wtd_profit_margin    = pr_margin,
        wtd_revenue_growth   = rev_growth,
        wtd_earnings_growth  = ear_growth,
        wtd_debt_to_equity   = dte,
        coverage={
            "pe":               pe_n,
            "forward_pe":       fwd_pe_n,
            "pb":               pb_n,
            "ev_ebitda":        ev_ebitda_n,
            "peg":              peg_n,
            "div_yield":        div_yield_n,
            "roe":              roe_n,
            "roa":              roa_n,
            "operating_margin": op_margin_n,
            "profit_margin":    pr_margin_n,
            "revenue_growth":   rev_growth_n,
            "earnings_growth":  ear_growth_n,
            "debt_to_equity":   dte_n,
        },
        outliers_excluded=outliers_excluded,
    )
