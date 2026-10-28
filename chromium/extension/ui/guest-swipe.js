// Встраивается в страницы вкладок Luch: свайп двумя пальцами по трекпаду влево и вправо —
// назад и вперёд по истории, со стрелкой у края, как в Chrome. Срабатывает, только когда
// страница (или блок под курсором) уже не может прокрутиться в эту сторону
(() => {
  if (window.top !== window || window.__luchSwipe) return;
  window.__luchSwipe = true;

  const THRESHOLD = 140;   // сколько нужно «протянуть», чтобы перейти
  const END_DELAY = 140;   // пауза в событиях прокрутки — жест вместе с инерцией закончился
  let acc = 0;
  let timer = null;
  // Переход уже сделан: остаток жеста и инерцию трекпада пропускаем до паузы
  let fired = false;

  // Стрелка в теневом DOM, чтобы стили сайта её не задели
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    .a { position: fixed; top: 50%; width: 44px; height: 44px; margin-top: -22px; border-radius: 50%;
      display: grid; place-items: center; background: rgba(60, 64, 72, .85); color: #fff;
      box-shadow: 0 4px 16px rgba(0,0,0,.25); opacity: 0; transition: opacity .15s, background .15s; }
    .a.ready { background: #2f86d1; }
    .a svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .l { left: -44px; } .r { right: -44px; }
  </style>
  <div class="a l"><svg viewBox="0 0 16 16"><path d="M13 8H3M7 4L3 8l4 4"/></svg></div>
  <div class="a r"><svg viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4"/></svg></div>`;
  const left = root.querySelector('.l');
  const right = root.querySelector('.r');
  const attach = () => { if (!host.isConnected) (document.body || document.documentElement).appendChild(host); };

  function show(progress) {
    attach();
    const back = progress > 0;
    const p = Math.min(1, Math.abs(progress));
    const el = back ? left : right;
    const other = back ? right : left;
    other.style.opacity = 0;
    other.style.transform = '';
    el.style.opacity = Math.min(1, p * 1.6);
    el.style.transform = `translateX(${(back ? 1 : -1) * p * 70}px)`;
    el.classList.toggle('ready', p >= 1);
  }
  function hide() {
    for (const el of [left, right]) { el.style.opacity = 0; el.style.transform = ''; el.classList.remove('ready'); }
  }

  // Может ли что-то под курсором ещё прокрутиться по горизонтали в сторону жеста
  function canScroll(target, dx) {
    for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 1) {
        const ox = getComputedStyle(el).overflowX;
        if (ox === 'auto' || ox === 'scroll' || el === document.scrollingElement) {
          if (dx < 0 && el.scrollLeft > 0) return true;
          if (dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
        }
      }
    }
    const se = document.scrollingElement;
    return Boolean(se && ((dx < 0 && se.scrollLeft > 0) || (dx > 0 && se.scrollLeft + se.clientWidth < se.scrollWidth - 1)));
  }

  function reset() {
    timer = null;
    fired = false;
    acc = 0;
    hide();
  }

  addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;
    clearTimeout(timer);
    timer = setTimeout(reset, END_DELAY);
    if (fired) return;
    // Нужен именно горизонтальный жест
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.3) {
      if (acc && Math.abs(e.deltaY) > 4) { acc = 0; hide(); }
      return;
    }
    if (canScroll(e.target, e.deltaX)) { acc = 0; hide(); return; }
    // Пальцы вправо (deltaX < 0) — назад, влево — вперёд. Переходим сразу, как только жест
    // дотянут, не дожидаясь конца инерции — так нет задержки
    acc -= e.deltaX;
    show(acc / THRESHOLD);
    if (Math.abs(acc) >= THRESHOLD) {
      fired = true;
      if (acc > 0) history.back(); else history.forward();
      setTimeout(hide, 180);
    }
  }, { passive: true, capture: true });
})();
