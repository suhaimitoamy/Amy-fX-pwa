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

// ─── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  loadNews();
  loadHeatmap();

  // Auto-refresh
  setInterval(() => {
    if (currentTab === 'news') loadNews(true);
    else if (currentTab === 'heatmap') loadHeatmap(true);
    else if (currentTab === 'liquidity') loadLiquidity(true);
  }, REFRESH_INTERVAL);
});

// ─── Tab Navigation ──────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.intel-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      currentTab = tab;

      document.querySelectorAll('.intel-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.intel-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`panel-${tab}`).classList.add('active');

      if (tab === 'heatmap') loadHeatmap();
      else if (tab === 'liquidity') loadLiquidity();
      else loadNews();
    });
  });
}

// ─── News Loader ─────────────────────────────────────────
async function loadNews(silent = false) {
  const status = document.getElementById('news-status');
  const list = document.getElementById('news-list');
  if (!silent) status.textContent = '🔄 Memuat berita...';

  try {
    const res = await fetch(`${API_BASE}/news?limit=10`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (!data.news || data.news.length === 0) {
      status.textContent = '📭 Tidak ada berita gold saat ini';
      list.innerHTML = '<div class="empty-state">📭 Belum ada breaking news untuk XAU/USD.<br><small>Data dari SM_News_24h</small></div>';
      return;
    }

    const sortedNews = [...data.news].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    const latestNews = sortedNews[0];
    if (latestNews) {
      const currentNewsId = (latestNews.time || '') + (latestNews.text || '');
      const lastNewsId = localStorage.getItem('amy_last_news_id');
      
      if (lastNewsId && lastNewsId !== currentNewsId) {
        const title = '📰 Breaking News XAU/USD';
        const msg = latestNews.text || 'Berita baru telah tiba.';
        if (window.Android?.showNotificationWithUrl) {
          window.Android.showNotificationWithUrl(title, msg, location.href);
        } else if (typeof Notification !== 'undefined') {
          Notification.requestPermission().then(p => p === 'granted' && new Notification(title, { body: msg }));
        }
      }
      localStorage.setItem('amy_last_news_id', currentNewsId);
    }

    status.textContent = `📰 ${data.news.length} berita relevan • ${formatTime(data.updated)}`;
    renderNews(sortedNews);
  } catch (e) {
    status.textContent = '⚠️ Gagal memuat berita';
    list.innerHTML = '<div class="empty-state">⚠️ Gagal terhubung. Coba lagi nanti.</div>';
  }
}

function renderNews(sortedNews) {
  const list = document.getElementById('news-list');
  list.innerHTML = sortedNews.map((item, i) => `
    <div class="news-item" style="animation-delay:${i * 0.05}s" onclick="this.classList.toggle('expanded')">
      <div class="news-time">${formatTime(item.time)}</div>
      <div class="news-text">${escapeHtml(item.text)}</div>
      <div class="news-link">Sumber: SM_News_24h</div>
    </div>
  `).join('');
}

// ─── Heatmap Loader ──────────────────────────────────────
async function loadHeatmap(silent = false) {
  const status = document.getElementById('heatmap-status');
  if (!silent) status.textContent = '🔄 Menghitung heatmap...';

  try {
    const res = await fetch(`${API_BASE}/heatmap?interval=15min&outputsize=200`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (!data.zones || data.zones.length === 0) {
      status.textContent = '⚠️ Data belum cukup untuk heatmap';
      return;
    }

    document.getElementById('heatmap-price').textContent =
      `💰 XAU/USD ${data.currentPrice?.toFixed(2) || '--'}`;
    status.textContent = `🔥 ${data.zones.length} zona likuiditas • ${formatTime(data.updated)}`;
    renderHeatmap(data.zones, data.currentPrice);
  } catch (e) {
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
    const res = await fetch(`${API_BASE}/liquidity?interval=15min&outputsize=200`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (!data.levels || data.levels.length === 0) {
      status.textContent = '⚠️ Belum ada level liquidity terdeteksi';
      list.innerHTML = '<div class="empty-state">📭 Belum ada swing level aktif.<br><small>Data dari TwelveData M15</small></div>';
      return;
    }

    const priceStr = data.currentPrice ? data.currentPrice.toFixed(2) : '--';
    status.textContent = `💧 ${data.levels.length} level aktif • XAU/USD ${priceStr} • ${formatTime(data.updated)}`;
    renderLiquidity(data.levels, data.currentPrice);
  } catch (e) {
    status.textContent = '⚠️ Gagal memuat liquidity';
    list.innerHTML = '<div class="empty-state">⚠️ Gagal terhubung. Coba lagi nanti.</div>';
  }
}

function renderLiquidity(levels, currentPrice) {
  const list = document.getElementById('liquidity-list');
  if (!list) return;
  list.innerHTML = levels.map((lv, i) => {
    const isBSL = lv.type === 'BSL';
    const badgeClass = isBSL ? 'bsl' : 'ssl';
    const arrowClass = lv.distance > 0 ? 'up' : 'down';
    const arrow = lv.distance > 0 ? '↗' : '↘';
    const distAbs = Math.abs(lv.distance).toFixed(1);
    const timeText = lv.candlesAgo < 4 ? 'Baru' : `${lv.candlesAgo} cdl`;

    return `
      <div class="liq-card ${badgeClass}" style="animation-delay:${i * 0.04}s">
        <div class="liq-main">
          <div class="liq-type-wrap">
            <span class="liq-dot"></span>
            <span class="liq-type-text">${lv.type}</span>
          </div>
          <div class="liq-price">${lv.price.toFixed(2)}</div>
        </div>
        <div class="liq-details">
          <div class="liq-stat"><span class="liq-icon ${arrowClass}">${arrow}</span> ${distAbs} pips</div>
          <div class="liq-stat">🕒 ${timeText}</div>
          <div class="liq-status">Aktif</div>
        </div>
      </div>
    `;
  }).join('');
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
