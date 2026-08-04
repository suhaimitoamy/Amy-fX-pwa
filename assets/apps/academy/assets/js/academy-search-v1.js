(function () {
  'use strict';

  function init() {
    const input = document.getElementById('academySearch');
    if (!input) return;

    const cards = Array.from(document.querySelectorAll('.cards .course-card'));
    const empty = document.createElement('div');
    empty.className = 'empty-state-card';
    empty.hidden = true;
    empty.innerHTML = '<strong>Materi tidak ditemukan</strong><span>Coba kata kunci lain dari judul atau topik materi.</span>';
    input.insertAdjacentElement('afterend', empty);

    function filter() {
      const query = input.value.trim().toLocaleLowerCase('id-ID');
      let visible = 0;
      cards.forEach(card => {
        const match = !query || card.textContent.toLocaleLowerCase('id-ID').includes(query);
        card.hidden = !match;
        if (match) visible += 1;
      });
      empty.hidden = visible !== 0;
    }

    input.addEventListener('input', filter);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
