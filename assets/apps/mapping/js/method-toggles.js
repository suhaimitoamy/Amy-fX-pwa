import {SIX_DRIVERS} from './engine/six-driver-definitions.js';
const KEY='amy_mapping_method_toggles';
const DIRTY='amy_mapping_method_toggles_pending';
const ENDPOINT='https://wliecyxzlwhmtftnfnps.supabase.co/functions/v1/scalper-preferences';
export const METHODS=SIX_DRIVERS.map(d=>({id:d.id,name:d.name}));
let message='',queue=Promise.resolve(),ready;
function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch(_){return {};}}
export function methodEnabled(id){return read()[id]!==false;}
export function deviceHeaders(){
  let token=window.Android?.getScalperDeviceToken?.()||localStorage.getItem('amy_scalper_device_token');
  if(!/^[a-f0-9]{64}$/.test(token||'')){
    const bytes=crypto.getRandomValues(new Uint8Array(32));token=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
    localStorage.setItem('amy_scalper_device_token',token);
  }
  return {'x-amy-device-token':token};
}
function emit(){window.dispatchEvent(new Event('amy-method-toggles'));document.querySelectorAll('[data-method-sync]').forEach(node=>{node.textContent=message;});}
async function request(method,settings){
  const response=await fetch(ENDPOINT,{method,headers:{...deviceHeaders(),'Content-Type':'application/json'},...(settings?{body:JSON.stringify({enabledDrivers:settings})}:{}),cache:'no-store'});
  const data=await response.json();if(!response.ok||!data.ok)throw new Error('server belum tersinkron');return data;
}
export function initializeMethods(){
  if(ready)return ready;
  ready=(async()=>{
    try{
      const remote=await request('GET');
      if(localStorage.getItem(DIRTY)==='1'||!remote.registered){await request('PUT',read());localStorage.removeItem(DIRTY);}
      else localStorage.setItem(KEY,JSON.stringify(remote.enabledDrivers));
      message='';
    }catch(_){message='Belum tersinkron. Pengaturan server belum berubah.';}
    emit();
  })();queue=ready;return ready;
}
export function toggleMethod(id){
  if(!METHODS.some(d=>d.id===id))return;
  const settings=read();settings[id]=!methodEnabled(id);
  try{localStorage.setItem(KEY,JSON.stringify(settings));localStorage.setItem(DIRTY,'1');}
  catch(_){message='Gagal menyimpan pengaturan perangkat.';emit();return;}
  message='Menyinkronkan…';emit();
  queue=queue.catch(()=>{}).then(async()=>{
    const snapshot=JSON.stringify(read());
    try{await request('PUT',JSON.parse(snapshot));if(JSON.stringify(read())===snapshot)localStorage.removeItem(DIRTY);message='';}
    catch(_){message='Belum tersinkron. Pengaturan server belum berubah.';}
    emit();
  });
}
export function toggleMarkup(id){
  const on=methodEnabled(id);
  return `<button type="button" role="switch" aria-checked="${on}" aria-label="Aktifkan metode ${id}" data-method-toggle="${id}" style="border:0;border-radius:18px;padding:7px 14px;background:${on?'#15803d':'#64748b'};color:white">${on?'ON':'OFF'}</button><small style="display:block">${on?'ON':'OFF · DISABLED'}</small>`;
}
export function methodControls(){return `<section class="card"><h2>Metode perangkat ini</h2><p data-method-sync role="status">${message}</p>${METHODS.map(d=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:10px"><span>${d.name.replaceAll('&','&amp;')}</span><span>${toggleMarkup(d.id)}</span></div>`).join('')}</section>`;}
document.addEventListener('click',event=>{const button=event.target.closest('[data-method-toggle]');if(!button)return;event.stopPropagation();toggleMethod(button.dataset.methodToggle);},true);
window.addEventListener('online',()=>{ready=null;void initializeMethods();});
window.addEventListener('storage',event=>{if(event.key===KEY)emit();});
