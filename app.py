"""
Swing Trading Ranker - Flask Backend
Fetches live OHLCV data via yfinance and scores each ticker
on 8 swing-trading factors.
"""

import math
import numpy as np
import yfinance as yf
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─── Default universe ────────────────────────────────────────────────────────
DEFAULT_TICKERS = [
    # Mega-cap tech
    "NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AMD",
    # ETFs
    "SPY", "QQQ", "IWM", "XLK", "SOXX", "SMH", "ARKK", "XLE",
    # Growth / momentum favourites
    "PLTR", "CRWD", "PANW", "NFLX", "SPOT", "UBER", "MSTR", "COIN",
    # Healthcare / defensive
    "LLY", "UNH", "JNJ",
]

# ─── Helper maths ─────────────────────────────────────────────────────────────

def percentile_score(value: float, series: list[float]) -> float:
    """Return 0-100 score based on where value sits in the distribution."""
    if not series:
        return 50.0
    below = sum(1 for x in series if x <= value)
    return round((below / len(series)) * 100, 1)


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def rsi(prices: np.ndarray, period: int = 14) -> float:
    """Classic Wilder RSI."""
    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    avg_gain = gains[:period].mean()
    avg_loss = losses[:period].mean()
    for g, l in zip(gains[period:], losses[period:]):
        avg_gain = (avg_gain * (period - 1) + g) / period
        avg_loss = (avg_loss * (period - 1) + l) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> float:
    """Average True Range."""
    tr = np.maximum(
        high[1:] - low[1:],
        np.maximum(
            np.abs(high[1:] - close[:-1]),
            np.abs(low[1:] - close[:-1]),
        ),
    )
    return float(tr[-period:].mean())


# ─── Scoring functions ────────────────────────────────────────────────────────

def score_momentum(closes: np.ndarray, period: int) -> float:
    """% change over `period` days mapped to 0-100."""
    if len(closes) < period + 1:
        return 50.0
    pct = (closes[-1] - closes[-(period + 1)]) / closes[-(period + 1)] * 100
    # Map: -30% → 0, 0% → 50, +30% → 100
    return clamp((pct + 30) / 60 * 100)


def score_rs_vs_spy(ticker_pct_20d: float, spy_pct_20d: float) -> float:
    """Relative strength: how much ticker beat SPY over 20 days."""
    diff = ticker_pct_20d - spy_pct_20d  # e.g. +10 means 10 pp better
    return clamp((diff + 20) / 40 * 100)


def score_volume(vol_series: np.ndarray, lookback: int = 20) -> float:
    """Current volume vs 20-day average."""
    if len(vol_series) < lookback + 1:
        return 50.0
    avg = vol_series[-(lookback + 1):-1].mean()
    if avg == 0:
        return 50.0
    ratio = vol_series[-1] / avg  # 1.0 = in-line; >1.5 = surge
    return clamp((ratio - 0.3) / 2.2 * 100)


def score_atr(closes: np.ndarray, atr_val: float) -> float:
    """
    ATR as % of price — sweet spot for swing trading is 1-4%.
    We reward moderate volatility (not too low, not too high).
    """
    if closes[-1] == 0:
        return 50.0
    atr_pct = atr_val / closes[-1] * 100
    # Bell-curve centred on 2.5%
    peak = 2.5
    score = 100 * math.exp(-((atr_pct - peak) ** 2) / (2 * 1.5 ** 2))
    return clamp(score)


def score_ma_structure(closes: np.ndarray) -> float:
    """
    Score how aligned the MAs are in a bullish stack:
    Price > MA10 > MA20 > MA50 = 100, inverse = 0.
    """
    if len(closes) < 51:
        return 50.0
    price = closes[-1]
    ma10 = closes[-10:].mean()
    ma20 = closes[-20:].mean()
    ma50 = closes[-50:].mean()
    # 4 binary conditions worth 25 pts each
    score = 0.0
    if price > ma10:
        score += 25
    if ma10 > ma20:
        score += 25
    if ma20 > ma50:
        score += 25
    if price > ma50:
        score += 25
    return score


def score_rsi(rsi_val: float) -> float:
    """
    Swing trading sweet spot: 45-65 (momentum without overbought).
    RSI ~55 → 100.  RSI 30 or 80 → 0.
    """
    peak = 55.0
    return clamp(100 * math.exp(-((rsi_val - peak) ** 2) / (2 * 18 ** 2)))


