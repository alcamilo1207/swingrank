# Swing Trading Ranker — Implementation Plan

## Architecture
- **Backend**: Python Flask server using `yfinance` to pull live OHLCV data
- **Frontend**: Single-page HTML/CSS/JS with a dark trading terminal aesthetic
- **No external JS framework needed** — vanilla JS with Chart.js for sparklines

## Scoring Factors (0-100 each → weighted composite)

| Factor | Weight | Logic |
|--------|--------|-------|
| 20D Momentum | 15% | % change over 20 days, normalized |
| 50D Momentum | 15% | % change over 50 days, normalized |
| RS vs SPY | 20% | Relative performance vs SPY |
| Volume | 10% | Current vol vs 20D avg vol |
| ATR | 10% | ATR normalized for volatility quality |
| MA Structure | 15% | Price vs 10/20/50 MA alignment |
| RSI | 10% | RSI(14) normalized to swing-trade sweet spot |
| Market Regime | 5% | SPY vs its 50D MA |

## Files
- `app.py` — Flask backend, /api/ranks endpoint
- `templates/index.html` — Main UI
- `static/style.css` — Styling
- `static/app.js` — Frontend logic
- `requirements.txt` — Dependencies
