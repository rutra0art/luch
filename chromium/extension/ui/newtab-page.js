    const h = new Date().getHours();
    document.getElementById('greeting').textContent =
      h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';

    const form = document.getElementById('form');
    const q = document.getElementById('q');
    const isUrl = (t) => !/\s/.test(t) && (/^(https?|file):/i.test(t) || /^localhost(:\d+)?(\/|$)/.test(t) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(t));
    // Вопросы передаются браузеру, который открывает панель Gemini
    const ask = (text) => console.log('luch:ask:' + text);

    // Enter — открыть сайт или искать в интернете, ⌘Enter — спросить Gemini
    function go(askGemini) {
      const text = q.value.trim();
      if (!text) return;
      if (askGemini) { ask(text); q.value = ''; form.classList.remove('typing'); }
      else if (isUrl(text)) location.href = /^[a-z]+:/i.test(text) ? text : 'https://' + text;
      else console.log('luch:search:' + text);
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); go(false); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); go(true); }
    });
    q.addEventListener('input', () => form.classList.toggle('typing', q.value.trim() !== ''));
    for (const li of document.querySelectorAll('.suggest li')) li.onclick = () => ask(li.dataset.q);
  