def score_market_regime(spy_closes: np.ndarray) -> float:
    """SPY position relative to 50-day MA as a regime gauge."""
    if len(spy_closes) < 51:
        return 50.0
    price = spy_closes[-1]
    ma50 = spy_closes[-50:].mean()
    pct_above = (price - ma50) / ma50 * 100  # -5 to +5 typical
    return clamp((pct_above + 5) / 10 * 100)


# ─── Main fetch & score ───────────────────────────────────────────────────────

WEIGHTS = {
    "momentum_20d": 0.15,
    "momentum_50d": 0.15,
    "rs_vs_spy":    0.20,
    "volume":       0.10,
    "atr":          0.10,
    "ma_structure": 0.15,
    "rsi":          0.10,
    "market_regime":0.05,
}


def fetch_and_score(tickers: list[str]) -> list[dict]:
    # Always include SPY for regime + RS computation
    symbols = list(dict.fromkeys(["SPY"] + tickers))

    # Download 6 months of daily OHLCV in one shot
    raw = yf.download(
        symbols,
        period="6mo",
        interval="1d",
        auto_adjust=True,
        progress=False,
        group_by="ticker",
    )

    # Market regime from SPY
    try:
        spy_closes = raw["SPY"]["Close"].dropna().values
        spy_pct_20d = float(
            (spy_closes[-1] - spy_closes[-21]) / spy_closes[-21] * 100
        ) if len(spy_closes) > 21 else 0.0
        regime_score = score_market_regime(spy_closes)
    except Exception:
        spy_pct_20d = 0.0
        regime_score = 50.0

    results = []

    for ticker in tickers:
        try:
            df = raw[ticker].dropna()
            if len(df) < 55:
                continue

            closes = df["Close"].values.astype(float)
            highs  = df["High"].values.astype(float)
            lows   = df["Low"].values.astype(float)
            vols   = df["Volume"].values.astype(float)

            ticker_pct_20d = float(
                (closes[-1] - closes[-21]) / closes[-21] * 100
            ) if len(closes) > 21 else 0.0

            atr_val  = atr(highs, lows, closes)
            rsi_val  = rsi(closes)

            scores = {
                "momentum_20d": round(score_momentum(closes, 20), 1),
                "momentum_50d": round(score_momentum(closes, 50), 1),
                "rs_vs_spy":    round(score_rs_vs_spy(ticker_pct_20d, spy_pct_20d), 1),
                "volume":       round(score_volume(vols), 1),
                "atr":          round(score_atr(closes, atr_val), 1),
                "ma_structure": round(score_ma_structure(closes), 1),
                "rsi":          round(score_rsi(rsi_val), 1),
                "market_regime":round(regime_score, 1),
            }

            composite = round(
                sum(scores[k] * WEIGHTS[k] for k in WEIGHTS), 1
            )

            # Sparkline: last 20 closes normalised 0-100
            spark_raw = closes[-20:].tolist()
            mn, mx = min(spark_raw), max(spark_raw)
            rng = mx - mn if mx != mn else 1
            sparkline = [round((v - mn) / rng * 100, 1) for v in spark_raw]

            results.append({
                "ticker":        ticker,
                "price":         round(float(closes[-1]), 2),
                "change_pct_1d": round(float((closes[-1] - closes[-2]) / closes[-2] * 100), 2),
                "change_pct_20d":round(ticker_pct_20d, 2),
                "rsi_raw":       round(rsi_val, 1),
                "atr_pct":       round(atr_val / closes[-1] * 100, 2),
                "composite":     composite,
                "scores":        scores,
                "sparkline":     sparkline,
            })

        except Exception as e:
            print(f"[WARN] {ticker}: {e}")
            continue

    results.sort(key=lambda x: x["composite"], reverse=True)
    return results


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/ranks")
def api_ranks():
    custom = request.args.get("tickers", "")
    if custom.strip():
        tickers = [t.strip().upper() for t in custom.split(",") if t.strip()]
    else:
        tickers = [t for t in DEFAULT_TICKERS if t != "SPY"]
    try:
        data = fetch_and_score(tickers)
        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/detail/<ticker>")
def api_detail(ticker: str):
    try:
        data = fetch_and_score([ticker.upper()])
        if not data:
            return jsonify({"ok": False, "error": "No data"}), 404
        return jsonify({"ok": True, "data": data[0]})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5050)
