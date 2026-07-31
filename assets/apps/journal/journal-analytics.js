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
      balance += Number(x.pnlMoney || (x.result === 'Win' ? (x.riskReward || 2) * 10 : x.result === 'Loss' ? -10 : 0));
      return {time:x.analysisTime || x.createdAt || new Date().toISOString(), balance};
    });
  },
  renderEquitySVG(entries){
    const data = this.equity(entries);
    if (!data.length) {
      return '<div style="padding:20px;text-align:center;color:var(--muted,#888);font-size:13px;">Belum ada data trade tertutup untuk kurva equity.</div>';
    }
    const values = [0, ...data.map(d => d.balance)];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = (maxVal - minVal) || 1;

    const width = 600;
    const height = 180;
    const padding = 20;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;

    const points = values.map((v, i) => {
      const x = padding + (i / (values.length - 1 || 1)) * innerW;
      const y = height - padding - ((v - minVal) / range) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const isPositive = values[values.length - 1] >= 0;
    const strokeColor = isPositive ? '#00d97e' : '#ff4c4c';
    const fillColor = isPositive ? 'rgba(0, 217, 126, 0.12)' : 'rgba(255, 76, 76, 0.12)';

    const areaPoints = `${padding},${height - padding} ${points.join(' ')} ${width - padding},${height - padding}`;

    return `
      <div style="background:var(--surface-soft, rgba(255,255,255,0.03));border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-size:13px;font-weight:700;color:var(--gold,#d4a832);">EQUITY GROWTH CURVE</span>
          <span style="font-size:13px;font-weight:700;color:${strokeColor};">${values[values.length-1] >= 0 ? '+' : ''}${values[values.length-1].toFixed(2)}</span>
        </div>
        <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;overflow:visible;">
          <polygon points="${areaPoints}" fill="${fillColor}" />
          <polyline points="${points.join(' ')}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    `;
  }
};
