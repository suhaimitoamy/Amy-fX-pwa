document.addEventListener('DOMContentLoaded', async () => {
    const container = document.querySelector('.quiz-container');
    if (!container) return;

    const moduleName = container.getAttribute('data-module');
    if (!moduleName) return;

    try {
        const root = typeof ROOT_PATH !== 'undefined' ? ROOT_PATH : '../';
        const response = await fetch(root + 'assets/data/quizzes.json');
        const allQuizzes = await response.json();
        const quizzes = allQuizzes[moduleName];
        
        if (!quizzes || quizzes.length === 0) return;

        let currentQ = 0;
        let score = 0;

        function renderQuiz() {
            if (currentQ >= quizzes.length) {
                renderResult();
                return;
            }

            const q = quizzes[currentQ];
            let html = `
                <div class="quiz-box glass-panel">
                    <div class="quiz-header">
                        <span class="quiz-badge">Evaluasi Akhir Modul</span>
                        <span class="quiz-progress">Pertanyaan ${currentQ + 1} dari ${quizzes.length}</span>
                    </div>
                    <h3 class="quiz-question">${q.question}</h3>
                    <div class="quiz-options">
                        ${q.options.map((opt, i) => `
                            <button class="quiz-btn" onclick="selectAnswer(${i})">${String.fromCharCode(65 + i)}. ${opt}</button>
                        `).join('')}
                    </div>
                    <div id="quiz-feedback" class="quiz-feedback" style="display:none;"></div>
                    <button id="quiz-next" class="btn primary" style="display:none; margin-top:15px; width:100%" onclick="nextQuestion()">Lanjut Pertanyaan</button>
                </div>
            `;
            container.innerHTML = html;
        }

        window.selectAnswer = function(idx) {
            const btns = document.querySelectorAll('.quiz-btn');
            btns.forEach(b => b.disabled = true);
            
            const q = quizzes[currentQ];
            const feedback = document.getElementById('quiz-feedback');
            const nextBtn = document.getElementById('quiz-next');
            
            if (idx === q.correctIndex) {
                btns[idx].classList.add('correct');
                feedback.innerHTML = `<strong>Benar! 🎉</strong><br>${q.explanation}`;
                feedback.className = 'quiz-feedback success';
                score++;
            } else {
                btns[idx].classList.add('wrong');
                btns[q.correctIndex].classList.add('correct');
                feedback.innerHTML = `<strong>Salah! ❌</strong><br>${q.explanation}`;
                feedback.className = 'quiz-feedback error';
            }
            
            feedback.style.display = 'block';
            nextBtn.style.display = 'block';
        };

        window.nextQuestion = function() {
            currentQ++;
            renderQuiz();
        };

        function renderResult() {
            let passed = score === quizzes.length;
            let html = `
                <div class="quiz-box glass-panel" style="text-align:center">
                    <h2 style="color:${passed ? '#4ade80' : '#ffc107'}">${passed ? 'Lulus Sempurna! 🎉' : 'Evaluasi Selesai!'}</h2>
                    <p style="margin-bottom:20px;">Anda menjawab ${score} dari ${quizzes.length} pertanyaan dengan benar.</p>
                    ${passed ? '<p style="color:#a1a3ab">Pengetahuan Anda di modul ini sudah sangat matang.</p>' : '<p style="color:#a1a3ab">Silakan baca ulang materi ini jika masih ada konsep yang membingungkan.</p>'}
                    <button class="btn primary" onclick="location.reload()">Ulangi Kuis</button>
                </div>
            `;
            container.innerHTML = html;

            if (passed) {
                // Confetti effect
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
                script.onload = () => {
                    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
                };
                document.body.appendChild(script);
            }
        }

        renderQuiz();

    } catch (e) {
        console.error("Gagal memuat kuis:", e);
    }
});


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

