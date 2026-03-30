/**
 * Portfolio Advisor Engine — lib/advisor.ts
 * -----------------------------------------
 * Rule-based advisor that responds to natural language queries about a portfolio.
 * Pure computation: zero React imports, zero side effects, zero API calls.
 *
 * Entry point:
 *   routeQuery(query, input)  →  AdvisorResponse
 *   getSuggestedQuestions(input)  →  string[]
 *
 * Domain analyzers (7):
 *   analyzeDiversification  — sector spread, missing sectors
 *   analyzeConcentration    — single-stock risk, HHI, effective-N
 *   analyzeDividends        — yield, income contributors, watchlist income
 *   analyzeValuation        — P/E, P/B, PEG, cheapest/most expensive
 *   analyzeWatchlist        — high-conviction ideas, target prices, new sectors
 *   analyzePerformance      — winners/losers, win rate, rebalancing signals
 *   analyzePeerComparison   — ROE strength/weakness, refers to Peer tool
 *   analyzeGeneral          — portfolio overview used as fallback
 *
 * Future AI integration:
 *   Replace routeQuery() body with:
 *     return await claudeApi.ask(query, input)   ← same AdvisorResponse type
 *   The AdvisorEngineInput already packages all context for prompt injection.
 *   Hooks, components, and pages require zero changes.
 */

import type {
  Holding,
  SectorAllocation,
  WeightedFundamentals,
  RiskSnapshot,
  WatchlistItem,
  HoldingWithFundamentals,
  PortfolioDelta,
} from '@/types'

// ─── Output types ─────────────────────────────────────────────────────────────

export type AdvisorCategory =
  | 'diversification'
  | 'concentration'
  | 'dividend'
  | 'valuation'
  | 'watchlist'
  | 'performance'
  | 'peer'
  | 'general'

/** A factual observation about the portfolio */
export interface AdvisorInsight {
  type:         'insight'
  category:     AdvisorCategory
  title:        string
  explanation:  string        // plain English, non-expert friendly
  metric?:      string        // e.g. "P/E: 24×" displayed as a callout
  confidence:   'high' | 'medium' | 'low'
}

/** A concrete action the investor could take */
export interface AdvisorSuggestion {
  type:       'suggestion'
  category:   AdvisorCategory
  action:     string          // short imperative: "Consider reducing..."
  rationale:  string          // why this action makes sense
  ticker?:    string          // relevant ticker if any
  priority:   'high' | 'medium' | 'low'
}

/** A risk factor that needs attention */
export interface AdvisorWarning {
  type:     'warning'
  category: AdvisorCategory
  issue:    string            // short problem statement
  detail:   string            // fuller explanation
  ticker?:  string
  severity: 'critical' | 'warning'
}

export type AdvisorItem = AdvisorInsight | AdvisorSuggestion | AdvisorWarning

/** Full response returned by routeQuery() */
export interface AdvisorResponse {
  query:      string
  category:   AdvisorCategory
  summary:    string          // one-sentence top-level answer
  items:      AdvisorItem[]
  followUps:  string[]        // suggested next questions
}

// ─── Input type ───────────────────────────────────────────────────────────────

export interface OptimizationSummary {
  maxSharpe: {
    expectedReturn: number
    volatility:     number
    sharpeRatio:    number
    topWeights:     { ticker: string; weight: number }[]
  }
  minVariance: { volatility: number; sharpeRatio: number } | null
  currentSharpe:    number | null
  rebalanceActions: number
  period:           string | undefined
}

