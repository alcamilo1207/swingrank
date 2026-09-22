<h1 align="center">SwingRank</h1>

SwingRank helps you compare stocks and ETFs for swing-trading research. It ranks a watchlist using eight technical factors and shows the trend, momentum and pullback conditions behind each result.

## Using SwingRank

1. Open the app to scan the default watchlist of 26 symbols.
2. Enter comma-separated symbols, such as AAPL, NVDA, MSFT, and select Scan to compare your own watchlist. Each scan accepts up to 100 nonempty entries; repeated symbols are processed once.
3. Sort the results by composite score or an individual factor.
4. Select a symbol to see its normalized 20-session price chart, factor breakdown and trading-position signals.

The app refreshes every five minutes while the page is open. An empty ticker field uses the default watchlist. Symbols are trimmed and converted to uppercase, with a limit of 32 characters each and 3,300 characters for the full input.

## Understanding the score

Each factor produces a score from 0 to 100. The composite is their weighted sum; a higher value means a closer match to the app's scoring rules, not a probability of profit.

| Factor | Weight | What it measures |
| --- | --- | --- |
| 20D Momentum | 15% | Price change over 20 trading sessions. |
| 50D Momentum | 15% | Price change over 50 trading sessions. |
| RS vs SPY | 20% | The symbol's 20-session return minus SPY's return. |
| Volume Surge | 10% | Latest daily volume relative to the preceding 20 sessions. |
| ATR Quality | 10% | Volatility as a percentage of price, with a scoring peak at 2.5%. |
| MA Structure | 15% | Four comparisons between price and the 10-, 20- and 50-session moving averages. |
| RSI | 10% | A smooth score centered on a 14-period RSI of 55. |
| Market Regime | 5% | SPY's distance above or below its 50-session moving average. |

The separate market sentiment panel uses SPY and its 50- and 200-session averages to describe bullish, bearish or mixed conditions. It is a proxy based on SPY, not a survey of every market.

## Reading the signals

- Trend qualified: the symbol ranks in the scan's top 10, its price is above its 50-session average, that average is above its 200-session average, and both momentum readings are positive.
- Pullback active: the trend filter passes and the latest low touches or falls below the 20-session average.
- Buy signal ready: the trend and pullback conditions pass, and the latest close exceeds the previous session's high.
- No trade signal: the trend filter does not pass.

Rank-based signals depend on the symbols included in the scan. Looking up a symbol alone can therefore produce a different signal from comparing it in a larger watchlist.

## Data and limitations

SwingRank uses adjusted daily price and volume data from Yahoo Finance through yfinance. Refreshing the page does not turn daily bars into a real-time price feed; data can be delayed, incomplete or unavailable. Symbols with fewer than 55 usable bars are omitted from rankings, and some calculations need longer histories.

The chart normalizes the latest 20 closes to a 0-100 range. Its vertical axis does not show dollar prices. Scores and signals describe technical conditions; the app does not place trades or guarantee future returns.
