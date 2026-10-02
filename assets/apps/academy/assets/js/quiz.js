document.addEventListener('DOMContentLoaded', async () => {
    const container = document.querySelector('.quiz-container');
    if (!container) return;

    const root = typeof ROOT_PATH !== 'undefined' ? ROOT_PATH : '../';
    const pathMatch = window.location.pathname.match(/bagian-(\d{2})-/i);
    const sectionNumber = pathMatch ? pathMatch[1] : container.getAttribute('data-section');
    const legacyModuleName = container.getAttribute('data-module');

    const LEVEL_COPY = {
        easy: {
            label: 'Mudah',
            subtitle: 'Fondasi & definisi',
            description: 'Kenali arti konsep utama dari materi ini.'
        },
        medium: {
            label: 'Menengah',
            subtitle: 'Pengenalan konsep',
            description: 'Tentukan konsep dari penjelasan yang diberikan.'
        },
        hard: {
            label: 'Sulit',
            subtitle: 'Presisi konsep',
            description: 'Bedakan pasangan konsep dan penjelasan yang sangat mirip.'
        }
    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const shuffle = (items) => {
        const out = [...items];
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    };

    const shardFor = (number) => {
        const n = Number(number);
        if (n >= 1 && n <= 10) return 'quiz-levels-01-10.json';
        if (n >= 11 && n <= 20) return 'quiz-levels-11-20.json';
        if (n >= 21 && n <= 30) return 'quiz-levels-21-30.json';
        if (n >= 31 && n <= 36) return 'quiz-levels-31-36.json';
        return null;
    };

    const makeOptions = (correctValue, pool) => {
        const distractors = shuffle(pool.filter((item) => item !== correctValue)).slice(0, 3);
        const values = shuffle([correctValue, ...distractors]);
        return {
            options: values,
            correctIndex: values.indexOf(correctValue)
        };
    };

    const normalizeConcepts = (moduleData) => (moduleData.concepts || [])
        .map((item) => ({ term: item[0], definition: item[1] }))
        .filter((item) => item.term && item.definition);

    const buildHardOptions = (targetIndex, concepts) => {
        const target = concepts[targetIndex];
        const otherIndexes = shuffle(concepts.map((_, idx) => idx).filter((idx) => idx !== targetIndex));
        const picked = otherIndexes.slice(0, 3);
        const distractors = picked.map((termIndex, pos) => {
            let defIndex = picked[(pos + 1) % picked.length];
            if (defIndex === termIndex) defIndex = targetIndex;
            return `${concepts[termIndex].term} — ${concepts[defIndex].definition}`;
        });
        const correct = `${target.term} — ${target.definition}`;
        const options = shuffle([correct, ...distractors]);
        return { options, correctIndex: options.indexOf(correct) };
    };

    const buildQuestions = (moduleData, level) => {
        const concepts = normalizeConcepts(moduleData);
        const definitions = concepts.map((item) => item.definition);
        const terms = concepts.map((item) => item.term);

        return shuffle(concepts.map((concept, index) => {
            if (level === 'easy') {
                const answerSet = makeOptions(concept.definition, definitions);
                return {
                    question: `Apa penjelasan yang paling tepat untuk “${escapeHtml(concept.term)}”?`,
                    options: answerSet.options,
                    correctIndex: answerSet.correctIndex,
                    explanation: `<strong>${escapeHtml(concept.term)}</strong> — ${escapeHtml(concept.definition)}`
                };
            }

            if (level === 'medium') {
                const answerSet = makeOptions(concept.term, terms);
                return {
                    question: `Konsep apa yang paling sesuai dengan penjelasan berikut?<br><span style="font-weight:400;color:#a1a3ab">“${escapeHtml(concept.definition)}”</span>`,
                    options: answerSet.options,
                    correctIndex: answerSet.correctIndex,
                    explanation: `Jawabannya <strong>${escapeHtml(concept.term)}</strong>. ${escapeHtml(concept.definition)}`
                };
            }

            const answerSet = buildHardOptions(index, concepts);
            return {
                question: 'Hanya satu pasangan konsep dan penjelasan berikut yang benar. Pilih yang paling tepat.',
                options: answerSet.options,
                correctIndex: answerSet.correctIndex,
                explanation: `Pasangan yang benar adalah <strong>${escapeHtml(concept.term)}</strong> — ${escapeHtml(concept.definition)}`
            };
        }));
    };

    const launchConfetti = () => {
        if (typeof window.confetti === 'function') {
            window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
        script.onload = () => {
            if (typeof window.confetti === 'function') {
                window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
            }
        };
        document.body.appendChild(script);
    };

    const runTieredQuiz = (payload, moduleData) => {
        const levels = payload.levels || {};
        let selectedLevel = null;
        let questions = [];
        let currentQ = 0;
        let score = 0;
        let answered = false;

        const renderLevelSelector = () => {
            const buttons = ['easy', 'medium', 'hard'].map((key) => {
                const copy = LEVEL_COPY[key];
                const passPercent = levels[key]?.passPercent ?? (key === 'easy' ? 70 : key === 'medium' ? 75 : 80);
                return `
                    <button type="button" class="quiz-btn quiz-level-btn" data-level="${key}" style="text-align:left;padding:16px;margin-bottom:10px">
                        <strong style="display:block;font-size:1.05rem">${copy.label}</strong>
                        <span style="display:block;color:#a1a3ab;margin-top:4px">${copy.subtitle} • Lulus ${passPercent}%</span>
                        <span style="display:block;margin-top:6px">${copy.description}</span>
                    </button>
                `;
            }).join('');

            container.innerHTML = `
                <div class="quiz-box glass-panel">
                    <div class="quiz-header">
                        <span class="quiz-badge">Quiz Bertingkat</span>
                        <span class="quiz-progress">Bagian ${escapeHtml(sectionNumber || '')}</span>
                    </div>
                    <h3 class="quiz-question">Pilih tingkat kesulitan</h3>
                    <p style="color:#a1a3ab;margin-bottom:16px">${escapeHtml(moduleData.title || 'Evaluasi Materi')}</p>
                    <div class="quiz-options">${buttons}</div>
                </div>
            `;

            container.querySelectorAll('[data-level]').forEach((button) => {
                button.addEventListener('click', () => startLevel(button.dataset.level));
            });
        };

        const startLevel = (level) => {
            selectedLevel = level;
            questions = buildQuestions(moduleData, level);
            currentQ = 0;
            score = 0;
            answered = false;
            renderQuestion();
        };

        const renderQuestion = () => {
            if (currentQ >= questions.length) {
                renderResult();
                return;
            }

            answered = false;
            const q = questions[currentQ];
            const levelLabel = LEVEL_COPY[selectedLevel]?.label || selectedLevel;
            const optionsHtml = q.options.map((option, idx) => `
                <button type="button" class="quiz-btn" data-answer="${idx}">${String.fromCharCode(65 + idx)}. ${escapeHtml(option)}</button>
            `).join('');

            container.innerHTML = `
                <div class="quiz-box glass-panel">
                    <div class="quiz-header">
                        <span class="quiz-badge">${escapeHtml(levelLabel)}</span>
                        <span class="quiz-progress">Pertanyaan ${currentQ + 1} dari ${questions.length}</span>
                    </div>
                    <h3 class="quiz-question">${q.question}</h3>
                    <div class="quiz-options">${optionsHtml}</div>
                    <div id="quiz-feedback" class="quiz-feedback" style="display:none"></div>
                    <button id="quiz-next" type="button" class="btn primary" style="display:none;margin-top:15px;width:100%">${currentQ + 1 === questions.length ? 'Lihat Hasil' : 'Lanjut Pertanyaan'}</button>
                </div>
            `;

            container.querySelectorAll('[data-answer]').forEach((button) => {
                button.addEventListener('click', () => selectAnswer(Number(button.dataset.answer)));
            });
            container.querySelector('#quiz-next').addEventListener('click', nextQuestion);
        };

        const selectAnswer = (idx) => {
            if (answered) return;
            answered = true;

            const q = questions[currentQ];
            const buttons = Array.from(container.querySelectorAll('[data-answer]'));
            const feedback = container.querySelector('#quiz-feedback');
            const nextBtn = container.querySelector('#quiz-next');
            buttons.forEach((button) => { button.disabled = true; });

            if (idx === q.correctIndex) {
                buttons[idx]?.classList.add('correct');
                feedback.innerHTML = `<strong>Benar.</strong><br>${q.explanation}`;
                feedback.className = 'quiz-feedback success';
                score++;
            } else {
                buttons[idx]?.classList.add('wrong');
                buttons[q.correctIndex]?.classList.add('correct');
                feedback.innerHTML = `<strong>Belum tepat.</strong><br>${q.explanation}`;
                feedback.className = 'quiz-feedback error';
            }

            feedback.style.display = 'block';
            nextBtn.style.display = 'block';
        };

        const nextQuestion = () => {
            currentQ++;
            renderQuestion();
        };

        const renderResult = () => {
            const levelConfig = levels[selectedLevel] || {};
            const passPercent = levelConfig.passPercent ?? 80;
            const percent = questions.length ? Math.round((score / questions.length) * 100) : 0;
            const passed = percent >= passPercent;
            const levelLabel = LEVEL_COPY[selectedLevel]?.label || selectedLevel;

            container.innerHTML = `
                <div class="quiz-box glass-panel" style="text-align:center">
                    <span class="quiz-badge">${escapeHtml(levelLabel)}</span>
                    <h2 style="margin-top:14px;color:${passed ? '#4ade80' : '#ffc107'}">${passed ? 'Lulus!' : 'Belum Lulus'}</h2>
                    <p style="font-size:1.15rem;margin:10px 0">Skor <strong>${score}/${questions.length}</strong> (${percent}%)</p>
                    <p style="color:#a1a3ab;margin-bottom:20px">Batas lulus level ini ${passPercent}%.</p>
                    <div style="display:grid;gap:10px">
                        <button id="quiz-retry" type="button" class="btn primary">Ulangi Level ${escapeHtml(levelLabel)}</button>
                        <button id="quiz-change-level" type="button" class="btn">Pilih Level Lain</button>
                    </div>
                </div>
            `;

            container.querySelector('#quiz-retry').addEventListener('click', () => startLevel(selectedLevel));
            container.querySelector('#quiz-change-level').addEventListener('click', renderLevelSelector);
            if (passed) launchConfetti();
        };

        renderLevelSelector();
    };

    const runLegacyQuiz = async () => {
        if (!legacyModuleName) return;
        const response = await fetch(root + 'assets/data/quizzes.json');
        const allQuizzes = await response.json();
        const quizzes = allQuizzes[legacyModuleName];
        if (!quizzes || quizzes.length === 0) return;

        let currentQ = 0;
        let score = 0;

        const renderQuestion = () => {
            if (currentQ >= quizzes.length) {
                const percent = Math.round((score / quizzes.length) * 100);
                container.innerHTML = `
                    <div class="quiz-box glass-panel" style="text-align:center">
                        <h2>Evaluasi Selesai</h2>
                        <p>Skor ${score}/${quizzes.length} (${percent}%).</p>
                        <button id="legacy-retry" type="button" class="btn primary">Ulangi Kuis</button>
                    </div>
                `;
                container.querySelector('#legacy-retry').addEventListener('click', () => {
                    currentQ = 0;
                    score = 0;
                    renderQuestion();
                });
                return;
            }

            const q = quizzes[currentQ];
            container.innerHTML = `
                <div class="quiz-box glass-panel">
                    <div class="quiz-header"><span class="quiz-badge">Evaluasi Modul</span><span class="quiz-progress">Pertanyaan ${currentQ + 1} dari ${quizzes.length}</span></div>
                    <h3 class="quiz-question">${escapeHtml(q.question)}</h3>
                    <div class="quiz-options">${q.options.map((option, idx) => `<button type="button" class="quiz-btn" data-legacy-answer="${idx}">${String.fromCharCode(65 + idx)}. ${escapeHtml(option)}</button>`).join('')}</div>
                    <div id="legacy-feedback" class="quiz-feedback" style="display:none"></div>
                    <button id="legacy-next" type="button" class="btn primary" style="display:none;margin-top:15px;width:100%">Lanjut Pertanyaan</button>
                </div>
            `;

            const buttons = Array.from(container.querySelectorAll('[data-legacy-answer]'));
            const feedback = container.querySelector('#legacy-feedback');
            const next = container.querySelector('#legacy-next');
            buttons.forEach((button) => button.addEventListener('click', () => {
                buttons.forEach((item) => { item.disabled = true; });
                const idx = Number(button.dataset.legacyAnswer);
                if (idx === q.correctIndex) {
                    button.classList.add('correct');
                    score++;
                    feedback.className = 'quiz-feedback success';
                    feedback.innerHTML = `<strong>Benar.</strong><br>${escapeHtml(q.explanation || '')}`;
                } else {
                    button.classList.add('wrong');
                    buttons[q.correctIndex]?.classList.add('correct');
                    feedback.className = 'quiz-feedback error';
                    feedback.innerHTML = `<strong>Belum tepat.</strong><br>${escapeHtml(q.explanation || '')}`;
                }
                feedback.style.display = 'block';
                next.style.display = 'block';
            }));
            next.addEventListener('click', () => {
                currentQ++;
                renderQuestion();
            });
        };

        renderQuestion();
    };

    try {
        const shard = shardFor(sectionNumber);
        if (!shard || !sectionNumber) {
            await runLegacyQuiz();
            return;
        }

        const response = await fetch(root + 'assets/data/' + shard);
        if (!response.ok) throw new Error(`Quiz bank HTTP ${response.status}`);
        const payload = await response.json();
        const moduleData = payload.modules?.[sectionNumber];
        if (!moduleData) {
            await runLegacyQuiz();
            return;
        }

        runTieredQuiz(payload, moduleData);
    } catch (error) {
        console.error('Gagal memuat quiz bertingkat:', error);
        try {
            await runLegacyQuiz();
        } catch (legacyError) {
            console.error('Gagal memuat quiz fallback:', legacyError);
        }
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
