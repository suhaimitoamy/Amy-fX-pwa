window.AmyJournalSchema = {
  requiredFields: ['analysisTime','pair','timeframe','htfBias','setupType','entryArea','stopLoss','takeProfit2','setupScore'],
  emptyEntry(){
    return {
      id: 'JRN-' + Date.now(),
      analysisTime: new Date().toISOString(),
      pair: 'XAU/USD',
      timeframe: '',
      htfBias: '',
      setupType: '',
      entryArea: '',
      stopLoss: '',
      takeProfit1: '',
      takeProfit2: '',
      takeProfit3: '',
      riskReward: '',
      setupScore: '',
      screenshot: '',
      planNote: '',
      actualEntryTime: '',
      actualEntryPrice: '',
      lotSize: '',
      platform: '',
      result: '',
      exitPrice: '',
      pnlPips: '',
      pnlMoney: '',
      followedPlan: '',
      mistake: '',
      lesson: '',
      rating: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  },
  validate(entry){
    const missing = this.requiredFields.filter(k => !entry[k]);
    return {ok: missing.length === 0, missing};
  },
  computeRR(entry){
    const e = Number(entry.actualEntryPrice || entry.entryArea);
    const sl = Number(entry.stopLoss);
    const tp = Number(entry.takeProfit2 || entry.takeProfit1);
    if(!Number.isFinite(e)||!Number.isFinite(sl)||!Number.isFinite(tp)||e===sl) return '';
    return Math.abs((tp-e)/(e-sl)).toFixed(2);
  }
};
