const DISPLAY_ZONE = 'Asia/Makassar';

const SESSION_DEFINITIONS = Object.freeze({
  LONDON: Object.freeze({
    id: 'LONDON',
    label: 'London',
    timeZone: 'Europe/London',
    startMinute: 7 * 60,
    endMinute: 11 * 60
  }),
  NEW_YORK: Object.freeze({
    id: 'NEW_YORK',
    label: 'New York',
    timeZone: 'America/New_York',
    startMinute: 7 * 60 + 30,
    endMinute: 16 * 60
  })
});

function timestampMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return number > 10_000_000_000 ? number : number * 1000;
}

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

function sourceOffsetMinutes(timestamp, timeZone) {
  const observed = zonedParts(timestamp, timeZone);
  const observedAsUtc = Date.UTC(
    observed.year,
    observed.month - 1,
    observed.day,
    observed.hour,
    observed.minute,
    observed.second
  );
  return Math.round((observedAsUtc - timestamp) / 60000);
}

function sourceSeason(timestamp, timeZone) {
  const offset = sourceOffsetMinutes(timestamp, timeZone);
  if (timeZone === 'America/New_York') {
    if (offset === -240) return 'EDT';
    if (offset === -300) return 'EST';
  }
  if (timeZone === 'Europe/London') {
    if (offset === 60) return 'BST';
    if (offset === 0) return 'GMT';
  }
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function zonedTimestamp(dateParts, minuteOfDay, timeZone) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const targetAsUtc = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hour,
    minute,
    0
  );
  let guess = targetAsUtc;
  for (let attempt = 0; attempt < 6; attempt += 1) {
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

function formatWita(timestamp) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: DISPLAY_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(timestamp)).replace('.', ':');
}

function minuteInZone(timestamp, timeZone) {
  const parts = zonedParts(timestamp, timeZone);
  return parts.hour * 60 + parts.minute;
}

function inWindow(minute, start, end) {
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
}

function sessionDetail(definition, timestamp) {
  const sourceDate = zonedParts(timestamp, definition.timeZone);
  const start = zonedTimestamp(sourceDate, definition.startMinute, definition.timeZone);
  const end = zonedTimestamp(sourceDate, definition.endMinute, definition.timeZone);
  return {
    id: definition.id,
    label: definition.label,
    timeZone: definition.timeZone,
    season: sourceSeason(timestamp, definition.timeZone),
    active: inWindow(
      minuteInZone(timestamp, definition.timeZone),
      definition.startMinute,
      definition.endMinute
    ),
    sourceStartMinute: definition.startMinute,
    sourceEndMinute: definition.endMinute,
    start,
    end,
    witaStart: formatWita(start),
    witaEnd: formatWita(end)
  };
}

export function executionSessionState(value, mode = 'NONE') {
  const timestamp = timestampMs(value);
  if (!Number.isFinite(timestamp)) {
    return {
      mode,
      ready: false,
      allowed: mode === 'NONE',
      activeSession: 'UNKNOWN',
      london: null,
      newYork: null,
      source: 'DST_AWARE_SESSION_CLOCK_V1'
    };
  }
  const london = sessionDetail(SESSION_DEFINITIONS.LONDON, timestamp);
  const newYork = sessionDetail(SESSION_DEFINITIONS.NEW_YORK, timestamp);
  const allowed = mode === 'NONE'
    ? true
    : mode === 'NEW_YORK_ONLY'
      ? newYork.active
      : mode === 'LONDON_ONLY'
        ? london.active
        : london.active || newYork.active;
  const activeSession = newYork.active
    ? 'NEW_YORK'
    : london.active
      ? 'LONDON'
      : 'OFF_SESSION';
  return {
    mode,
    ready: true,
    allowed,
    activeSession,
    london,
    newYork,
    displayZone: DISPLAY_ZONE,
    source: 'DST_AWARE_SESSION_CLOCK_V1'
  };
}

export function executionSessionAllowed(value, mode = 'NONE') {
  return executionSessionState(value, mode).allowed;
}

export function executionSessionRequirement(mode = 'NONE', value = Date.now()) {
  if (mode === 'NONE') return 'Tidak menjadi hard gate';
  const state = executionSessionState(value, mode);
  if (!state.ready) return 'Jam sesi belum dapat dihitung';
  const london = `London ${state.london.witaStart}–${state.london.witaEnd} WITA (${state.london.season})`;
  const newYork = `New York ${state.newYork.witaStart}–${state.newYork.witaEnd} WITA (${state.newYork.season})`;
  if (mode === 'NEW_YORK_ONLY') return `${newYork} · DST otomatis`;
  if (mode === 'LONDON_ONLY') return `${london} · DST otomatis`;
  return `${london} / ${newYork} · DST otomatis`;
}

export const EXECUTION_SESSION_CONFIG = Object.freeze({
  displayZone: DISPLAY_ZONE,
  london: SESSION_DEFINITIONS.LONDON,
  newYork: SESSION_DEFINITIONS.NEW_YORK
});
