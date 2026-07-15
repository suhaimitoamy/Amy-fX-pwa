(function(){
  window.AmyMappingMTF = {
    summarize(analyses){
      const items = Array.isArray(analyses) ? analyses : [];
      const bullish = items.filter(x => String(x.bias || x.final || '').toUpperCase().includes('BULL')).length;
      const bearish = items.filter(x => String(x.bias || x.final || '').toUpperCase().includes('BEAR')).length;
      const ranging = Math.max(0, items.length - bullish - bearish);
      const direction = bullish >= 3 ? 'HTF BULLISH' : bearish >= 3 ? 'HTF BEARISH' : 'HTF RANGING';
      const alignmentScore = Math.max(bullish, bearish);
      return {direction, bullish, bearish, ranging, alignmentScore, alertAllowed: alignmentScore >= 3};
    },
    render(container, summary){
      if(!container) return;
      container.innerHTML = `
        <div class="amy-card">
          <div style="color:var(--amy-gold);font-weight:950">MTF Confluence</div>
          <div style="font-size:24px;font-weight:950;margin:8px 0">${summary.direction}</div>
          <div class="amy-grid two">
            <div>Bullish: <b>${summary.bullish}</b></div>
            <div>Bearish: <b>${summary.bearish}</b></div>
            <div>Ranging: <b>${summary.ranging}</b></div>
            <div>Score: <b>${summary.alignmentScore}/7</b></div>
          </div>
        </div>`;
    }
  };
})();
