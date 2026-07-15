(function(){
  'use strict';

  const modules = [
    {
      number: 31,
      title: 'ICT Advanced Concepts',
      description: 'Konsep ICT lanjutan: IPDA, AMDX, quarterly theory, BPR, MMXM, OTE, SMT, macro time, dan standard deviation.',
      href: 'bagian-31-ict-advanced-concepts/index.html'
    },
    {
      number: 32,
      title: 'Trading Tools & Setup',
      description: 'Pengaturan TradingView, tools pendukung, dan indikator waktu untuk membantu proses analisis tanpa menggantikan keputusan trader.',
      href: 'bagian-32-trading-tools-setup/index.html'
    },
    {
      number: 33,
      title: 'Live Case Studies',
      description: 'Studi kasus XAUUSD dan pembahasan kegagalan setup agar konsep dapat dibandingkan dengan kondisi market nyata.',
      href: 'bagian-33-live-case-studies/index.html'
    },
    {
      number: 34,
      title: 'Prop Firm Mastery',
      description: 'Cara kerja prop firm, aturan drawdown, dan manajemen risiko khusus untuk menghadapi evaluasi secara terukur.',
      href: 'bagian-34-prop-firm-mastery/index.html'
    },
    {
      number: 35,
      title: 'Trading Plan Template',
      description: 'Template SOP trading satu halaman untuk menyatukan bias, setup, risiko, entry, exit, dan evaluasi.',
      href: 'bagian-35-trading-plan-template/index.html'
    },
    {
      number: 36,
      title: 'Psikologi ICT Lanjutan',
      description: 'Mengenali analysis freeze, backtest bias, narrative bias, overexplaining market, dan kebiasaan berpindah metode.',
      href: 'bagian-36-psikologi-ict-lanjutan/index.html'
    }
  ];

  function hasModule(number) {
    return Array.from(document.querySelectorAll('.num, section.panel h2')).some(function(el){
      return el.textContent.trim().startsWith('Bagian ' + String(number).padStart(2, '0'));
    });
  }

  function addProgressBadge(card, href) {
    if (!card || card.querySelector('.progress-badge')) return;
    const lastUrl = localStorage.getItem('amy_last_opened_url') || '';
    const folder = (href.match(/bagian-\d+[^/]+/) || [''])[0];
    const badge = document.createElement('span');
    badge.className = 'progress-badge';
    badge.style.fontSize = '12px';
    badge.style.fontWeight = '700';
    badge.style.padding = '4px 10px';
    badge.style.borderRadius = '99px';
    badge.style.marginBottom = '8px';
    badge.style.display = 'inline-block';
    badge.style.width = 'fit-content';
    if (folder && lastUrl.indexOf(folder) !== -1) {
      badge.textContent = 'Sedang dipelajari';
      badge.style.background = 'var(--accent-soft)';
      badge.style.color = 'var(--accent)';
    } else {
      badge.textContent = 'Belum mulai';
      badge.style.background = 'var(--surface-soft)';
      badge.style.color = 'var(--muted)';
      badge.style.border = '1px solid var(--border)';
    }
    card.insertBefore(badge, card.firstChild);
  }

  function removeDuplicateBadges() {
    document.querySelectorAll('.course-card').forEach(function(card){
      const badges = card.querySelectorAll('.progress-badge');
      for (let i = 1; i < badges.length; i++) badges[i].remove();
    });
  }

  function injectHomeModules() {
    const card30 = Array.from(document.querySelectorAll('.course-card')).find(function(card){
      const num = card.querySelector('.num');
      return num && num.textContent.trim() === 'Bagian 30';
    });
    if (!card30 || hasModule(31)) return;

    const previousGrid = card30.closest('section.cards');
    if (!previousGrid) return;

    document.querySelectorAll('.mini-feature span').forEach(function(el){
      el.textContent = el.textContent.replace('30 bagian', '36 bagian');
    });

    const heading = document.createElement('section');
    heading.className = 'section-heading';
    heading.id = 'mastery-lanjutan';
    heading.innerHTML = '<div class="eyebrow">Materi Master & Praktik</div>' +
      '<h2>Bagian 31–36 — Mastery, Tools, Studi Kasus & Psikologi</h2>' +
      '<p>Kelanjutan Academy dari konsep ICT lanjutan sampai kesiapan praktik, prop firm, trading plan, dan psikologi ICT.</p>';

    const grid = document.createElement('section');
    grid.className = 'cards';
    modules.forEach(function(item){
      const card = document.createElement('article');
      card.className = 'course-card';
      card.innerHTML = '<div class="num">Bagian ' + String(item.number).padStart(2, '0') + '</div>' +
        '<h3>' + item.title + '</h3>' +
        '<p>' + item.description + '</p>' +
        '<a class="btn" href="' + item.href + '">Buka Materi →</a>';
      grid.appendChild(card);
      addProgressBadge(card, item.href);
    });

    previousGrid.insertAdjacentElement('afterend', heading);
    heading.insertAdjacentElement('afterend', grid);
  }

  function injectCatalogModules() {
    const title = Array.from(document.querySelectorAll('.section-heading h1')).find(function(el){
      return el.textContent.trim() === 'Daftar Materi';
    });
    if (!title || hasModule(31)) return;

    const intro = title.parentElement && title.parentElement.querySelector('p');
    if (intro) intro.textContent = '36 bagian utama dari pemula sampai mastery, praktik, dan psikologi ICT lanjutan.';

    const lastPanel = Array.from(document.querySelectorAll('section.panel')).pop();
    if (!lastPanel) return;

    let anchor = lastPanel;
    modules.forEach(function(item){
      const panel = document.createElement('section');
      panel.className = 'panel';
      panel.dataset.category = item.number === 36 ? 'Psikologi' : 'Advanced';
      panel.style.padding = '24px';
      panel.style.marginBottom = '20px';
      panel.innerHTML = '<h2>Bagian ' + String(item.number).padStart(2, '0') + ' — ' + item.title + '</h2>' +
        '<div class="chapter-list"><a class="chapter-row" href="' + item.href + '">' +
        '<span><strong>' + item.title + '</strong><br><small>' + item.description + '</small></span><span>→</span>' +
        '</a></div>';
      anchor.insertAdjacentElement('afterend', panel);
      anchor = panel;
    });
  }

  function run() {
    injectHomeModules();
    injectCatalogModules();
    setTimeout(removeDuplicateBadges, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
