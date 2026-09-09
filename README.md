# ⚡ SwingRank — Live Swing Trading Scanner

A real-time swing trading scanner that ranks stocks and ETFs using a composite score built from 8 technical factors.

![SwingRank UI](docs/preview.png)

## Features

- 🌐 **Global Market Sentiment Section**: Evaluates S&P 500 (SPY proxy) moving average regime conditions:
  - 🟢 **Bull Regime**: $$ SPY_{close} > SMA_{200} $$ AND $$ SMA_{50} > SMA_{200} $$
  - 🔴 **Bear Regime**: $$ SPY_{close} < SMA_{200} $$
- 🏆 **Ticker Rankings Panel**: Real-time composite scoring across 8 technical factors with infinite marquee ticker tape.
- 📊 **Interactive Charts & Factor Breakdown**: Detailed 20-day price trend analysis and individual factor scores for any selected asset.
- 📈 **Live data** via Yahoo Finance (no API key required)
- 🔍 **Custom universe** — scan any tickers on demand
- 🔄 **Auto-refresh** every 5 minutes

## Scoring Factors

| Factor | Weight | Logic |
|--------|--------|-------|
| 20D Momentum | 15% | % change over 20 days, normalised |
| 50D Momentum | 15% | % change over 50 days, normalised |
| RS vs SPY | 20% | Outperformance vs S&P 500 |
| Volume Surge | 10% | Today's volume vs 20-day average |
| ATR Quality | 10% | Rewards ideal swing-trade volatility (~2.5% ATR) |
| MA Structure | 15% | Price > MA10 > MA20 > MA50 bullish stack |
| RSI | 10% | Bell-curve peak at RSI 55 (momentum, not overbought) |
| Market Regime | 5% | SPY above/below its 50-day MA |

## Running Locally

```bash
git clone https://github.com/YOUR_USERNAME/swingrank.git
cd swingrank
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5050

## Deploying to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Select your repo — Railway auto-detects the `Procfile` and deploys
4. Your live URL is shown in the Railway dashboard

## Tech Stack

- **Backend**: Python · Flask · yfinance · NumPy
- **Frontend**: Vanilla JS · HTML/CSS · Chart.js
- **Deploy**: Railway (or any Procfile-compatible PaaS)
