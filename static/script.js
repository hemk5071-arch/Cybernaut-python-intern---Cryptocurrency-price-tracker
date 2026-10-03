const state = { chart: null, timer: null, selectedCoin: '', history: [], range: 'all', coins: [] };
const $ = (selector) => document.querySelector(selector);

function money(value) { return value == null ? '--' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 1 ? 6 : 2 }).format(value); }
function change(value) { return value == null ? '--' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`; }
function setStatus(text, offline = false) { $('#status-text').textContent = text; $('.status').classList.toggle('offline', offline); }
function toast(text) { const node = $('#toast'); node.textContent = text; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2600); }
function chartPalette() { const light = document.documentElement.dataset.theme === 'light'; return { text: light ? '#60716a' : '#8997a5', grid: light ? 'rgba(96,113,106,.16)' : 'rgba(137,151,165,.12)', positive: light ? '#557c12' : '#c8f169', negative: light ? '#bf4942' : '#ff7f79' }; }
function chartColor(history) { const colors = chartPalette(); return history.length > 1 && history[history.length - 1].price_usd < history[0].price_usd ? colors.negative : colors.positive; }
function applyThemeToCharts() {
  if (typeof Chart === 'undefined') return;
  const colors = chartPalette();
  [$('#live-chart'), $('#history-chart')].forEach(canvas => {
    const chart = Chart.getChart(canvas);
    if (!chart) return;
    Object.values(chart.options.scales || {}).forEach(scale => {
      if (scale.ticks) scale.ticks.color = colors.text;
      if (scale.grid) scale.grid.color = colors.grid;
    });
    const dataset = chart.data.datasets[0];
    const prices = dataset.data.map(point => typeof point === 'number' ? point : point.y);
    const color = prices.length > 1 && prices[prices.length - 1] < prices[0] ? colors.negative : colors.positive;
    dataset.borderColor = color;
    dataset.backgroundColor = `${color}20`;
    chart.update('none');
  });
}
function rangeStart(range) { const hours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }; const latest = state.history.length ? Date.parse(state.history[state.history.length - 1].timestamp) : Date.now(); const end = Number.isFinite(latest) ? latest : Date.now(); return hours[range] ? end - hours[range] * 60 * 60 * 1000 : 0; }
function visibleHistory() { const start = rangeStart(state.range); return state.history.filter(item => !start || new Date(item.timestamp).getTime() >= start); }
function setChartMessage(text) { const node = $('#chart-message'); node.textContent = text; node.hidden = !text; }

function updateChartStats(history) {
  const selected = state.coins.find(coin => coin.name === state.selectedCoin);
  const latest = history[history.length - 1];
  const prices = history.map(item => item.price_usd).filter(Number.isFinite);
  $('#chart-current').textContent = latest ? money(latest.price_usd) : '--';
  $('#chart-symbol').textContent = selected?.symbol || latest?.symbol || '--';
  $('#chart-change').textContent = change(selected?.change_24h_pct ?? latest?.change_24h_pct);
  $('#chart-change').className = (selected?.change_24h_pct ?? latest?.change_24h_pct ?? 0) >= 0 ? 'positive' : 'negative';
  $('#chart-high').textContent = prices.length ? money(Math.max(...prices)) : '--';
  $('#chart-low').textContent = prices.length ? money(Math.min(...prices)) : '--';
}

function renderLiveChart() {
  const history = visibleHistory();
  const colors = chartPalette();
  updateChartStats(history);
  if (typeof Chart === 'undefined') { setChartMessage('Chart library unavailable.'); return; }
  if (!history.length) { setChartMessage('No historical data available yet. Live data will appear as the tracker collects market snapshots.'); if (state.chart) { state.chart.data.datasets[0].data = []; state.chart.update('none'); } return; }
  setChartMessage(history.length < 3 ? 'Collecting more snapshots. Additional points will appear every 30 seconds.' : '');
  const color = chartColor(history);
  if (!state.chart) {
    state.chart = new Chart($('#live-chart'), {
      type: 'line',
      data: { datasets: [{ label: 'Price', data: history.map(item => ({ x: item.timestamp, y: item.price_usd })), borderColor: color, backgroundColor: `${color}20`, fill: true, tension: .3, pointRadius: context => context.dataIndex === history.length - 1 ? 5 : 0, pointHoverRadius: 6, borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 450 }, interaction: { intersect: false, mode: 'index' },
        scales: {
          x: { type: 'time', time: { tooltipFormat: 'MMM d, HH:mm' }, grid: { color: colors.grid }, ticks: { color: colors.text, maxTicksLimit: 7 } },
          y: { grid: { color: colors.grid }, ticks: { color: colors.text, callback: value => money(value) } }
        },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => new Date(items[0].parsed.x).toLocaleString(), label: context => `Price: ${money(context.parsed.y)}` } } }
      }
    });
  } else {
    state.chart.data.datasets[0].data = history.map(item => ({ x: item.timestamp, y: item.price_usd }));
    state.chart.options.scales.x.grid.color = colors.grid;
    state.chart.options.scales.x.ticks.color = colors.text;
    state.chart.options.scales.y.grid.color = colors.grid;
    state.chart.options.scales.y.ticks.color = colors.text;
    applyThemeToCharts();
  }
}

async function loadChartHistory(name = state.selectedCoin) {
  if (!name) return;
  state.selectedCoin = name; setChartMessage('Loading historical data...');
  try { const response = await fetch(`/api/history/${encodeURIComponent(name)}?limit=100`); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to load chart data'); state.history = result.data || []; const latest = state.history[state.history.length - 1]; $('#chart-source').textContent = latest ? `As of ${new Date(latest.timestamp).toLocaleString()}` : 'No history yet'; renderLiveChart(); }
  catch (error) { state.history = []; renderLiveChart(); setChartMessage('Unable to load chart data. Retrying on the next refresh.'); }
}

function populateChartSelector(coins) {
  const names = coins.map(coin => coin.name); const select = $('#chart-coin');
  if (!names.length) { select.innerHTML = '<option>No cryptocurrencies available</option>'; return; }
  const next = names.includes(state.selectedCoin) ? state.selectedCoin : names[0];
  select.innerHTML = names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join(''); select.value = next;
  if (next !== state.selectedCoin) loadChartHistory(next); else renderLiveChart();
}

async function loadCoins() {
  setStatus('Updating'); $('#refresh-button').disabled = true;
  const params = new URLSearchParams();
  [['min-price', 'min_price'], ['min-change', 'min_change_pct'], ['alert-threshold', 'alert_threshold_pct']].forEach(([id, key]) => { if ($('#' + id).value) params.set(key, $('#' + id).value); });
  try {
    const response = await fetch(`/api/coins?${params}`); const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    state.coins = result.coins; renderCoins(result.coins); const selectedBeforeRefresh = state.selectedCoin; populateChartSelector(result.coins); if (selectedBeforeRefresh && selectedBeforeRefresh === state.selectedCoin) loadChartHistory(state.selectedCoin); $('#data-source').textContent = result.stale ? 'Showing cached data' : 'Live data';
    setStatus(result.stale ? 'Cached' : 'Live', result.stale); $('#last-updated').textContent = `Last updated ${new Date().toLocaleTimeString()}`;
    $('#message').hidden = !result.error; $('#message').textContent = result.error ? 'Live source unavailable. Showing the most recently stored snapshot.' : '';
  } catch (error) { setStatus('Unavailable', true); $('#message').hidden = false; $('#message').textContent = error.message; }
  finally { $('#refresh-button').disabled = false; }
}
function renderCoins(coins) {
  $('#tracked').textContent = coins.length; $('#alerts').textContent = coins.filter(c => c.alert).length;
  const highest = coins.reduce((a, b) => !a || b.price_usd > a.price_usd ? b : a, null); const gainer = coins.reduce((a, b) => !a || (b.change_24h_pct || -Infinity) > (a.change_24h_pct || -Infinity) ? b : a, null);
  $('#highest').textContent = highest ? money(highest.price_usd) : '--'; $('#gainer').textContent = gainer ? `${gainer.symbol || gainer.name} ${change(gainer.change_24h_pct)}` : '--';
  $('#coin-rows').innerHTML = coins.length ? coins.map((coin, index) => `<tr class="${coin.alert ? 'alert-row' : ''}"><td>${index + 1}</td><td><span class="coin-name">${escapeHtml(coin.name)}</span><span class="symbol">${escapeHtml(coin.symbol || '')}</span></td><td>${money(coin.price_usd)}</td><td class="${(coin.change_24h_pct || 0) >= 0 ? 'positive' : 'negative'}">${change(coin.change_24h_pct)}</td><td>${escapeHtml(coin.market_cap_usd || '--')}</td><td>${coin.alert ? '<span class="alert-tag">ALERT</span>' : '<span class="symbol">—</span>'}</td><td><button class="history" data-coin="${escapeHtml(coin.name)}">HISTORY</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty">No coins match these filters.</td></tr>';
  document.querySelectorAll('.history').forEach(button => button.addEventListener('click', () => showHistory(button.dataset.coin)));
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
async function showHistory(name) {
  try {
    const response = await fetch(`/api/history/${encodeURIComponent(name)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const colors = chartPalette();
    const history = result.data || [];
    const color = chartColor(history);
    $('#chart-title').textContent = `${name} price history`;
    $('#modal').hidden = false;
    $('#modal').setAttribute('aria-hidden', 'false');
    if (state.chart) state.chart.destroy();
    state.chart = new Chart($('#history-chart'), {
      type: 'line',
      data: { labels: history.map(item => new Date(item.timestamp).toLocaleString()), datasets: [{ label: 'USD price', data: history.map(item => item.price_usd), borderColor: color, backgroundColor: `${color}20`, fill: true, tension: .3 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { ticks: { color: colors.text, maxTicksLimit: 6 }, grid: { color: colors.grid } }, y: { ticks: { color: colors.text }, grid: { color: colors.grid } } },
        plugins: { legend: { labels: { color: colors.text } } }
      }
    });
    $('#close-modal').focus();
  } catch (error) { toast(error.message); }
}
function closeHistory() { const modal = $('#modal'); modal.hidden = true; modal.setAttribute('aria-hidden', 'true'); if (state.chart) { state.chart.destroy(); state.chart = null; } }
function setTheme(theme, persist = true) {
  const activeTheme = theme === 'light' ? 'light' : 'dark';
  const nextTheme = activeTheme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = activeTheme;
  $('#theme-toggle').setAttribute('aria-label', `Switch to ${nextTheme} theme`);
  $('#theme-toggle').title = `Switch to ${nextTheme} theme`;
  $('#theme-icon').textContent = activeTheme === 'light' ? '☾' : '☼';
  $('#theme-label').textContent = `${nextTheme[0].toUpperCase()}${nextTheme.slice(1)} mode`;
  if (persist) { try { localStorage.setItem('cryptopulse-theme', activeTheme); } catch {} }
  applyThemeToCharts();
}
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
setTheme(document.documentElement.dataset.theme || 'dark', false);
$('#refresh-button').addEventListener('click', loadCoins); $('#apply-button').addEventListener('click', loadCoins); $('#reset-button').addEventListener('click', () => { $('#min-price').value = ''; $('#min-change').value = ''; $('#alert-threshold').value = '5'; loadCoins(); }); $('#close-modal').addEventListener('click', closeHistory); $('#modal').addEventListener('click', event => { if (event.target === $('#modal')) closeHistory(); }); document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#modal').hidden) closeHistory(); });
$('#chart-coin').addEventListener('change', event => loadChartHistory(event.target.value)); document.querySelectorAll('.range-button').forEach(button => button.addEventListener('click', () => { state.range = button.dataset.range; document.querySelectorAll('.range-button').forEach(item => item.classList.toggle('active', item === button)); renderLiveChart(); }));
loadCoins(); state.timer = setInterval(loadCoins, 30000);