export interface AdvisorEngineInput {
  holdings:          Holding[]
  enrichedHoldings:  HoldingWithFundamentals[]
  sectors:           SectorAllocation[]
  weightedMetrics:   WeightedFundamentals | null
  riskSnapshot:      RiskSnapshot | null
  watchlistItems:    WatchlistItem[]
  /** Optional — populated when optimizer results are available */
  optimizationSummary?: OptimizationSummary | null
  /**
   * Optional — latest snapshot delta (newest vs previous).
   * Populated by PortfolioAdvisorPanel when ≥2 snapshots exist.
   * Used by analyzeDelta() to answer "what changed" queries.
   */
  latestDelta?: PortfolioDelta | null
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmt = (v: number | null, suffix = '', digits = 1): string =>
  v !== null ? `${v.toFixed(digits)}${suffix}` : 'N/A'

const fmtPct = (v: number | null) => fmt(v, '%')
const fmtMul = (v: number | null) => fmt(v, '×')
const shortTicker = (t: string) => t.replace(/\.(NS|BSE)$/i, '')

// ─── Known major Indian equity sectors ───────────────────────────────────────

const MAJOR_SECTORS: { name: string; keywords: string[] }[] = [
  { name: 'Banking & Finance',         keywords: ['bank', 'finance', 'nbfc', 'insurance'] },
  { name: 'Information Technology',    keywords: ['it', 'tech', 'software', 'digital']    },
  { name: 'FMCG / Consumer Staples',   keywords: ['fmcg', 'consumer', 'staple', 'food']   },
  { name: 'Pharmaceuticals',           keywords: ['pharma', 'health', 'drug', 'medical']  },
  { name: 'Energy & Utilities',        keywords: ['energy', 'power', 'oil', 'gas', 'util'] },
  { name: 'Automobiles',               keywords: ['auto', 'vehicle', 'car', 'motor']       },
  { name: 'Metals & Mining',           keywords: ['metal', 'steel', 'mining', 'alumin']    },
  { name: 'Infrastructure',            keywords: ['infra', 'construct', 'cement', 'build'] },
  { name: 'Telecom',                   keywords: ['telecom', 'wireless', 'mobile']          },
  { name: 'Capital Goods',             keywords: ['capital', 'industrial', 'engineer']      },
]

// ─── Helper: check which major sectors are missing ───────────────────────────

function findMissingSectors(sectorNames: string[]): string[] {
  const joined = sectorNames.map((s) => s.toLowerCase()).join('|')
  return MAJOR_SECTORS
    .filter(({ keywords }) => !keywords.some((kw) => joined.includes(kw)))
    .map(({ name }) => name)
}

// ─── Domain analyzers ─────────────────────────────────────────────────────────

function analyzeDiversification(
  query: string,
  input: AdvisorEngineInput,
): AdvisorResponse {
  const { sectors, riskSnapshot } = input
  const items: AdvisorItem[] = []

  const numSectors = sectors.length
  const hhi        = riskSnapshot?.hhi ?? null
  const divScore   = riskSnapshot?.diversification_score ?? null
  const sectorNames = sectors.map((s) => s.sector)
  const missing    = findMissingSectors(sectorNames)

  // Diversification quality
  if (hhi !== null && hhi < 0.15 && numSectors >= 5) {
    items.push({
      type:        'insight',
      category:    'diversification',
      title:       'Well-Diversified Portfolio',
      explanation: `Your portfolio spans ${numSectors} sectors with an HHI of ${hhi.toFixed(3)} — the lower the better. A diversification score of ${divScore?.toFixed(0) ?? 'N/A'}/100 means no single sector dominates your risk.`,
      metric:      `HHI: ${hhi.toFixed(3)}`,
      confidence:  'high',
    })
  } else if (numSectors < 4) {
    items.push({
      type:     'warning',
      category: 'diversification',
      issue:    'Limited Sector Spread',
      detail:   `Only ${numSectors} sector${numSectors === 1 ? '' : 's'} represented. Your portfolio is more vulnerable to sector-specific events, regulatory changes, or earnings cycles.`,
      severity: 'warning',
    })
  }

  // Sector breakdown insight
  const topSectors = [...sectors].sort((a, b) => b.weight_pct - a.weight_pct).slice(0, 3)
  if (topSectors.length > 0) {
    items.push({
      type:        'insight',
      category:    'diversification',
      title:       'Top Sector Breakdown',
      explanation: `Your three largest sectors: ${topSectors.map((s) => `${s.sector} (${fmtPct(s.weight_pct)})`).join(', ')}. Together they account for ${fmtPct(topSectors.reduce((acc, s) => acc + s.weight_pct, 0))} of your portfolio.`,
      confidence:  'high',
    })
  }

  // Missing sectors suggestion
  const topMissing = missing.slice(0, 3)
  if (topMissing.length > 0) {
    items.push({
      type:      'suggestion',
      category:  'diversification',
      action:    `Consider adding exposure to ${topMissing.join(', ')}`,
      rationale: `These are major Indian equity segments with low correlation to your existing holdings. Even a small allocation would reduce the impact of a downturn in any single sector.`,
      priority:  numSectors < 4 ? 'high' : 'medium',
    })
  }

  const summary =
    numSectors >= 5
      ? `Your portfolio covers ${numSectors} sectors — reasonably spread. ${missing.length > 0 ? `You have no exposure to ${missing.slice(0, 2).join(' or ')}.` : 'Good breadth across major sectors.'}`
      : `Your portfolio is concentrated in ${numSectors} sector${numSectors === 1 ? '' : 's'}, carrying meaningful sector-specific risk.`

  return {
    query,
    category: 'diversification',
    summary,
    items,
    followUps: [
      'Which stock contributes the most risk?',
      'How concentrated is my biggest holding?',
      'What are my watchlist opportunities?',
    ],
  }
}

function analyzeConcentration(
  query: string,
  input: AdvisorEngineInput,
): AdvisorResponse {
  const { holdings, riskSnapshot } = input
  const items: AdvisorItem[] = []

  if (holdings.length === 0) {
    return {
      query,
      category: 'concentration',
      summary:  'No holdings data available.',
      items:    [],
      followUps: ['What sectors am I missing?'],
    }
  }

  const sorted      = [...holdings].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
  const largest     = sorted[0]
  const top3Weight  = riskSnapshot?.top3_weight ?? null
  const hhi         = riskSnapshot?.hhi ?? null
  const effectiveN  = riskSnapshot?.effective_n ?? null

  // Largest holding
  if (largest) {
    const w = largest.weight ?? 0
    items.push({
      type:        'insight',
      category:    'concentration',
      title:       `Largest Position: ${shortTicker(largest.ticker)}`,
      explanation: `${largest.name} is your biggest holding at ${fmtPct(w)} of portfolio value. ${
        w >= 30
          ? 'This is high — a 10% move in this stock alone shifts your total portfolio by ' + fmtPct(w * 0.1) + '.'
          : 'This is within a manageable range for a single position.'
      }`,
      metric:     fmtPct(w),
      confidence: 'high',
    })

    if (w >= 40) {
      items.push({
        type:     'warning',
        category: 'concentration',
        issue:    `Critical Concentration in ${shortTicker(largest.ticker)}`,
        detail:   `A ${fmtPct(w)} position means a 10% drop in ${largest.name} alone would reduce your total portfolio by ${fmtPct(w * 0.1)}. This is the single largest risk factor in your portfolio.`,
        ticker:   largest.ticker,
        severity: 'critical',
      })
    } else if (w >= 30) {
      items.push({
        type:      'suggestion',
        category:  'concentration',
        action:    `Consider trimming ${shortTicker(largest.ticker)} toward a 20–25% limit`,
        rationale: `At ${fmtPct(w)}, ${largest.name} amplifies single-company risk. Rebalancing into complementary holdings reduces exposure without sacrificing sector conviction.`,
        ticker:    largest.ticker,
        priority:  'medium',
      })
    }
  }

  // Top 3 weight
  if (top3Weight !== null) {
    const top3 = sorted.slice(0, 3)
    items.push({
      type:        'insight',
      category:    'concentration',
      title:       'Top 3 Holdings Combined',
      explanation: `${top3.map((h) => shortTicker(h.ticker)).join(', ')} together account for ${fmtPct(top3Weight)} of your portfolio. ${
        top3Weight >= 60
          ? 'Your returns will be closely tied to these three companies.'
          : 'This is a manageable level of top-of-portfolio concentration.'
      }`,
      metric:     fmtPct(top3Weight),
      confidence: 'high',
    })
  }

  // HHI + effective N
  if (hhi !== null && effectiveN !== null) {
    items.push({
      type:        'insight',
      category:    'concentration',
      title:       'Equivalent Breadth (Effective-N)',
      explanation: `Your HHI of ${hhi.toFixed(3)} is equivalent to holding ${effectiveN.toFixed(1)} equally-weighted positions — even though you own ${holdings.length} stocks. ${
        effectiveN < 5
          ? 'Low effective-N confirms concentration is high; a few positions dominate.'
          : 'This is a healthy spread across your holdings.'
      }`,
      metric:     `Effective-N: ${effectiveN.toFixed(1)}`,
      confidence: 'high',
    })
  }

  const summary = largest
    ? `${largest.name} contributes the most risk at ${fmtPct(largest.weight ?? null)} of your portfolio. Your top 3 holdings represent ${fmtPct(top3Weight)} combined.`
    : 'Concentration data is not available.'

  return {
    query,
    category: 'concentration',
    summary,
    items,
    followUps: [
      'How diversified is my sector allocation?',
      'What is my portfolio dividend yield?',
      'Which of my holdings looks most overvalued?',
    ],
  }
}

function analyzeDividends(
  query: string,
  input: AdvisorEngineInput,
): AdvisorResponse {
  const { enrichedHoldings, weightedMetrics, watchlistItems } = input
  const items: AdvisorItem[] = []
  const w = weightedMetrics

  const yieldVal   = w?.wtd_div_yield ?? null
  const niftyYield = 1.3 // Nifty 50 typical

  // Portfolio-level yield
  if (yieldVal !== null) {
    items.push({
      type:        'insight',
      category:    'dividend',
      title:       'Portfolio Dividend Yield',
      explanation: `Your weighted average dividend yield is ${fmtPct(yieldVal)}. ${
        yieldVal >= 2
          ? `This beats the Nifty 50's typical ~${niftyYield}%, providing meaningful income alongside growth potential.`
          : yieldVal >= niftyYield
          ? `Roughly in line with the Nifty 50 (~${niftyYield}%). Your portfolio provides modest income but is primarily growth-oriented.`
          : `Below the Nifty 50's ~${niftyYield}% average — this is a growth-oriented portfolio with limited income focus.`
      }`,
      metric:     fmtPct(yieldVal),
      confidence: 'high',
    })
  }

  // Top income contributors
  const divPayers = [...enrichedHoldings]
    .filter((h) => (h.fundamentals?.dividend_yield ?? 0) > 0)
    .sort((a, b) => (b.fundamentals?.dividend_yield ?? 0) - (a.fundamentals?.dividend_yield ?? 0))
    .slice(0, 3)

  if (divPayers.length > 0) {
    items.push({
      type:        'insight',
      category:    'dividend',
      title:       'Top Income Contributors',
      explanation: `Your highest-yielding holdings: ${divPayers
        .map((h) => `${shortTicker(h.ticker)} (${fmtPct(h.fundamentals?.dividend_yield ?? null)})`)
        .join(', ')}. These generate most of your portfolio's dividend income.`,
      confidence: 'medium',
    })
  }

