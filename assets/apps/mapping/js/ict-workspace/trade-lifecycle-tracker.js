// Amy FX Pro — Trade Lifecycle Tracker & Archive Specialist
// Tracks Entry Assistant V3 Plan lifecycle:
// ARMED_LIMIT -> ACTIVE_RUNNING -> CLOSED_TP / CLOSED_SL
// Dispatches Android notifications and renders Win Rate Archive tab.

export const STORAGE_KEY = 'amyfx_trade_lifecycle_history';
const NOTIFIED_KEY = 'amyfx_notified_assistant_lifecycle';

let lastKnownPrice = null;

function safeLocalStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function loadTradeHistory() {
  const storage = safeLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.trades)) return parsed.trades;
    return [];
  } catch (err) {
    console.warn('[TradeLifecycle] Gagal membaca storage:', err);
    return [];
  }
}

export function saveTradeHistory(trades) {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    // Pertahankan maksimum 150 riwayat trade terakhir
    const safeTrades = Array.isArray(trades) ? trades.slice(-150) : [];
    storage.setItem(STORAGE_KEY, JSON.stringify(safeTrades));
  } catch (err) {
    console.warn('[TradeLifecycle] Gagal menyimpan storage:', err);
  }
}

export function sendAndroidNotification(title, body, url = null) {
  try {
    const targetUrl = url || (typeof location !== 'undefined' ? `${location.href.split('#')[0]}#History` : '');
    if (typeof window !== 'undefined' && window.Android?.showNotificationWithUrl) {
      window.Android.showNotificationWithUrl(title, body, targetUrl);
    } else if (typeof window !== 'undefined' && window.Android?.showNotification) {
      window.Android.showNotification(title, body);
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch (err) {
    console.warn('[TradeLifecycle] Gagal kirim notifikasi:', err);
  }
}

export function triggerHaptic(duration = 20) {
  try {
    if (typeof window !== 'undefined' && window.Android?.triggerHaptic) {
      window.Android.triggerHaptic(duration);
    } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(duration);
    }
  } catch (_) {}
}

export function getCurrentPrice() {
  if (lastKnownPrice != null && Number.isFinite(lastKnownPrice)) {
    return lastKnownPrice;
  }
  const storage = safeLocalStorage();
  if (storage) {
    const p = parseFloat(storage.getItem('last_price'));
    if (Number.isFinite(p) && p > 0) return p;
  }
  if (typeof document !== 'undefined') {
    const txt = document.getElementById('chart-price')?.textContent?.replace(/[^0-9.]/g, '');
    const p = parseFloat(txt);
    if (Number.isFinite(p) && p > 0) return p;
  }
  if (typeof window !== 'undefined' && window.amyfxLastPrice) {
    const p = Number(window.amyfxLastPrice);
    if (Number.isFinite(p) && p > 0) return p;
  }
  return null;
}

export function generatePlanKey(plan) {
  if (!plan) return null;
  const side = plan.side || (plan.signalType > 0 ? 'BUY' : 'SELL');
  const entry = Number(plan.entry).toFixed(2);
  const sl = Number(plan.sl).toFixed(2);
  const tp1 = Number(plan.tp1).toFixed(2);
  return `${side}_${entry}_${sl}_${tp1}`;
}

export function trackAssistantPlan(plan, priceOverride = null) {
  if (!plan || !plan.entry || !plan.sl || !plan.tp1) return null;

  const side = plan.side || (plan.signalType > 0 ? 'BUY' : 'SELL');
  const entry = Number(plan.entry);
  const sl = Number(plan.sl);
  const tp1 = Number(plan.tp1);
  const tp2 = plan.tp2 ? Number(plan.tp2) : null;

  if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tp1)) return null;

  const planKey = generatePlanKey(plan);
  const trades = loadTradeHistory();

  // Periksa apakah trade dengan planKey ini sudah ada dalam status ARMED atau ACTIVE
  const existing = trades.find(t => t.planKey === planKey && (t.status === 'ARMED_LIMIT' || t.status === 'ACTIVE_RUNNING'));
  if (existing) {
    return existing;
  }

  // Jika trade dengan setup yang sama sudah selesai dalam 20 menit terakhir, jangan duplikasi
  const recentClosed = trades.find(t => t.planKey === planKey && (t.status === 'CLOSED_TP' || t.status === 'CLOSED_SL') && (Date.now() - t.closedAt < 20 * 60 * 1000));
  if (recentClosed) {
    return recentClosed;
  }

  const currentPrice = priceOverride != null ? priceOverride : getCurrentPrice();
  let initialStatus = 'ARMED_LIMIT';
  let triggeredAt = null;

  if (currentPrice != null && Number.isFinite(currentPrice)) {
    if (side === 'BUY') {
      // Jika harga saat ini sudah mencapai atau menyentuh entry (tapi belum tembus SL)
      if (currentPrice <= entry && currentPrice > sl) {
        initialStatus = 'ACTIVE_RUNNING';
        triggeredAt = Date.now();
      } else if (currentPrice <= sl) {
        // Harga sudah melampaui SL sebelum disentuh, setup tidak valid
        return null;
      }
    } else {
      // SELL
      if (currentPrice >= entry && currentPrice < sl) {
        initialStatus = 'ACTIVE_RUNNING';
        triggeredAt = Date.now();
      } else if (currentPrice >= sl) {
        // Harga sudah melampaui SL
        return null;
      }
    }
  }

  const newTrade = {
    id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    planKey,
    side,
    entry,
    sl,
    tp1,
    tp2,
    risk: Number((Math.abs(entry - sl)).toFixed(2)),
    status: initialStatus,
    signalName: plan.signalName || `${side} ENTRY`,
    signalType: plan.signalType || (side === 'BUY' ? 1 : -1),
    createdAt: Date.now(),
    triggeredAt,
    closedAt: null,
    closePrice: null,
    profitPoints: null,
    closeReason: null,
    notified: {}
  };

  if (initialStatus === 'ACTIVE_RUNNING') {
    newTrade.notified.ACTIVE_RUNNING = Date.now();
    const title = `⚡ Order Terpicu: ${side} XAUUSD @ ${entry.toFixed(2)} Aktif!`;
    const body = `Harga menyentuh limit entry. Posisi sekarang sedang berjalan (SL: ${sl.toFixed(2)} | TP: ${tp1.toFixed(2)}).`;
    sendAndroidNotification(title, body);
    triggerHaptic(20);
  }

  trades.push(newTrade);
  saveTradeHistory(trades);
  dispatchLifecycleChange();

  return newTrade;
}

