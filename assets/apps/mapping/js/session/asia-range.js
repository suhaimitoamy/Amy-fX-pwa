const NY_ZONE = 'America/New_York';
const WIB_ZONE = 'Asia/Jakarta';

function zonedParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(timestamp));
  const read = type => Number(parts.find(item => item.type === type)?.value || 0);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second')
  };
}

function addCalendarDays(parts, amount) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function zonedTimestamp(dateParts, hour, minute, timeZone) {
  const targetAsUtc = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hour,
    minute,
    0
  );
  let guess = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = zonedParts(guess, timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    const correction = targetAsUtc - observedAsUtc;
    guess += correction;
    if (Math.abs(correction) < 1000) break;
  }
  return guess;
}

function candleTimeMs(candle) {
  const value = Number(candle?.time);
  if (!Number.isFinite(value)) return NaN;
  return value > 10_000_000_000 ? value : value * 1000;
}

function validCandle(candle) {
  return Number.isFinite(candleTimeMs(candle)) &&
    Number.isFinite(Number(candle?.high)) &&
    Number.isFinite(Number(candle?.low)) &&
    Number.isFinite(Number(candle?.close));
}

function formatWib(timestamp) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(timestamp)).replace('.', ':');
}

function formatWibDate(timestamp) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB_ZONE,
    day: '2-digit',
    month: 'short'
  }).format(new Date(timestamp));
}

export function asiaSessionWindows(nowMs = Date.now(), count = 8) {
  const nowNy = zonedParts(nowMs, NY_ZONE);
  const anchorOffset = nowNy.hour >= 20 ? 0 : -1;
  const windows = [];

  for (let index = 0; index < count; index += 1) {
    const startDate = addCalendarDays(nowNy, anchorOffset - index);
    const endDate = addCalendarDays(startDate, 1);
    const start = zonedTimestamp(startDate, 20, 0, NY_ZONE);
    const end = zonedTimestamp(endDate, 0, 0, NY_ZONE);
    windows.push({
      start,
      end,
      active: nowMs >= start && nowMs < end,
      complete: nowMs >= end,
      label: `${formatWibDate(start)} • ${formatWib(start)}–${formatWib(end)} WIB`
    });
  }
  return windows;
}

function classifyLevel(direction, level, postSession, livePrice, tolerance, active) {
  if (active) return 'BERKEMBANG';

  const closeBroken = postSession.some(candle => direction === 'HIGH'
    ? Number(candle.close) > level
    : Number(candle.close) < level);
  if (closeBroken) return 'CLOSE BREAK';

  const wickSwept = postSession.some(candle => direction === 'HIGH'
    ? Number(candle.high) > level && Number(candle.close) <= level
    : Number(candle.low) < level && Number(candle.close) >= level);
  if (wickSwept) return 'TERSAPU WICK';

  if (Number.isFinite(livePrice)) {
    const beyond = direction === 'HIGH' ? livePrice > level : livePrice < level;
    if (beyond) return 'LEWAT LIVE';
    if (Math.abs(livePrice - level) <= tolerance) return 'SEDANG DIUJI';
  }
  return 'BELUM DISAPU';
}

function marketPosition(price, high, low) {
  if (!Number.isFinite(price)) return 'Harga live belum tersedia';
  if (price > high) return 'Harga di atas Asia High';
  if (price < low) return 'Harga di bawah Asia Low';
  return 'Harga masih di dalam Asia Range';
}

function buildSummary(result) {
  if (!result.valid) return result.note || 'Candle M15 Asia Range belum tersedia.';
  if (result.active) {
    return `Range sementara ${result.range.toFixed(2)} • Asia Range masih berkembang`;
  }

  const highTaken = ['TERSAPU WICK', 'CLOSE BREAK', 'LEWAT LIVE'].includes(result.highStatus);
  const lowTaken = ['TERSAPU WICK', 'CLOSE BREAK', 'LEWAT LIVE'].includes(result.lowStatus);
  if (highTaken && !lowTaken) {
    return `Range ${result.range.toFixed(2)} • Asia High sudah diambil, Asia Low masih utuh`;
  }
  if (lowTaken && !highTaken) {
    return `Range ${result.range.toFixed(2)} • Asia Low sudah diambil, Asia High masih utuh`;
  }
  if (highTaken && lowTaken) {
    return `Range ${result.range.toFixed(2)} • Kedua sisi Asia Range sudah diambil`;
  }
  return `Range ${result.range.toFixed(2)} • ${result.position}`;
}

export function calculateAsiaRange(candles = [], livePrice = NaN, nowMs = Date.now()) {
  const clean = candles.filter(validCandle);
  const windows = asiaSessionWindows(nowMs);
  if (!clean.length) {
    return {
      valid: false,
      state: 'NO_DATA',
      windowLabel: windows[0]?.label || '-',
      note: 'Memuat candle M15 untuk Asia Range.'
    };
  }

  let selected = null;
  let sessionCandles = [];
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    const rows = clean.filter(candle => {
      const time = candleTimeMs(candle);
      return time >= window.start && time < window.end;
    });

    if (window.active && index === 0 && rows.length === 0) {
      return {
        valid: false,
        state: 'DEVELOPING',
        active: true,
        windowLabel: window.label,
        note: 'Asia Range baru dimulai; menunggu candle M15 pertama selesai.'
      };
    }
    if (rows.length >= 2) {
      selected = window;
      sessionCandles = rows;
      break;
    }
  }

  if (!selected) {
    return {
      valid: false,
      state: 'NO_SESSION',
      windowLabel: windows[0]?.label || '-',
      note: 'Data Asia Range belum lengkap.'
    };
  }

  const high = Math.max(...sessionCandles.map(candle => Number(candle.high)));
  const low = Math.min(...sessionCandles.map(candle => Number(candle.low)));
  const range = high - low;
  const price = Number(livePrice);
  const postSession = clean.filter(candle => {
    const time = candleTimeMs(candle);
    return time >= selected.end && time <= nowMs;
  });
  const tolerance = Math.max(range * 0.025, 0.2);

  const result = {
    valid: true,
    state: selected.active ? 'DEVELOPING' : 'COMPLETE',
    active: selected.active,
    complete: selected.complete,
    start: selected.start,
    end: selected.end,
    windowLabel: selected.label,
    high,
    low,
    range,
    highStatus: classifyLevel('HIGH', high, postSession, price, tolerance, selected.active),
    lowStatus: classifyLevel('LOW', low, postSession, price, tolerance, selected.active),
    position: marketPosition(price, high, low),
    candleCount: sessionCandles.length
  };
  result.summary = buildSummary(result);
  return result;
}
