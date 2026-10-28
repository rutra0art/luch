// Темы пространств: фон окна из 1–3 цветов, режим (авто/светлый/тёмный), насыщенность и зернистость.
// Тема хранится в пространстве: { mode, colors: [{ h, s, l }], intensity, grain }.
// Редактор: поле с точками (положение точки — оттенок и яркость), ряд готовых цветов, волна и ручка
(() => {
  const PALETTES = [
    // Яркие, пастельные, глубокие, серые
    ['#ece6e2', '#e98bb0', '#9a5a95', '#e8504f', '#f2763a', '#f2c94c', '#2fd18b', '#56b4dc', '#545a80'],
    ['#fbf7f4', '#f6d3e0', '#e6c8ec', '#f8b9bd', '#fbd3b6', '#f8efc1', '#c8f0d6', '#c9ecf3', '#c8c9ee'],
    ['#4a3557', '#6e2f4f', '#9b3533', '#b5622a', '#d6a63f', '#d6d29a', '#6aa874', '#2f6b48', '#24406b'],
    ['#ffffff', '#e4e4e4', '#c8c8c8', '#a8a8a8', '#7f7f7f', '#5c5c5c', '#3b3b3b', '#202020', '#000000'],
  ];
  const MAX_COLORS = 3;
  // Где на фоне окна стоят пятна цветов: главный — слева сверху, остальные — справа и внизу
  const ANCHORS = [[18, 12], [92, 20], [55, 105]];

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  function hexToHsl(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s, l };
  }
  const css = ({ h, s, l }, a = 1) => `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`;

  // Положение точки на поле: по горизонтали — оттенок, по вертикали — яркость (сверху светлее)
  const toPoint = (c) => ({ x: c.s < 0.06 ? 0.5 : c.h / 360, y: clamp(1 - (c.l - 0.08) / 0.84) });
  const fromPoint = (x, y, s) => ({ h: clamp(x) * 360, s: s < 0.06 ? 0 : s, l: 0.08 + (1 - clamp(y)) * 0.84 });

  function defaultTheme(color) {
    return { mode: 'auto', colors: [hexToHsl(color || '#56b4dc')], intensity: 0.7, grain: 0.25 };
  }

  function isDark(theme) {
    if (theme.mode === 'dark') return true;
    if (theme.mode === 'light') return false;
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // Цвет для фона окна: в тёмном режиме приглушаем, в светлом — высветляем, насыщенность — от «волны»
  function tone(c, dark, intensity) {
    const s = c.s * (0.25 + intensity * 0.75);
    const l = dark ? 0.12 + c.l * 0.3 : 0.62 + c.l * 0.3;
    return { h: c.h, s, l };
  }

  function grainImage(amount) {
    if (amount <= 0.01) return '';
    const a = (amount * 0.55).toFixed(3);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 ${a} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  function background(theme) {
    const dark = isDark(theme);
    const cols = theme.colors.map(c => tone(c, dark, theme.intensity));
    const base = cols[0];
    const base2 = { ...base, l: base.l * (dark ? 0.8 : 0.97) };
    const layers = cols.map((c, i) => `radial-gradient(120% 90% at ${ANCHORS[i][0]}% ${ANCHORS[i][1]}%, ${css(c)} 0%, ${css(c, 0)} 72%)`);
    return {
      image: [grainImage(theme.grain), ...layers, `linear-gradient(180deg, ${css(base)}, ${css(base2)})`].filter(Boolean).join(', '),
      bg: css(base),
      bg2: css(base2),
    };
  }

  // Тема пространства на всё окно. null — стандартный фон Luch
  function apply(theme) {
    const root = document.documentElement;
    const body = document.body;
    const globalTheme = typeof settings === 'function' ? settings().theme : 'system';
    if (!theme || body.classList.contains('incognito')) {
      body.style.removeProperty('background');
      root.style.removeProperty('--bg');
      root.style.removeProperty('--bg-2');
      window.luch.setTheme(globalTheme);
      return;
    }
    // Режим пространства важнее общей темы; «авто» — как в общих настройках
    window.luch.setTheme(theme.mode === 'auto' ? globalTheme : theme.mode);
    const b = background(theme);
    root.style.setProperty('--bg', b.bg);
    root.style.setProperty('--bg-2', b.bg2);
    body.style.background = b.image;
  }

  // ---------- Редактор ----------

  const ICONS = {
    auto: '<svg viewBox="0 0 16 16"><path d="M6 2.5c.4 2.2 1.8 3.6 4 4-2.2.4-3.6 1.8-4 4-.4-2.2-1.8-3.6-4-4 2.2-.4 3.6-1.8 4-4zM12 9.5c.2 1 .8 1.6 1.8 1.8-1 .2-1.6.8-1.8 1.8-.2-1-.8-1.6-1.8-1.8 1-.2 1.6-.8 1.8-1.8z"/></svg>',
    light: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>',
    dark: '<svg viewBox="0 0 16 16"><path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6z"/></svg>',
  };
  const MODE_TITLES = { auto: 'Как в настройках Luch', light: 'Светлая', dark: 'Тёмная' };

  // Перетаскивание с захватом указателя: значение меняется, пока кнопка мыши нажата
  function dragging(e, onMove) {
    onMove(e);
    const up = () => { removeEventListener('pointermove', onMove); removeEventListener('pointerup', up); };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', up);
    e.preventDefault();
  }

  function picker(container, initial, onChange) {
    const theme = JSON.parse(JSON.stringify(initial));
    let selected = 0;
    let page = 0;
    container.innerHTML = `
      <div class="tp-pad">
        <div class="tp-modes"></div>
        <div class="tp-dots"></div>
        <div class="tp-count"><button class="tp-minus" title="Убрать цвет">−</button><button class="tp-plus" title="Добавить цвет">+</button></div>
      </div>
      <div class="tp-palette"><button class="tp-prev" title="Предыдущие цвета">‹</button><div class="tp-swatches"></div><button class="tp-next" title="Следующие цвета">›</button></div>
      <div class="tp-controls">
        <div class="tp-wave" title="Насыщенность"><svg viewBox="0 0 200 40" preserveAspectRatio="none"><path class="tp-wave-path"/></svg><div class="tp-wave-knob"></div></div>
        <div class="tp-dial" title="Зернистость"><div class="tp-dial-ticks"></div><div class="tp-dial-face"></div><div class="tp-dial-mark"></div></div>
      </div>`;
    const $ = (s) => container.querySelector(s);
    const emit = () => { render(); onChange(JSON.parse(JSON.stringify(theme))); };

    for (const m of ['auto', 'light', 'dark']) {
      const b = document.createElement('button');
      b.className = 'tp-mode';
      b.dataset.mode = m;
      b.title = MODE_TITLES[m];
      b.innerHTML = ICONS[m];
      b.onclick = () => { theme.mode = m; emit(); };
      $('.tp-modes').appendChild(b);
    }

    // Точки перетаскиваются по полю; выбранную точку перекрашивает ряд цветов
    const pad = $('.tp-dots');
    function drag(i, e) {
      selected = i;
      const rect = pad.getBoundingClientRect();
      dragging(e, (ev) => {
        theme.colors[i] = fromPoint((ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height, theme.colors[i].s);
        emit();
      });
    }

    $('.tp-plus').onclick = () => {
      if (theme.colors.length >= MAX_COLORS) return;
      // Новый цвет — соседний по кругу оттенков, чтобы сочетался с главным
      const base = theme.colors[0];
      theme.colors.push({ h: (base.h + 40 * theme.colors.length) % 360, s: Math.max(base.s, 0.5), l: base.l });
      selected = theme.colors.length - 1;
      emit();
    };
    $('.tp-minus').onclick = () => {
      if (theme.colors.length <= 1) return;
      theme.colors.splice(selected === 0 ? theme.colors.length - 1 : selected, 1);
      selected = 0;
      emit();
    };

    $('.tp-prev').onclick = () => { page = (page + PALETTES.length - 1) % PALETTES.length; render(); };
    $('.tp-next').onclick = () => { page = (page + 1) % PALETTES.length; render(); };

    // Волна — насыщенность: тянуть по горизонтали
    const wave = $('.tp-wave');
    wave.onpointerdown = (e) => {
      const rect = wave.getBoundingClientRect();
      dragging(e, (ev) => { theme.intensity = clamp((ev.clientX - rect.left) / rect.width); emit(); });
    };

    // Ручка — зернистость: поворот от −135° до +135°, колесом мыши тоже можно
    const dial = $('.tp-dial');
    for (let i = 0; i < 16; i++) {
      const t = document.createElement('i');
      t.style.transform = `rotate(${-135 + i * 18}deg) translateY(-24px)`;
      $('.tp-dial-ticks').appendChild(t);
    }
    dial.onpointerdown = (e) => {
      const rect = dial.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      dragging(e, (ev) => {
        const deg = Math.atan2(ev.clientX - cx, cy - ev.clientY) * 180 / Math.PI;
        theme.grain = clamp((deg + 135) / 270);
        emit();
      });
    };
    dial.onwheel = (e) => { e.preventDefault(); theme.grain = clamp(theme.grain - Math.sign(e.deltaY) * 0.05); emit(); };

    function render() {
      for (const b of container.querySelectorAll('.tp-mode')) b.classList.toggle('on', b.dataset.mode === theme.mode);
      pad.innerHTML = '';
      theme.colors.forEach((c, i) => {
        const p = toPoint(c);
        const d = document.createElement('button');
        d.className = 'tp-dot' + (i === 0 ? ' main' : '') + (i === selected ? ' selected' : '');
        d.style.left = p.x * 100 + '%';
        d.style.top = p.y * 100 + '%';
        d.style.background = css(c);
        d.title = i === 0 ? 'Главный цвет' : 'Дополнительный цвет';
        d.onpointerdown = (e) => drag(i, e);
        pad.appendChild(d);
      });
      $('.tp-minus').disabled = theme.colors.length <= 1;
      $('.tp-plus').disabled = theme.colors.length >= MAX_COLORS;
      const sw = $('.tp-swatches');
      sw.innerHTML = '';
      for (const hex of PALETTES[page]) {
        const b = document.createElement('button');
        b.className = 'tp-swatch';
        b.style.background = hex;
        b.onclick = () => { theme.colors[selected] = hexToHsl(hex); emit(); };
        sw.appendChild(b);
      }
      // Волна: чем выше насыщенность, тем выше волна
      const amp = 3 + theme.intensity * 13;
      let d = 'M0 20';
      for (let x = 0; x <= 200; x += 4) d += ` L${x} ${(20 - Math.sin(x / 200 * Math.PI * 8) * amp).toFixed(1)}`;
      $('.tp-wave-path').setAttribute('d', d);
      $('.tp-wave-knob').style.left = theme.intensity * 100 + '%';
      $('.tp-dial-mark').style.transform = `rotate(${-135 + theme.grain * 270}deg)`;
    }
    render();
    return { get: () => JSON.parse(JSON.stringify(theme)) };
  }

  // Цвет точки пространства в колонке — главный цвет темы
  const primary = (t) => css({ h: t.colors[0].h, s: Math.max(t.colors[0].s, 0.15), l: clamp(t.colors[0].l, 0.35, 0.65) });

  window.LuchTheme = { apply, picker, defaultTheme, hexToHsl, primary };
})();
