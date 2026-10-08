/**
 * Amy FX Pro — Custom Price Alert Manager (Alarm Harga Kustom)
 * Manages user-defined price targets for XAU/USD with real-time threshold monitoring,
 * multi-channel notification dispatch (Android native bridge, Web Notification API, in-app banner),
 * Web Audio API alarm chimes, haptic feedback, and responsive UI helpers.
 */

const STORAGE_KEY = 'amyfx_custom_price_alerts';

let previousPrice = null;
let audioCtx = null;
const registeredContainers = new Set();
let observerInitialized = false;

/**
 * Safely parse numbers
 */
function parsePrice(val) {
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Retrieve current price from multiple live market sources
 */
export function getCurrentLivePrice() {
  if (typeof window === 'undefined') return 2650.0;

  // 1. window.amyfxCurrentPrice
  if (parsePrice(window.amyfxCurrentPrice)) {
    return Number(window.amyfxCurrentPrice);
  }

  // 2. window.state?.price (WebSocket tick)
  if (parsePrice(window.state?.price)) {
    return Number(window.state?.price);
  }

  // 3. Last closed candle from M15 / M5
  if (window.amyfxLastCandles?.length) {
    const c = window.amyfxLastCandles.at(-1);
    if (parsePrice(c?.close)) return Number(c.close);
  }
  if (window.amyfxLastContext?.amy?.chartCandles?.M15?.length) {
    const c = window.amyfxLastContext.amy.chartCandles.M15.at(-1);
    if (parsePrice(c?.close)) return Number(c.close);
  }

  // 4. DOM chart price element
  if (typeof document !== 'undefined') {
    const chartPriceEl = document.getElementById('chart-price');
    if (chartPriceEl) {
      const p = parseFloat(chartPriceEl.textContent.replace(/[^0-9.]/g, ''));
      if (parsePrice(p)) return p;
    }
  }

  // 5. Stored last price
  try {
    const stored = parseFloat(localStorage.getItem('last_price') || '');
    if (parsePrice(stored)) return stored;
  } catch (_) {}

  return 2650.0;
}

/**
 * Read all stored price alerts from localStorage
 */
export function getAlerts() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[PriceAlert] Gagal membaca storage:', err);
    return [];
  }
}

/**
 * Persist price alerts to localStorage
 */
export function saveAlerts(alerts) {
  try {
    if (typeof localStorage === 'undefined') return false;
    const safeList = Array.isArray(alerts) ? alerts : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeList));
    return true;
  } catch (err) {
    console.error('[PriceAlert] Gagal menyimpan alerts:', err);
    return false;
  }
}

/**
 * Add a new target price alert
 * @param {number|string} targetPrice - Price level to alert on
 * @param {Object} options - Optional config { direction, note, currentPrice }
 */
export function addAlert(targetPrice, options = {}) {
  const target = parsePrice(targetPrice);
  if (!target) {
    throw new Error('Target harga harus berupa angka positif yang valid.');
  }

  const curPrice = parsePrice(options.currentPrice) || getCurrentLivePrice();

  // Automatic direction detection:
  // CROSS_ABOVE if target > current price
  // CROSS_BELOW if target < current price
  let direction = options.direction;
  if (!direction || !['CROSS_ABOVE', 'CROSS_BELOW'].includes(direction)) {
    direction = target >= curPrice ? 'CROSS_ABOVE' : 'CROSS_BELOW';
  }

  const alert = {
    id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    targetPrice: Math.round(target * 100) / 100,
    direction,
    createdPrice: Math.round(curPrice * 100) / 100,
    createdAt: Date.now(),
    triggeredAt: null,
    status: 'ACTIVE',
    note: String(options.note || '').trim() || 'Alarm Target Harga'
  };

  const list = getAlerts();
  list.push(alert);
  saveAlerts(list);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('amyfx:price-alerts-updated', {
      detail: { action: 'add', alert, alerts: list }
    }));
  }

  renderAllRegisteredContainers();
  return alert;
}

/**
 * Remove an alert by its ID
 */
export function removeAlert(id) {
  const list = getAlerts();
  const filtered = list.filter(a => a.id !== id);
  saveAlerts(filtered);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('amyfx:price-alerts-updated', {
      detail: { action: 'remove', id, alerts: filtered }
    }));
  }

  renderAllRegisteredContainers();
  return filtered;
}

/**
 * Reset a TRIGGERED alert back to ACTIVE
 */
