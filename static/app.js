/**
 * SwingRank — Frontend Logic
 * Handles API fetching, card rendering, sparklines, and detail view.
 */

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE   = '';          // same-origin
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 min

// Factor display metadata
const FACTORS = [
  { key: 'momentum_20d',  label: '20D Momentum',  weight: '15%' },
  { key: 'momentum_50d',  label: '50D Momentum',  weight: '15%' },
  { key: 'rs_vs_spy',     label: 'RS vs SPY',     weight: '20%' },
  { key: 'volume',        label: 'Volume Surge',  weight: '10%' },
  { key: 'atr',           label: 'ATR Quality',   weight: '10%' },
  { key: 'ma_structure',  label: 'MA Structure',  weight: '15%' },
  { key: 'rsi',           label: 'RSI',           weight: '10%' },
  { key: 'market_regime', label: 'Market Regime', weight: '5%'  },
];

// ─── State ────────────────────────────────────────────────────────────────────
let allData       = [];
let activeTickerIdx = -1;
let sortKey       = 'composite';
let refreshTimer  = null;
let sparkChartRef = null;  // Chart.js instance for detail sparkline

// ─── Utility helpers ──────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);

function scoreColor(v) {
  if (v >= 80) return '#22d3a0';
  if (v >= 60) return '#4f8ef7';
  if (v >= 40) return '#f5c542';
  return '#f05a7e';
}

