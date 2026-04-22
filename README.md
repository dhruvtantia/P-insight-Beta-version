# 🚀 P-Insight — Portfolio Intelligence Platform

P-Insight is a self-hosted portfolio analytics system designed for retail equity investors who want institutional-grade insights without institutional tools.

It transforms a simple portfolio upload into a complete analytical stack — covering performance, risk, fundamentals, and (future) AI-driven decision support.

---

## 📌 Overview

- Focus: Indian equity portfolios  
- Users: Retail investors managing ₹10L–₹5Cr portfolios  
- Goal: Upload once → understand your portfolio in under 30 seconds → return weekly  

---

## 🧠 Key Features

### Portfolio Upload & Enrichment
- Upload CSV from broker or manual tracking  
- Automatic column detection + mapping  
- Enrichment with sector, metadata, fundamentals  

### Dashboard
- Portfolio value, P&L, allocation  
- Sector breakdown  
- Top holdings  
- Actionable insights  

### Risk & Quant Analytics
- Concentration metrics (HHI, diversification score)  
- Volatility, Sharpe, Sortino  
- Drawdown analysis  
- Correlation matrix  
- Benchmark comparison (NIFTY 50)  

### Fundamentals
- PE, PB, ROE, margins  
- Weighted portfolio metrics  
- Data-source transparency  

### Peer Comparison
- Compare holdings vs industry peers  
- Identify valuation gaps  

### Market Context
- Index tracking (NIFTY, Sensex, Bank Nifty)  
- Sector performance  
- Gainers / losers  

### Watchlist
- Track potential investments  
- Add from portfolio or peer comparisons  

### Snapshots
- Track portfolio changes over time  
- Compare allocation and holdings  

### AI Advisor (In Development)
- Natural language queries  
- Rule-based + LLM insights  
- Structured recommendations  

---

## 🏗️ Architecture

### Frontend
- Next.js (App Router)  
- TypeScript + Tailwind  
- Zustand state management  

### Backend
- FastAPI (Python 3.11+)  
- SQLAlchemy + SQLite  
- Modular services and analytics engine  

### Data Sources
- yfinance (primary)  
- FMP (fallback)  
- NewsAPI (optional)  

---

## 🔬 Analytics Engine

- Portfolio return computation  
- Risk metrics (volatility, beta, drawdown)  
- Correlation analysis  
- Benchmark comparison  
- Optimization (PyPortfolioOpt)  

---

## 🚧 Current Limitations

- Reliance on external APIs for market data  
- Optimization constraints still being refined  
- Broker sync not implemented  
- AI advisor not yet live  
- Indian market only  

---

## 🔮 Roadmap

### Short-Term
- AI advisor integration  
- Optimization improvements  
- Better caching  

### Medium-Term
- Broker integrations  
- US market expansion  

### Long-Term
- Multi-user system  
- Real-time analytics  
- Portfolio recommendations  

---

## 🛠️ Setup

### Backend
```bash
cd backend
poetry install --no-root
poetry env activate
uvicorn main:app --reload --port 8000'''

### Author
Dhruv Tantia
Statistics + Financial Risk Management (University of Waterloo)
