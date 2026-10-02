/* Amy Pro local assistant. No provider, LLM, remote request or trading execution. */
(function(root) {
  'use strict';
  if(root.AmyLocalAssistant)return;
  const script=root.document?.currentScript?.src;
  const base=script?new URL('../../',script).href:'';
  const routes={mapping:['Mapping','apps/mapping/index.html'],news:['Berita','apps/market-intel/index.html'],journal:['Jurnal Trading','apps/journal/index.html'],academy:['Tutorial Trading','apps/academy/index.html'],home:['Beranda','index.html']};
  const norm=s=>String(s??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9/\s]/g,' ').replace(/\s+/g,' ').trim();
  const list=v=>Array.isArray(v)?v:[];
  const read=(key,fallback=null)=>{try{return JSON.parse(root.localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const raw=key=>{try{return root.localStorage.getItem(key)||'';}catch{return '';}};
  const stamp=t=>t&&Number.isFinite(new Date(t).getTime())?new Date(t).toLocaleString('id-ID',{timeZone:'Asia/Makassar',hour12:false})+' WITA':'waktu tidak tersedia';
  const number=v=>v!==null&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString('id-ID',{maximumFractionDigits:2}):'belum tersedia';
  let lastIntent='',lastQuery='',knowledgeReady=Promise.resolve();
  // Query only the journal metadata record, never credentials or binary attachments.
  function journals() {
    return new Promise(resolve=>{
      let done=false,db;const finish=v=>{if(done)return;done=true;clearTimeout(timer);db?.close();resolve(v);};
      const fallback=()=>finish({rows:list(read('tradingLibraryManager.journals.v1',[])),fallback:true});
      const timer=setTimeout(fallback,1800);
      try{
        const req=root.indexedDB.open('tradingLibraryManager.files');
        req.onupgradeneeded=()=>{req.transaction.abort();};
        req.onerror=fallback;req.onblocked=fallback;
        req.onsuccess=()=>{
          db=req.result;if(done){db.close();return;}
          if(!db.objectStoreNames.contains('metadata')){fallback();return;}
          const r=db.transaction('metadata','readonly').objectStore('metadata').get('journals.v2');
          r.onsuccess=()=>Array.isArray(r.result?.value)?finish({rows:r.result.value,fallback:false}):fallback();r.onerror=fallback;
        };
      }catch{fallback();}
    });
  }
  function intent(q){
    const found=[];
    if(/\b(harga|price|mapping|market|xau|gold|emas|sinyal|signal|bias|arah|entry|setup|stop loss|target|sl|tp)\b/.test(q))found.push('mapping');
    if(/\b(news|berita|kabar|headline|ekonomi)\b/.test(q))found.push('news');
    if(/\b(jurnal|journal|transaksi|profit|rugi|winrate|win rate|performa|evaluasi|kesalahan|emosi|disiplin)\b/.test(q))found.push('journal');
    if(/\b(belajar|baca|bacaan|membaca|pelajari|academy|akademi|tutorial|progres|progress|latihan|soal|skor|nilai|materi|pelajaran)\b/.test(q))found.push('academy');
    // Personal trade questions use Journal, unless Mapping is explicitly named.
    if(found.includes('journal')&&!/mapping|harga|market|xau|gold|emas|sinyal|signal|bias|arah/.test(q))return found.filter(id=>id!=='mapping');
    return found;
  }
  function mapping(q,m,now){
    const context=root.AmyMarketContext||read('amyfx.market-context.v1');
    if(context?.version==='amyfx-gold-context-v1'){
      const isM5=Boolean(context.source?.M5);
      const confSource=Number(context.source?.M5||context.source?.M1);
      const maxAge=isM5?900:180;
      const age=now/1000-confSource;
      const tfName=isM5?'M5':'M1';
      const fresh=context.fresh===true&&age>=0&&age<=maxAge;
      if(!fresh)return `Konteks Gold terakhir sudah lama. Buka Mapping dan tunggu data H1, M15, dan ${tfName} yang baru.`;
      const p=context.primary;
      const area=p?.area?`${number(p.area.low)}–${number(p.area.high)}`:'belum ada area valid';
      const conf=context.m5||context.m1;
      return `Konteks Gold: H1 ${{BULLISH:'naik',BEARISH:'turun'}[context.h1?.bias]||'netral'} (${{HEALTHY:'kuat',WEAKENING:'melemah',INVALIDATED:'batal'}[context.h1?.health]||'belum jelas'}); M15 ${{BUYER:'pembeli',SELLER:'penjual'}[context.m15?.control]||'seimbang'}; ${tfName} ${{CONFIRMED:'terkonfirmasi',CONFIRMING:'sedang dikonfirmasi',FAILED:'gagal'}[conf?.status]||'menunggu'}. `+
        `Skenario utama ${p?.label||'belum tersedia'}, area ${area}, invalidasi ${number(p?.invalidation)}. `+
        `Asisten eksekusi: ${context.execution?.status==='READY TO REVIEW'?'siap ditinjau':'belum siap'}. ${context.execution?.reason||''} ${context.news?.note||''}`;
    }
    // Old cached entry plans from Pro356 are retired after the context migration.
    if(m?.model==='ICT-SWEEP-MSS-FVG-1')return 'Rencana entry versi lama sudah tidak berlaku. Buka Mapping untuk konteks Gold terbaru.';
    if(!m)return 'Belum ada snapshot Mapping baru. Buka Mapping dan tunggu analisis selesai, lalu tanya lagi.';
    const seconds={M5:300,M15:900}[m.tf]||900;
    const end=Number(m.sourceTime)*1000+seconds*1000;
    const fresh=m.fresh===true&&Number.isFinite(end)&&now>=end&&now-end<=seconds*2000;
    const lines=[`Mapping ${m.tf||''} · ${fresh?'candle masih dalam batas waktu':'DATA LAMA / BELUM SIAP'} · candle dibuka ${stamp(Number(m.sourceTime)*1000)}.`,
      `Harga penutupan candle: ${number(m.close)}. Ini harga candle Mapping, bukan tick live atau harga broker saat ini.`];
    if(!/^(berapa )?(harga|price)/.test(q)||/mapping|arah|bias|entry|setup|sinyal|signal|sl|tp|target/.test(q)){
      lines.push(`Keputusan ${fresh?m.signal:'WAIT'}. ${m.reason||''}`);
      if(m.context)lines.push(`Struktur H1: ${m.context.direction||'WAIT'}; tahap ${m.stage||'belum tersedia'}; sesi ${m.session||'belum tersedia'}.`);
      if(fresh&&m.plan){const p=m.plan;lines.push(`Rencana ${p.direction} · ${p.status}. Entry ${number(p.entry)}, SL ${number(p.sl)}, target ${number(p.tp)}, RR ${number(p.rr)}R. ${p.status==='PENDING'?'Belum fill.':'Fill adalah hasil simulasi model, bukan transaksi akun.'}`);}
      if(!fresh)lines.push('Perbarui Mapping sebelum memakai rencana entry. Level lama tidak dipakai sebagai sinyal.');
    }
    return lines.join('\n');
  }
  function news(q,n){
    const items=list(n?.items);if(!items.length)return 'Belum ada berita tersimpan. Buka Berita untuk memuat feed aplikasi.';
    const terms=q.split(' ').filter(t=>t.length>2&&!['berita','news','terbaru','apa','yang','ada','tentang','kabar','tolong','ringkas','ringkasan','sekarang','dong','nih','nggak','enggak','gak','kah','saya','aku','tampilkan','lihat','kasih','berikan'].includes(t));
    const selected=terms.length?items.filter(r=>terms.some(t=>norm(r.text+' '+r.textOriginal).includes(t))):items;
    return `Berita yang tersimpan · feed ${stamp(n.updated||n.capturedAt)}. Ini salinan feed terakhir, bukan jaminan berita paling baru.\n`+(selected.length?selected.slice(0,5).map((r,i)=>`${i+1}. ${String(r.text||r.textOriginal||r.title||'').slice(0,1400)}\nSumber: ${r.source||'SM_News_24h'} · ${stamp(r.time)}`).join('\n\n'):'Tidak ada berita tersimpan yang cocok. Buka Berita untuk memperbarui feed.');
  }
  function journal(q,data){
    const rows=data.rows; if(!rows.length)return `Belum ada jurnal yang dapat dibaca.${data.fallback?' Penyimpanan utama kosong/tidak tersedia; cache lokal juga kosong.':''}`;
    const win=rows.filter(r=>norm(r.result)==='win').length,loss=rows.filter(r=>norm(r.result)==='loss').length,be=rows.filter(r=>['be','break even','breakeven'].includes(norm(r.result))).length;
    const profit=rows.reduce((s,r)=>s+(Number(r.profit)||0),0),lossAmount=rows.reduce((s,r)=>s+(Number(r.loss)||0),0),completed=win+loss+be;
    let text=`Jurnal: ${rows.length} transaksi; ${win} win, ${loss} loss, ${be} BE, ${rows.length-completed} belum selesai/lainnya. Win rate ${completed?number(win/completed*100)+'%':'belum tersedia'} (win / transaksi selesai, termasuk BE).\nTotal profit tercatat ${number(profit)}, loss ${number(lossAmount)}, selisih ${number(profit-lossAmount)} dalam satuan input jurnal.`;
    if(data.fallback)text+='\nSumber: cache lokal; penyimpanan utama tidak tersedia.';
    let sorted=rows.slice().sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||'')));
    const date=q.match(/\b20\d{2} \d{2} \d{2}\b/);if(date)sorted=sorted.filter(r=>r.date===date[0].replaceAll(' ','-'));
    if(/loss|rugi|kalah/.test(q))sorted=sorted.filter(r=>norm(r.result)==='loss');
    if(/win|menang/.test(q)&&!/rate/.test(q))sorted=sorted.filter(r=>norm(r.result)==='win');
    const fields=/evaluasi|kesalahan|emosi|disiplin|review|pelajaran/.test(q)?['evaluation','mistakes','lessons','emotion']:['setup'];
    text+='\n'+sorted.slice(0,5).map(r=>`${r.date||''} · ${r.title||'Jurnal'} · ${r.market||''} · ${r.result||''}\n`+fields.map(f=>r[f]?`${({evaluation:'Evaluasi',mistakes:'Kesalahan',lessons:'Pelajaran',emotion:'Emosi',setup:'Setup'})[f]}: ${String(r[f]).slice(0,800)}`:'').filter(Boolean).join('\n')).join('\n');
    return text;
  }
  function academy(){
    const readTopics=list(read('amy_read_topics',[])),last=read('amy_academy_last_read_v2',{}),report=read('amy-guided-v2-summary',{}),results=list(report.results);
    let text=`Catatan belajar: ${new Set(readTopics).size} bagian ditandai dibuka. Ini catatan akses, bukan bukti menguasai materi.\nTerakhir dibaca: ${last.title||raw('amy_last_opened_title')||'belum tercatat'}.`;
    if(last.headingText)text+=`\nPosisi bacaan terakhir: ${last.headingText} (${number(last.progress)}% halaman tergulir; bukan persentase penguasaan).`;
    if(results.length){const correct=results.filter(r=>r.correct===true).length;text+=`\nSesi latihan terakhir: ${correct}/${results.length} benar (${number(correct/results.length*100)}%).`;
      const wrong=list(report.review);text+=wrong.length?'\nPerlu dipelajari ulang: '+wrong.map(t=>t.title).join(', '):results.some(r=>!r.correct)?'\nAda jawaban salah. Buka hasil Latihan untuk rincian materi yang perlu diulang.':'\nSemua jawaban pada sesi ini benar.';
    }else text+='\nBelum ada sesi latihan selesai tersimpan.';
    return text;
  }
  const stop=new Set('apa itu adalah jelaskan jelasin tolong saya aku dong nih yang dengan dan di ke dari tentang bagaimana kenapa mengapa cara materi belajar tutorial arti maksud pengertian contoh nya'.split(' '));
  function knowledge(q){
    const tokens=q.split(' ').filter(t=>t.length>1&&!stop.has(t));if(!tokens.length)return null;
    const ranked=list(root.AmyLocalKnowledge).map(row=>{const title=norm(row.title),body=norm(row.text);return {row,score:tokens.reduce((s,t)=>s+(title.includes(t)?5:body.includes(t)?1:0),0),hits:tokens.filter(t=>title.includes(t)||body.includes(t)).length};}).filter(r=>r.hits===tokens.length).sort((a,b)=>b.score-a.score);
    const match=ranked[0];if(!match)return null;
    return {text:`Dari materi Academy: ${match.row.title}\n${match.row.text}`,links:[{label:'Buka materi lengkap',path:match.row.path}]};
  }
  async function ask(question){
    let q=norm(question).slice(0,2000);const links=[];let text='';
    let intents=intent(q);
    const follow=/^(lalu|terus|kenapa|mengapa|jelaskan|detail|lanjut|yang terakhir|berapa|bagaimana)( itu| lagi| dong| nya)?$/.test(q);
    if(follow&&lastIntent){intents=lastIntent.split(',');q=lastQuery+' '+q;}
    const definition=/\b(apa itu|pengertian|definisi|arti|contoh|jelaskan konsep|cara kerja|perbedaan|bedanya)\b/.test(q);
    if(definition){await knowledgeReady;const k=knowledge(q);if(k){text=k.text;links.push(...k.links);intents=[];}else if(!/saya|aku|sekarang|terakhir/.test(q)){text='Belum menemukan penjelasan yang cocok di indeks materi. Coba nama konsep yang lebih spesifik, misalnya FVG, liquidity sweep, atau order block.';links.push({label:'Buka Tutorial Trading',path:routes.academy[1]});}}
    if(!text&&/^(hai|halo|hi|pagi|siang|malam|terima kasih|makasih)$/.test(q))text='Halo, saya Amy, asisten lokal aplikasi. Saya bisa membaca Mapping, berita tersimpan, jurnal, progres belajar, dan mencari penjelasan dari materi Academy. Apa yang ingin kamu cek?';
    if(!text&&/\b(versi|version|update|pembaruan)\b/.test(q)){text=`Versi aplikasi ${root.AmyFXAppVersion?.name||'lihat Profil → Versi Aplikasi'}. Untuk pembaruan, buka Profil → Versi Aplikasi. Notifikasi mengikuti manifest rilis yang sudah diterbitkan.`;links.push({label:'Buka Beranda / Profil',path:'index.html'});}
    if(/semua menu|semua modul|ringkasan aplikasi/.test(q))intents=['mapping','news','journal','academy'];
    if(!text&&intents.length){
      const parts=[];
      for(const id of intents){
        if(id==='mapping')parts.push(mapping(q,root.AmyICTMapping||read('amyfx.ict.mapping.v1'),Date.now()));
        if(id==='news')parts.push(news(q,read('amyfx.assistant.news.v1')||read('amyfx.market.intel.v1',{})?.news));
        if(id==='journal')parts.push(journal(q,await journals()));
        if(id==='academy')parts.push(academy());
        links.push({label:'Buka '+routes[id][0],path:routes[id][1]});
      }
      text=parts.join('\n\n');lastIntent=intents.join(',');lastQuery=q;
    }
    if(!text){await knowledgeReady;const k=knowledge(q);if(k){text=k.text;links.push(...k.links);}}
    if(!text)text='Saya belum bisa menentukan maksud pertanyaan ini. Sebutkan data atau topiknya, misalnya “harga di Mapping”, “berita terbaru”, “evaluasi jurnal saya”, “progres belajar”, atau “apa itu FVG”. Jawaban saya berasal dari data dan materi aplikasi; pertanyaan bebas di luar cakupan itu belum didukung.';
    return {text,links,provider:'amy-local',model:'local-app-rules-v1',source:'Data lokal Amy FX Pro'};
  }
  function mount(){
    if(!root.document?.body||document.getElementById('amy-local-root'))return;
    const style=document.createElement('style');style.textContent=`#amy-local-root{font:14px/1.6 system-ui;color:#e4edf8}#amy-local-root [hidden]{display:none!important}#amy-local-root button,#amy-local-root input,#amy-local-root a{font:inherit}@keyframes aiSparkBreathe{0%,100%{transform:scale(1);opacity:1;filter:drop-shadow(0 0 8px #f5c451)}50%{transform:scale(1.22);opacity:0.85;filter:drop-shadow(0 0 16px #f5c451)}}#amy-local-fab{position:fixed;right:20px;bottom:90px;z-index:10000;display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,rgba(24,34,58,0.88) 0%,rgba(10,14,26,0.92) 100%);backdrop-filter:blur(28px) saturate(200%);-webkit-backdrop-filter:blur(28px) saturate(200%);border:1px solid rgba(245,196,81,0.55);border-top:1px solid rgba(255,255,255,0.35);border-radius:9999px;color:#fff;font-size:11.5px;font-weight:800;letter-spacing:0.05em;padding:10px 18px;box-shadow:0 16px 40px rgba(0,0,0,0.65),inset 0 1px 1px 0 rgba(255,255,255,0.25),0 0 20px rgba(245,196,81,0.3);cursor:pointer;transition:transform .2s cubic-bezier(0.16,1,0.3,1),box-shadow .2s ease,border-color .2s ease}#amy-local-fab:hover{transform:translateY(-2px) scale(1.02);border-color:rgba(245,196,81,0.9);box-shadow:0 20px 48px rgba(0,0,0,0.75),inset 0 1px 1px 0 rgba(255,255,255,0.35),0 0 28px rgba(245,196,81,0.45)}#amy-local-fab:active{transform:scale(0.97)}#amy-local-fab .ai-spark{color:#f5c451;font-size:14px;line-height:1;display:inline-block;animation:aiSparkBreathe 2.4s infinite ease-in-out;filter:drop-shadow(0 0 8px #f5c451)}#amy-local-panel{position:fixed;right:16px;bottom:90px;width:min(430px,calc(100vw - 24px));height:min(600px,75dvh);max-height:75vh;z-index:10001;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(16,24,45,0.95) 0%,rgba(8,12,22,0.96) 100%);backdrop-filter:blur(32px) saturate(200%);-webkit-backdrop-filter:blur(32px) saturate(200%);border:1px solid rgba(245,196,81,0.35);border-top:1px solid rgba(255,255,255,0.3);border-radius:22px;box-shadow:0 24px 64px rgba(0,0,0,0.8),inset 0 1px 1px 0 rgba(255,255,255,0.2),0 0 25px rgba(245,196,81,0.15);overflow:hidden}#amy-local-panel header,#amy-local-panel form{display:flex;gap:8px;padding:12px;background:rgba(20,29,51,0.9)}#amy-local-panel header strong{flex:1;color:#f8fafc;font-weight:800}#amy-local-panel button{background:rgba(245,196,81,0.15);color:#f5c451;border:1px solid rgba(245,196,81,0.35);border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:700}#amy-local-panel button:hover{background:rgba(245,196,81,0.25)}#amy-local-panel input{min-width:0;flex:1;background:rgba(7,11,20,0.8);color:white;border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:8px 12px}#amy-local-messages{overflow:auto;flex:1;padding:12px;overscroll-behavior:contain}#amy-local-messages p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 14px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)}#amy-local-messages a{color:#60a5fa;display:block}#amy-local-panel small{padding:4px 12px 0;color:#94a3b8;font-size:11px}#amy-local-panel .prompts{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px}#amy-local-panel .prompts button{background:rgba(255,255,255,0.06);color:#cbd5e1;border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:5px 10px;font-size:11px}#amy-local-panel .prompts button:hover{border-color:rgba(245,196,81,0.5);color:#fff}`;document.head.appendChild(style);
    const host=document.createElement('div');host.id='amy-local-root';host.innerHTML='<button id="amy-local-fab" type="button"><span class="ai-spark">✦</span><span>CS</span></button><section id="amy-local-panel" hidden aria-label="Asisten Amy"><header><strong>Amy · Asisten aplikasi</strong><button type="button" id="amy-local-close" aria-label="Tutup asisten">Tutup</button></header><small>Lokal · tanpa API AI / LLM · membaca data aplikasi</small><div class="prompts"></div><div id="amy-local-messages" aria-live="polite"></div><form><input aria-label="Pertanyaan untuk Amy" placeholder="Tanya data atau materi aplikasi…" maxlength="2000"><button type="submit">Kirim</button></form></section>';document.body.appendChild(host);
    const panel=host.querySelector('section'),input=host.querySelector('input'),messages=host.querySelector('#amy-local-messages'),fab=host.querySelector('#amy-local-fab');
    const open=()=>{panel.hidden=false;fab.hidden=true;input.focus();};const close=()=>{panel.hidden=true;fab.hidden=false;fab.focus();};fab.onclick=open;host.querySelector('#amy-local-close').onclick=close;panel.addEventListener('keydown',e=>{if(e.key==='Escape')close();});root.addEventListener('amyfx:open-mentor',open);
    function append(text,links=[]){const p=document.createElement('p');p.textContent=text;messages.appendChild(p);links.forEach(l=>{try{const url=new URL(l.path,base);if(!url.href.startsWith(base))return;const a=document.createElement('a');a.href=url.href;a.textContent=l.label;p.appendChild(a);}catch{}});while(messages.children.length>40)messages.firstChild.remove();messages.scrollTop=messages.scrollHeight;}
    let busy=false;async function send(q){if(busy||!q.trim())return;busy=true;input.value='';append('Anda: '+q);const button=host.querySelector('form button');button.disabled=true;try{const r=await ask(q);append(r.text,r.links);}catch{append('Data belum dapat dibaca. Buka menu terkait lalu coba lagi.');}finally{busy=false;button.disabled=false;input.focus();}}
    host.querySelector('form').onsubmit=e=>{e.preventDefault();send(input.value);};['Harga Mapping','Berita terbaru','Evaluasi jurnal saya','Progres belajar'].forEach(q=>{const b=document.createElement('button');b.type='button';b.textContent=q;b.onclick=()=>send(q);host.querySelector('.prompts').appendChild(b);});
    append('Saya membaca data aplikasi yang tersimpan dan materi Academy. Pilih pertanyaan di atas atau tulis pertanyaanmu.');
    // Knowledge is packaged JavaScript, loaded locally; no network AI call.
    if(script){knowledgeReady=new Promise(resolve=>{const s=document.createElement('script');const timer=setTimeout(resolve,5000);const done=()=>{clearTimeout(timer);resolve();};s.onload=done;s.onerror=done;s.src=new URL('amy-local-knowledge.js',script).href;document.head.appendChild(s);});}
  }
  root.AmyLocalAssistant=Object.freeze({ask,intent,mapping,news,journal,academy,knowledge});
  if(root.document){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}
})(typeof window==='undefined'?globalThis:window);