export function resetAlert(id, options = {}) {
  const list = getAlerts();
  const alert = list.find(a => a.id === id);
  if (!alert) return null;

  const curPrice = parsePrice(options.currentPrice) || getCurrentLivePrice();

  alert.status = 'ACTIVE';
  alert.triggeredAt = null;
  alert.createdPrice = Math.round(curPrice * 100) / 100;

  if (options.direction && ['CROSS_ABOVE', 'CROSS_BELOW'].includes(options.direction)) {
    alert.direction = options.direction;
  } else {
    alert.direction = alert.targetPrice >= curPrice ? 'CROSS_ABOVE' : 'CROSS_BELOW';
  }

  saveAlerts(list);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('amyfx:price-alerts-updated', {
      detail: { action: 'reset', alert, alerts: list }
    }));
  }

  renderAllRegisteredContainers();
  return alert;
}

/**
 * Clear alerts (all or only triggered)
 */
export function clearAlerts(mode = 'all') {
  const list = getAlerts();
  const filtered = mode === 'triggered'
    ? list.filter(a => a.status !== 'TRIGGERED')
    : [];

  saveAlerts(filtered);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('amyfx:price-alerts-updated', {
      detail: { action: 'clear', mode, alerts: filtered }
    }));
  }

  renderAllRegisteredContainers();
  return filtered;
}

/**
 * Play a clear, high-fidelity 2-tone melodic notification chime via Web Audio API
 */
export function playAlertBeep() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const t = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, t); // A5
    osc1.frequency.setValueAtTime(1174.66, t + 0.18); // D6

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(587.33, t); // D5
    osc2.frequency.setValueAtTime(880, t + 0.18); // A5

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.65);
    osc2.stop(t + 0.65);
  } catch (err) {
    console.warn('[PriceAlert] Gagal memutar audio beep:', err);
  }
}

/**
 * Trigger vibration / haptic feedback on Android or modern browser
 */
export function triggerHapticFeedback() {
  if (typeof window === 'undefined') return;
  try {
    if (window.Android?.triggerHaptic) {
      window.Android.triggerHaptic(18);
    } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 300]);
    }
  } catch (_) {}
}

/**
 * Show in-app glassmorphism notification banner
 */
export function showInAppBanner(alert, price) {
  if (typeof document === 'undefined') return;

  const bannerId = 'amyfx-price-alert-banner';
  let banner = document.getElementById(bannerId);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = bannerId;
    banner.setAttribute('role', 'alert');
    banner.style.cssText = `
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      width: calc(100% - 32px);
      max-width: 440px;
      background: rgba(19, 30, 45, 0.95);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid #F5C451;
      box-shadow: 0 12px 36px rgba(0,0,0,0.65), 0 0 18px rgba(245, 196, 81, 0.35);
      border-radius: 14px;
      padding: 14px 18px;
      color: #fff;
      font-family: inherit;
      box-sizing: border-box;
      transition: opacity 0.35s ease, transform 0.35s ease;
    `;
    document.body.appendChild(banner);
  }

  const directionSymbol = alert.direction === 'CROSS_ABOVE' ? '▲' : '▼';
  const directionText = alert.direction === 'CROSS_ABOVE' ? 'Menembus Ke Atas' : 'Menembus Ke Bawah';
  const dirColor = alert.direction === 'CROSS_ABOVE' ? '#32D583' : '#FF5C6C';

  banner.innerHTML = `
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
      <div style="font-size:26px; line-height:1; filter:drop-shadow(0 0 6px rgba(245,196,81,0.6));">🔔</div>
      <div style="flex:1;">
        <div style="font-size:11px; font-weight:800; color:#F5C451; letter-spacing:0.08em; text-transform:uppercase;">
          ALARM HARGA TERCAPAI
        </div>
        <div style="font-size:16px; font-weight:800; margin:3px 0; color:#fff; display:flex; align-items:center; gap:8px;">
          <span>XAU/USD $${price.toFixed(2)}</span>
          <span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.08); color:${dirColor};">
            ${directionSymbol} ${directionText}
          </span>
        </div>
        <div style="font-size:12px; color:#94A3B8; line-height:1.4;">
          Target $${alert.targetPrice.toFixed(2)} telah tercapai! ${alert.note ? '· ' + alert.note : ''}
        </div>
      </div>
      <button type="button" id="close-price-alert-banner" aria-label="Tutup notifikasi" style="background:transparent; border:0; color:#94A3B8; font-size:22px; cursor:pointer; padding:0 4px; line-height:1;">&times;</button>
    </div>
  `;

  const closeBtn = document.getElementById('close-price-alert-banner');
  if (closeBtn) {
    closeBtn.onclick = () => { banner.remove(); };
  }

  setTimeout(() => {
    if (banner && banner.parentNode) {
      banner.style.opacity = '0';
      banner.style.transform = 'translate(-50%, -15px)';
      setTimeout(() => banner.remove(), 350);
    }
  }, 8000);
}