export function updatePrice(price, high = null, low = null, timestamp = null) {
  if (!Number.isFinite(price) || price <= 0) return;
  lastKnownPrice = price;

  const trades = loadTradeHistory();
  let changed = false;

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    trade.notified = trade.notified || {};

    // 1. TRANSISI: ARMED_LIMIT -> ACTIVE_RUNNING
    if (trade.status === 'ARMED_LIMIT') {
      let triggered = false;

      if (trade.side === 'BUY') {
        const touchLow = low != null && Number.isFinite(low) ? low : price;
        if (touchLow <= trade.entry) {
          // Validasi tidak langsung tembus SL
          if (touchLow <= trade.sl) {
            trade.status = 'CANCELLED';
            trade.cancelReason = 'Gapped through SL';
            changed = true;
            continue;
          }
          triggered = true;
        }
      } else {
        // SELL
        const touchHigh = high != null && Number.isFinite(high) ? high : price;
        if (touchHigh >= trade.entry) {
          if (touchHigh >= trade.sl) {
            trade.status = 'CANCELLED';
            trade.cancelReason = 'Gapped through SL';
            changed = true;
            continue;
          }
          triggered = true;
        }
      }

      if (triggered) {
        trade.status = 'ACTIVE_RUNNING';
        trade.triggeredAt = timestamp ? timestamp * 1000 : Date.now();
        changed = true;

        if (!trade.notified.ACTIVE_RUNNING) {
          trade.notified.ACTIVE_RUNNING = Date.now();
          const title = `⚡ Order Terpicu: ${trade.side} XAUUSD @ ${trade.entry.toFixed(2)} Aktif!`;
          const body = `Harga menyentuh limit entry. Posisi sekarang sedang berjalan (SL: ${trade.sl.toFixed(2)} | TP: ${trade.tp1.toFixed(2)}).`;
          sendAndroidNotification(title, body);
          triggerHaptic(20);
        }
      }
    }

    // 2. EVALUASI: ACTIVE_RUNNING -> CLOSED_TP atau CLOSED_SL
    if (trade.status === 'ACTIVE_RUNNING') {
      const curPrice = price;
      const curHigh = high != null && Number.isFinite(high) ? high : curPrice;
      const curLow = low != null && Number.isFinite(low) ? low : curPrice;

      if (trade.side === 'BUY') {
        // Cek Stop Loss terlebih dahulu (prinsip proteksi risiko)
        if (curLow <= trade.sl || curPrice <= trade.sl) {
          trade.status = 'CLOSED_SL';
          trade.closedAt = timestamp ? timestamp * 1000 : Date.now();
          trade.closePrice = trade.sl;
          const lossPts = Number(Math.abs(trade.entry - trade.sl).toFixed(2));
          trade.profitPoints = -lossPts;
          trade.closeReason = 'SL';
          changed = true;

          if (!trade.notified.CLOSED_SL) {
            trade.notified.CLOSED_SL = Date.now();
            const title = `🛑 Stop Loss Kena: ${trade.side} XAUUSD (-${lossPts.toFixed(2)} pts)`;
            const body = `Harga menyentuh batas risiko di ${trade.sl.toFixed(2)}. Posisi ditutup secara disiplin. Evaluasi tercatat di Arsip.`;
            sendAndroidNotification(title, body);
            triggerHaptic(50);
          }
        }
        // Cek Take Profit
        else if (curHigh >= trade.tp1 || curPrice >= trade.tp1) {
          const hitTp2 = trade.tp2 && (curHigh >= trade.tp2 || curPrice >= trade.tp2);
          const tpPrice = hitTp2 ? trade.tp2 : trade.tp1;
          const gainPts = Number(Math.abs(tpPrice - trade.entry).toFixed(2));

          trade.status = 'CLOSED_TP';
          trade.closedAt = timestamp ? timestamp * 1000 : Date.now();
          trade.closePrice = tpPrice;
          trade.profitPoints = gainPts;
          trade.closeReason = hitTp2 ? 'TP2' : 'TP1';
          changed = true;

          if (!trade.notified.CLOSED_TP) {
            trade.notified.CLOSED_TP = Date.now();
            const title = `🎯 TP Tercapai: ${trade.side} XAUUSD (+${gainPts.toFixed(2)} pts)`;
            const body = `Target profit ${tpPrice.toFixed(2)} sukses tercapai! Posisi selesai dengan profit penuh.`;
            sendAndroidNotification(title, body);
            triggerHaptic(30);
          }
        }
      } else {
        // SELL
        // Cek Stop Loss terlebih dahulu
        if (curHigh >= trade.sl || curPrice >= trade.sl) {
          trade.status = 'CLOSED_SL';
          trade.closedAt = timestamp ? timestamp * 1000 : Date.now();
          trade.closePrice = trade.sl;
          const lossPts = Number(Math.abs(trade.sl - trade.entry).toFixed(2));
          trade.profitPoints = -lossPts;
          trade.closeReason = 'SL';
          changed = true;

          if (!trade.notified.CLOSED_SL) {
            trade.notified.CLOSED_SL = Date.now();
            const title = `🛑 Stop Loss Kena: ${trade.side} XAUUSD (-${lossPts.toFixed(2)} pts)`;
            const body = `Harga menyentuh batas risiko di ${trade.sl.toFixed(2)}. Posisi ditutup secara disiplin. Evaluasi tercatat di Arsip.`;
            sendAndroidNotification(title, body);
            triggerHaptic(50);
          }
        }
        // Cek Take Profit
        else if (curLow <= trade.tp1 || curPrice <= trade.tp1) {
          const hitTp2 = trade.tp2 && (curLow <= trade.tp2 || curPrice <= trade.tp2);
          const tpPrice = hitTp2 ? trade.tp2 : trade.tp1;
          const gainPts = Number(Math.abs(trade.entry - tpPrice).toFixed(2));

          trade.status = 'CLOSED_TP';
          trade.closedAt = timestamp ? timestamp * 1000 : Date.now();
          trade.closePrice = tpPrice;
          trade.profitPoints = gainPts;
          trade.closeReason = hitTp2 ? 'TP2' : 'TP1';
          changed = true;

          if (!trade.notified.CLOSED_TP) {
            trade.notified.CLOSED_TP = Date.now();
            const title = `🎯 TP Tercapai: ${trade.side} XAUUSD (+${gainPts.toFixed(2)} pts)`;
            const body = `Target profit ${tpPrice.toFixed(2)} sukses tercapai! Posisi selesai dengan profit penuh.`;
            sendAndroidNotification(title, body);
            triggerHaptic(30);
          }
        }
      }
    }
  }

  if (changed) {
    saveTradeHistory(trades);
    dispatchLifecycleChange();
  }
}

function dispatchLifecycleChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('amyfx:lifecycle-state-change'));

  // Jika tab Arsip sedang aktif, perbarui tampilannya secara langsung
  const historyPanel = document.getElementById('History');
  if (historyPanel && !historyPanel.hidden) {
    const el = document.getElementById('history');
    if (el) renderLifecycleArchive(el);
  }
}

export function computeWinRateStats(closedTrades = []) {
  const total = closedTrades.length;
  const wins = closedTrades.filter(t => t.status === 'CLOSED_TP' || (t.profitPoints != null && t.profitPoints > 0)).length;
  const losses = closedTrades.filter(t => t.status === 'CLOSED_SL' || (t.profitPoints != null && t.profitPoints < 0)).length;
  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const totalPoints = closedTrades.reduce((acc, t) => acc + (Number(t.profitPoints) || 0), 0);

  const winSum = closedTrades.filter(t => (t.profitPoints || 0) > 0).reduce((acc, t) => acc + t.profitPoints, 0);
  const lossSum = Math.abs(closedTrades.filter(t => (t.profitPoints || 0) < 0).reduce((acc, t) => acc + t.profitPoints, 0));

  const avgWin = wins > 0 ? winSum / wins : 0;
  const avgLoss = losses > 0 ? lossSum / losses : 0;

  return {
    total,
    wins,
    losses,
    winRate: Number(winRate.toFixed(1)),
    totalPoints: Number(totalPoints.toFixed(2)),
    avgWin: Number(avgWin.toFixed(2)),
    avgLoss: Number(avgLoss.toFixed(2)),
    ratio: losses > 0 ? (wins / losses).toFixed(2) : (wins > 0 ? `${wins}:0` : '—')
  };
}

