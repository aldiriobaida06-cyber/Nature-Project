/*!
 * Gradient Studio — Green Wings Wallpapers
 *
 * Standalone module, loaded with `defer`.
 *  - Preview is pure CSS: one custom property (--grad-css) is updated, no <canvas> work.
 *  - A <canvas> exists only during Download and is zeroed right after export.
 *  - CSP-safe: no inline scripts, no style="" attributes, no eval, no innerHTML.
 *    Dynamic values go through CSSOM (el.style.setProperty), which strict
 *    `style-src` policies allow.
 *  - The dialog DOM is built lazily on first open, so page load cost is ~0.
 *
 * Hooks into the page via:
 *   [data-gradient-studio-open]  any element that opens the studio
 *   [data-gs-label="nav|navShort"]  nav label spans, translated by this module
 * Language/direction follow <html lang> and <html dir> (observed live).
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Config                                                              */
  /* ------------------------------------------------------------------ */
  const FILE_BASE = 'green-wings-gradient';
  const MAX_SIDE = 4096;          // longest edge cap
  const MAX_PIXELS = 16e6;        // ~16 MP cap (also safe for iOS canvas limits)
  const STRIP_PIXELS = 1 << 20;   // dither ~1 MP per slice, then yield to the UI
  const JPG_QUALITY = 0.95;

  /* ------------------------------------------------------------------ */
  /* i18n (self-contained EN / AR)                                       */
  /* ------------------------------------------------------------------ */
  const I18N = {
    en: {
      nav: 'Gradient Studio',
      navShort: 'Gradients',
      title: 'Gradient Studio',
      close: 'Close',
      preview: 'Gradient preview',
      presets: 'Presets',
      colors: 'Colors',
      color: 'Color {n}',
      third: 'Three colors',
      random: 'Randomize',
      angle: 'Angle',
      size: 'Size',
      myScreen: 'My Screen',
      phone: 'Phone',
      desktop: 'Desktop',
      format: 'Format',
      dither: 'Smooth banding',
      download: 'Download',
      working: 'Rendering…',
      done: 'Download started',
      error: 'Couldn’t create the image. Try a smaller size.'
    },
    ar: {
      nav: 'استوديو التدرجات',
      navShort: 'التدرجات',
      title: 'استوديو التدرجات',
      close: 'إغلاق',
      preview: 'معاينة التدرج',
      presets: 'قوالب جاهزة',
      colors: 'الألوان',
      color: 'اللون {n}',
      third: 'ثلاثة ألوان',
      random: 'عشوائي',
      angle: 'الزاوية',
      size: 'الحجم',
      myScreen: 'شاشتي',
      phone: 'الهاتف',
      desktop: 'سطح المكتب',
      format: 'الصيغة',
      dither: 'تنعيم التدرج',
      download: 'تنزيل',
      working: 'جارٍ إنشاء الصورة…',
      done: 'بدأ التنزيل',
      error: 'تعذّر إنشاء الصورة. جرّب حجمًا أصغر.'
    }
  };

  const getLang = () =>
    (document.documentElement.lang || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';

  const t = (key, vars) => {
    let s = (I18N[getLang()] || I18N.en)[key] ?? I18N.en[key] ?? key;
    if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
    return s;
  };

  /* ------------------------------------------------------------------ */
  /* Presets                                                             */
  /* ------------------------------------------------------------------ */
  const PRESETS = [
    { id: 'canopy',  en: 'Emerald Canopy', ar: 'مظلة الزمرد',     angle: 160, colors: ['#0b3d2e', '#1f8a5b', '#a8e6a1'] },
    { id: 'aurora',  en: 'Aurora Night',   ar: 'ليل الشفق',       angle: 210, colors: ['#0a1030', '#11806a', '#9b7bff'] },
    { id: 'alpine',  en: 'Alpine Sunset',  ar: 'غروب الألب',      angle: 180, colors: ['#1e2a4a', '#c0576b', '#f4b26a'] },
    { id: 'ocean',   en: 'Deep Ocean',     ar: 'المحيط العميق',   angle: 180, colors: ['#4fc3d9', '#0a5f80', '#021526'] },
    { id: 'moss',    en: 'Misty Moss',     ar: 'طحلب ضبابي',      angle: 140, colors: ['#4a6a54', '#dce6dc'] },
    { id: 'meadow',  en: 'Golden Meadow',  ar: 'المرج الذهبي',    angle: 20,  colors: ['#2f5d2a', '#9ab83c', '#f7d774'] }
  ];

  /* ------------------------------------------------------------------ */
  /* Resolution                                                          */
  /* ------------------------------------------------------------------ */
  const fit = (w, h) => {
    const k = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
    return [Math.max(1, Math.floor(w * k)), Math.max(1, Math.floor(h * k))];
  };

  const SIZES = {
    screen: () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(screen.width * dpr) || 1920;
      const h = Math.round(screen.height * dpr) || 1080;
      return fit(w, h);
    },
    phone: () => [1080, 2400],
    desktop: () => [3840, 2160]
  };

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  const state = {
    colors: [...PRESETS[0].colors, '#a8e6a1'].slice(0, 3),
    count: 3,
    angle: PRESETS[0].angle,
    preset: PRESETS[0].id,
    res: 'screen',
    fmt: 'png',
    dither: true,
    busy: false
  };

  const activeColors = () => state.colors.slice(0, state.count);
  const cssGradient = (angle, colors) => `linear-gradient(${angle}deg, ${colors.join(', ')})`;
  const targetSize = () => SIZES[state.res]();

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids) if (kid != null) n.append(kid);
    return n;
  }

  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return '#' + [f(0), f(8), f(4)]
      .map((x) => Math.round(x * 255).toString(16).padStart(2, '0'))
      .join('');
  }

  const tick = () =>
    globalThis.scheduler && typeof scheduler.yield === 'function'
      ? scheduler.yield()
      : new Promise((r) => setTimeout(r, 0));

  /* ------------------------------------------------------------------ */
  /* UI (built lazily)                                                   */
  /* ------------------------------------------------------------------ */
  let dlg = null;
  const refs = { presets: [], dims: {} };
  const labels = []; // translatable nodes

  function L(node, key, attr, vars) {
    labels.push({ node, key, attr, vars });
    return node;
  }

  function applyLang() {
    for (const { node, key, attr, vars } of labels) {
      const s = t(key, vars);
      if (attr) node.setAttribute(attr, s);
      else node.textContent = s;
    }
    const lang = getLang();
    for (const { name, p } of refs.presets) name.textContent = p[lang];
  }

  function applyNav() {
    document.querySelectorAll('[data-gs-label]').forEach((n) => { n.textContent = t(n.dataset.gsLabel); });
  }

  function setStatus(text, isError) {
    if (!refs.status) return;
    refs.status.textContent = text || '';
    refs.status.classList.toggle('is-error', !!isError);
  }

  function option(type, name, value, checked, onChange, ...content) {
    const input = el('input', { type, name, value, class: 'gs-sr' });
    input.checked = checked;
    input.addEventListener('change', onChange);
    return el('label', { class: 'gs-opt' }, input, el('span', { class: 'gs-opt-box' }, ...content));
  }

  function build() {
    if (dlg) return;

    dlg = el('dialog', { class: 'gs-dialog', 'aria-labelledby': 'gs-title' });

    /* header */
    const close = L(el('button', { type: 'button', class: 'gs-close' }, '×'), 'close', 'aria-label');
    close.addEventListener('click', closeDialog);
    const head = el('header', { class: 'gs-head' },
      L(el('h2', { id: 'gs-title' }), 'title'),
      close
    );

    /* preview (pure CSS) */
    const preview = L(el('div', { class: 'gs-preview', role: 'img' }), 'preview', 'aria-label');
    const stage = el('div', { class: 'gs-stage' }, preview);

    /* presets */
    const presetGrid = el('div', { class: 'gs-presets' });
    for (const p of PRESETS) {
      const name = el('span', { class: 'gs-preset-name' });
      const btn = el('button', { type: 'button', class: 'gs-preset', 'aria-pressed': 'false' },
        el('span', { class: 'gs-preset-sw' }), name);
      btn.style.setProperty('--grad-css', cssGradient(p.angle, p.colors));
      btn.addEventListener('click', () => applyPreset(p));
      refs.presets.push({ btn, name, p });
      presetGrid.append(btn);
    }

    /* colors */
    refs.pickers = [0, 1, 2].map((i) => {
      const input = el('input', { type: 'color', class: 'gs-swatch' });
      input.value = state.colors[i];
      L(input, 'color', 'aria-label', { n: i + 1 });
      input.addEventListener('input', () => {
        state.colors[i] = input.value;
        state.preset = null;
        setStatus('');
        update();
      });
      const hex = el('span', { class: 'gs-hex' });
      return { input, hex, wrap: el('label', { class: 'gs-color' }, input, hex) };
    });

    refs.three = el('input', { type: 'checkbox' });
    refs.three.checked = state.count === 3;
    refs.three.addEventListener('change', () => {
      state.count = refs.three.checked ? 3 : 2;
      state.preset = null;
      setStatus('');
      update();
    });

    const random = L(el('button', { type: 'button', class: 'gs-btn' }), 'random');
    random.addEventListener('click', randomize);

    const colorsSec = el('section', { class: 'gs-sec' },
      L(el('h3', { class: 'gs-label' }), 'colors'),
      el('div', { class: 'gs-colors' }, ...refs.pickers.map((p) => p.wrap)),
      el('div', { class: 'gs-row' },
        el('label', { class: 'gs-check' }, refs.three, L(el('span'), 'third')),
        random
      )
    );

    /* angle */
    refs.angle = el('input', { type: 'range', min: 0, max: 360, step: 1, id: 'gs-angle', class: 'gs-range' });
    refs.angle.value = state.angle;
    refs.angleOut = el('output', { for: 'gs-angle', class: 'gs-angle-val', dir: 'ltr' });
    refs.angle.addEventListener('input', () => {
      state.angle = +refs.angle.value;
      state.preset = null;
      setStatus('');
      update();
    });
    const angleSec = el('section', { class: 'gs-sec' },
      el('div', { class: 'gs-rowhead' },
        L(el('label', { for: 'gs-angle', class: 'gs-label' }), 'angle'),
        refs.angleOut
      ),
      refs.angle
    );

    /* size */
    const sizeOpts = el('div', { class: 'gs-opts' });
    for (const [key, labelKey] of [['screen', 'myScreen'], ['phone', 'phone'], ['desktop', 'desktop']]) {
      const dim = el('span', { class: 'gs-dim', dir: 'ltr' });
      refs.dims[key] = dim;
      sizeOpts.append(option('radio', 'gs-res', key, state.res === key, () => {
        state.res = key;
        setStatus('');
        updateSize();
      }, L(el('span', { class: 'gs-opt-name' }), labelKey), dim));
    }
    const sizeSec = el('fieldset', { class: 'gs-sec' },
      L(el('legend', { class: 'gs-label' }), 'size'), sizeOpts);

    /* format */
    refs.dither = el('input', { type: 'checkbox' });
    refs.dither.checked = state.dither;
    refs.dither.addEventListener('change', () => { state.dither = refs.dither.checked; });
    const fmtOpts = el('div', { class: 'gs-opts' });
    for (const f of ['png', 'jpg']) {
      fmtOpts.append(option('radio', 'gs-fmt', f, state.fmt === f, () => { state.fmt = f; },
        el('span', { class: 'gs-opt-name' }, f.toUpperCase())));
    }
    const fmtSec = el('fieldset', { class: 'gs-sec' },
      L(el('legend', { class: 'gs-label' }), 'format'),
      fmtOpts,
      el('label', { class: 'gs-check' }, refs.dither, L(el('span'), 'dither'))
    );

    const panel = el('div', { class: 'gs-panel' },
      el('section', { class: 'gs-sec' }, L(el('h3', { class: 'gs-label' }), 'presets'), presetGrid),
      colorsSec, angleSec, sizeSec, fmtSec
    );

    /* footer */
    refs.status = el('p', { class: 'gs-status', role: 'status', 'aria-live': 'polite' });
    refs.download = L(el('button', { type: 'button', class: 'gs-btn gs-btn-primary' }), 'download');
    refs.download.addEventListener('click', download);
    const foot = el('footer', { class: 'gs-foot' }, refs.status, refs.download);

    dlg.append(el('div', { class: 'gs-shell' }, head, el('div', { class: 'gs-body' }, stage, panel), foot));

    /* backdrop click + scroll lock bookkeeping */
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(); });
    dlg.addEventListener('close', () => document.documentElement.classList.remove('gs-lock'));

    document.body.append(dlg);
  }

  function openDialog() {
    build();
    if (dlg.open) return;
    applyLang();
    updateSize();
    update();
    setStatus('');
    document.documentElement.classList.add('gs-lock');
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function closeDialog() {
    if (!dlg) return;
    if (typeof dlg.close === 'function') dlg.close();
    else { dlg.removeAttribute('open'); document.documentElement.classList.remove('gs-lock'); }
  }

  /* ------------------------------------------------------------------ */
  /* Live preview — touches only CSS custom properties                   */
  /* ------------------------------------------------------------------ */
  function update() {
    dlg.style.setProperty('--grad-css', cssGradient(state.angle, activeColors()));
    if (+refs.angle.value !== state.angle) refs.angle.value = state.angle;
    refs.angleOut.textContent = state.angle + '°';
    refs.pickers.forEach((p, i) => {
      if (p.input.value !== state.colors[i]) p.input.value = state.colors[i];
      p.hex.textContent = state.colors[i].toUpperCase();
    });
    refs.pickers[2].wrap.hidden = state.count !== 3;
    refs.three.checked = state.count === 3;
    for (const { btn, p } of refs.presets) btn.setAttribute('aria-pressed', String(state.preset === p.id));
  }

  function updateSize() {
    const [pw, ph] = targetSize();
    dlg.style.setProperty('--gs-r', (pw / ph).toFixed(4));
    for (const key of Object.keys(refs.dims)) {
      const [w, h] = SIZES[key]();
      refs.dims[key].textContent = `${w}×${h}`;
    }
  }

  function applyPreset(p) {
    const cols = p.colors.slice();
    state.count = cols.length;
    while (cols.length < 3) cols.push(state.colors[cols.length]);
    state.colors = cols;
    state.angle = p.angle;
    state.preset = p.id;
    setStatus('');
    update();
  }

  function randomize() {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const h = rnd(0, 360);
    const spread = rnd(25, 70) * (Math.random() < 0.5 ? -1 : 1);
    const hues = [h, h + spread, h + spread * rnd(1.6, 2.4)];
    const lights = [rnd(14, 28), rnd(38, 52), rnd(64, 84)];
    if (Math.random() < 0.5) lights.reverse();
    state.colors = hues.map((hh, i) => hslToHex(hh, rnd(45, 80), lights[i]));
    state.angle = Math.round(rnd(0, 360));
    state.preset = null;
    setStatus('');
    update();
  }

  /* ------------------------------------------------------------------ */
  /* Rendering (offscreen canvas, only while downloading)                */
  /* ------------------------------------------------------------------ */

  // Same geometry as CSS linear-gradient(<angle>deg, …): 0° = up, clockwise,
  // gradient line length = |w·sin a| + |h·cos a|, centred on the box.
  function gradientLine(w, h, deg) {
    const a = (deg * Math.PI) / 180;
    const sx = Math.sin(a), sy = -Math.cos(a);
    const len = Math.abs(w * sx) + Math.abs(h * sy);
    const cx = w / 2, cy = h / 2;
    return [cx - (sx * len) / 2, cy - (sy * len) / 2, cx + (sx * len) / 2, cy + (sy * len) / 2];
  }

  async function renderCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) { canvas.width = 0; canvas.height = 0; throw new Error('no 2d context'); }

    const [x0, y0, x1, y1] = gradientLine(w, h, state.angle);
    const cols = activeColors();

    if (!state.dither) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      cols.forEach((c, i) => g.addColorStop(i / (cols.length - 1), c));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return canvas;
    }

    /*
     * Anti-banding: evaluate the gradient in floating point and add ±1 LSB
     * triangular noise *before* rounding to 8 bits (true dithering, so band
     * edges dissolve instead of just getting grain on top). Done in ~1 MP
     * slices with a yield in between so the page never freezes.
     */
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const dt = ux / len;
    const rgb = cols.map(hexToRgb);
    const two = rgb.length === 2;
    const [c0, c1, c2] = rgb;
    const rows = Math.max(1, Math.floor(STRIP_PIXELS / w));
    let seed = (Math.random() * 4294967295) >>> 0 || 123456789; // xorshift32
    let img = null;

    for (let y = 0; y < h; y += rows) {
      const sh = Math.min(rows, h - y);
      if (!img || img.height !== sh) img = ctx.createImageData(w, sh);
      const d = img.data;
      let p = 0;
      for (let r = 0; r < sh; r++) {
        let tt = ((0.5 - x0) * ux + (y + r + 0.5 - y0) * uy) / len;
        for (let x = 0; x < w; x++, tt += dt) {
          const k = tt < 0 ? 0 : tt > 1 ? 1 : tt;
          let a, b, u;
          if (two) { a = c0; b = c1; u = k; }
          else if (k < 0.5) { a = c0; b = c1; u = k * 2; }
          else { a = c1; b = c2; u = (k - 0.5) * 2; }

          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          const n = (seed & 0xffff) / 65536 + (seed >>> 16) / 65536 - 1; // (-1, 1), triangular

          d[p]     = a[0] + (b[0] - a[0]) * u + n;
          d[p + 1] = a[1] + (b[1] - a[1]) * u + n;
          d[p + 2] = a[2] + (b[2] - a[2]) * u + n;
          d[p + 3] = 255;
          p += 4;
        }
      }
      ctx.putImageData(img, 0, y);
      await tick();
    }
    return canvas;
  }

  const freeCanvas = (c) => { if (c) { c.width = 0; c.height = 0; } };

  const toBlob = (canvas, type, quality) =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename, rel: 'noopener' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000); // give the browser time to start the save
  }

  async function download() {
    if (state.busy) return;
    state.busy = true;
    refs.download.disabled = true;
    refs.download.setAttribute('aria-busy', 'true');
    setStatus(t('working'));

    let canvas = null;
    try {
      const [w, h] = targetSize();
      const jpg = state.fmt === 'jpg';
      canvas = await renderCanvas(w, h);
      const blob = await toBlob(canvas, jpg ? 'image/jpeg' : 'image/png', jpg ? JPG_QUALITY : undefined);
      freeCanvas(canvas); // release the pixel buffer immediately
      canvas = null;
      if (!blob) throw new Error('export failed');
      saveBlob(blob, `${FILE_BASE}.${jpg ? 'jpg' : 'png'}`);
      setStatus(t('done'));
    } catch (err) {
      setStatus(t('error'), true);
    } finally {
      freeCanvas(canvas); // no-op unless an error skipped the early release
      state.busy = false;
      refs.download.disabled = false;
      refs.download.removeAttribute('aria-busy');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest && e.target.closest('[data-gradient-studio-open]');
    if (!trigger) return;
    e.preventDefault();
    openDialog();
  });

  new MutationObserver(() => {
    applyNav();
    if (dlg) { applyLang(); updateSize(); setStatus(''); }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });

  applyNav();
})();