/**
 * Dispatch multi-channel notification for a triggered alert
 */
export function notifyTriggeredAlert(alert, currentPrice) {
  const price = Number(currentPrice);
  const priceStr = price.toFixed(2);
  const targetStr = alert.targetPrice.toFixed(2);
  const title = `🔔 Alarm Harga: XAU/USD Menyentuh ${priceStr}`;
  const message = `Target harga ${targetStr} telah tercapai! Pantau aksi harga di chart.`;
  const url = (typeof location !== 'undefined' ? location.href.split('#')[0] : '') + '#Dashboard';

  // 1. Android Native Notification Bridge
  try {
    if (window.Android?.showNotificationWithUrl) {
      window.Android.showNotificationWithUrl(title, message, url);
    } else if (window.Android?.showNotification) {
      window.Android.showNotification(title, message);
    }
  } catch (err) {
    console.warn('[PriceAlert] Gagal memanggil Android notification bridge:', err);
  }

  // 2. Web Notification API (browser permissions)
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: '/favicon.ico',
        tag: 'amyfx_alert_' + alert.id
      });
    }
  } catch (_) {}

  // 3. In-App Glassmorphism Banner
  showInAppBanner(alert, price);

  // 4. Audio Beep & Haptic
  playAlertBeep();
  triggerHapticFeedback();
}

/**
 * Reset or set previous price reference (useful for testing or reconnect)
 */
export function setPreviousPrice(price) {
  previousPrice = parsePrice(price);
}

/**
 * Real-time price check comparing previous price with incoming new price tick
 * @param {number|string} newPrice - Newly arrived live market price
 */
export function checkPrice(newPrice) {
  const current = parsePrice(newPrice);
  if (!current) return false;

  const alerts = getAlerts();
  const activeAlerts = alerts.filter(a => a.status === 'ACTIVE');
  if (!activeAlerts.length) {
    previousPrice = current;
    return false;
  }

  const triggeredAlerts = [];
  let hasChange = false;

  for (const alert of activeAlerts) {
    const target = alert.targetPrice;
    // Base previous price: prioritize alert's last checked price, fallback to createdPrice, then global previousPrice
    const prev = alert.lastCheckedPrice != null
      ? alert.lastCheckedPrice
      : (alert.createdPrice != null ? alert.createdPrice : (previousPrice !== null ? previousPrice : current));

    let isTriggered = false;

    if (alert.direction === 'CROSS_ABOVE') {
      // Crossed from below to above or exact hit
      if (prev <= target && current >= target) {
        isTriggered = true;
      }
    } else if (alert.direction === 'CROSS_BELOW') {
      // Crossed from above to below or exact hit
      if (prev >= target && current <= target) {
        isTriggered = true;
      }
    }

    alert.lastCheckedPrice = current;

    if (isTriggered) {
      alert.status = 'TRIGGERED';
      alert.triggeredAt = Date.now();
      triggeredAlerts.push(alert);
      hasChange = true;
      notifyTriggeredAlert(alert, current);
    }
  }

  previousPrice = current;

  if (hasChange) {
    saveAlerts(alerts);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('amyfx:price-alert-triggered', {
        detail: { triggeredAlerts, price: current }
      }));
      window.dispatchEvent(new CustomEvent('amyfx:price-alerts-updated', {
        detail: { alerts }
      }));
    }
    renderAllRegisteredContainers();
  }

  return triggeredAlerts.length > 0;
}

/**
 * Render the price alerts list into a DOM container
 * @param {HTMLElement|string} target - Container element or selector
 */