function formatWitaTime(timestamp) {
  if (!timestamp) return '—';
  try {
    return new Date(Number(timestamp)).toLocaleString('id-ID', {
      timeZone: 'Asia/Makassar',
      hour12: false,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' WITA';
  } catch (_) {
    return '—';
  }
}

function injectLifecycleStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('amyfx-lifecycle-styles')) return;

  const style = document.createElement('style');
  style.id = 'amyfx-lifecycle-styles';
  style.textContent = `
    .lifecycle-archive-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin: 8px 0 20px 0;
    }
    .archive-wr-card {
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      padding: 16px;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .archive-wr-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding-bottom: 10px;
    }
    .archive-wr-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .archive-wr-title strong {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #FFFFFF;
    }
    .archive-tag-badge {
      font-size: 10px;
      font-weight: 700;
      color: var(--amy-accent, #F5C451);
      background: rgba(245, 196, 81, 0.12);
      border: 1px solid rgba(245, 196, 81, 0.3);
      padding: 2px 8px;
      border-radius: 12px;
    }
    .archive-metrics-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .archive-metric-box {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 12px 10px;
      text-align: center;
    }
    .archive-metric-box.featured {
      border-color: rgba(34, 197, 94, 0.3);
      background: rgba(34, 197, 94, 0.06);
    }
    .archive-metric-label {
      display: block;
      font-size: 10px;
      color: var(--muted, #94A3B8);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
      font-weight: 600;
    }
    .archive-metric-val {
      display: block;
      font-size: 1.35rem;
      font-weight: 800;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
      margin-bottom: 3px;
    }
    .archive-metric-sub {
      display: block;
      font-size: 10px;
      color: var(--muted, #94A3B8);
    }
    .val-green { color: #22C55E !important; }
    .val-red { color: #EF4444 !important; }
    .val-gold { color: var(--amy-accent, #F5C451) !important; }

    .archive-section {
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 16px;
    }
    .archive-section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .archive-section-head h3 {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0;
      color: #E2E8F0;
    }
    .archive-count-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 8px;
    }
    .archive-count-badge.active {
      background: rgba(34, 197, 94, 0.15);
      color: #22C55E;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .archive-count-badge.closed {
      background: rgba(255, 255, 255, 0.08);
      color: var(--muted, #94A3B8);
    }

    /* Active Running Cards */
    .running-trade-card {
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 12px;
      position: relative;
      overflow: hidden;
    }
    .running-trade-card.side-buy {
      border-left: 4px solid #22C55E;
    }
    .running-trade-card.side-sell {
      border-left: 4px solid #EF4444;
    }
    .running-card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .running-title-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .running-side-badge {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .running-side-badge.buy {
      background: #22C55E;
      color: #000;
    }
    .running-side-badge.sell {
      background: #EF4444;
      color: #FFF;
    }
    .running-signal-name {
      font-size: 12px;
      font-weight: 700;
      color: #FFF;
    }
    .running-pulse-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 700;
      color: #22C55E;
      background: rgba(34, 197, 94, 0.1);
      padding: 2px 8px;
      border-radius: 12px;
      border: 1px solid rgba(34, 197, 94, 0.25);
    }
    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22C55E;
      box-shadow: 0 0 6px #22C55E;
      animation: pulseAnim 1.6s infinite ease-in-out;
    }
    @keyframes pulseAnim {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.3); }
    }

    .running-floating-panel {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.04);
      padding: 10px 12px;
      border-radius: 10px;
      margin-bottom: 10px;
    }
    .floating-pts-box strong {
      font-size: 1.25rem;
      font-weight: 800;
      display: block;
      line-height: 1.1;
    }
    .floating-pts-box span {
      font-size: 10px;
      color: var(--muted, #94A3B8);
    }
    .floating-price-box {
      text-align: right;
    }
    .floating-price-box strong {
      font-size: 1.1rem;
      color: #FFF;
      display: block;
    }
    .floating-price-box span {
      font-size: 10px;
      color: var(--muted, #94A3B8);
    }

    .running-distances-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }
    .dist-box {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .dist-box small {
      display: block;
      font-size: 9px;
      font-weight: 700;
      color: var(--muted, #94A3B8);
      letter-spacing: 0.03em;
      margin-bottom: 2px;
    }
    .dist-box strong {
      font-size: 13px;
      display: block;
      color: #F8FAFC;
    }
    .dist-box span {
      font-size: 10px;
      color: var(--muted, #94A3B8);
    }

    .running-progress-wrap {
      margin-bottom: 10px;
    }
    .progress-bar-track {
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 4px;
    }
    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #22C55E, #F5C451);
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .progress-bar-fill.negative {
      background: linear-gradient(90deg, #EF4444, #F97316);
    }
    .progress-labels-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--muted, #94A3B8);
      margin-top: 4px;
    }

    .running-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 11px;
      color: var(--muted, #94A3B8);
    }
    .btn-focus-chart {
      background: rgba(245, 196, 81, 0.12);
      border: 1px solid rgba(245, 196, 81, 0.3);
      color: var(--amy-accent, #F5C451);
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      min-height: auto;
    }

    /* Completed Trades List */
    .closed-trade-card {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 8px;
      transition: background 0.2s ease;
    }
    .closed-trade-card:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .closed-card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .closed-outcome-badge {
      font-size: 11px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .closed-outcome-badge.tp {
      background: rgba(34, 197, 94, 0.15);
      color: #22C55E;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .closed-outcome-badge.sl {
      background: rgba(239, 68, 68, 0.15);
      color: #EF4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .closed-pair-title {
      font-size: 12px;
      font-weight: 700;
      color: #FFF;
    }
    .closed-time-label {
      font-size: 10px;
      color: var(--muted, #94A3B8);
    }
    .closed-meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      background: rgba(255, 255, 255, 0.02);
      padding: 8px;
      border-radius: 8px;
      font-size: 11px;
    }
    .closed-meta-item small {
      display: block;
      font-size: 9px;
      color: var(--muted, #94A3B8);
      font-weight: 600;
    }
    .closed-meta-item strong {
      display: block;
      color: #E2E8F0;
      font-size: 11px;
    }
    .closed-card-note {
      display: flex;
      justify-content: space-between;
      margin-top: 6px;
      font-size: 10px;
      color: var(--muted, #94A3B8);
    }

    .empty-state-card {
      text-align: center;
      padding: 24px 16px;
      color: var(--muted, #94A3B8);
      background: rgba(0, 0, 0, 0.2);
      border-radius: 12px;
      border: 1px dashed rgba(255, 255, 255, 0.08);
    }
    .empty-state-card strong {
      display: block;
      color: #E2E8F0;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .empty-state-card p {
      font-size: 11px;
      margin: 0;
      line-height: 1.5;
    }

    @media (max-width: 500px) {
      .archive-metrics-row {
        gap: 6px;
      }
      .archive-metric-val {
        font-size: 1.15rem;
      }
      .running-distances-grid {
        grid-template-columns: 1fr;
      }
      .closed-meta-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }
    }
  `;
  document.head.appendChild(style);
}