function fmtChg(pct) {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Load Chart.js lazily from CDN ────────────────────────────────────────────
function loadChartJs() {
  return new Promise((resolve) => {
    if (window.Chart) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

// ─── API calls ────────────────────────────────────────────────────────────────
async function fetchRankings(tickers = '') {
  const qs = tickers ? `?tickers=${encodeURIComponent(tickers)}` : '';
  const res = await fetch(`${API_BASE}/api/ranks${qs}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json.data;
}

async function fetchSentiment() {
  const res = await fetch(`${API_BASE}/api/sentiment`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Sentiment API error');
  return json.data;
}

function renderSentiment(d) {
  // Regime badge
  const badge = $('#sentiment-regime-badge');
  badge.className = `regime-badge ${d.regime.toLowerCase()}`;
  badge.innerHTML = `<span class="badge-text">${d.regime_title}</span>`;

  // Overview metrics
  $('#spy-close-price').textContent = `$${d.spy_close.toFixed(2)}`;
  const spyChgEl = $('#spy-price-chg');
  spyChgEl.textContent = fmtChg(d.change_pct_1d);
  spyChgEl.className = `sc-chg ${d.change_pct_1d >= 0 ? 'pos' : 'neg'}`;
  $('#spy-sma-50').textContent = `$${d.sma_50.toFixed(2)}`;
  $('#spy-sma-200').textContent = `$${d.sma_200.toFixed(2)}`;

  // Bull Condition 1: SPY_close > SMA_200
  const c1Card = $('#card-cond-bull1');
  const c1Met = d.cond_close_gt_sma200;
  c1Card.className = `sentiment-card formula-card ${c1Met ? 'met' : 'unmet'}`;
  $('#val-cond-bull1').innerHTML = `
    <span class="val-left">$${d.spy_close.toFixed(2)}</span>
    <span class="val-op">&gt;</span>
    <span class="val-right">$${d.sma_200.toFixed(2)}</span>
  `;
  $('#status-cond-bull1').innerHTML = c1Met ? '✅ TRUE' : '❌ FALSE';

  // Bull Condition 2: SMA_50 > SMA_200
  const c2Card = $('#card-cond-bull2');
  const c2Met = d.cond_sma50_gt_sma200;
  c2Card.className = `sentiment-card formula-card ${c2Met ? 'met' : 'unmet'}`;
  $('#val-cond-bull2').innerHTML = `
    <span class="val-left">$${d.sma_50.toFixed(2)}</span>
    <span class="val-op">&gt;</span>
    <span class="val-right">$${d.sma_200.toFixed(2)}</span>
  `;
  $('#status-cond-bull2').innerHTML = c2Met ? '✅ TRUE' : '❌ FALSE';

  // Bear Condition: SPY_close < SMA_200
  const c3Card = $('#card-cond-bear');
  const c3Met = d.cond_close_lt_sma200;
  c3Card.className = `sentiment-card formula-card ${c3Met ? 'met' : 'unmet'}`;
  $('#val-cond-bear').innerHTML = `
    <span class="val-left">$${d.spy_close.toFixed(2)}</span>
    <span class="val-op">&lt;</span>
    <span class="val-right">$${d.sma_200.toFixed(2)}</span>
  `;
  $('#status-cond-bear').innerHTML = c3Met ? '🔴 TRUE (BEAR)' : '⚪ FALSE';

  // If KaTeX loaded, render KaTeX formulas inside sentiment-section
  if (window.renderMathInElement) {
    renderMathInElement($('#sentiment-section'), {
      delimiters: [
        {left: '\\(', right: '\\)', display: false},
        {left: '\\[', right: '\\]', display: true}
      ],
      throwOnError: false
    });
  }
}

// ─── Render pulse bar (scrolling ticker tape) ─────────────────────────────────
function renderPulse(data) {
  const bar = $('#pulse-bar');

  // Build one set of items (use all tickers)
  const itemsHTML = data.map((d) => `
    <div class="pulse-item">
      <span class="pulse-ticker">${d.ticker}</span>
      <span class="pulse-price">$${d.price.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
      <span class="pulse-chg ${d.change_pct_1d >= 0 ? 'pos' : 'neg'}">${fmtChg(d.change_pct_1d)}</span>
    </div>
    <span class="pulse-sep">·</span>
  `).join('');

  // Duplicate for a seamless infinite loop (CSS animates -50%)
  bar.innerHTML = itemsHTML + itemsHTML;

  // Scale duration to number of items (~3.5s per ticker)
  const duration = data.length * 3.5;
  bar.style.setProperty('--ticker-duration', `${duration}s`);
}

// ─── Draw mini sparkline (canvas 2D) ─────────────────────────────────────────
function drawMiniSpark(canvas, data, color) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!data || data.length < 2) return;

  const step = w / (data.length - 1);
  const toY  = (v) => h - (v / 100) * h;

  // Fill gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '00');

  ctx.beginPath();
  ctx.moveTo(0, toY(data[0]));
  data.forEach((v, i) => { if (i > 0) ctx.lineTo(i * step, toY(v)); });
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(0, toY(data[0]));
  data.forEach((v, i) => { if (i > 0) ctx.lineTo(i * step, toY(v)); });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ─── Render ranking cards ─────────────────────────────────────────────────────
function rankBadgeClass(i) {
  if (i === 0) return 'gold';
  if (i === 1) return 'silver';
  if (i === 2) return 'bronze';
  return 'plain';
}

function renderCards(data) {
  const list = $('#ranking-list');
  list.innerHTML = '';
  $('#panel-count').textContent = `${data.length} tickers`;

  data.forEach((d, i) => {
    const color    = scoreColor(d.composite);
    const chgClass = d.change_pct_1d >= 0 ? 'pos' : 'neg';
    const card     = document.createElement('div');
    card.className = 'rank-card';
    card.style.setProperty('--score-color', color);
    card.dataset.idx = i;

    card.innerHTML = `
      <div class="rank-badge ${rankBadgeClass(i)}">${i + 1}</div>
      <div class="card-body">
        <div class="card-top">
          <span class="card-ticker">${d.ticker}</span>
          <span class="card-price">$${d.price.toLocaleString('en-US', {minimumFractionDigits:2})}</span>
          <span class="card-chg ${chgClass}">${fmtChg(d.change_pct_1d)}</span>
        </div>
        <div class="sparkline-wrap">
          <canvas width="340" height="22"></canvas>
        </div>
      </div>
      <div class="card-score">
        <span class="score-value">${d.composite}</span>
        <span class="score-label">Score</span>
      </div>
    `;

    list.appendChild(card);

    // Draw sparkline
    const canvas = card.querySelector('canvas');
    drawMiniSpark(canvas, d.sparkline, color);

    card.addEventListener('click', () => selectCard(i));
  });
}

// ─── Select a card & render detail ───────────────────────────────────────────
function selectCard(idx) {
  activeTickerIdx = idx;

  // Update active class
  document.querySelectorAll('.rank-card').forEach((c) => c.classList.remove('active'));
  const activeCard = document.querySelector(`.rank-card[data-idx="${idx}"]`);
  if (activeCard) {
    activeCard.classList.add('active');
    activeCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  renderDetail(allData[idx]);
  renderSignals(allData[idx]);
}

async function renderDetail(d) {
  await loadChartJs();

  const placeholder = $('#detail-placeholder');
  const content     = $('#detail-content');
  placeholder.classList.add('hidden');
  content.classList.remove('hidden');

  const chgClass = d.change_pct_1d >= 0 ? 'pos' : 'neg';
  const color    = scoreColor(d.composite);

  // Build factor rows HTML
  const factorRows = FACTORS.map(f => {
    const val = d.scores[f.key] ?? 0;
    const c   = scoreColor(val);
    return `
      <div class="breakdown-row">
        <span class="br-name">${f.label}</span>
        <div class="br-bar-wrap">
          <div class="br-bar" style="width:${val}%; background:${c};"></div>
        </div>
        <span class="br-score" style="color:${c};">${val}</span>
      </div>
    `;
  }).join('');

  // Score card grid
  const scoreCards = FACTORS.map(f => {
    const val = d.scores[f.key] ?? 0;
    const c   = scoreColor(val);
    return `
      <div class="score-card" style="--bar-color:${c}; --bar-width:${val}%;">
        <div class="sc-name">${f.label}</div>
        <div class="sc-value">${val}</div>
        <div class="sc-gauge">
          <div class="sc-gauge-fill" style="width:${val}%; background:${c};"></div>
        </div>
      </div>
    `;
  }).join('');

  content.innerHTML = `
    <!-- Header -->
    <div class="d-header">
      <div>
        <div class="d-ticker-row">
          <span class="d-ticker">${d.ticker}</span>
          <span class="d-price">$${d.price.toLocaleString('en-US', {minimumFractionDigits:2})}</span>
          <span class="d-chg ${chgClass}">${fmtChg(d.change_pct_1d)}</span>
        </div>
        <div class="quick-stats" style="margin-top:14px;">
          <div class="stat-box">
            <div class="stat-name">20D Change</div>
            <div class="stat-val ${d.change_pct_20d >= 0 ? 'pos' : 'neg'}">${fmtChg(d.change_pct_20d)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-name">RSI (14)</div>
            <div class="stat-val">${d.rsi_raw}</div>
          </div>
          <div class="stat-box">
            <div class="stat-name">ATR %</div>
            <div class="stat-val">${d.atr_pct}%</div>
          </div>
        </div>
      </div>
      <div class="d-composite">
        <div class="d-composite-val">${d.composite}</div>
        <div class="d-composite-label">Composite Score</div>
      </div>
    </div>

    <!-- 20-day price chart -->
    <div class="d-chart-wrap">
      <div class="d-chart-title">20-Day Price Action (normalised)</div>
      <canvas id="detail-chart" height="110"></canvas>
    </div>

    <!-- Score grid -->
    <div class="score-grid">${scoreCards}</div>

    <!-- Factor breakdown -->
    <div class="breakdown-wrap">
      <div class="breakdown-header">Factor Breakdown</div>
      ${factorRows}
      <div class="composite-row">
        <span class="composite-row-label">Composite Score</span>
        <span class="composite-row-val">${d.composite}</span>
      </div>
    </div>
  `;

  // Render Chart.js line chart for sparkline
  if (sparkChartRef) { sparkChartRef.destroy(); sparkChartRef = null; }
  const canvas = $('#detail-chart');
  sparkChartRef = new Chart(canvas, {
    type: 'line',
    data: {
      labels: d.sparkline.map((_, i) => `-${d.sparkline.length - 1 - i}d`),
      datasets: [{
        data: d.sparkline,
        borderColor: color,
        backgroundColor: color + '20',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#131929',
        borderColor: '#1a2236',
        borderWidth: 1,
        titleColor: '#8b9bbf',
        bodyColor: color,
        callbacks: {
          label: (ctx) => `  Normalised: ${ctx.parsed.y.toFixed(1)}`,
        },
      }},
      scales: {
        x: { grid: { color: '#1a2236' }, ticks: { color: '#4d5d80', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0, maxTicksLimit: 6 } },
        y: { grid: { color: '#1a2236' }, ticks: { color: '#4d5d80', font: { family: 'JetBrains Mono', size: 10 } }, min: 0, max: 100 },
      },
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 600, easing: 'easeInOutQuart' },
    },
  });
}

function renderSignals(d) {
  const placeholder = $('#signal-placeholder');
  const content     = $('#signal-content');
  if (placeholder) placeholder.classList.add('hidden');
  if (content) content.classList.remove('hidden');

  content.innerHTML = `
    <!-- ── TRADING POSITION SIGNALS SECTION ── -->
    <div class="signal-section">
      <div class="signal-header">
        <div class="signal-title-wrap">
          <span class="signal-icon">🎯</span>
          <span class="signal-title">Trading Position Signals — ${d.ticker}</span>
        </div>
        <div class="signal-badge ${d.signals ? d.signals.signal_status.toLowerCase() : 'no_signal'}">
          ${d.signals ? d.signals.signal_badge : '⚪ NO SIGNAL'}
        </div>
      </div>

      <!-- Trend Filter Sub-Section -->
      <div class="signal-group">
        <div class="signal-group-header">
          <span class="sg-title">1. Trend Filter Conditions</span>
          <span class="sg-status ${d.signals && d.signals.trend_filter_passed ? 'passed' : 'failed'}">
            ${d.signals && d.signals.trend_filter_passed ? '✅ ALL 5 CONDITIONS MET' : '❌ TREND FILTER NOT MET'}
          </span>
        </div>

        <div class="signal-grid-5">
          <!-- Check 1: Rank <= 10 -->
          <div class="sentiment-card formula-card ${d.signals && d.signals.cond_rank_le_10 ? 'met' : 'unmet'}">
            <div class="formula-header">
              <span class="formula-tag bull-tag">Rank Check</span>
              <span class="formula-math">\\( Rank \\le 10 \\)</span>
            </div>
            <div class="formula-values">
              <span class="val-left">Rank #${d.rank}</span>
              <span class="val-op">${d.rank <= 10 ? '≤' : '>'}</span>
              <span class="val-right">10</span>
            </div>
            <div class="formula-status">${d.signals && d.signals.cond_rank_le_10 ? '✅ TRUE' : '❌ FALSE'}</div>
          </div>

          <!-- Check 2: Price > SMA50 -->
          <div class="sentiment-card formula-card ${d.signals && d.signals.cond_price_gt_sma50 ? 'met' : 'unmet'}">
            <div class="formula-header">
              <span class="formula-tag bull-tag">Price vs SMA50</span>
              <span class="formula-math">\\( Price > SMA_{50} \\)</span>
            </div>
            <div class="formula-values">
              <span class="val-left">$${d.price}</span>
              <span class="val-op">&gt;</span>
              <span class="val-right">$${d.sma50}</span>
            </div>
            <div class="formula-status">${d.signals && d.signals.cond_price_gt_sma50 ? '✅ TRUE' : '❌ FALSE'}</div>
          </div>

          <!-- Check 3: SMA50 > SMA200 -->
          <div class="sentiment-card formula-card ${d.signals && d.signals.cond_sma50_gt_sma200 ? 'met' : 'unmet'}">
            <div class="formula-header">
              <span class="formula-tag bull-tag">Golden Alignment</span>
              <span class="formula-math">\\( SMA_{50} > SMA_{200} \\)</span>
            </div>
            <div class="formula-values">
              <span class="val-left">$${d.sma50}</span>
              <span class="val-op">&gt;</span>
              <span class="val-right">$${d.sma200}</span>
            </div>
            <div class="formula-status">${d.signals && d.signals.cond_sma50_gt_sma200 ? '✅ TRUE' : '❌ FALSE'}</div>
          </div>

          <!-- Check 4: 20D Momentum > 0 -->
          <div class="sentiment-card formula-card ${d.signals && d.signals.cond_momentum20d_gt_0 ? 'met' : 'unmet'}">
            <div class="formula-header">
              <span class="formula-tag bull-tag">20D Momentum</span>
              <span class="formula-math">\\( Mom_{20D} > 0 \\)</span>
            </div>
            <div class="formula-values">
              <span class="val-left">${d.change_pct_20d >= 0 ? '+' : ''}${d.change_pct_20d}%</span>
              <span class="val-op">&gt;</span>
              <span class="val-right">0%</span>
            </div>
            <div class="formula-status">${d.signals && d.signals.cond_momentum20d_gt_0 ? '✅ TRUE' : '❌ FALSE'}</div>
          </div>

          <!-- Check 5: 50D Momentum > 0 -->
          <div class="sentiment-card formula-card ${d.signals && d.signals.cond_momentum50d_gt_0 ? 'met' : 'unmet'}">
            <div class="formula-header">
              <span class="formula-tag bull-tag">50D Momentum</span>
              <span class="formula-math">\\( Mom_{50D} > 0 \\)</span>
            </div>
            <div class="formula-values">
              <span class="val-left">${d.change_pct_50d >= 0 ? '+' : ''}${d.change_pct_50d}%</span>
              <span class="val-op">&gt;</span>
              <span class="val-right">0%</span>
            </div>
            <div class="formula-status">${d.signals && d.signals.cond_momentum50d_gt_0 ? '✅ TRUE' : '❌ FALSE'}</div>
          </div>
        </div>
      </div>

      <!-- Pullback & Confirmation Sub-Section -->
      <div class="signal-group">
        <div class="signal-group-header">
          <span class="sg-title">2. Pullback & Confirmation</span>
          <span class="sg-status ${d.signals && d.signals.cond_pullback ? 'passed' : 'failed'}">
            ${d.signals && d.signals.cond_pullback ? '✅ PULLBACK ACTIVE' : '⏳ AWAITING PULLBACK'}
          </span>
        </div>

        <div class="signal-grid-2">
          <!-- Pullback: Low_t <= SMA20_t -->
          <div class="sentiment-card formula-card ${d.signals && d.signals.cond_pullback ? 'met' : 'unmet'}">
            <div class="formula-header">
              <span class="formula-tag bull-tag">Pullback Condition</span>
              <span class="formula-math">\\( Low_t \\le SMA_{20,t} \\)</span>
            </div>
            <div class="formula-values">
              <span class="val-left">Low $${d.low_t}</span>
              <span class="val-op">&le;</span>
              <span class="val-right">SMA20 $${d.sma20}</span>
            </div>
            <div class="formula-status">${d.signals && d.signals.cond_pullback ? '✅ TRUE (TOUCHED 20MA)' : '⏳ FALSE'}</div>
          </div>

          <!-- Confirmation: Close_t > High_{t-1} -->
          <div class="sentiment-card formula-card ${d.signals && d.signals.cond_confirmation ? 'met' : 'unmet'}">
            <div class="formula-header">
              <span class="formula-tag bull-tag">Confirmation Condition</span>
              <span class="formula-math">\\( Close_t > High_{t-1} \\)</span>
            </div>
            <div class="formula-values">
              <span class="val-left">Close $${d.price}</span>
              <span class="val-op">&gt;</span>
              <span class="val-right">High(t-1) $${d.high_prev}</span>
            </div>
            <div class="formula-status">${d.signals && d.signals.cond_confirmation ? '✅ TRUE (BREAKOUT CONFIRMED)' : '⏳ FALSE'}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.renderMathInElement) {
    renderMathInElement($('#signal-content'), {
      delimiters: [
        {left: '\\(', right: '\\)', display: false},
        {left: '\\[', right: '\\]', display: true}
      ],
      throwOnError: false
    });
  }
}

// ─── Sort ─────────────────────────────────────────────────────────────────────
function sortedData(data, key) {
  const copy = [...data];
  if (key === 'composite') {
    copy.sort((a, b) => b.composite - a.composite);
  } else {
    copy.sort((a, b) => (b.scores[key] ?? 0) - (a.scores[key] ?? 0));
  }
  return copy;
}

// ─── Main load ────────────────────────────────────────────────────────────────
async function load(customTickers = '') {
  // Show overlay
  const overlay = $('#loading-overlay');
  overlay.classList.remove('hidden');

  const tickerList = customTickers
    ? customTickers.split(',').map(t => t.trim()).filter(Boolean)
    : null;
  $('#loading-count').textContent = tickerList ? tickerList.length : '~25';

  try {
    const [raw, sentimentData] = await Promise.all([
      fetchRankings(customTickers),
      fetchSentiment().catch(err => {
        console.warn('Sentiment fetch failed:', err);
        return null;
      })
    ]);

    allData = sortedData(raw, sortKey);

    renderPulse(allData);
    renderCards(allData);
    if (sentimentData) {
      renderSentiment(sentimentData);
    }

    $('#last-updated').textContent = `Updated ${now()}`;

    // If a card was active before, re-select it by ticker
    if (activeTickerIdx >= 0 && activeTickerIdx < allData.length) {
      const prevTicker = allData[activeTickerIdx]?.ticker;
      const newIdx     = allData.findIndex(d => d.ticker === prevTicker);
      if (newIdx >= 0) selectCard(newIdx);
    }
  } catch (err) {
    console.error(err);
    $('#ranking-list').innerHTML = `
      <div style="padding:24px; color:#f05a7e; font-size:13px;">
        ⚠ ${err.message || 'Failed to fetch data. Is the Flask server running?'}
      </div>`;
  } finally {
    overlay.classList.add('hidden');
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────
$('#scan-btn').addEventListener('click', () => {
  const val = $('#ticker-input').value.trim();
  activeTickerIdx = -1;
  clearInterval(refreshTimer);
  load(val);
  refreshTimer = setInterval(() => load(val), AUTO_REFRESH_MS);
});

$('#ticker-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#scan-btn').click();
});

$('#sort-select').addEventListener('change', (e) => {
  sortKey = e.target.value;
  allData = sortedData(allData, sortKey);
  renderCards(allData);
  if (activeTickerIdx >= 0) selectCard(activeTickerIdx);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
load();
refreshTimer = setInterval(() => load($('#ticker-input').value.trim()), AUTO_REFRESH_MS);
