export function entryMapDisplayState(setup) {
  if (setup?.dataStale || setup?.status === 'DATA USANG' || setup?.statusText === 'DATA USANG') {
    return {
      status: 'DATA USANG',
      terminal: true,
      dataStale: true,
      note: 'DATA USANG: Cache kedaluwarsa & API gagal diperbarui. Entry Map dan sinyal dinonaktifkan.'
    };
  }

  if (!setup || (!setup.dir && !setup.status && !setup.lifecycle)) {
    return {
      status: 'WAIT',
      terminal: false,
      note: 'Belum ada setup M15 yang lolos seluruh filter Entry Map.'
    };
  }

  const status = setup.lifecycle?.status || setup.lifecycleStatus || setup.status || 'WAIT';
  const terminal = setup.lifecycle?.live === false || ['SL HIT', 'TP2 HIT', 'TP1 / BE', 'EXPIRED'].includes(status);
  const entry = Number(setup.entry ?? setup.entryLow);
  const sl = Number(setup.sl);
  const tp1 = Number(setup.tp1);
  const tp2 = Number(setup.tp2);
  const bars = Number(setup.lifecycle?.barsElapsed || 0);
  const side = String(setup.dir || '').includes('SELL') ? 'SELL' : 'BUY';
  const price = value => Number.isFinite(value) ? value.toFixed(2) : '-';

  const notes = {
    'LONG ACTIVE': `Entry BUY ${price(entry)} aktif. SL ${price(sl)}, TP1 ${price(tp1)}, TP2 ${price(tp2)}.`,
    'SHORT ACTIVE': `Entry SELL ${price(entry)} aktif. SL ${price(sl)}, TP1 ${price(tp1)}, TP2 ${price(tp2)}.`,
    'TP1 HIT / BE': `TP1 tercapai. Stop runner sudah dipindahkan ke break-even ${price(entry)} menuju TP2 ${price(tp2)}.`,
    'TP2 HIT': `Setup ${side} selesai karena TP2 ${price(tp2)} tercapai.`,
    'TP1 / BE': `TP1 tercapai, lalu sisa posisi selesai di break-even ${price(entry)}.`,
    'SL HIT': `Setup ${side} selesai karena SL ${price(sl)} tersentuh sebelum TP1.`,
    EXPIRED: `Setup kedaluwarsa setelah ${setup.expiryBars || 36} candle M15 tanpa penyelesaian target atau stop.`
  };

  return {
    status,
    terminal,
    note: notes[status] || `Entry Map ${side} berjalan selama ${bars} candle M15.`
  };
}
