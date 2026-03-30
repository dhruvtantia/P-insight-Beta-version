import { DataModeConfig } from '@/types'

// ─── Data Modes ───────────────────────────────────────────────────────────────

export const DATA_MODES: DataModeConfig[] = [
  {
    value: 'mock',
    label: 'Mock Data',
    description: 'Use built-in sample Indian equity portfolio',
    enabled: true,
  },
  {
    value: 'uploaded',
    label: 'Uploaded Portfolio',
    description: 'Use your uploaded Excel or CSV file',
    enabled: true,
  },
  {
    value: 'live',
    label: 'Live API Data',
    description: 'Real-time market data via Yahoo Finance (yfinance)',
    enabled: true,
    badge: 'Beta',
  },
  {
    value: 'broker',
    label: 'Broker Sync',
    description: 'Sync directly from Zerodha, Groww, or Fyers',
    enabled: false,
    badge: 'Phase 3',
  },
]

// ─── Sector Colors ────────────────────────────────────────────────────────────
// Used for consistent color mapping across all sector charts

export const SECTOR_COLORS: Record<string, string> = {
  'Information Technology': '#6366f1',   // Indigo
  'Financials':             '#3b82f6',   // Blue
  'Energy':                 '#f59e0b',   // Amber
  'Consumer Staples':       '#10b981',   // Emerald
  'Consumer Discretionary': '#ec4899',   // Pink
  'Healthcare':             '#14b8a6',   // Teal
  'Communication Services': '#8b5cf6',   // Violet
  'Industrials':            '#f97316',   // Orange
  'Materials':              '#84cc16',   // Lime
  'Real Estate':            '#ef4444',   // Red
  'Utilities':              '#6b7280',   // Gray
  'Unknown':                '#9ca3af',
}

export const DEFAULT_SECTOR_COLOR = '#94a3b8'

// ─── Watchlist Tags ───────────────────────────────────────────────────────────
// Conviction/category labels for watchlist items.
// These string values must mirror the WatchlistTag union type in @/types.
// Colours are Tailwind utility strings (bg + text + border) for each tag.

export const WATCHLIST_TAGS = [
  'General',
  'High Conviction',
  'Speculative',
  'Income',
  'Defensive',
  'Research',
] as const

export type WatchlistTagConst = typeof WATCHLIST_TAGS[number]

