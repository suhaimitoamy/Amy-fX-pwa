window.AmyJournalAI = {
  buildPrompt(entries){
    const since = Date.now() - 30*24*60*60*1000;
    const recent = (Array.isArray(entries)?entries:[]).filter(x => (x.createdAt || 0) >= since).slice(0,120);
    const summary = recent.map(x => ({
      date:x.analysisTime,
      pair:x.pair,
      tf:x.timeframe,
      bias:x.htfBias,
      setup:x.setupType,
      score:x.setupScore,
      rr:x.riskReward,
      result:x.result,
      mistake:x.mistake,
      followedPlan:x.followedPlan,
      lesson:x.lesson
    }));
    return [
      'Kamu adalah analis jurnal trading Amy FX.',
      'Analisa data 30 hari terakhir berikut.',
      'Tugas:',
      '1. Temukan pola kesalahan berulang.',
      '2. Tentukan setup yang paling konsisten.',
      '3. Beri saran perbaikan spesifik.',
      '4. Evaluasi psikologi trading seperti FOMO, moved SL, early exit.',
      'Jawab ringkas, praktis, dan berbasis data.',
      '',
      JSON.stringify(summary, null, 2)
    ].join('\n');
  }
};
