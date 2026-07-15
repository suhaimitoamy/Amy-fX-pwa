// Image Manager - Handles upload, resize, and ImgBB integration
const ImageManager = {
  apiKey: localStorage.getItem('amy_imgbb_api_key') || '',
  
  init() {
    this.modal = document.getElementById('imageModal');
    this.closeBtn = document.getElementById('closeImageModal');
    this.cancelBtn = document.getElementById('cancelImageBtn');
    this.saveBtn = document.getElementById('saveImageBtn');
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('imageFileInput');
    this.urlInput = document.getElementById('imgUrlInput');
    this.captionInput = document.getElementById('imgCaption');
    this.sizeSelect = document.getElementById('imgSize');
    this.positionSelect = document.getElementById('imgPosition');
    this.uploadPreview = document.getElementById('uploadPreview');
    this.uploadPlaceholder = document.getElementById('uploadPlaceholder');
    
    this.currentCallback = null;
    this.currentDataUrl = null;
    
    this.bindEvents();
  },
  
  bindEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        e.target.classList.add('active');
        document.getElementById(`tab-${e.target.dataset.tab}`).style.display = 'block';
      });
    });
    
    // Modal controls
    this.closeBtn.addEventListener('click', () => this.hideModal());
    this.cancelBtn.addEventListener('click', () => this.hideModal());
    
    // Dropzone
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('dragover');
    });
    this.dropZone.addEventListener('dragleave', () => this.dropZone.classList.remove('dragover'));
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        this.processFile(e.dataTransfer.files[0]);
      }
    });
    
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        this.processFile(e.target.files[0]);
      }
    });
    
    // Save button
    this.saveBtn.addEventListener('click', () => this.save());
  },
  
  showModal(existingData, callback) {
    this.currentCallback = callback;
    this.currentDataUrl = null;
    
    // Reset or fill form
    if (existingData) {
      if (existingData.imageUrl && existingData.imageUrl.startsWith('http')) {
        this.urlInput.value = existingData.imageUrl;
        // switch to url tab
        document.querySelector('.tab-btn[data-tab="url"]').click();
      } else {
        this.urlInput.value = '';
        document.querySelector('.tab-btn[data-tab="upload"]').click();
      }
      this.captionInput.value = existingData.imageCaption || '';
      this.sizeSelect.value = existingData.imageSize || '100%';
      this.positionSelect.value = existingData.imagePosition || 'center';
      
      if (existingData.imageUrl) {
        this.setPreview(existingData.imageUrl);
      } else {
        this.resetPreview();
      }
    } else {
      this.urlInput.value = '';
      this.captionInput.value = '';
      this.sizeSelect.value = '100%';
      this.positionSelect.value = 'center';
      this.resetPreview();
      document.querySelector('.tab-btn[data-tab="upload"]').click();
    }
    
    this.modal.classList.add('active');
  },
  
  hideModal() {
    this.modal.classList.remove('active');
    this.fileInput.value = '';
  },
  
  resetPreview() {
    this.uploadPreview.style.display = 'none';
    this.uploadPreview.src = '';
    this.uploadPlaceholder.style.display = 'block';
    this.dropZone.classList.remove('has-image');
  },
  
  setPreview(src) {
    this.uploadPreview.src = src;
    this.uploadPreview.style.display = 'block';
    this.uploadPlaceholder.style.display = 'none';
    this.dropZone.classList.add('has-image');
  },
  
  processFile(file) {
    if (!file.type.match('image.*')) {
      alert('Tolong upload file gambar (JPG/PNG).');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      this.resizeImage(e.target.result, 1200, 0.85).then(resizedUrl => {
        this.currentDataUrl = resizedUrl;
        this.setPreview(resizedUrl);
      });
    };
    reader.readAsDataURL(file);
  },
  
  resizeImage(dataUrl, maxWidth, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  },
  
  async save() {
    this.saveBtn.textContent = 'Menyimpan...';
    this.saveBtn.disabled = true;
    
    try {
      let finalUrl = this.urlInput.value;
      
      // If we have a new dataUrl from upload
      if (this.currentDataUrl) {
        // We no longer upload to ImgBB here. We just pass the base64 dataUrl back.
        // It will be handled and uploaded to GitHub when "Simpan ke GitHub" is clicked.
        finalUrl = this.currentDataUrl;
      }
      
      if (this.currentCallback) {
        this.currentCallback({
          imageUrl: finalUrl,
          imageCaption: this.captionInput.value,
          imageSize: this.sizeSelect.value,
          imagePosition: this.positionSelect.value
        });
      }
      
      this.hideModal();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      this.saveBtn.textContent = 'Simpan Gambar';
      this.saveBtn.disabled = false;
    }
  }
};


