export const MAPPING_CLAIM_ACCURACY = Object.freeze({
  marketStateM15: Object.freeze({
    label: 'Market State M15',
    value: 73.19,
    metric: 'structural agreement',
    period: '2022–Jun 2026',
    authority: 'VALIDATED_PINE',
    claim: 'Kondisi struktur saat ini sesuai audit struktur independen; bukan prediksi harga.'
  }),
  directionForecastM15: Object.freeze({
    label: 'Direction Forecast M15',
    value: 60.36,
    metric: 'direction accuracy',
    period: '2022–Jun 2026',
    authority: 'VALIDATED_PINE',
    claim: 'Harga penutupan pada horizon 48 jam bergerak sesuai forecast.'
  }),
  nearestLiquidity: Object.freeze({
    label: 'Nearest Liquidity',
    value: 79.55,
    metric: 'first-hit accuracy',
    coverage: 82.97,
    period: '2022–2025',
    authority: 'VALIDATED_APP',
    claim: 'Di antara target liquidity aktif atas dan bawah, level terdekat menjadi first hit.'
  }),
  marketRegime: Object.freeze({
    label: 'Market Regime',
    value: 19.74,
    metric: 'current-condition agreement',
    period: '2022–2025',
    authority: 'EXPERIMENTAL',
    claim: 'Label regime sesuai audit kondisi M15 pada candle yang sama.'
  }),
  marketShift: Object.freeze({
    label: 'Market Shift',
    value: 14.01,
    secondaryValue: 62.21,
    metric: 'warning precision',
    secondaryMetric: 'recall',
    period: '2022–2025',
    authority: 'ADVISORY_ONLY',
    claim: 'Warning diikuti major structure flip dalam 12 candle M15.'
  }),
  strategyRouter: Object.freeze({
    label: 'Strategy Router',
    value: 48.53,
    metric: 'strategy-suitability accuracy',
    period: '2022–2025',
    authority: 'EXPERIMENTAL',
    claim: 'Strategi yang dipilih cocok dengan perilaku market berikutnya menurut definisi strateginya.'
  }),
  validBreak: Object.freeze({
    label: 'Valid Break',
    value: 67.51,
    metric: 'hold-and-extension accuracy',
    period: '2022–2025',
    authority: 'CONTEXT_ONLY',
    claim: 'Break bertahan dan melanjutkan minimal 0,5 ATR sebelum close kembali melewati level.'
  }),
  sweepOnly: Object.freeze({
    label: 'Sweep Only',
    value: 68.33,
    metric: 'reversal-reaction accuracy',
    period: '2022–2025',
    authority: 'CONTEXT_ONLY',
    claim: 'Reclaim diikuti reaksi reversal minimal 0,4 ATR.'
  }),
  failedBreak: Object.freeze({
    label: 'Failed Break',
    value: 81.38,
    metric: 'failure-reaction accuracy',
    period: '2022–2025',
    authority: 'VALIDATED_APP',
    claim: 'Label failed break diikuti reaksi minimal 0,4 ATR ke arah kegagalan.'
  }),
  entryMap: Object.freeze({
    label: 'Entry Map',
    value: 48.24,
    metric: 'directional-reaction accuracy',
    period: '2022–2025',
    authority: 'EXPERIMENTAL',
    claim: 'Setelah Sweep → MSS, harga bereaksi minimal 0,5 ATR sesuai mapping dalam 16 candle M15.'
  })
});

export const LOCKED_PINE_REFERENCE_CLAIMS = Object.freeze([
  { label: 'Validated Target', value: 91.38, claim: 'Target reach', period: '2020–2025' },
  { label: 'Asia High / Low', value: 86.64, claim: 'Target reach ≤4 jam', period: '2020–2025' },
  { label: 'PDH / PDL', value: 85.64, claim: 'Target reach ≤8 jam', period: '2020–2025' },
  { label: 'Midnight Open', value: 86.43, claim: 'Retest ≤4 jam', period: '2020–2025' },
  { label: 'Order Block', value: 83.91, claim: 'Revisit ≤4 jam', period: '2020–2025' },
  { label: 'FVG', value: 82.37, claim: 'Revisit ≤4 jam', period: '2020–2025' },
  { label: 'M5 Key Liquidity', value: 82.43, claim: 'Target reach ≤4 jam', period: '2020–2025' },
  { label: 'Protected Low', value: 93.47, claim: 'Level bertahan 1 jam', period: '2020–2025' },
  { label: 'Protected High', value: 91.86, claim: 'Level bertahan 1 jam', period: '2020–2025' }
]);

export function accuracyText(claim) {
  return claim ? `${Number(claim.value).toFixed(2)}% ${claim.metric}` : '-';
}
