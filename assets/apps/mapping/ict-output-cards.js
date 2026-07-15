(function(){
  const fmt = v => Number.isFinite(+v) ? Number(v).toFixed(2) : '-';

  window.AmyICTCards = {
    card(item){
      const type = item.type || item.kind || 'ANALYSIS';
      const status = item.status || '';
      const bottom = item.bottom ?? item.low ?? item.entryLow;
      const top = item.top ?? item.high ?? item.entryHigh;
      return `
        <article class="amy-card" data-type="${type}">
          <div style="display:flex;justify-content:space-between;gap:10px">
            <strong style="color:var(--amy-gold)">${type}</strong>
            <span>${status}</span>
          </div>
          <div style="margin-top:8px;color:var(--amy-muted)">Zone: ${fmt(bottom)} - ${fmt(top)}</div>
          <div style="margin-top:8px;font-size:12px;color:var(--amy-muted)">Time: ${new Date().toLocaleString()}</div>
          <button class="amy-btn secondary" style="margin-top:12px" onclick="AmyICTCards.copyToJournal(${encodeURIComponent(JSON.stringify(item))})">Copy to Jurnal</button>
        </article>`;
    },
    render(container, items){
      if(!container) return;
      const arr = Array.isArray(items) ? items : [];
      container.innerHTML = arr.length ? arr.map(AmyICTCards.card).join('') : '<div class="amy-empty">Belum ada hasil analisa.</div>';
    },
    copyToJournal(encoded){
      const item = JSON.parse(decodeURIComponent(encoded));
      const list = JSON.parse(localStorage.getItem('amy_journal_drafts') || '[]');
      list.unshift({createdAt:Date.now(), source:'mapping', data:item});
      localStorage.setItem('amy_journal_drafts', JSON.stringify(list.slice(0,50)));
      if(window.AmyFX) AmyFX.toast('Disalin ke draft jurnal');
    }
  };
})();
