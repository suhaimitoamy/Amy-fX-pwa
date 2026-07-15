window.AmyJournalExport = {
  toCsv(entries){
    const keys = Object.keys((entries && entries[0]) || {});
    const esc = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
    return [keys.join(','), ...(entries||[]).map(row => keys.map(k => esc(row[k])).join(','))].join('\n');
  },
  downloadCsv(entries, filename='amyfx-journal.csv'){
    const csv = this.toCsv(entries);
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
};