export function renderAlertList(target) {
  if (typeof document === 'undefined') return;
  const container = typeof target === 'string' ? document.querySelector(target) : target;
  if (!container) return;

  registeredContainers.add(container);

  const alerts = getAlerts();
  const currentPrice = getCurrentLivePrice();
  const activeCount = alerts.filter(a => a.status === 'ACTIVE').length;

  let html = `
    <div class="price-alert-widget-box" style="margin-top:14px; padding:14px 16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <strong style="font-size:13px; color:#fff; display:flex; align-items:center; gap:6px;">
            <span>🔔</span> Alarm Target Harga
          </strong>
          <span style="font-size:10px; font-weight:700; padding:2px 7px; border-radius:10px; background:${activeCount > 0 ? 'rgba(245,196,81,0.2)' : 'rgba(255,255,255,0.08)'}; color:${activeCount > 0 ? '#F5C451' : 'var(--muted,#94A3B8)'};">
            ${activeCount} Aktif
          </span>
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="amyfx-add-alert-btn" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:var(--amy-accent,#69b7ff); background:rgba(105,183,255,0.12); padding:5px 10px; border-radius:6px; border:1px solid rgba(105,183,255,0.28); cursor:pointer;">
            <span>+ Tambah Alarm</span>
          </button>
          ${alerts.some(a => a.status === 'TRIGGERED') ? `
            <button type="button" class="amyfx-clear-triggered-btn" title="Hapus alarm tercapai" style="background:transparent; border:1px solid rgba(255,255,255,0.15); color:var(--muted,#94A3B8); font-size:11px; padding:5px 8px; border-radius:6px; cursor:pointer;">
              Bersihkan
            </button>
          ` : ''}
        </div>
      </div>
  `;

  if (!alerts.length) {
    html += `
      <div style="padding:16px 12px; text-align:center; font-size:12px; color:var(--muted,#94A3B8); background:rgba(0,0,0,0.15); border-radius:8px;">
        Belum ada alarm target harga. Tekan <strong>+ Tambah Alarm</strong> untuk memantau level penting.
      </div>
    `;
  } else {
    html += `<div style="display:flex; flex-direction:column; gap:8px; max-height:260px; overflow-y:auto; padding-right:2px;">`;

    // Sort: ACTIVE first (closest to current price), then TRIGGERED
    const sorted = [...alerts].sort((a, b) => {
      if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
      if (a.status !== 'ACTIVE' && b.status === 'ACTIVE') return 1;
      return Math.abs(a.targetPrice - currentPrice) - Math.abs(b.targetPrice - currentPrice);
    });

    for (const item of sorted) {
      const isTriggered = item.status === 'TRIGGERED';
      const isAbove = item.direction === 'CROSS_ABOVE';
      const dirSymbol = isAbove ? '▲' : '▼';
      const dirColor = isAbove ? '#32D583' : '#FF5C6C';
      const dist = Math.abs(item.targetPrice - currentPrice);
      const distPips = (dist * 10).toFixed(0);

      html += `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; background:${isTriggered ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'}; border:1px solid ${isTriggered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'}; border-radius:8px; opacity:${isTriggered ? '0.75' : '1'};">
          <div style="display:flex; align-items:center; gap:8px; min-width:0;">
            <span style="font-size:14px; font-weight:800; color:${dirColor};">${dirSymbol}</span>
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                <strong style="font-size:13px; font-variant-numeric:tabular-nums; color:#fff;">$${item.targetPrice.toFixed(2)}</strong>
                <span style="font-size:10px; padding:1px 5px; border-radius:4px; font-weight:700; ${isTriggered ? 'background:rgba(105,183,255,0.15); color:#69b7ff;' : 'background:rgba(245,196,81,0.15); color:#F5C451;'}">
                  ${isTriggered ? 'TERCAPAI' : 'MENUNGGU'}
                </span>
              </div>
              <div style="font-size:11px; color:var(--muted,#94A3B8); margin-top:2px;">
                ${isTriggered
                  ? `Tersentuh pada ${new Date(item.triggeredAt || item.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WITA`
                  : `Selisih: ${dist.toFixed(2)} pts (${distPips} pips) · Base $${item.createdPrice.toFixed(2)}`
                }
                ${item.note && item.note !== 'Alarm Target Harga' ? `· <span style="color:#CBD5E1;">${escapeHtml(item.note)}</span>` : ''}
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            ${isTriggered ? `
              <button type="button" class="amyfx-reset-alert-btn" data-id="${item.id}" title="Reset Alarm" style="background:rgba(105,183,255,0.15); border:1px solid rgba(105,183,255,0.3); color:#69b7ff; border-radius:6px; font-size:11px; padding:4px 8px; cursor:pointer;">
                ↺ Reset
              </button>
            ` : ''}
            <button type="button" class="amyfx-del-alert-btn" data-id="${item.id}" aria-label="Hapus alarm" title="Hapus Alarm" style="background:transparent; border:0; color:#EF4444; font-size:14px; cursor:pointer; padding:4px 6px;">
              🗑
            </button>
          </div>
        </div>
      `;
    }

    html += `</div>`;
  }

  html += `</div>`;
  container.innerHTML = html;

  // Bind UI Events
  container.querySelector('.amyfx-add-alert-btn')?.addEventListener('click', () => {
    openAddAlertDialog(currentPrice);
  });

  container.querySelector('.amyfx-clear-triggered-btn')?.addEventListener('click', () => {
    clearAlerts('triggered');
  });

  container.querySelectorAll('.amyfx-del-alert-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      if (id) removeAlert(id);
    });
  });

  container.querySelectorAll('.amyfx-reset-alert-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      if (id) resetAlert(id);
    });
  });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderAllRegisteredContainers() {
  for (const container of registeredContainers) {
    if (document.body.contains(container)) {
      renderAlertList(container);
    } else {
      registeredContainers.delete(container);
    }
  }
}

