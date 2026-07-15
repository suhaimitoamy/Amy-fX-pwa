window.AmyJournalAnalytics = {
  analyze(entries){
    const list = Array.isArray(entries) ? entries : [];
    const closed = list.filter(x => ['Win','Loss','Breakeven'].includes(x.result));
    const wins = closed.filter(x => x.result === 'Win').length;
    const losses = closed.filter(x => x.result === 'Loss').length;
    const winRate = closed.length ? (wins / closed.length) * 100 : 0;
    const rrValues = closed.map(x => Number(x.riskReward)).filter(Number.isFinite);
    const avgRR = rrValues.length ? rrValues.reduce((a,b)=>a+b,0)/rrValues.length : 0;
    const bySetup = {};
    const bySession = {};
    closed.forEach(x => {
      const setup = x.setupType || 'Unknown';
      const session = x.session || 'Unknown';
      bySetup[setup] = bySetup[setup] || {total:0,win:0,loss:0};
      bySession[session] = bySession[session] || {total:0,win:0,loss:0};
      bySetup[setup].total++; bySession[session].total++;
      if(x.result==='Win'){bySetup[setup].win++; bySession[session].win++;}
      if(x.result==='Loss'){bySetup[setup].loss++; bySession[session].loss++;}
    });
    return {total:list.length, closed:closed.length, wins, losses, winRate:+winRate.toFixed(2), avgRR:+avgRR.toFixed(2), bySetup, bySession};
  },
  equity(entries){
    let balance = 0;
    return (Array.isArray(entries)?entries:[]).map(x => {
      balance += Number(x.pnlMoney || 0);
      return {time:x.analysisTime || x.createdAt, balance};
    });
  }
};