  // Non-dividend count
  const noDivCount = enrichedHoldings.filter(
    (h) => (h.fundamentals?.dividend_yield ?? 0) === 0,
  ).length
  if (noDivCount > 0) {
    items.push({
      type:        'insight',
      category:    'dividend',
      title:       `${noDivCount} Holding${noDivCount > 1 ? 's' : ''} Without Dividend`,
      explanation: `${noDivCount} of your holdings do not currently pay a dividend. These are likely reinvestment-stage or growth businesses where capital is deployed back into the company.`,
      confidence:  'medium',
    })
  }

  // Watchlist income suggestions
  const incomeWatchlist = watchlistItems.filter(
    (wi) => wi.tag === 'Income' || (wi.notes?.toLowerCase().includes('dividend') ?? false),
  )
  if (incomeWatchlist.length > 0 && (yieldVal === null || yieldVal < 2)) {
    items.push({
      type:      'suggestion',
      category:  'dividend',
      action:    `Review ${incomeWatchlist.map((wi) => shortTicker(wi.ticker)).join(', ')} from your watchlist`,
      rationale: `These are tagged as income stocks on your watchlist and could boost your overall dividend yield.`,
      priority:  'low',
    })
  }

  const summary =
    yieldVal !== null
      ? `Your portfolio yields ${fmtPct(yieldVal)} — ${
          yieldVal >= 2 ? 'above' : yieldVal >= 1 ? 'close to' : 'below'
        } the market average of ~${niftyYield}%. ${
          divPayers.length > 0 ? `${divPayers[0].name} is your top income contributor.` : ''
        }`
      : 'Dividend yield data is not yet available for your portfolio.'

