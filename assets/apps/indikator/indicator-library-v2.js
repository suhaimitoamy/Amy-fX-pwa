window.AmyIndicatorLibrary = {
  favoritesKey:'amy_indicator_favorites',
  async loadManifest(){
    try{
      const res = await fetch('manifest-v2.json');
      if(!res.ok) throw new Error('manifest-v2 missing');
      return await res.json();
    }catch(e){
      const legacy = await fetch('manifest.json').then(r=>r.json());
      return {version:'legacy', categories:[{id:'legacy', name:'All Indicators', indicators:legacy.map((x,i)=>({
        id:'legacy-'+i, name:x.name, description:x.desc, category:x.category, timeframe:'Any', version:'1.0', author:'Amy FX', tags:[x.category], file:x.url, preview:''
      }))}]};
    }
  },
  favorites(){
    try{return JSON.parse(localStorage.getItem(this.favoritesKey)||'[]')}catch(_){return[]}
  },
  toggleFavorite(id){
    const fav = new Set(this.favorites());
    fav.has(id) ? fav.delete(id) : fav.add(id);
    localStorage.setItem(this.favoritesKey, JSON.stringify([...fav]));
  },
  flatten(manifest){
    return manifest.categories.flatMap(c => c.indicators.map(i => ({...i, categoryName:c.name})));
  },
  filter(items, q=''){
    const s = q.toLowerCase().trim();
    if(!s) return items;
    return items.filter(i => [i.name,i.description,i.category,i.timeframe,...(i.tags||[])].join(' ').toLowerCase().includes(s));
  },
  async preview(file, lines=20){
    const code = await fetch(file).then(r=>r.text());
    return code.split('\n').slice(0,lines).join('\n');
  },
  async exportSelected(items){
    const blocks = [];
    for(const item of items){
      const code = await fetch(item.file).then(r=>r.text());
      blocks.push(`// ===== ${item.name} =====\n${code}`);
    }
    return blocks.join('\n\n');
  }
};
