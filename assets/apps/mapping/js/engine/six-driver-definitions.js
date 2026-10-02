// Six independent research models. Closed M15 context, sequential M5 confirmation.
// Prices and outcomes are simulated; scores never gate a valid driver trigger.
export const SIX_ENGINE_VERSION = 'amyfx-six-drivers-pro382';
export const SIX_RULE_VERSION = 'six-driver-rules-v1';
export const SIX_DRIVERS = Object.freeze([
  {id:'HIGH_WINRATE_SNIPER_70',name:'Sniper · Deep OTE',rr:.8,fib:[.75,.786],mode:'SWEEP',hold:3600,desc:'Sweep → break M15 → OTE 75–78,6% → konfirmasi M5 · 0,8R'},
  {id:'AI_ADAPTIVE_SMART_DRIVER',name:'Adaptive Smart',rr:1.6,fib:[.5,.618],mode:'CONTINUATION',hold:10800,be:.8,desc:'Continuation M15 · pullback 50–61,8% · 1,6R · BE setelah 0,8R'},
  {id:'SWING_CHOCH_OTE',name:'Swing CHoCH + OTE',rr:.8,fib:[.745,.755],mode:'REVERSAL',hold:10800,desc:'CHoCH terkonfirmasi · body ≥2×ATR sebelumnya · OTE 75% · 0,8R'},
  {id:'MULTI_DRIVER_ENSEMBLE',name:'Multi-Driver Ensemble',rr:.8,fib:[.72,.73],mode:'ENSEMBLE',hold:5400,desc:'Dua model dasar searah · OTE 72,5% ±0,5% · ATR M15 ≥$2,5 · 0,8R'},
  {id:'CONSERVATIVE_SHIELD',name:'Conservative Shield',rr:.7,fib:[.618,.705],mode:'SHIELD',hold:5400,riskFraction:.0025,desc:'Continuation defensif · satu posisi model · risiko acuan 0,25% · batas harian −2R'},
  {id:'HUMAN_MTF_RAPID_SCALPER',name:'Human MTF Rapid Scalper',rr:1.3,mode:'RAPID',hold:2700,earlyCut:.35,desc:'Retest break M15 → M5 · sesi London/NY · 1,3R · early exit kondisional'}
]);