  return {
    query,
    category: 'dividend',
    summary,
    items,
    followUps: [
      'How is my portfolio valued?',
      'Which watchlist stocks could add income?',
      'What is my overall portfolio quality?',
    ],
  }
}

function analyzeValuation(
  query: string,
  input: AdvisorEngineInput,
): AdvisorResponse {
  const { enrichedHoldings, weightedMetrics } = input
  const items: AdvisorItem[] = []
  const w = weightedMetrics

  const peVal  = w?.wtd_pe  ?? null
  const pbVal  = w?.wtd_pb  ?? null
  const roeVal = w?.wtd_roe ?? null
  const pegVal = w?.wtd_peg ?? null

  // P/E
  if (peVal !== null) {
    const label =
      peVal > 30 ? 'Premium Valuation'
      : peVal <= 18 ? 'Attractively Valued'
      : 'Fairly Valued'
    items.push({
      type:        'insight',
      category:    'valuation',
      title:       label,
      explanation: `Weighted P/E of ${fmtMul(peVal)} vs the Nifty 50 benchmark of ~21×. ${
        peVal > 30
          ? 'You are paying a significant premium for earnings — growth expectations are built in. Watch for any earnings disappointments.'
          : peVal <= 18
          ? 'Your portfolio trades below the market multiple, suggesting relative value versus current earnings.'
          : 'The portfolio is broadly in line with the market — neither especially cheap nor expensive on P/E alone.'
      }`,
      metric:     `P/E: ${fmtMul(peVal)}`,
      confidence: 'high',
    })
  }

  // P/B
  if (pbVal !== null) {
    items.push({
      type:        'insight',
      category:    'valuation',
      title:       `Price-to-Book: ${fmtMul(pbVal)}`,
      explanation: `${
        pbVal > 5
          ? 'A high P/B reflects strong expected returns on equity — common for capital-light or high-ROE businesses.'
          : pbVal < 1.5
          ? 'A low P/B can indicate deep value or cyclical headwinds. Cross-check with ROE to distinguish the two.'
          : 'Moderate P/B, consistent with a mix of quality and cyclical names.'
      }`,
      metric:     `P/B: ${fmtMul(pbVal)}`,
      confidence: 'medium',
    })
  }

  // PEG warning
  if (pegVal !== null && pegVal > 2) {
    items.push({
      type:     'warning',
      category: 'valuation',
      issue:    'High PEG Ratio',
      detail:   `Weighted PEG of ${fmtMul(pegVal)} (above 2×) suggests the growth implied in current prices is expensive. A PEG below 1× is typically considered good value for growth stocks.`,
      severity: 'warning',
    })
  }

  // Most expensive holdings
  const withPE = [...enrichedHoldings]
    .filter((h) => h.fundamentals?.pe_ratio != null)
    .sort((a, b) => (b.fundamentals?.pe_ratio ?? 0) - (a.fundamentals?.pe_ratio ?? 0))

  if (withPE.length >= 2) {
    const expensive = withPE.slice(0, 2)
    items.push({
      type:        'insight',
      category:    'valuation',
      title:       'Highest Multiples',
      explanation: `${expensive.map((h) => `${shortTicker(h.ticker)} (P/E ${fmtMul(h.fundamentals?.pe_ratio ?? null)})`).join(' and ')} trade at the highest multiples in your portfolio. Justify with their revenue growth via Peer Comparison.`,
      confidence:  'medium',
    })
  }

  // Cheap + quality suggestion
  const cheapest = [...withPE]
    .reverse()
    .filter((h) => (h.fundamentals?.pe_ratio ?? 0) > 0)
    .slice(0, 2)
  if (cheapest.length > 0 && roeVal !== null && roeVal > 15) {
    items.push({
      type:      'suggestion',
      category:  'valuation',
      action:    `Review ${cheapest.map((h) => shortTicker(h.ticker)).join(' and ')} for quality-at-value`,
      rationale: `These trade at low multiples yet your portfolio's overall ROE is strong. Worth checking whether the discount is warranted or a buying opportunity.`,
      priority:  'low',
    })
  }

  const summary =
    peVal !== null
      ? `At a weighted P/E of ${fmtMul(peVal)}, your portfolio is ${
          peVal > 30 ? 'trading at a premium to the market' :
          peVal <= 18 ? 'modestly below the market average' :
          'broadly in line with the Nifty 50'
        }.`
      : 'Valuation data is not yet available for your portfolio.'

  return {
    query,
    category: 'valuation',
    summary,
    items,
    followUps: [
      'Which stock has the most risk?',
      'How is my portfolio quality (ROE)?',
      'Compare my best holding to its peers',
    ],
  }
}

