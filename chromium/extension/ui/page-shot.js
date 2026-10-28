// Снимки страницы во вкладке (<webview>): видимая часть, вся страница — прокруткой и склейкой
// кадров — и область, выделенная мышью. Возвращают PNG (Blob); сохраняет app.js
(() => {
  const MAX_HEIGHT = 32000; // предел высоты холста в точках экрана
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const capture = (wv) => new Promise((resolve, reject) => wv.captureVisibleRegion({ format: 'png' }, (url) => (
    url ? resolve(url) : reject(new Error(chrome.runtime.lastError?.message || 'Не удалось снять страницу'))
  )));
  const image = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось прочитать снимок'));
    img.src = url;
  });
  const toBlob = (canvas) => new Promise((r) => canvas.toBlob(r, 'image/png'));
  // Скрипты выполняются в изолированном мире: страница не видит и не меняет переменные снимка
  const run = (wv, code) => wv.executeJavaScript(code);

  async function visible(wv) {
    const img = await image(await capture(wv));
    const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    canvas.getContext('2d').drawImage(img, 0, 0);
    return toBlob(canvas);
  }

  async function full(wv) {
    const m = await run(wv, `({ h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
      vh: innerHeight, vw: innerWidth, y: scrollY })`);
    await run(wv, 'scrollTo({ top: 0, behavior: "instant" }), true');
    await wait(300);
    const first = await image(await capture(wv));
    const scale = first.width / m.vw;
    const total = Math.min(m.h, Math.floor(MAX_HEIGHT / scale));
    const canvas = Object.assign(document.createElement('canvas'), { width: first.width, height: Math.round(total * scale) });
    const ctx = canvas.getContext('2d');
    ctx.drawImage(first, 0, 0);
    // Закреплённые шапки и плашки остаются только на первом кадре, иначе повторялись бы на каждом
    await run(wv, `(() => {
      window.__luchShotHidden = [];
      for (const el of document.querySelectorAll('body *')) {
        const p = getComputedStyle(el).position;
        if (p === 'fixed' || p === 'sticky') { window.__luchShotHidden.push([el, el.style.visibility]); el.style.visibility = 'hidden'; }
      }
      return true;
    })()`);
    try {
      for (let y = m.vh; y < total; y += m.vh) {
        const actual = await run(wv, `scrollTo({ top: ${y}, behavior: "instant" }), scrollY`);
        await wait(300); // подгрузка картинок и перерисовка
        const frame = await image(await capture(wv));
        ctx.drawImage(frame, 0, Math.round(actual * scale));
      }
    } finally {
      await run(wv, `(() => {
        for (const [el, v] of window.__luchShotHidden || []) el.style.visibility = v;
        delete window.__luchShotHidden;
        scrollTo({ top: ${m.y}, behavior: "instant" });
        return true;
      })()`).catch(() => {});
    }
    return { blob: await toBlob(canvas), cut: m.h > total };
  }

  // Рамка выделения рисуется на самой странице; результат забираем опросом
  const AREA_OVERLAY = `(() => {
    if (window.__luchArea !== undefined) return true;
    window.__luchArea = null;
    const shade = document.createElement('div');
    shade.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.3)';
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;display:none;border:1.5px solid #fff;box-shadow:0 0 0 100vmax rgba(0,0,0,.3);pointer-events:none';
    shade.appendChild(box);
    let start = null;
    const rect = (e) => ({ x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY),
      w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y) });
    const finish = (result) => { shade.remove(); removeEventListener('keydown', onKey, true); window.__luchArea = result; };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish('cancel'); } };
    shade.addEventListener('mousedown', (e) => { e.preventDefault(); start = { x: e.clientX, y: e.clientY }; });
    shade.addEventListener('mousemove', (e) => {
      if (!start) return;
      const r = rect(e);
      shade.style.background = 'transparent';
      Object.assign(box.style, { display: 'block', left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    });
    shade.addEventListener('mouseup', (e) => {
      if (!start) return;
      const r = rect(e);
      finish(r.w > 4 && r.h > 4 ? { ...r, vw: innerWidth } : 'cancel');
    });
    addEventListener('keydown', onKey, true);
    document.documentElement.appendChild(shade);
    return true;
  })()`;

  async function area(wv) {
    await run(wv, AREA_OVERLAY);
    wv.focus();
    let result = '';
    for (let i = 0; i < 600 && !result; i++) { // до двух минут
      await wait(200);
      result = await run(wv, 'window.__luchArea ? JSON.stringify(window.__luchArea) : ""').catch(() => '"cancel"');
    }
    await run(wv, 'delete window.__luchArea, true').catch(() => {});
    if (!result || result === '"cancel"') return null;
    const r = JSON.parse(result);
    await wait(120); // рамка уже убрана со страницы
    const img = await image(await capture(wv));
    const scale = img.width / r.vw;
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(r.w * scale), height: Math.round(r.h * scale) });
    canvas.getContext('2d').drawImage(img, r.x * scale, r.y * scale, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return toBlob(canvas);
  }

  window.LuchShot = { visible, full, area };
})();