export function renderLifecycleArchive(container, serverHistory = null) {
  if (!container) return;
  injectLifecycleStyles();

  const currentPrice = getCurrentPrice();
  const allTrades = loadTradeHistory();

  // FILTER ANTI-SPAM WAJIB:
  // Setup dengan status pending limit (ARMED_LIMIT atau yang belum tersentuh) DILARANG masuk Arsip!
  const activeRunningTrades = allTrades.filter(t => t.status === 'ACTIVE_RUNNING');
  const closedTrackerTrades = allTrades.filter(t => t.status === 'CLOSED_TP' || t.status === 'CLOSED_SL');

  // Integrasi server driver history jika ada (hanya yang sudah selesai TP_HIT atau SL_HIT)
  const serverClosedTrades = [];
  if (Array.isArray(serverHistory)) {
    for (const s of serverHistory) {
      if (s.symbol === 'XAU/USD' && (s.status === 'TP_HIT' || s.status === 'SL_HIT')) {
        const side = s.direction || 'BUY';
        const isTp = s.status === 'TP_HIT';
        const entry = Number(s.entry) || 0;
        const sl = Number(s.stopLoss) || 0;
        const tp = Number(s.target) || 0;
        const pts = isTp ? Math.abs(tp - entry) : -Math.abs(entry - sl);

        serverClosedTrades.push({
          id: `server_${s.id || Math.random()}`,
          side,
          entry,
          sl,
          tp1: tp,
          tp2: null,
          status: isTp ? 'CLOSED_TP' : 'CLOSED_SL',
          signalName: s.driverName || s.model || 'Driver Model',
          triggeredAt: s.signalCandleCloseTime ? s.signalCandleCloseTime * 1000 : null,
          closedAt: s.evaluatedAt ? s.evaluatedAt * 1000 : (s.signalCandleCloseTime ? s.signalCandleCloseTime * 1000 + 3600000 : null),
          closePrice: isTp ? tp : sl,
          profitPoints: Number(pts.toFixed(2)),
          closeReason: isTp ? 'TP' : 'SL',
          isServerDriver: true
        });
      }
    }
  }

  // Gabungkan closed trades, prioritaskan trade dari assistant tracker
  const combinedClosed = [...closedTrackerTrades];
  const seenKeys = new Set(closedTrackerTrades.map(t => `${t.side}_${t.entry}_${t.closePrice}`));
  for (const s of serverClosedTrades) {
    const k = `${s.side}_${s.entry}_${s.closePrice}`;
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      combinedClosed.push(s);
    }
  }

  // Hitung ringkasan Win Rate
  const stats = computeWinRateStats(combinedClosed);

  const wrClass = stats.total === 0 ? '' : stats.winRate >= 50 ? 'val-green' : 'val-red';
  const ptsClass = stats.totalPoints > 0 ? 'val-green' : stats.totalPoints < 0 ? 'val-red' : '';
  const ptsSign = stats.totalPoints > 0 ? `+${stats.totalPoints.toFixed(2)}` : `${stats.totalPoints.toFixed(2)}`;

  // 1. CARD RINGKASAN WIN RATE (Paling Atas)
  const summaryCardHtml = `
    <div class="archive-wr-card">
      <div class="archive-wr-header">
        <div class="archive-wr-title">
          <span style="font-size:16px;">🏆</span>
          <strong>Ringkasan Performa &amp; Win Rate</strong>
        </div>
        <span class="archive-tag-badge">ENTRY ASSISTANT V3 &amp; DRIVER</span>
      </div>
      <div class="archive-metrics-row">
        <div class="archive-metric-box featured">
          <span class="archive-metric-label">Win Rate</span>
          <strong class="archive-metric-val ${wrClass}">${stats.total > 0 ? stats.winRate + '%' : '—'}</strong>
          <span class="archive-metric-sub">${stats.wins} Menang · ${stats.losses} Kalah</span>
        </div>
        <div class="archive-metric-box">
          <span class="archive-metric-label">Rasio Menang / Kalah</span>
          <strong class="archive-metric-val val-gold">${stats.ratio}</strong>
          <span class="archive-metric-sub">${stats.total} Total Selesai</span>
        </div>
        <div class="archive-metric-box">
          <span class="archive-metric-label">Total Poin</span>
          <strong class="archive-metric-val ${ptsClass}">${ptsSign} pts</strong>
          <span class="archive-metric-sub">${(stats.totalPoints * 10).toFixed(0)} pips</span>
        </div>
      </div>
    </div>
  `;

  // 2. POSISI SEDANG BERJALAN (Active Running) DENGAN FLOATING DISTANCE
  let activeSectionHtml = '';
  if (activeRunningTrades.length === 0) {
    activeSectionHtml = `
      <div class="empty-state-card">
        <strong>Tidak ada posisi yang sedang berjalan saat ini</strong>
        <p>Setup pending limit (ARMED) menunggu harga menyentuh entry sebelum aktif masuk ke Arsip.</p>
      </div>
    `;
  } else {
    activeSectionHtml = activeRunningTrades.map(t => {
      const p = currentPrice || t.entry;
      const isBuy = t.side === 'BUY';
      const floatingPts = isBuy ? (p - t.entry) : (t.entry - p);
      const floatingClass = floatingPts >= 0 ? 'val-green' : 'val-red';
      const floatingSign = floatingPts >= 0 ? `+${floatingPts.toFixed(2)}` : `${floatingPts.toFixed(2)}`;

      const distTp1 = isBuy ? (t.tp1 - p) : (p - t.tp1);
      const distSl = isBuy ? (p - t.sl) : (t.sl - p);

      const tp1Label = distTp1 <= 0 ? 'Tersentuh / Melewati Target' : `${distTp1.toFixed(2)} pts lagi ke TP1`;
      const slLabel = distSl <= 0 ? 'Tersentuh Batas Risiko' : `${distSl.toFixed(2)} pts dari SL`;

      // Progress bar percentage: dari SL (0%) ke Entry lalu ke TP1 (100%)
      const totalSpan = isBuy ? (t.tp1 - t.sl) : (t.sl - t.tp1);
      const currentProgress = isBuy ? (p - t.sl) : (t.sl - p);
      let pct = totalSpan > 0 ? (currentProgress / totalSpan) * 100 : 50;
      pct = Math.max(0, Math.min(100, pct));

      const rValue = t.risk > 0 ? (floatingPts / t.risk).toFixed(2) : '—';

      return `
        <div class="running-trade-card ${isBuy ? 'side-buy' : 'side-sell'}">
          <div class="running-card-head">
            <div class="running-title-group">
              <span class="running-side-badge ${isBuy ? 'buy' : 'sell'}">${t.side}</span>
              <strong class="running-signal-name">${t.signalName}</strong>
            </div>
            <span class="running-pulse-badge">
              <span class="pulse-dot"></span> LIVE RUNNING
            </span>
          </div>

          <div class="running-floating-panel">
            <div class="floating-pts-box">
              <span class="archive-metric-label">Floating Gain / Loss</span>
              <strong class="${floatingClass}">${floatingSign} pts</strong>
              <span>${(floatingPts * 10).toFixed(0)} pips · ${rValue} R</span>
            </div>
            <div class="floating-price-box">
              <span class="archive-metric-label">Live Price</span>
              <strong>${p ? '$' + p.toFixed(2) : '—'}</strong>
              <span>Entry: $${t.entry.toFixed(2)}</span>
            </div>
          </div>

          <div class="running-distances-grid">
            <div class="dist-box">
              <small>JARAK KE TP 1</small>
              <strong class="val-green">${tp1Label}</strong>
              <span>Target: $${t.tp1.toFixed(2)}</span>
            </div>
            <div class="dist-box">
              <small>JARAK KE STOP LOSS</small>
              <strong class="${distSl <= 1.5 ? 'val-red' : ''}">${slLabel}</strong>
              <span>Batas SL: $${t.sl.toFixed(2)}</span>
            </div>
          </div>

          <div class="running-progress-wrap">
            <div class="progress-labels-row">
              <span>SL $${t.sl.toFixed(2)}</span>
              <span style="color:var(--amy-accent,#F5C451);">Entry $${t.entry.toFixed(2)}</span>
              <span style="color:#22C55E;">TP1 $${t.tp1.toFixed(2)}</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill ${floatingPts < 0 ? 'negative' : ''}" style="width:${pct.toFixed(0)}%;"></div>
            </div>
          </div>

          <div class="running-card-footer">
            <span>Terpicu: ${formatWitaTime(t.triggeredAt)}</span>
            <button type="button" class="btn-focus-chart" data-focus-trade="${t.id}">📈 Tampilkan di Chart</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. RIWAYAT POSISI SELESAI (Completed TP/SL)
  let closedSectionHtml = '';
  if (combinedClosed.length === 0) {
    closedSectionHtml = `
      <div class="empty-state-card">
        <strong>Belum ada riwayat posisi selesai</strong>
        <p>Setiap trade yang menyentuh target profit (TP) atau stop loss (SL) akan otomatis diarsipkan di sini.</p>
      </div>
    `;
  } else {
    closedSectionHtml = combinedClosed.slice(0, 25).map(t => {
      const isTp = t.status === 'CLOSED_TP';
      const isBuy = t.side === 'BUY';
      const pts = Number(t.profitPoints || 0);
      const ptsText = pts > 0 ? `+${pts.toFixed(2)} pts` : `${pts.toFixed(2)} pts`;
      const timeStr = formatWitaTime(t.closedAt || t.triggeredAt);

      return `
        <div class="closed-trade-card">
          <div class="closed-card-head">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="closed-outcome-badge ${isTp ? 'tp' : 'sl'}">
                ${isTp ? '🎯 TP HIT (' + ptsText + ')' : '🛑 SL HIT (' + ptsText + ')'}
              </span>
              <strong class="closed-pair-title">${t.side} XAU/USD</strong>
            </div>
            <span class="closed-time-label">${timeStr}</span>
          </div>

          <div class="closed-meta-grid">
            <div class="closed-meta-item">
              <small>ENTRY</small>
              <strong>$${Number(t.entry).toFixed(2)}</strong>
            </div>
            <div class="closed-meta-item">
              <small>EXIT</small>
              <strong>$${t.closePrice ? Number(t.closePrice).toFixed(2) : '—'}</strong>
            </div>
            <div class="closed-meta-item">
              <small>STOP LOSS</small>
              <strong>$${Number(t.sl).toFixed(2)}</strong>
            </div>
            <div class="closed-meta-item">
              <small>TARGET TP</small>
              <strong>$${Number(t.tp1).toFixed(2)}</strong>
            </div>
          </div>

          <div class="closed-card-note">
            <span>${t.signalName || 'Amy ICT Model'}</span>
            <span style="font-weight:700; color:${isTp ? '#22C55E' : '#EF4444'};">
              ${isTp ? 'Target sukses tercapai penuh' : 'Disiplin risiko stop loss tercatat'}
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = `
    <div class="lifecycle-archive-container">
      ${summaryCardHtml}

      <div class="archive-section">
        <div class="archive-section-head">
          <h3>⚡ Posisi Sedang Berjalan</h3>
          <span class="archive-count-badge ${activeRunningTrades.length > 0 ? 'active' : 'closed'}">
            ${activeRunningTrades.length} AKTIF
          </span>
        </div>
        ${activeSectionHtml}
      </div>

      <div class="archive-section">
        <div class="archive-section-head">
          <h3>📜 Riwayat Posisi Selesai</h3>
          <span class="archive-count-badge closed">
            ${combinedClosed.length} SELESAI
          </span>
        </div>
        ${closedSectionHtml}
      </div>
    </div>
  `;

  // Pasang listener interaksi tombol 'Tampilkan di Chart'
  container.querySelectorAll('[data-focus-trade]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tradeId = btn.getAttribute('data-focus-trade');
      const tr = allTrades.find(x => x.id === tradeId);
      if (!tr) return;

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('amyfx:driver-plan', {
          detail: {
            id: tr.id,
            entry: tr.entry,
            sl: tr.sl,
            tp1: tr.tp1,
            tp: tr.tp2 || tr.tp1,
            label: tr.signalName
          }
        }));
        window.setTab?.('Dashboard');
        document.getElementById('chart')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }
    });
  });
}