function analyzeWatchlist(
  query: string,
  input: AdvisorEngineInput,
): AdvisorResponse {
  const { holdings, watchlistItems, sectors } = input
  const items: AdvisorItem[] = []

  const holdingTickers  = new Set(holdings.map((h) => h.ticker.toUpperCase()))
  const holdingSectors  = new Set(sectors.map((s) => s.sector.toLowerCase()))

  const notInPortfolio  = watchlistItems.filter((w) => !holdingTickers.has(w.ticker.toUpperCase()))
  const highConv        = notInPortfolio.filter((w) => w.tag === 'High Conviction')
  const speculative     = notInPortfolio.filter((w) => w.tag === 'Speculative')
  const withTargets     = watchlistItems.filter(
    (w) => w.target_price !== null && holdingTickers.has(w.ticker.toUpperCase()),
  )

  // High conviction
  if (highConv.length > 0) {
    items.push({
      type:      'suggestion',
      category:  'watchlist',
      action:    `Review ${highConv.slice(0, 3).map((w) => shortTicker(w.ticker)).join(', ')} for potential entry`,
      rationale: `You have ${highConv.length} "High Conviction" stock${highConv.length > 1 ? 's' : ''} on your watchlist that are not yet in your portfolio — these represent your highest-priority ideas waiting for the right entry.`,
      priority:  'high',
    })
  }

  // Diversification from watchlist
  const newSectorItems = notInPortfolio.filter(
    (w) => w.sector && !holdingSectors.has(w.sector.toLowerCase()),
  )
  if (newSectorItems.length > 0) {
    items.push({
      type:        'insight',
      category:    'watchlist',
      title:       'Watchlist Expands Sector Coverage',
      explanation: `${newSectorItems.length} watchlist stock${newSectorItems.length > 1 ? 's' : ''} — ${newSectorItems.slice(0, 3).map((w) => shortTicker(w.ticker)).join(', ')} — are in sectors not currently in your portfolio. Adding any of these would reduce correlation with existing holdings.`,
      confidence:  'medium',
    })
  }

  // Portfolio holdings with target prices
  if (withTargets.length > 0) {
    items.push({
      type:        'insight',
      category:    'watchlist',
      title:       `${withTargets.length} Holding${withTargets.length > 1 ? 's' : ''} with Target Price`,
      explanation: `${withTargets.map((w) => shortTicker(w.ticker)).join(', ')} have target prices set on your watchlist. Compare current prices to your targets to review whether your original investment thesis still holds.`,
      confidence:  'high',
    })
  }

  // Speculative ideas
  if (speculative.length > 0) {
    items.push({
      type:        'insight',
      category:    'watchlist',
      title:       'Speculative Ideas on Watchlist',
      explanation: `${speculative.slice(0, 3).map((w) => shortTicker(w.ticker)).join(', ')} are tagged speculative. These could complement a diversified portfolio at a smaller position size if your conviction grows.`,
      confidence:  'low',
    })
  }

  if (watchlistItems.length === 0) {
    items.push({
      type:      'suggestion',
      category:  'watchlist',
      action:    'Start building your watchlist',
      rationale: 'A watchlist lets you track ideas before committing capital. Add stocks with conviction tags and target prices to monitor entry points.',
      priority:  'low',
    })
  }

  const summary =
    watchlistItems.length > 0
      ? `You have ${notInPortfolio.length} watchlist stocks not yet in your portfolio${
          highConv.length > 0 ? `, including ${highConv.length} high-conviction idea${highConv.length > 1 ? 's' : ''}` : ''
        }.`
      : 'Your watchlist is empty. Add stocks to track investment opportunities.'

  return {
    query,
    category: 'watchlist',
    summary,
    items,
    followUps: [
      'How diversified is my current portfolio?',
      'Which of my holdings looks most expensive?',
      'What is my portfolio dividend income?',
    ],
  }
}

function analyzePerformance(
  query: string,
  input: AdvisorEngineInput,
): AdvisorResponse {
  const { holdings } = input
  const items: AdvisorItem[] = []

  const withPnl = holdings.filter((h) => h.pnl_pct !== undefined && h.pnl_pct !== null)
  if (withPnl.length === 0) {
    return {
      query,
      category:  'performance',
      summary:   'Performance (P&L) data is not available for your portfolio.',
      items:     [],
      followUps: ['How is my portfolio valued?', 'What sectors am I in?'],
    }
  }

  const sorted  = [...withPnl].sort((a, b) => (b.pnl_pct ?? 0) - (a.pnl_pct ?? 0))
  const winners = sorted.filter((h) => (h.pnl_pct ?? 0) > 0)
  const losers  = sorted.filter((h) => (h.pnl_pct ?? 0) < 0)
  const top     = sorted[0]
  const bottom  = sorted[sorted.length - 1]

  // Top gainer
  if (top && (top.pnl_pct ?? 0) > 0) {
    items.push({
      type:        'insight',
      category:    'performance',
      title:       `Best Performer: ${shortTicker(top.ticker)}`,
      explanation: `${top.name} is your top gainer at ${fmtPct(top.pnl_pct ?? null)} return${top.weight ? ` (${fmtPct(top.weight)} of portfolio)` : ''}. ${
        (top.weight ?? 0) > 25
          ? 'Given its portfolio weight, this gain has meaningfully boosted your total returns.'
          : 'Consider whether to lock in some gains or let the thesis continue to play out.'
      }`,
      metric:     fmtPct(top.pnl_pct ?? null),
      confidence: 'high',
    })
  }

  // Worst performer
  if (bottom && (bottom.pnl_pct ?? 0) < -10) {
    items.push({
      type:     'warning',
      category: 'performance',
      issue:    `Significant Underperformer: ${shortTicker(bottom.ticker)}`,
      detail:   `${bottom.name} is down ${fmtPct(Math.abs(bottom.pnl_pct ?? 0))} from your cost. Review the fundamentals and peer performance to determine if this is a temporary dip or a structural deterioration.`,
      ticker:   bottom.ticker,
      severity: 'warning',
    })
  } else if (bottom && (bottom.pnl_pct ?? 0) < 0) {
    items.push({
      type:        'insight',
      category:    'performance',
      title:       `Lagging Performer: ${shortTicker(bottom.ticker)}`,
      explanation: `${bottom.name} is your weakest stock at ${fmtPct(bottom.pnl_pct ?? null)}. A modest negative — may not be a concern depending on your time horizon.`,
      metric:     fmtPct(bottom.pnl_pct ?? null),
      confidence: 'medium',
    })
  }

  // Win rate summary
  items.push({
    type:        'insight',
    category:    'performance',
    title:       'Portfolio Win Rate',
    explanation: `${winners.length} of ${withPnl.length} holdings are in profit — a ${fmtPct((winners.length / withPnl.length) * 100)} win rate. ${
      losers.length > 0
        ? `${losers.length} holding${losers.length > 1 ? 's are' : ' is'} currently underwater.`
        : 'All holdings are currently in profit.'
    }`,
    metric:     `${winners.length}/${withPnl.length}`,
    confidence: 'high',
  })

  // Rebalancing signal — large winning position
  if (top && (top.weight ?? 0) > 25 && (top.pnl_pct ?? 0) > 30) {
    items.push({
      type:      'suggestion',
      category:  'performance',
      action:    `Consider a partial trim on ${shortTicker(top.ticker)}`,
      rationale: `It is both your largest holding (${fmtPct(top.weight ?? null)}) and your best performer (${fmtPct(top.pnl_pct ?? null)} return). Trimming would lock in gains and simultaneously reduce concentration risk.`,
      ticker:    top.ticker,
      priority:  'medium',
    })
  }

  const summary = `${top?.name ?? 'Your best holding'} leads at ${fmtPct(top?.pnl_pct ?? null)}. ${winners.length}/${withPnl.length} holdings are in profit.`

  return {
    query,
    category: 'performance',
    summary,
    items,
    followUps: [
      'Which stock contributes the most risk?',
      'Is my portfolio overvalued?',
      'Should I review my watchlist?',
    ],
  }
}

