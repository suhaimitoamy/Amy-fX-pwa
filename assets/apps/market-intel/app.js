/**
 * Amy FX — Market Intel App
 * ========================
 * Fetch: News dari SM_News_24h (via API)
 *        Heatmap dari liquidity calculation (via API)
 */

// ─── Config ──────────────────────────────────────────────
const API_BASE = 'https://amy-fx.vercel.app/api';
const REFRESH_INTERVAL = 60 * 1000; // Auto-refresh setiap 1 menit

// ─── State ───────────────────────────────────────────────
let currentTab = 'news';
let pendingNewsId = '';
let newsRouteRetries = 0;
const requestControllers = {};
const panelLoadedAt = {};

function newsId(item) {
  return String(item?.id || `${item?.time || ''}:${item?.textOriginal || item?.text || ''}`);
}

function newsTargetUrl(id) {
  const base = 'file:///android_asset/apps/market-intel/index.html';
  return `${base}#news=${encodeURIComponent(id)}`;
}

function readNewsRoute() {
  try {
    const hash = (location.hash || '').replace(/^#/, '');
    const params = new URLSearchParams(hash.includes('=') ? hash : location.search);
    return params.get('news') || '';
  } catch (_) {
    return '';
  }
}

function beginRequest(panel) {
  if (requestControllers[panel]) requestControllers[panel].abort();
  requestControllers[panel] = new AbortController();
  return requestControllers[panel].signal;
}

function shouldRefresh(panel, maxAge = 30000) {
  return !panelLoadedAt[panel] || Date.now() - panelLoadedAt[panel] > maxAge;
}

// ─── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  pendingNewsId = readNewsRoute();
  window.AmyFXIntel?.mountStrip(document.getElementById('market-command-strip'));
  window.AmyFXIntel?.mountBriefing(document.getElementById('intel-briefing'));
  setupTabs();
  setupNewsInteractions();
  loadNews();
  loadHeatmap();

  // Auto-refresh
  setInterval(() => {
    if (document.hidden) return;
    if (currentTab === 'news') loadNews(true);
    else if (currentTab === 'heatmap') loadHeatmap(true);
    else if (currentTab === 'liquidity') loadLiquidity(true);
  }, REFRESH_INTERVAL);

  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('webview-idle', document.hidden);
    if (!document.hidden) {
      if (currentTab === 'news' && shouldRefresh('news', REFRESH_INTERVAL)) loadNews(true);
      if (currentTab === 'heatmap' && shouldRefresh('heatmap', REFRESH_INTERVAL)) loadHeatmap(true);
      if (currentTab === 'liquidity' && shouldRefresh('liquidity', REFRESH_INTERVAL)) loadLiquidity(true);
    }
  });
});

window.addEventListener('hashchange', () => {
  pendingNewsId = readNewsRoute();
  if (pendingNewsId) {
    activateTab('news');
    if (!focusNewsItem(pendingNewsId)) loadNews(true);
  }
});

// ─── Tab Navigation ──────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.intel-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.tab);
    });
  });
}

function activateTab(tab) {
  if (!['news', 'heatmap', 'liquidity'].includes(tab)) return;
  currentTab = tab;
  document.querySelectorAll('.intel-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.intel-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  if (tab === 'heatmap' && shouldRefresh('heatmap')) loadHeatmap();
  else if (tab === 'liquidity' && shouldRefresh('liquidity')) loadLiquidity();
  else if (tab === 'news' && shouldRefresh('news')) loadNews();
}

function setupNewsInteractions() {
  document.getElementById('news-list')?.addEventListener('click', event => {
    const item = event.target.closest('.news-item');
    if (!item) return;
    item.classList.toggle('expanded');
    item.classList.remove('news-focus');
  });
  document.getElementById('news-list')?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const item = event.target.closest('.news-item');
    if (!item) return;
    event.preventDefault();
    item.classList.toggle('expanded');
    item.classList.remove('news-focus');
  });
}

