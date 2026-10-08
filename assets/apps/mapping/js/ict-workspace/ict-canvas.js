import {compactChartNarration} from './ict-presentation.js';
import {fibonacci, sessions} from './amy-ict.js';
import {calculateNextGenIndicators} from './nextgen-indicators.js';

const COLORS = {
  BUY: '#00cfa0',
  SELL: '#ff606f',
  pivot: '#82a7ff',
  VI: '#37cde8',
  NWOG: '#e88eab',
  NDOG: '#ffc578',
  LIQ: '#d694ff',
  BPR: '#d9e68a'
};

export function createIctCanvas(element, chart, series) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ict-overlay';
  canvas.style.pointerEvents = 'none';
  canvas.setAttribute('aria-hidden', 'true');
  element.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let state = null, frame = null, visualKey = '', indicators = null;

  const request = () => {
    if (frame == null) frame = requestAnimationFrame(paint);
  };

  function paint() {
    frame = null;
    if (!ctx) return;
    const w = element.clientWidth, h = element.clientHeight, scale = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * scale) || canvas.height !== Math.round(h * scale)) {
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!state?.candles?.length) return;

    const {candles, amy, settings: s = {}, tf} = state;
    const seconds = {M1: 60, M5: 300, M15: 900, H1: 3600}[tf] || 900;
    const fullscreen = Boolean(element.closest('#gold-chart-workspace.is-fullscreen'));
    const fontSize = fullscreen ? 14 : 10;
    const plotRight = Math.max(0, w - chart.priceScale('right').width());
    const plotBottom = Math.max(0, h - chart.timeScale().height());

    const key = tf + JSON.stringify(candles);
    if (key !== visualKey || !indicators) {
      visualKey = key;
      indicators = state.indicators || calculateNextGenIndicators(candles, {
        context: state.context || (amy ? {amy} : null)
      });
    }

    const x = t => Number.isFinite(t) ? chart.timeScale().timeToCoordinate(t) : null;
    const y = p => series.priceToCoordinate(p);
    const logical = chart.timeScale().getVisibleLogicalRange();
    const first = logical ? Math.max(0, Math.floor(logical.from)) : 0;
    const last = Math.min(candles.length - 1, logical ? Math.ceil(logical.to) : candles.length - 1);

    const leftAt = t => {
      const index = candles.findIndex(c => c.time >= t);
      if (index < 0) return null;
      const v = x(candles[index].time);
      return v == null ? (index < first ? 0 : null) : v;
    };

    const light = document.documentElement.dataset.amyfxTheme === 'light';
    const labelBounds = [];

    const label = (text, xx, yy, color) => {
      if (!text || yy < fontSize || yy > plotBottom - 6) return;
      ctx.font = fontSize + 'px sans-serif';
      const textWidth = ctx.measureText(text).width;
      const width = Math.min(textWidth + 6, Math.max(0, plotRight - xx));
      const bounds = {left: xx - 2, right: xx + width, top: yy - fontSize - 1, bottom: yy + 3};
      if (labelBounds.some(b => bounds.left < b.right && bounds.right > b.left && bounds.top < b.bottom && bounds.bottom > b.top)) return;
      labelBounds.push(bounds);
      ctx.fillStyle = light ? '#eff4ffeb' : '#07111deb';
      ctx.fillRect(xx - 2, yy - fontSize - 1, width, fontSize + 4);
      ctx.fillStyle = color;
      ctx.fillText(text, xx, yy, Math.max(0, plotRight - xx));
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, plotRight, plotBottom);
    ctx.clip();

    // 1. Killzones / Session background shading
    if (s.killzones) {
      for (let i = first; i <= last; i++) {
        const c = candles[i], names = sessions(c.time);
        const active = names.find(n => ({NY: s.ny, LONDON_OPEN: s.londonOpen, LONDON_CLOSE: s.londonClose, ASIA: s.asian})[n]);
        if (!active) continue;
        const xx = x(c.time), next = x(candles[i + 1]?.time);
        if (xx == null) continue;
        ctx.fillStyle = {NY: '#ff8c001a', LONDON_OPEN: '#00bcd41a', LONDON_CLOSE: '#2157f322', ASIA: '#e91e631a'}[active];
        ctx.fillRect(xx, 0, (next ?? xx + 8) - xx, plotBottom);
      }
    }

    const lineRight = Math.min(plotRight, chart.timeScale().logicalToCoordinate(candles.length - 1 + (s.rightBars || 40)) ?? plotRight);

    const line = (price, title, color, time = null, end = null, dashed = false) => {
      const yy = y(price);
      if (yy == null) return;
      const origin = time != null ? leftAt(time) : x(candles[Math.max(0, candles.length - (s.backBars || 80))]?.time);
      const xx = origin ?? 0, right = end != null ? leftAt(end) ?? plotRight : lineRight;
      ctx.strokeStyle = color;
      ctx.lineWidth = s.lineWidth || 1;
      if (dashed) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(right, yy);
      ctx.stroke();
      if (dashed) ctx.setLineDash([]);
      label(title, Math.max(4, Math.min(xx + 3, plotRight - 90)), yy - 3, color);
    };

    // 2. Asia Session High / Low (06:00 - 14:00 WITA)
    const kl = indicators?.keyLevels;
    if (kl?.asiaStart && kl.asiaHigh != null && kl.asiaLow != null) {
      const aX1 = leftAt(kl.asiaStart);
      const aX2 = kl.asiaEnd ? leftAt(kl.asiaEnd) : lineRight;
      const aTop = y(kl.asiaHigh);
      const aBot = y(kl.asiaLow);
      if (aX1 != null && aTop != null && aBot != null) {
        ctx.fillStyle = light ? 'rgba(168, 85, 247, 0.05)' : 'rgba(168, 85, 247, 0.08)';
        ctx.fillRect(aX1, aTop, Math.max(0, Math.min(plotRight, aX2 ?? plotRight) - aX1), Math.max(0, aBot - aTop));
      }
      line(kl.asiaHigh, `ASIA HIGH ${kl.asiaHigh.toFixed(2)}`, '#a855f7', kl.asiaStart, null, true);
      line(kl.asiaLow, `ASIA LOW ${kl.asiaLow.toFixed(2)}`, '#a855f7', kl.asiaStart, null, true);
    }

    // 3. Time-bounded POI Boxes: FVG with 50% CE (dashed line)
    for (const fvg of indicators?.poi?.fvg || []) {
      const xx = leftAt(fvg.startTime);
      const top = y(fvg.top), bottom = y(fvg.bot);
      if (xx == null || top == null || bottom == null || xx > plotRight) continue;
      const end = fvg.endTime ? leftAt(fvg.endTime) : lineRight;
      const right = Math.min(plotRight, end ?? lineRight);
      const color = fvg.side === 'BUY' ? '#10b981' : '#ef4444';

      ctx.fillStyle = color + (light ? '15' : '20');
      ctx.fillRect(xx, top, Math.max(0, right - xx), Math.max(0, bottom - top));
      ctx.strokeStyle = color;
      ctx.lineWidth = s.lineWidth || 1;
      if (fvg.tested) ctx.setLineDash([3, 3]);
      ctx.strokeRect(xx, top, Math.max(0, right - xx), Math.max(0, bottom - top));
      ctx.setLineDash([]);

      // 50% CE dashed line
      const ceY = y(fvg.ce);
      if (ceY != null) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#ffd166'; // gold dashed line for CE
        ctx.beginPath();
        ctx.moveTo(xx, ceY);
        ctx.lineTo(right, ceY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      label(`${fvg.side === 'BUY' ? 'Bull' : 'Bear'} FVG · 50% CE`, Math.max(3, xx + 4), top + 12, color);
    }

    // 4. Time-bounded POI Boxes: Order Blocks (+OB, -OB) with 50% CE
    for (const ob of indicators?.poi?.ob || []) {
      const xx = leftAt(ob.startTime);
      const top = y(ob.top), bottom = y(ob.bot);
      if (xx == null || top == null || bottom == null || xx > plotRight) continue;
      const end = ob.endTime ? leftAt(ob.endTime) : lineRight;
      const right = Math.min(plotRight, end ?? lineRight);
      const color = ob.color || (ob.side === 'BUY' ? '#3b82f6' : '#ef4444');

      ctx.fillStyle = color + (light ? '18' : '24');
      ctx.fillRect(xx, top, Math.max(0, right - xx), Math.max(0, bottom - top));
      ctx.strokeStyle = color;
      ctx.lineWidth = s.lineWidth || 1;
      ctx.strokeRect(xx, top, Math.max(0, right - xx), Math.max(0, bottom - top));

      // 50% CE dashed line
      const ceY = y(ob.ce);
      if (ceY != null) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(xx, ceY);
        ctx.lineTo(right, ceY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      label(`${ob.label} · 50% CE`, Math.max(3, xx + 4), top + 12, color);
    }

    // 5. Market Structure: BOS and MSS lines with labels
    for (const ev of indicators?.structure?.events || []) {
      const x1 = leftAt(ev.startTime), x2 = leftAt(ev.endTime), yy = y(ev.level);
      if (x1 == null || x2 == null || yy == null) continue;
      ctx.strokeStyle = ev.color;
      ctx.lineWidth = Math.max(1, s.lineWidth || 1);
      ctx.beginPath();
      ctx.moveTo(x1, yy);
      ctx.lineTo(x2, yy);
      ctx.stroke();
      const xMid = Math.round((x1 + x2) / 2);
      label(`${ev.type} · ICT`, Math.max(4, xMid - 16), yy - 3, ev.color);
    }

    // 6. Internal Liquidity: BSL (Swing High 4-bar) and SSL (Swing Low 4-bar)
    for (const bsl of indicators?.liquidity?.bsl || []) {
      const xx = leftAt(bsl.time), yy = y(bsl.level);
      if (xx == null || yy == null) continue;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = s.lineWidth || 1;
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(lineRight, yy);
      ctx.stroke();
      ctx.setLineDash([]);
      label(`BSL ${bsl.level.toFixed(2)}`, Math.max(4, Math.min(xx + 4, plotRight - 90)), yy - 3, '#ef4444');
    }
    for (const ssl of indicators?.liquidity?.ssl || []) {
      const xx = leftAt(ssl.time), yy = y(ssl.level);
      if (xx == null || yy == null) continue;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = s.lineWidth || 1;
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(lineRight, yy);
      ctx.stroke();
      ctx.setLineDash([]);
      label(`SSL ${ssl.level.toFixed(2)}`, Math.max(4, Math.min(xx + 4, plotRight - 90)), yy - 3, '#22c55e');
    }

    // 7. Sweep Markers ('×' for BSL/SSL, '◆' for Asia)
    for (const sw of indicators?.liquidity?.sweeps || []) {
      const xx = x(sw.time), yy = y(sw.price);
      if (xx == null || yy == null || xx < 0 || xx > plotRight) continue;
      ctx.font = 'bold ' + (fontSize + 3) + 'px sans-serif';
      ctx.fillStyle = sw.color;
      ctx.textAlign = 'center';
      const offset = sw.side === 'BUY' ? -4 : (fontSize + 4);
      ctx.fillText(sw.symbol, xx, yy + offset);
      ctx.textAlign = 'left';
    }

    // 8. Infinite/Horizontal Key Levels on Canvas (renders clean labels directly on chart)
    if (kl) {
      if (Number.isFinite(kl.pdh)) line(kl.pdh, `PDH ${kl.pdh.toFixed(2)}`, '#f97316', null, null, true);
      if (Number.isFinite(kl.pdl)) line(kl.pdl, `PDL ${kl.pdl.toFixed(2)}`, '#3b82f6', null, null, true);
      if (Number.isFinite(kl.pwh)) line(kl.pwh, `PWH ${kl.pwh.toFixed(2)}`, '#d946ef', null, null, true);
      if (Number.isFinite(kl.pwl)) line(kl.pwl, `PWL ${kl.pwl.toFixed(2)}`, '#06b6d4', null, null, true);
      if (Number.isFinite(kl.pdEq)) line(kl.pdEq, `PD EQ ${kl.pdEq.toFixed(2)}`, '#94a3b8', null, null, true);
    }
    if (indicators?.structure?.invalidation?.level) {
      const inv = indicators.structure.invalidation;
      line(inv.level, inv.text, inv.color, inv.time, null, true);
    }

    // 9. Compact Chart Narration
    if (s.narration && amy?.entry) {
      const lines = compactChartNarration(amy, state.news);
      ctx.font = (fullscreen ? 14 : 11) + 'px sans-serif';
      const lineHeight = fullscreen ? 20 : 15, bw = Math.min(plotRight - 16, fullscreen ? 440 : 300), bh = lines.length * lineHeight + 12;
      ctx.fillStyle = light ? '#f3f7fff0' : '#07111def';
      ctx.fillRect(8, 8, bw, bh);
      ctx.strokeStyle = '#739bd2';
      ctx.strokeRect(8, 8, bw, bh);
      ctx.fillStyle = light ? '#263c60' : '#e4eeff';
      lines.forEach((text, i) => ctx.fillText(text, 14, 8 + lineHeight + i * lineHeight, bw - 12));
    }

    ctx.restore();
  }

  let interacting = false;
  const begin = () => { interacting = true; request(); };
  const move = () => { if (interacting) request(); };
  const end = event => { interacting = Boolean(event?.touches?.length); request(); };
  const bindings = [
    [element, 'touchstart', begin], [element, 'mousedown', begin], [element, 'dblclick', request],
    [document, 'touchmove', move], [document, 'mousemove', move], [document, 'touchend', end],
    [document, 'touchcancel', end], [document, 'mouseup', end], [window, 'blur', end]
  ];
  for (const [target, name, handler] of bindings) target.addEventListener(name, handler, {passive: true});
  chart.timeScale().subscribeVisibleLogicalRangeChange(request);
  const observer = new ResizeObserver(request);
  observer.observe(element);

  return {
    update(next) {
      state = next;
      indicators = next?.indicators || null;
      request();
    },
    invalidate: request,
    destroy() {
      for (const [target, name, handler] of bindings) target.removeEventListener(name, handler);
      if (frame != null) cancelAnimationFrame(frame);
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(request);
      canvas.remove();
    }
  };
}