function analyzePeerComparison(
  query: string,
  input: AdvisorEngineInput,
): AdvisorResponse {
  const { enrichedHoldings } = input
  const items: AdvisorItem[] = []

  const withROE   = enrichedHoldings.filter((h) => h.fundamentals?.roe != null)
  const strongROE = [...withROE].sort((a, b) => (b.fundamentals?.roe ?? 0) - (a.fundamentals?.roe ?? 0)).slice(0, 2)
  const weakROE   = [...withROE].sort((a, b) => (a.fundamentals?.roe ?? 0) - (b.fundamentals?.roe ?? 0))
    .filter((h) => (h.fundamentals?.roe ?? 0) < 12)
    .slice(0, 3)

  if (strongROE.length > 0) {
    items.push({
      type:        'insight',
      category:    'peer',
      title:       'Strongest ROE in Portfolio',
      explanation: `${strongROE.map((h) => `${shortTicker(h.ticker)} (ROE ${fmtPct(h.fundamentals?.roe ?? null)})`).join(' and ')} generate the highest returns on shareholders' equity. High-ROE businesses are typically superior capital allocators.`,
      metric:     `ROE: ${fmtPct(strongROE[0].fundamentals?.roe ?? null)}`,
      confidence: 'high',
    })
  }

  if (weakROE.length > 0) {
    items.push({
      type:      'suggestion',
      category:  'peer',
      action:    `Compare ${weakROE.map((h) => shortTicker(h.ticker)).join(', ')} against industry peers`,
      rationale: `These holdings have below-average ROE (< 12%). The Peer Comparison tool shows whether competitors in the same industry are generating better capital returns.`,
      priority:  'medium',
    })
  }

  items.push({
    type:        'insight',
    category:    'peer',
    title:       'How to Run a Peer Comparison',
    explanation: 'Click any row in the Holdings table — it navigates directly to Peer Comparison with that ticker pre-selected. You will see a full table of P/E, ROE, revenue growth, margins, and leverage vs sector peers.',
    confidence:  'high',
  })

  const summary = strongROE.length > 0
    ? `${shortTicker(strongROE[0].ticker)} has the strongest ROE at ${fmtPct(strongROE[0].fundamentals?.roe ?? null)}. Click any holding in the table to open a full peer comparison.`
    : 'Click any holding in the Holdings table to open a full side-by-side peer comparison.'

  return {
    query,
    category: 'peer',
    summary,
    items,
    followUps: [
      'Which holding looks most expensive?',
      'What is my portfolio quality score?',
      'What sectors am I missing?',
    ],
  }
}

function analyzeGeneral(
  query: string,
  input: AdvisorEngineInput,
): AdvisorResponse {
  const { holdings, sectors, weightedMetrics, riskSnapshot } = input
  const items: AdvisorItem[] = []
  const w = weightedMetrics

  items.push({
    type:        'insight',
    category:    'general',
    title:       'Portfolio Overview',
    explanation: `You hold ${holdings.length} stock${holdings.length !== 1 ? 's' : ''} across ${sectors.length} sector${sectors.length !== 1 ? 's' : ''}. ${
      riskSnapshot
        ? `Risk profile: "${riskSnapshot.risk_profile.replace(/_/g, ' ')}" — ${riskSnapshot.risk_profile_reason}`
        : ''
    }`,
    confidence: 'high',
  })

  if (w?.wtd_pe !== null && w?.wtd_pe !== undefined) {
    items.push({
      type:        'insight',
      category:    'general',
      title:       'Quick Fundamentals Snapshot',
      explanation: `Weighted P/E ${fmtMul(w.wtd_pe)} ${
        w.wtd_pe > 25 ? '(above market — growth tilt)' :
        w.wtd_pe < 18 ? '(below market — value tilt)' :
        '(in line with market)'
      }. Weighted ROE ${fmtPct(w.wtd_roe ?? null)} ${
        (w.wtd_roe ?? 0) >= 18 ? '(strong)' :
        (w.wtd_roe ?? 0) >= 12 ? '(decent)' : '(weak)'
      }. Dividend yield ${fmtPct(w.wtd_div_yield ?? null)}.`,
      metric:     `P/E ${fmtMul(w.wtd_pe)}`,
      confidence: 'medium',
    })
  }

  if (riskSnapshot?.single_stock_flag) {
    items.push({
      type:     'warning',
      category: 'general',
      issue:    'Single-Stock Concentration Risk',
      detail:   'At least one holding exceeds 30% of your portfolio. This is your most significant risk factor — a sharp move in that stock alone will materially impact total returns.',
      severity: 'warning',
    })
  } else if (riskSnapshot?.sector_concentration_flag) {
    items.push({
      type:     'warning',
      category: 'general',
      issue:    'Sector Concentration Risk',
      detail:   'One or more sectors exceed 50% of your portfolio. Sector-wide events — regulatory changes, earnings cycles — could significantly impact returns.',
      severity: 'warning',
    })
  }

  const summary = `Your portfolio of ${holdings.length} stocks across ${sectors.length} sectors has a "${
    riskSnapshot?.risk_profile.replace(/_/g, ' ') ?? 'moderate'
  }" risk profile. Ask me anything specific — concentration, valuation, income, or watchlist opportunities.`

  return {
    query,
    category: 'general',
    summary,
    items,
    followUps: [
      'Which stock contributes the most risk?',
      'What sectors am I missing?',
      'Is my portfolio overvalued?',
      'How much dividend income do I earn?',
    ],
  }
}