function focusNewsItem(id) {
  if (!id) return false;
  const item = [...document.querySelectorAll('.news-item')].find(el => el.dataset.newsId === String(id));
  if (!item) return false;
  item.classList.add('expanded', 'news-focus');
  item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  pendingNewsId = '';
  newsRouteRetries = 0;
  return true;
}

// ─── News Loader ─────────────────────────────────────────
async function loadNews(silent = false) {
  const status = document.getElementById('news-status');
  const list = document.getElementById('news-list');
  if (!silent) status.textContent = '🔄 Memuat berita...';

  try {
    const minuteKey = Math.floor(Date.now() / 60000);
    const res = await fetch(`${API_BASE}/news?limit=20&fresh=${minuteKey}`, {
      signal: beginRequest('news'),
      cache: 'no-store'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (!data.news || data.news.length === 0) {
      status.textContent = '📭 Tidak ada berita gold saat ini';
      list.innerHTML = '<div class="empty-state">📭 Belum ada breaking news untuk XAU/USD.<br><small>Data dari SM_News_24h</small></div>';
      return;
    }

    const sortedNews = [...data.news].sort((a, b) => {
      const byId = Number(b.id || 0) - Number(a.id || 0);
      return byId || new Date(b.time || 0) - new Date(a.time || 0);
    });
    const latestNews = sortedNews[0];
    if (latestNews) {
      const currentNewsId = newsId(latestNews);
      const lastNewsId = localStorage.getItem('amy_last_news_id');
      
      if (lastNewsId && lastNewsId !== currentNewsId) {
        const title = '📰 Breaking News XAU/USD';
        const msg = latestNews.text || 'Berita baru telah tiba.';
        if (window.Android?.showNotificationWithUrl) {
          window.Android.showNotificationWithUrl(title, msg, newsTargetUrl(currentNewsId));
        } else if (typeof Notification !== 'undefined') {
          Notification.requestPermission().then(p => {
            if (p !== 'granted') return;
            const notification = new Notification(title, { body: msg, tag: `amy-news-${currentNewsId}` });
            notification.onclick = () => {
              window.focus();
              location.hash = `news=${encodeURIComponent(currentNewsId)}`;
            };
          });
        }
      }
      localStorage.setItem('amy_last_news_id', currentNewsId);
    }

    status.textContent = `📰 ${data.news.length} berita relevan • ${formatTime(data.updated)}`;
    panelLoadedAt.news = Date.now();
    window.AmyFXIntel?.write('news', { updated: data.updated, items: sortedNews.slice(0, 10) });
    renderNews(sortedNews);
    if (pendingNewsId) {
      activateTab('news');
      if (!focusNewsItem(pendingNewsId)) {
        newsRouteRetries += 1;
        if (newsRouteRetries <= 3) {
          status.textContent = '⏳ Berita dari notifikasi sedang disinkronkan...';
          setTimeout(() => loadNews(true), 1500);
        } else {
          status.textContent = '⚠️ Berita tujuan belum tersedia pada feed terbaru';
          pendingNewsId = '';
          newsRouteRetries = 0;
        }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    status.textContent = '⚠️ Gagal memuat berita';
    list.innerHTML = '<div class="empty-state">⚠️ Gagal terhubung. Coba lagi nanti.</div>';
  }
}

function renderNews(sortedNews) {
  const list = document.getElementById('news-list');
  list.innerHTML = sortedNews.map((item, i) => `
    <article class="news-item" data-news-id="${escapeHtml(newsId(item))}" style="animation-delay:${i * 0.05}s" tabindex="0">
      <div class="news-time">${formatTime(item.time)}</div>
      <div class="news-text">${escapeHtml(item.text)}</div>
      <div class="news-link">Sumber: SM_News_24h</div>
    </article>
  `).join('');
}

// ─── Heatmap Loader ──────────────────────────────────────
async function loadHeatmap(silent = false) {
  const status = document.getElementById('heatmap-status');
  if (!silent) status.textContent = '🔄 Menghitung heatmap...';

  try {
    const res = await fetch(`${API_BASE}/heatmap?interval=15min&outputsize=200`, { signal: beginRequest('heatmap') });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (!data.zones || data.zones.length === 0) {
      status.textContent = '⚠️ Data belum cukup untuk heatmap';
      return;
    }

    document.getElementById('heatmap-price').textContent =
      `💰 XAU/USD ${data.currentPrice?.toFixed(2) || '--'}`;
    status.textContent = `🔥 ${data.zones.length} zona likuiditas • ${formatTime(data.updated)}`;
    panelLoadedAt.heatmap = Date.now();
    window.AmyFXIntel?.write('heatmap', { updated: data.updated, currentPrice: data.currentPrice, zones: data.zones });
    renderHeatmap(data.zones, data.currentPrice);
  } catch (e) {
    if (e.name === 'AbortError') return;
    status.textContent = '⚠️ Gagal memuat heatmap';
  }
}

function renderHeatmap(zones, currentPrice) {
  const canvas = document.getElementById('heatmap-canvas');
  if (!zones.length) return;

  const sortedZones = [...zones].sort((a,b) => b.price - a.price);
  const maxActivity = Math.max(...sortedZones.map(z => z.totalActivity), 1);

  canvas.style.display = 'flex';
  canvas.style.flexDirection = 'column';
  canvas.style.gap = '0';
  canvas.style.padding = '8px 0';
  canvas.style.overflowY = 'auto';

  function genBlocks(count, max, isResist) {
    if(!count || count === 0) return '';
    const maxBlocks = 20;
    const blocks = Math.ceil((count / max) * maxBlocks);
    const typeClass = isResist ? 'block-resist' : 'block-support';
    return Array(blocks).fill(`<div class="heat-block ${typeClass}"></div>`).join('');
  }

  canvas.innerHTML = sortedZones.map(z => {
    const isCurrent = z.isCurrent;
    return `
      <div class="ladder-row ${isCurrent ? 'ladder-now' : ''}">
        <div class="ladder-price-col">
          <span class="ladder-price">${z.price}</span>
          ${isCurrent ? '<span class="ladder-now-indicator">◀</span>' : ''}
        </div>
        <div class="ladder-blocks-col">
          <div class="ladder-blocks">
            ${genBlocks(z.resistCount, maxActivity, true)}
            ${genBlocks(z.supportCount, maxActivity, false)}
          </div>
        </div>
        <div class="ladder-meta-col">
          ${z.label ? `<span class="ladder-label">${z.label}</span>` : ''}
          <span class="ladder-vol">${z.totalActivity}</span>
        </div>
      </div>
    `;
  }).join('');

  hideLoading();
}

// ─── Liquidity Loader ────────────────────────────────────
async function loadLiquidity(silent = false) {
  const status = document.getElementById('liquidity-status');
  const list = document.getElementById('liquidity-list');
  if (!status || !list) return;
  if (!silent) status.textContent = '🔄 Melacak liquidity...';

  try {
    const res = await fetch(`${API_BASE}/liquidity?interval=15min&outputsize=200`, { signal: beginRequest('liquidity') });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (!data.levels || data.levels.length === 0) {
      status.textContent = '⚠️ Belum ada level liquidity terdeteksi';
      list.innerHTML = '<div class="empty-state">📭 Belum ada swing level aktif.<br><small>Data dari TwelveData M15</small></div>';
      return;
    }

    const priceStr = data.currentPrice ? data.currentPrice.toFixed(2) : '--';
    status.textContent = `💧 ${data.levels.length} level aktif • XAU/USD ${priceStr} • ${formatTime(data.updated)}`;
    panelLoadedAt.liquidity = Date.now();
    window.AmyFXIntel?.write('liquidity', { updated: data.updated, currentPrice: data.currentPrice, levels: data.levels });
    renderLiquidity(data.levels, data.currentPrice);
  } catch (e) {
    if (e.name === 'AbortError') return;
    status.textContent = '⚠️ Gagal memuat liquidity';
    list.innerHTML = '<div class="empty-state">⚠️ Gagal terhubung. Coba lagi nanti.</div>';
  }
}

function renderLiquidity(levels, currentPrice) {
  const list = document.getElementById('liquidity-list');
  const bslLevels = levels.filter(lv => lv.type === 'BSL').sort((a,b) => b.price - a.price);
  const sslLevels = levels.filter(lv => lv.type === 'SSL').sort((a,b) => b.price - a.price);
  const priceStr = currentPrice ? currentPrice.toFixed(2) : '--';
  const maxDistance = Math.max(...levels.map(lv => Math.abs(Number(lv.distance) || 0)), 1);
  const nearest = [...levels].sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))[0];

  function renderNodes(arr, isBSL) {
    return arr.map((lv, i) => {
      const distAbs = Math.abs(lv.distance).toFixed(1);
      const timeText = lv.candlesAgo < 4 ? 'Baru' : `${lv.candlesAgo}`;
      const typeClass = isBSL ? 'bsl' : 'ssl';
      const proximity = 1 - Math.min(Math.abs(Number(lv.distance) || 0) / maxDistance, 1);
      const freshness = 1 - Math.min(Number(lv.candlesAgo || 0) / 200, 1);
      const strength = Math.max(0.16, proximity * 0.72 + freshness * 0.28);
      const isNearest = nearest && nearest.type === lv.type && Number(nearest.price) === Number(lv.price);
      
      return `
        <div class="liq-node-wrapper" style="--distance:${Math.abs(Number(lv.distance) || 0)};--strength:${strength.toFixed(2)};--node-scale:${(0.94 + strength * 0.06).toFixed(3)};animation-delay:${i * 0.05}s">
          <div class="node-card ${typeClass} ${isNearest ? 'nearest-draw' : ''}">
            <div class="node-head">
              <span class="node-badge">${lv.type}</span>
              <span class="node-active" title="Aktif"></span>
            </div>
            ${isNearest ? '<div class="nearest-label">NEAREST DRAW</div>' : ''}
            <div class="node-price">${lv.price.toFixed(2)}</div>
            <div class="node-stats">
              <span class="node-stat">⟷ ${distAbs}p</span>
              <span class="node-stat">⏱ ${timeText}c</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  list.innerHTML = `
    <div class="liq-network">
      <div class="liq-branch">
        ${renderNodes(bslLevels, true)}
      </div>

      <div class="liq-center">
        <span>XAU/USD</span>
        <strong>${priceStr}</strong>
      </div>

      <div class="liq-branch">
        ${renderNodes(sslLevels, false)}
      </div>
    </div>
    
    <div class="liq-legend">
      <div class="leg-item"><span class="leg-dot bsl-dot"></span> BSL (Buy Stop)</div>
      <div class="leg-item"><span class="leg-dot ssl-dot"></span> SSL (Sell Stop)</div>
      <div class="leg-item">⟷ Pips Jarak</div>
      <div class="leg-item">⏱ Usia Candle</div>
      <div class="leg-item"><span class="node-active leg-active"></span> Aktif</div>
    </div>
  `;
}

// ─── Helpers ─────────────────────────────────────────────
function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60 * 1000) return 'Baru saja';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m lalu`;
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
  } catch { return iso; }
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function openLink(url) {
  try {
    if (window.Android?.openUrl) window.Android.openUrl(url);
    else window.open(url, '_blank');
  } catch { window.open(url, '_blank'); }
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

// Sembunyikan loading setelah 2 detik (fallback)
setTimeout(hideLoading, 2000);