/* AMYFX_NOTIFY_GUARD_START */
(function(){
  if(window.__amyfxNotifyGuardLoaded)return;
  window.__amyfxNotifyGuardLoaded=true;

  const STORE='amyfx.notify.last.sent';
  const COOLDOWN=5*60*1000;
  const RESUME_MUTE=9000;
  const MAX_ITEMS=80;
  let muteUntil=0;

  function now(){return Date.now()}
  function norm(x){
    return String(x||'')
      .replace(/\d+([.,]\d+)?/g,'#')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,180);
  }
  function kind(t,b){
    const x=(String(t||'')+' '+String(b||'')).toLowerCase();
    if(x.includes('scanner terhubung'))return 'scanner_connected';
    if(x.includes('amy fx aktif'))return 'scanner_alive';
    if(x.includes('liquidity sweep'))return 'liquidity_sweep';
    if(x.includes('ssl')||x.includes('bsl'))return 'bsl_ssl_touched';
    return 'amyfx_alert';
  }
  function key(t,b){
    return kind(t,b)+'|'+norm(t)+'|'+norm(b);
  }
  function read(){
    try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return{}}
  }
  function write(o){
    const arr=Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,MAX_ITEMS);
    localStorage.setItem(STORE,JSON.stringify(Object.fromEntries(arr)));
  }
  function route(t,b){
    const k=kind(t,b);
    if(k==='liquidity_sweep')return 'Analyze';
    if(k==='bsl_ssl_touched')return 'Analyze';
    if(k==='scanner_connected'||k==='scanner_alive')return 'Dashboard';
    return 'Analyze';
  }
  function openRoute(t,b){
    const r=route(t,b);
    try{localStorage.setItem('amyfx.notification.route',r)}catch(e){}
    try{if(typeof setTab==='function')setTab(r)}catch(e){}
    try{window.focus()}catch(e){}
  }
  function allow(t,b){
    const n=now();
    const k=key(t,b);

    if(n<muteUntil && kind(t,b)!=='scanner_alive')return false;

    const last=read();
    const prev=last[k]||0;
    if(n-prev<COOLDOWN)return false;

    last[k]=n;
    write(last);
    return true;
  }

  document.addEventListener('visibilitychange',function(){
    if(!document.hidden){
      muteUntil=now()+RESUME_MUTE;
    }
  });

  window.addEventListener('pageshow',function(){
    muteUntil=now()+RESUME_MUTE;
  });

  try{
    if('Notification' in window && !window.Notification.__amyfxWrapped){
      const OriginalNotification=window.Notification;
      const WrappedNotification=function(title,opts){
        opts=opts||{};
        const body=opts.body||'';
        if(!allow(title,body))return null;
        const n=new OriginalNotification(title,opts);
        n.onclick=function(){openRoute(title,body)};
        return n;
      };
      Object.getOwnPropertyNames(OriginalNotification).forEach(function(k){
        try{WrappedNotification[k]=OriginalNotification[k]}catch(e){}
      });
      WrappedNotification.prototype=OriginalNotification.prototype;
      WrappedNotification.__amyfxWrapped=true;
      window.Notification=WrappedNotification;
    }
  }catch(e){}

  function wrapBridge(obj){
    if(!obj||obj.__amyfxNotifyBridgeWrapped)return;
    Object.keys(obj).forEach(function(k){
      if(!/notify|notification|alert|push/i.test(k))return;
      if(typeof obj[k]!=='function')return;
      const old=obj[k];
      obj[k]=function(){
        const args=[].slice.call(arguments);
        const title=args[0]||'Amy FX';
        const body=args[1]||args[0]||'';
        if(!allow(title,body))return null;
        try{return old.apply(this,args)}catch(e){return null}
      };
    });
    obj.__amyfxNotifyBridgeWrapped=true;
  }

  function wrapAll(){
    ['Android','AndroidBridge','AmyFX','AmyFx','Native','NotificationBridge','AppBridge'].forEach(function(n){
      try{wrapBridge(window[n])}catch(e){}
    });
  }

  wrapAll();
  setInterval(wrapAll,1500);

  window.__amyfxNotifyAllow=allow;
  window.__amyfxNotifyOpenRoute=openRoute;
})();
/* AMYFX_NOTIFY_GUARD_END */