// ─── Delta analyzer ───────────────────────────────────────────────────────────

function analyzeDelta(query: string, input: AdvisorEngineInput): AdvisorResponse {
  const delta = input.latestDelta

  if (!delta) {
    return {
      query,
      category: 'general',
      summary: 'No snapshot history is available yet for change analysis.',
      items: [{
        type: 'insight',
        category: 'general',
        title: 'No snapshot history',
        explanation: 'Take at least two portfolio snapshots to enable change comparison. You can create snapshots on the Portfolios page or the What Changed page.',
        confidence: 'high',
      }],
      followUps: [
        'Give me a portfolio overview',
        'Which stock contributes the most risk?',
      ],
    }
  }

  const items: AdvisorItem[] = []
  const { added_tickers, removed_tickers, holding_deltas, sector_deltas,
          total_value_delta, total_value_delta_pct, days_apart } = delta

  const fmtCurr = (v: number | null): string => {
    if (v == null) return 'N/A'
    const abs = Math.abs(v)
    const sign = v >= 0 ? '+' : '−'
    if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)} Cr`
    if (abs >= 1_00_000)    return `${sign}₹${(abs / 1_00_000).toFixed(1)} L`
    return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  }

  const daysLabel = days_apart === 1 ? '1 day' : `${days_apart} days`

  // 1. Portfolio value change
  if (total_value_delta != null) {
    const positive = total_value_delta >= 0
    const valueSummary = `Over ${daysLabel}, your portfolio value changed by ${fmtCurr(total_value_delta)}${
      total_value_delta_pct != null
        ? ` (${total_value_delta_pct >= 0 ? '+' : ''}${total_value_delta_pct.toFixed(1)}%)`
        : ''
    }.`
    if (positive) {
      items.push({
        type: 'insight',
        category: 'general',
        title: `Portfolio value grew by ${fmtCurr(total_value_delta)}`,
        explanation: valueSummary,
        confidence: 'high',
      })
    } else {
      items.push({
        type: 'warning',
        category: 'general',
        issue: `Portfolio value declined by ${fmtCurr(total_value_delta)}`,
        detail: valueSummary,
        severity: 'warning',
      })
    }
  }

  // 2. Holdings added
  if (added_tickers.length > 0) {
    const names = added_tickers.map((t) => t.replace(/\.(NS|BSE|BO)$/i, '')).join(', ')
    items.push({
      type: 'insight',
      category: 'diversification',
      title: `${added_tickers.length} new holding${added_tickers.length > 1 ? 's' : ''} added`,
      explanation: `You added ${names} to your portfolio since the previous snapshot.`,
      confidence: 'high',
    })
  }

  // 3. Holdings removed
  if (removed_tickers.length > 0) {
    const names = removed_tickers.map((t) => t.replace(/\.(NS|BSE|BO)$/i, '')).join(', ')
    items.push({
      type: 'insight',
      category: 'general',
      title: `${removed_tickers.length} holding${removed_tickers.length > 1 ? 's' : ''} removed`,
      explanation: `${names} ${removed_tickers.length > 1 ? 'were' : 'was'} removed from your portfolio since the previous snapshot.`,
      confidence: 'high',
    })
  }

  // 4. Biggest weight gainer / loser
  const movers = holding_deltas
    .filter((h) => h.status === 'increased' || h.status === 'decreased')
    .sort((a, b) => Math.abs(b.weight_delta ?? 0) - Math.abs(a.weight_delta ?? 0))
    .slice(0, 2)

  for (const m of movers) {
    const ticker  = m.ticker.replace(/\.(NS|BSE|BO)$/i, '')
    const dir     = m.status === 'increased' ? 'increased' : 'decreased'
    const absDelta = Math.abs(m.weight_delta ?? 0).toFixed(1)
    items.push({
      type: m.status === 'increased' ? 'insight' : 'insight',
      category: 'concentration',
      title: `${ticker} weight ${dir} by ${absDelta} pp`,
      explanation: `${ticker}'s portfolio weight went from ${m.weight_before?.toFixed(1) ?? '—'}% to ${m.weight_after?.toFixed(1) ?? '—'}% — a shift of ${m.weight_delta != null ? (m.weight_delta > 0 ? '+' : '')  + m.weight_delta.toFixed(1) : '—'} percentage points.`,
      metric: `Δ ${m.weight_delta != null ? (m.weight_delta > 0 ? '+' : '') + m.weight_delta.toFixed(1) + ' pp' : '—'}`,
      confidence: 'high',
    })
  }

  // 5. Biggest sector shift
  const bigSectorShift = sector_deltas
    .filter((s) => s.weight_delta != null)
    .sort((a, b) => Math.abs(b.weight_delta ?? 0) - Math.abs(a.weight_delta ?? 0))[0]

  if (bigSectorShift && Math.abs(bigSectorShift.weight_delta ?? 0) > 1) {
    const dir = (bigSectorShift.weight_delta ?? 0) > 0 ? 'grew' : 'shrank'
    items.push({
      type: 'insight',
      category: 'diversification',
      title: `${bigSectorShift.sector} allocation ${dir} by ${Math.abs(bigSectorShift.weight_delta ?? 0).toFixed(1)} pp`,
      explanation: `Your ${bigSectorShift.sector} exposure changed from ${bigSectorShift.weight_before?.toFixed(1) ?? '—'}% to ${bigSectorShift.weight_after?.toFixed(1) ?? '—'}%.`,
      confidence: 'high',
    })
  }

  const unchanged = holding_deltas.filter((h) => h.status === 'unchanged').length
  const changed   = holding_deltas.length - unchanged

  const summary = changed === 0
    ? `No significant changes were detected between the two snapshots (${daysLabel} apart).`
    : `Over ${daysLabel}: ${changed} holding${changed !== 1 ? 's' : ''} changed${
        added_tickers.length    ? `, ${added_tickers.length} added`    : ''
      }${removed_tickers.length ? `, ${removed_tickers.length} removed` : ''
      }${total_value_delta != null ? `, value ${fmtCurr(total_value_delta)}` : ''}.`

  return {
    query,
    category: 'general',
    summary,
    items: items.slice(0, 6),
    followUps: [
      'Which stock contributes the most risk?',
      'Has my diversification improved?',
      'What sectors am I missing?',
      'Give me a portfolio overview',
    ],
  }
}