/**
 * Open modal prompt dialog to set a custom price alert
 * @param {number|string} prefillPrice - Default suggested price level
 */
export function openAddAlertDialog(prefillPrice) {
  if (typeof document === 'undefined') return;

  const curPrice = parsePrice(prefillPrice) || getCurrentLivePrice();
  const modalId = 'amyfx-add-price-alert-modal';
  let modal = document.getElementById(modalId);
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = modalId;
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(4, 8, 14, 0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 16px;
    box-sizing: border-box;
    animation: fadeIn 0.2s ease-out;
  `;

  modal.innerHTML = `
    <div style="background:var(--amy-surface-solid,#131e2d); border:1px solid var(--amy-border-strong,rgba(177,214,255,0.25)); border-radius:16px; width:100%; max-width:380px; padding:20px; box-shadow:0 20px 40px rgba(0,0,0,0.6); color:#fff; box-sizing:border-box;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
        <h3 style="margin:0; font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
          <span>🔔</span> Pasang Alarm Harga
        </h3>
        <button type="button" id="amyfx-modal-close" style="background:transparent; border:0; color:#94A3B8; font-size:22px; cursor:pointer; line-height:1; padding:0 4px;">&times;</button>
      </div>
      <p style="margin:0 0 14px; font-size:12px; color:#94A3B8; line-height:1.4;">
        Notifikasi otomatis akan berbunyi begitu harga XAU/USD menyentuh atau menembus target ini.
      </p>

      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:11px; font-weight:700; color:#CBD5E1; margin-bottom:6px;">
          Target Harga XAU/USD (Harga Saat Ini: $${curPrice.toFixed(2)})
        </label>
        <div style="display:flex; align-items:center; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.18); border-radius:8px; padding:0 10px;">
          <span style="color:#94A3B8; font-weight:700;">$</span>
          <input type="number" id="amyfx-alert-input-price" step="0.10" value="${curPrice.toFixed(2)}" placeholder="4301.00" style="flex:1; background:transparent; border:0; color:#fff; padding:10px 8px; font-size:15px; font-weight:700; font-family:inherit; outline:none;" />
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:11px; font-weight:700; color:#CBD5E1; margin-bottom:6px;">
          Arah Pemicu (Trigger Direction)
        </label>
        <select id="amyfx-alert-input-direction" style="width:100%; background:#0c1320; color:#fff; border:1px solid rgba(255,255,255,0.18); border-radius:8px; padding:9px 10px; font-size:13px; outline:none;">
          <option value="AUTO">Otomatis (Berdasarkan Level Harga)</option>
          <option value="CROSS_ABOVE">▲ Tembus Ke Atas (CROSS_ABOVE)</option>
          <option value="CROSS_BELOW">▼ Tembus Ke Bawah (CROSS_BELOW)</option>
        </select>
      </div>

      <div style="margin-bottom:18px;">
        <label style="display:block; font-size:11px; font-weight:700; color:#CBD5E1; margin-bottom:6px;">
          Catatan / Label (Opsional)
        </label>
        <input type="text" id="amyfx-alert-input-note" placeholder="Contoh: Rejection PDH / Target TP 1" style="width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.18); border-radius:8px; padding:9px 10px; font-size:13px; color:#fff; outline:none; box-sizing:border-box;" />
      </div>

      <div style="display:flex; gap:10px;">
        <button type="button" id="amyfx-modal-cancel" style="flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); color:#fff; border-radius:8px; padding:10px; font-size:13px; font-weight:700; cursor:pointer;">
          Batal
        </button>
        <button type="button" id="amyfx-modal-save" style="flex:1; background:var(--amy-accent,#69b7ff); border:0; color:#0c1320; border-radius:8px; padding:10px; font-size:13px; font-weight:800; cursor:pointer;">
          Simpan Alarm
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const priceInput = document.getElementById('amyfx-alert-input-price');
  const dirInput = document.getElementById('amyfx-alert-input-direction');
  const noteInput = document.getElementById('amyfx-alert-input-note');
  const closeBtn = document.getElementById('amyfx-modal-close');
  const cancelBtn = document.getElementById('amyfx-modal-cancel');
  const saveBtn = document.getElementById('amyfx-modal-save');

  if (priceInput) {
    priceInput.focus();
    priceInput.select();
  }

  const closeModal = () => {
    modal.remove();
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });

  saveBtn?.addEventListener('click', () => {
    const rawVal = priceInput?.value;
    const target = parsePrice(rawVal);
    if (!target) {
      alert('Masukkan angka target harga yang valid.');
      return;
    }

    const dirVal = dirInput?.value;
    const direction = dirVal === 'AUTO' ? undefined : dirVal;
    const note = noteInput?.value?.trim();

    try {
      addAlert(target, { direction, note, currentPrice: curPrice });
      triggerHapticFeedback();
      closeModal();
    } catch (err) {
      alert(err.message || 'Gagal menyimpan alarm.');
    }
  });
}