export const WATCHLIST_TAG_STYLES: Record<WatchlistTagConst, { bg: string; text: string; border: string; dot: string }> = {
  'General':         { bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400'   },
  'High Conviction': { bg: 'bg-indigo-50',   text: 'text-indigo-700',  border: 'border-indigo-200',  dot: 'bg-indigo-500'  },
  'Speculative':     { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  'Income':          { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  'Defensive':       { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'    },
  'Research':        { bg: 'bg-violet-50',   text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-500'  },
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export const NAV_ITEMS = [
  { label: 'Dashboard',        href: '/dashboard',  icon: 'LayoutDashboard' },
  { label: 'Holdings',         href: '/holdings',   icon: 'Briefcase'       },
  { label: 'Sector Allocation',href: '/sectors',    icon: 'PieChart'        },
  { label: 'Risk Metrics',     href: '/risk',       icon: 'Activity'        },
  { label: 'Efficient Frontier',href: '/frontier',  icon: 'TrendingUp'      },
  { label: 'Watchlist',        href: '/watchlist',  icon: 'Star'            },
  { label: 'Peer Comparison',  href: '/peers',      icon: 'Users'           },
  { label: 'News & Events',    href: '/news',       icon: 'Newspaper'       },
  { label: 'AI Chat',          href: '/ai-chat',    icon: 'Bot'             },
] as const

// ─── API ──────────────────────────────────────────────────────────────────────

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// ─── Formatting ───────────────────────────────────────────────────────────────

export const CURRENCY_SYMBOL = '₹'
export const LOCALE = 'en-IN'

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPct(value: number, decimals = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value)
}

// ─── Tooltip Definitions ─────────────────────────────────────────────────────
// Plain-English explanations for financial metrics shown via help icons

export const METRIC_TOOLTIPS: Record<string, string> = {
  sharpe_ratio:
    'Sharpe Ratio measures return earned per unit of risk. Higher is better. A ratio above 1.0 is considered good; above 2.0 is excellent.',
  beta:
    'Beta measures how much your portfolio moves relative to the market. Beta of 1.0 means it moves with the market. Below 1.0 means less volatile; above 1.0 means more volatile.',
  volatility:
    'Annualised Volatility is the standard deviation of daily returns, scaled to a yearly figure. Lower volatility means more stable returns.',
  max_drawdown:
    'Maximum Drawdown is the largest peak-to-trough decline in portfolio value. A drawdown of -20% means the portfolio fell 20% from its highest point.',
  var_95:
    'Value at Risk (95%) estimates the maximum loss expected on 95% of trading days. A VaR of -2% means on a typical bad day, losses should not exceed 2%.',
  pe_ratio:
    'Price-to-Earnings Ratio compares a stock\'s price to its earnings per share. Lower P/E can indicate a cheaper valuation relative to earnings.',
  pb_ratio:
    'Price-to-Book Ratio compares market value to book value of assets. A ratio below 1.0 may indicate undervaluation.',
  ev_ebitda:
    'Enterprise Value to EBITDA is a valuation multiple commonly used to compare companies. Lower values may indicate relative undervaluation.',
  sector_concentration:
    'Sector Concentration measures how much of your portfolio is in a single industry. High concentration increases sector-specific risk.',
  efficient_frontier:
    'The Efficient Frontier shows the set of optimal portfolios offering the highest expected return for a given level of risk.',
  top_holdings:
    'Top Holdings ranks your positions by current market value. High concentration in a few stocks can amplify both gains and losses.',
  portfolio_weight:
    'Portfolio Weight is the percentage of total portfolio value held in each position. A well-diversified portfolio avoids overly large individual weights.',
  hhi:
    'The Herfindahl–Hirschman Index (HHI) measures portfolio concentration. It equals the sum of squared position weights. Below 0.12 is well diversified; above 0.25 is highly concentrated.',
  effective_n:
    'Effective N (1 ÷ HHI) estimates how many equal-weight positions your portfolio is equivalent to. A portfolio with 10 holdings but concentrated in 2 will have an Effective N close to 2.',
  diversification_score:
    'Diversification Score (0–100) combines position weight balance (70%) and sector breadth (30%). Higher means your capital is spread more evenly across positions and industries.',
  risk_profile:
    'Risk Profile is a rule-based classification derived from position weights, sector allocation, and HHI — not from historical price data. It updates instantly when holdings change.',
  concentration:
    'Concentration risk arises when a large share of the portfolio is held in a few stocks or one sector. High concentration amplifies both potential gains and losses from those positions.',

  // ── Fundamentals — Valuation ────────────────────────────────────────────────
  forward_pe:
    'Forward P/E uses next-12-month consensus earnings estimates instead of trailing figures. It reflects the market\'s expectations for future profitability. Lower is generally cheaper; a much lower forward vs. trailing P/E suggests earnings growth is expected.',
  peg_ratio:
    'PEG Ratio = P/E ÷ Earnings Growth Rate. It adjusts the P/E for growth, so a fast-growing company with a high P/E may still look cheap on PEG. A PEG below 1.0 is often considered undervalued; above 2.0 may indicate the growth premium is expensive.',
  pb_ratio_detail:
    'Price-to-Book Ratio compares the stock\'s market price to the net asset value (book value) per share. A P/B below 1.0 means the stock trades below its accounting value — common in asset-heavy or distressed businesses. A high P/B (e.g. 10×) is typical for capital-light, high-ROE businesses like software.',
  ev_ebitda_detail:
    'EV/EBITDA compares Enterprise Value to operating earnings before interest, tax, depreciation and amortisation. It is widely used for cross-company comparisons because it is capital-structure-neutral. Not meaningful for banks or financial companies. Lower values suggest cheaper valuation.',
  market_cap:
    'Market Capitalisation is the total market value of all outstanding shares (price × shares). Large-cap (>₹20,000 Cr) companies are typically more stable; mid-cap and small-cap carry higher growth potential but more volatility.',
  dividend_yield:
    'Dividend Yield = Annual dividend per share ÷ Current price. It shows the income return from dividends. A high yield can signal income potential or, if unusually high, a distressed stock. Growth companies typically pay little or no dividend.',

  // ── Fundamentals — Quality ───────────────────────────────────────────────────
  roe:
    'Return on Equity (ROE) = Net Profit ÷ Shareholders\' Equity. It measures how efficiently management uses equity capital to generate profit. Above 15% is generally considered good; above 25% is excellent. Very high ROE can also result from high leverage, so check debt levels alongside.',
  roa:
    'Return on Assets (ROA) = Net Profit ÷ Total Assets. It reflects how efficiently a company uses all its assets to generate earnings. ROA above 10% is strong for non-financial companies. Banks naturally have low ROA (1–2%) due to their large asset bases.',
  operating_margin:
    'Operating Margin = Operating Profit ÷ Revenue. It shows how much of each rupee of revenue turns into operating profit before interest and taxes. Higher is better; thin margins leave little buffer for cost increases. Not meaningful for banks and financial companies.',
  profit_margin:
    'Net Profit Margin = Net Profit ÷ Revenue. It is the bottom-line profitability after all expenses. A margin of 20%+ is excellent for most industries. Like operating margin, it is not directly comparable across banks and non-banks.',

  // ── Fundamentals — Growth ────────────────────────────────────────────────────
  revenue_growth:
    'Revenue Growth (YoY) is the percentage change in total revenue compared to the prior year. Consistent double-digit growth signals strong business momentum. Declining revenue is a red flag unless the company is intentionally shedding low-margin segments.',
  earnings_growth:
    'Earnings Growth (YoY) is the percentage change in earnings per share or net profit vs. the prior year. High earnings growth justifies higher valuation multiples (P/E, PEG). Extremely high figures (e.g. 70%+) may reflect a low base or one-off items.',

  // ── Fundamentals — Leverage ──────────────────────────────────────────────────
  debt_to_equity:
    'Debt-to-Equity Ratio = Total Debt ÷ Shareholders\' Equity. It measures financial leverage. Below 0.5 is conservative; 0.5–1.5 is moderate; above 2.0 indicates high leverage and potential risk during downturns. Not meaningful for banks, which fund themselves primarily through deposits.',

  // ── Portfolio-level weighted metrics ────────────────────────────────────────
  wtd_pe:
    'Weighted-Average P/E is the portfolio\'s P/E ratio weighted by each holding\'s share of total value. It gives a blended valuation snapshot. Compare to the Nifty 50 P/E (~20–22×) to assess whether your portfolio is cheap or expensive relative to the broad market.',
  wtd_roe:
    'Weighted-Average ROE reflects the blended return-on-equity across your portfolio, weighted by position size. A high wtd. ROE (>20%) indicates your portfolio skews toward quality, capital-efficient businesses.',
  wtd_div_yield:
    'Weighted-Average Dividend Yield is the income yield you would earn from dividends across your entire portfolio. It is weighted by the market value of each position. Useful for income-focused investors tracking cash flow generation.',
  wtd_operating_margin:
    'Weighted-Average Operating Margin reflects the blended operational profitability across non-bank holdings. Bank and financial holdings are excluded from this calculation as operating margin is not a meaningful metric for them.',

  // ── Watchlist ────────────────────────────────────────────────────────────────
  watchlist_tag:
    'Watchlist Tag is your personal conviction label for this stock. Use High Conviction for your strongest ideas, Research for stocks still under investigation, Speculative for high-risk plays, Income for dividend payers, and Defensive for low-volatility holdings.',
  target_price:
    'Target Price is your own manually entered price reference — not a live quote or analyst estimate. Use it to track your buy target, fair value estimate, or the price at which you last reviewed the stock.',
  watchlist_sector:
    'Sector helps you visually group watchlist stocks alongside your portfolio\'s sector allocation. Use the same sector names as your portfolio for consistent comparisons.',
}

// ─── News & Events ────────────────────────────────────────────────────────────

import type { NewsEventType, NewsSentiment } from '@/types'

/** Labels shown in the filter bar and on EventBadge components. */
export const NEWS_EVENT_LABELS: Record<NewsEventType, string> = {
  earnings:       'Earnings',
  dividend:       'Dividend',
  deal:           'Deal',
  rating:         'Analyst Rating',
  company_update: 'Company Update',
  market_event:   'Market Event',
  regulatory:     'Regulatory',
  management:     'Management',
}

/** Tailwind color classes for EventBadge — background + text + border. */
export const NEWS_EVENT_STYLES: Record<NewsEventType, { bg: string; text: string; border: string }> = {
  earnings:       { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  dividend:       { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  deal:           { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200'   },
  rating:         { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200'  },
  company_update: { bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200'    },
  market_event:   { bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200'  },
  regulatory:     { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200'    },
  management:     { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
}

/** Sentiment dot color. */
export const NEWS_SENTIMENT_STYLES: Record<NewsSentiment, { dot: string; label: string }> = {
  positive: { dot: 'bg-emerald-400', label: 'Positive' },
  negative: { dot: 'bg-red-400',     label: 'Negative' },
  neutral:  { dot: 'bg-slate-300',   label: 'Neutral'  },
}

/** Labels for upcoming event type badges on the events timeline. */
export const CORPORATE_EVENT_LABELS: Record<string, string> = {
  earnings: 'Earnings',
  dividend: 'Dividend',
  agm:      'AGM',
  bonus:    'Bonus Issue',
  split:    'Stock Split',
}

export const CORPORATE_EVENT_STYLES: Record<string, { bg: string; text: string }> = {
  earnings: { bg: 'bg-violet-100', text: 'text-violet-700' },
  dividend: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  agm:      { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  bonus:    { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  split:    { bg: 'bg-sky-100',    text: 'text-sky-700'    },
}