// ─── Query router ─────────────────────────────────────────────────────────────

/**
 * Routes a natural language query to the appropriate domain analyzer.
 * Replace body with claudeApi.ask() for AI-powered responses — same return type.
 */
export function routeQuery(query: string, input: AdvisorEngineInput): AdvisorResponse {
  const q = query.toLowerCase()

  // Delta / change / history queries — check FIRST so "what changed" and
  // "how has my portfolio evolved" don't fall through to general analysis.
  if (/what.changed|changed.since|since.last|snapshot|recent.change|upload|new.holding|removed|added.holding|evolved|evolution|portfolio.history|how.has.my|when.did.i.add|when.was/.test(q)) {
    return analyzeDelta(query, input)
  }
  if (/sector|diversif|miss|allocat|spread|expos|breadth/.test(q)) {
    return analyzeDiversification(query, input)
  }
  if (/risk|concentrat|biggest|largest|dominant|top.hold|contribut|most/.test(q)) {
    return analyzeConcentration(query, input)
  }
  if (/dividend|income|yield|payout/.test(q)) {
    return analyzeDividends(query, input)
  }
  if (/valu|pe\b|p\/e|price.earn|expensiv|cheap|overvalued|undervalued|pb\b|p\/b|multiple/.test(q)) {
    return analyzeValuation(query, input)
  }
  if (/watchlist|opportunit|buy|add|consider|not.own|haven.t|have.not/.test(q)) {
    return analyzeWatchlist(query, input)
  }
  if (/peer|compet|compar|roe|industry|rival|sector.leader/.test(q)) {
    return analyzePeerComparison(query, input)
  }
  if (/perform|return|gain|loss|winner|loser|best|worst|profit/.test(q)) {
    return analyzePerformance(query, input)
  }
  return analyzeGeneral(query, input)
}

// ─── Suggested questions ──────────────────────────────────────────────────────

/** Returns context-aware suggested questions based on portfolio state. */
export function getSuggestedQuestions(input: Partial<AdvisorEngineInput>): string[] {
  const base = [
    'Give me a portfolio overview',
    'Which stock contributes the most risk?',
    'What sectors am I missing?',
    'Is my portfolio overvalued?',
    'How much dividend income do I earn?',
    'What are my watchlist opportunities?',
    'Which of my holdings has the best ROE?',
    'Who is my best performer?',
  ]

  const extra: string[] = []

  // Delta-aware questions (shown only when snapshot history exists)
  if (input.latestDelta) {
    extra.unshift('What changed in my portfolio?')
    extra.unshift('How has my portfolio evolved?')
    if ((input.latestDelta.added_tickers?.length ?? 0) > 0) {
      extra.push('Tell me about my newly added holdings')
    }
    if ((input.latestDelta.removed_tickers?.length ?? 0) > 0) {
      extra.push('Why might I have removed those holdings?')
    }
    if ((input.latestDelta.days_apart ?? 0) > 30) {
      extra.push('Has my diversification improved since last month?')
    }
  }

  if (input.riskSnapshot?.single_stock_flag) {
    extra.unshift('How much risk does my largest holding add?')
  }
  if ((input.watchlistItems?.length ?? 0) > 0) {
    extra.push('Which watchlist stocks differ most from what I own?')
  }
  if ((input.sectors?.length ?? 0) < 5) {
    extra.push('Which sectors should I add to reduce risk?')
  }

  return [...extra, ...base].slice(0, 8)
}