// Inisialisasi listener global otomatis
export function initTradeLifecycleTracker() {
  if (typeof window === 'undefined') return;

  // 1. Tangkap konteks pasar & plan dari Amy ICT / Entry Assistant V3
  window.addEventListener('amyfx:market-context', event => {
    const context = event.detail;
    if (!context?.amy) return;
    const plan = context.amy.assistant?.plan || context.amy.plan;
    if (plan) {
      trackAssistantPlan(plan);
    }
  });

  // 2. Tangkap sinyal asisten eksplisit
  window.addEventListener('amyfx:assistant-plan', event => {
    const plan = event.detail;
    if (plan) {
      trackAssistantPlan(plan);
    }
  });

  // 3. Tangkap live tick harga
  window.addEventListener('amyfx:live-price-display', event => {
    const price = event.detail?.price;
    if (price && Number.isFinite(price)) {
      updatePrice(price);
    }
  });

  // 4. Tangkap pembaruan candle
  window.addEventListener('amyfx:candles-updated', event => {
    const candles = event.detail?.candles;
    if (Array.isArray(candles) && candles.length > 0) {
      const last = candles[candles.length - 1];
      if (last && last.close) {
        updatePrice(Number(last.close), Number(last.high), Number(last.low), Number(last.time || last.open_time));
      }
    }
  });

  // 5. Polling sinkronisasi harga ringan tiap 2 detik jika tab aktif
  const syncTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const p = getCurrentPrice();
    if (p != null && Number.isFinite(p) && p !== lastKnownPrice) {
      updatePrice(p);
    }
  }, 2000);
  try { syncTimer?.unref?.(); } catch (_) {}

  // Inisialisasi awal dari context yang tersimpan
  try {
    const saved = localStorage.getItem('amyfx.market-context.v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      const plan = parsed?.amy?.assistant?.plan || parsed?.amy?.plan;
      if (plan) trackAssistantPlan(plan);
    }
  } catch (_) {}
}

// Jalankan inisialisasi modul jika di browser
if (typeof window !== 'undefined') {
  initTradeLifecycleTracker();
}