/**
 * Mount a standalone price alert card widget into any target element
 */
export function mountPriceAlertWidget(containerOrSelector) {
  renderAlertList(containerOrSelector);
}

/**
 * Initialize background listeners for price changes
 */
export function initPriceAlertObserver() {
  if (observerInitialized || typeof window === 'undefined') return;
  observerInitialized = true;

  // 1. Listen for WebSocket price ticks
  window.addEventListener('amyfx:twelvedata-price', event => {
    const price = event?.detail?.price;
    if (price) checkPrice(price);
  });

  // 2. Listen for generic price ticks
  window.addEventListener('amyfx:price-tick', event => {
    const price = event?.detail?.price || event?.detail;
    if (price) checkPrice(price);
  });

  // 3. Listen for context updates
  window.addEventListener('amyfx:market-context', event => {
    const candles = event?.detail?.amy?.chartCandles?.M15;
    if (candles?.length) {
      const last = candles.at(-1);
      if (last?.close) checkPrice(last.close);
    }
  });

  // 4. MutationObserver on #chart-price DOM element
  if (typeof document !== 'undefined') {
    const observeChartPrice = () => {
      const el = document.getElementById('chart-price');
      if (el) {
        const obs = new MutationObserver(() => {
          const text = el.textContent || '';
          const p = parseFloat(text.replace(/[^0-9.]/g, ''));
          if (parsePrice(p)) checkPrice(p);
        });
        obs.observe(el, { childList: true, characterData: true, subtree: true });
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observeChartPrice);
    } else {
      observeChartPrice();
    }

    // 5. Lightweight periodic safety check (every 2.5s) to ensure no tick missed
    setInterval(() => {
      const p = getCurrentLivePrice();
      if (p && previousPrice !== null && Math.abs(p - previousPrice) > 0.001) {
        checkPrice(p);
      }
    }, 2500);
  }
}

/**
 * Get summary statistics of stored alerts
 */
export function getStats() {
  const alerts = getAlerts();
  return {
    total: alerts.length,
    active: alerts.filter(a => a.status === 'ACTIVE').length,
    triggered: alerts.filter(a => a.status === 'TRIGGERED').length,
    currentPrice: getCurrentLivePrice()
  };
}

// Global API Object
const priceAlertManager = {
  getAlerts,
  saveAlerts,
  addAlert,
  removeAlert,
  resetAlert,
  clearAlerts,
  checkPrice,
  setPreviousPrice,
  getCurrentLivePrice,
  notifyTriggeredAlert,
  playAlertBeep,
  triggerHapticFeedback,
  showInAppBanner,
  renderAlertList,
  openAddAlertDialog,
  mountPriceAlertWidget,
  initPriceAlertObserver,
  getStats
};

// Auto-register to global window / globalThis for cross-module & UI accessibility
if (typeof globalThis !== 'undefined') {
  globalThis.AmyPriceAlertManager = priceAlertManager;
}
if (typeof window !== 'undefined') {
  window.AmyPriceAlertManager = priceAlertManager;
  initPriceAlertObserver();
}

export default priceAlertManager;
