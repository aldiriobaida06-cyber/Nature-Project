'use strict';

/* =====================================================================
   Smart Background Blur Tool (Lightbox)
   Load AFTER script.js:  <script src="/static/js/blur-tool.js?v1" defer></script>

   - Live preview: CSS filter + transform on #modalImg only (GPU, no <canvas> while dragging).
   - Download: blur = 0 -> the existing handler in script.js runs untouched.
               blur > 0 -> this file renders the image on an off-screen <canvas>, saves it, frees it.
   Uses these globals from script.js: TRANSLATIONS, applyI18n, t, showToast, trackDownload,
   decodeImage, coverRect, smartSize, sizedUrl, wallpaperRegistry, lbItems, lbIndex.
   ===================================================================== */
(function () {
    const range = document.getElementById('blurRange');
    const out = document.getElementById('blurValue');
    const img = document.getElementById('modalImg');
    if (!range || !out || !img) return;

    const MAX_BLUR = 30;
    const PREVIEW_ZOOM = 1.05;            // hides the faded edges the blur creates
    const MAX_CANVAS_PIXELS = 16000000;   // iOS Safari canvas limit is ~16.7 MP
    const BACKDROP_W = 48;

    Object.assign(TRANSLATIONS.en, {
        blur_label: 'Background blur',
        blur_aria: 'Blur amount',
        dl_blur_fail: 'Could not create the blurred image. Please try again, or set the blur to 0.'
    });
    Object.assign(TRANSLATIONS.ar, {
        blur_label: 'تمويه الخلفية',
        blur_aria: 'درجة التمويه',
        dl_blur_fail: 'تعذّر إنشاء الصورة المموّهة. حاول مرة أخرى أو اضبط التمويه على 0.'
    });
    applyI18n(range.closest('.blur-tool') || document);

    // Safari has no ctx.filter: detect it (read-back test) and use a down/up-scale fallback.
    const FILTER_OK = (() => {
        try {
            const ctx = document.createElement('canvas').getContext('2d');
            if (!ctx || !('filter' in ctx)) return false;
            ctx.filter = 'blur(2px)';
            return ctx.filter === 'blur(2px)';
        } catch { return false; }
    })();

    /* ---------- live preview (CSS only) ---------- */

    function setBlur(raw) {
        const v = Math.max(0, Math.min(MAX_BLUR, Math.round(Number(raw) || 0)));
        range.value = String(v);
        range.style.setProperty('--pct', (v / MAX_BLUR * 100) + '%');
        range.setAttribute('aria-valuetext', v + ' px');
        out.textContent = v + 'px';
        if (v > 0) {
            img.style.filter = `blur(${v}px)`;
            img.style.transform = `scale(${PREVIEW_ZOOM})`;
            img.classList.add('is-blurred');
        } else {
            img.style.filter = '';
            img.style.transform = '';
            img.classList.remove('is-blurred');
        }
    }

    range.addEventListener('input', () => setBlur(range.value));
    // Arrow keys on the slider must not also flip to the previous / next wallpaper.
    range.addEventListener('keydown', e => { if (e.key.startsWith('Arrow')) e.stopPropagation(); });

    window.GWBlur = { reset: () => setBlur(0), value: () => Number(range.value) };
    setBlur(0);

    /* ---------- canvas helpers ---------- */

    function capDims(w, h) {
        const px = w * h;
        if (px <= MAX_CANVAS_PIXELS) return { w, h };
        const k = Math.sqrt(MAX_CANVAS_PIXELS / px);
        return { w: Math.max(1, Math.floor(w * k)), h: Math.max(1, Math.floor(h * k)) };
    }

    // Width (CSS px) at which the whole photo is shown in the preview (object-fit: contain letterboxing).
    function previewWidth(meta) {
        const nw = img.naturalWidth || (meta && meta.width) || 0;
        const nh = img.naturalHeight || (meta && meta.height) || 0;
        const cw = img.clientWidth, ch = img.clientHeight;
        if (!nw || !nh || !cw || !ch) return cw || 0;
        return Math.min(cw, ch * nw / nh);
    }

    // Same-origin files just load. External ones: a cache-buster stops the browser from re-using a
    // cached NON-CORS copy of the image for this CORS request.
    function corsFresh(url) {
        try {
            const u = new URL(url, location.href);
            if (u.origin !== location.origin) u.searchParams.set('cw', '1');
            return u.toString();
        } catch { return url; }
    }

    function loadImageCors(url) {
        return new Promise((resolve, reject) => {
            const el = new Image();
            el.crossOrigin = 'anonymous';           // required, or the canvas gets tainted and toBlob() throws
            el.decoding = 'async';
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Image failed to load'));
            el.src = corsFresh(url);
        });
    }

    // Preferred: fetch (CORS) -> Blob -> decode. Pixels then come from memory, so the canvas can never be
    // tainted and no blob: image URL is needed (works with the strict CSP). Fallback: <img crossOrigin="anonymous">.
    async function loadSource(url) {
        try {
            const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await decodeImage(await res.blob());
        } catch (err) {
            console.warn('Fetch path failed, trying a CORS <img>:', err);
            return loadImageCors(url);
        }
    }

    // Very small copy of the photo, stretched under the blurred one, so edges fade into the photo's own
    // colours instead of transparent (= black in a JPEG).
    function paintBackdrop(ctx, source, rect, outW, outH) {
        const tiny = document.createElement('canvas');
        tiny.width = BACKDROP_W;
        tiny.height = Math.max(1, Math.round(BACKDROP_W * outH / outW));
        const tctx = tiny.getContext('2d');
        if (tctx) {
            tctx.imageSmoothingQuality = 'high';
            tctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, tiny.width, tiny.height);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(tiny, 0, 0, outW, outH);
        }
        tiny.width = tiny.height = 0;
    }

    // Safari fallback: repeated halving, then one smooth upscale (approximates a Gaussian blur).
    function softBlur(canvas, ctx, sigma) {
        const w = canvas.width, h = canvas.height;
        const factor = Math.max(2, sigma * 2.4);
        const tw = Math.max(1, Math.round(w / factor));
        const th = Math.max(1, Math.round(h / factor));
        const temps = [];
        let cur = canvas, cw = w, ch = h;
        while (cw > tw || ch > th) {
            const nw = Math.max(tw, Math.ceil(cw / 2));
            const nh = Math.max(th, Math.ceil(ch / 2));
            const c = document.createElement('canvas');
            c.width = nw;
            c.height = nh;
            const cx = c.getContext('2d');
            cx.imageSmoothingQuality = 'high';
            cx.drawImage(cur, 0, 0, nw, nh);
            temps.push(c);
            cur = c; cw = nw; ch = nh;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(cur, 0, 0, w, h);
        temps.forEach(c => { c.width = c.height = 0; });
    }

    /* ---------- render ---------- */

    async function renderBlurredBlob(button, meta, blur) {
        let url, outW = 0, outH = 0, cover = false;

        const screenMeta = button.dataset.mode === 'screen' ? wallpaperRegistry.get(button.dataset.key) : null;
        if (screenMeta && screenMeta.rawUrl && screenMeta.width && screenMeta.height) {
            // "Download for my screen": same size + same centred crop as the normal screen download.
            const size = smartSize(screenMeta);
            const scale = Math.min(1, Math.max(size.w / screenMeta.width, size.h / screenMeta.height));
            url = sizedUrl(screenMeta.rawUrl, { w: Math.max(1, Math.ceil(screenMeta.width * scale)), fit: 'max', fm: 'jpg', q: 90 });
            outW = size.w;
            outH = size.h;
            cover = true;
        } else {
            // "Download original" / uploads: full resolution, limited only by what a canvas can hold.
            url = button.dataset.downloadUrl;
            if (!url) throw new Error('No download URL');
            if (meta && meta.rawUrl && meta.width && meta.height) {
                const c = capDims(meta.width, meta.height);
                url = sizedUrl(url, { w: c.w, fit: 'max', fm: 'jpg', q: 90 });
            }
        }

        const source = await loadSource(url);
        let canvas = null;
        try {
            const iw = source.naturalWidth || source.width;
            const ih = source.naturalHeight || source.height;
            if (!iw || !ih) throw new Error('Empty image');
            if (!cover) ({ w: outW, h: outH } = capDims(iw, ih));
            const rect = cover ? coverRect(iw, ih, outW, outH) : { sx: 0, sy: 0, sw: iw, sh: ih };

            // Blur radius scaled from preview pixels to canvas pixels, so the file looks like the preview.
            const dispW = previewWidth(meta) || iw;
            const sigma = Math.max(0.5, blur * (iw / dispW) * (outW / rect.sw) * PREVIEW_ZOOM);

            canvas = document.createElement('canvas');
            canvas.width = outW;
            canvas.height = outH;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas not available');

            paintBackdrop(ctx, source, rect, outW, outH);

            const dw = outW * PREVIEW_ZOOM, dh = outH * PREVIEW_ZOOM;      // same 5% zoom as the preview
            const dx = (outW - dw) / 2, dy = (outH - dh) / 2;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            if (FILTER_OK) {
                ctx.filter = `blur(${sigma}px)`;
                ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, dx, dy, dw, dh);
                ctx.filter = 'none';
            } else {
                ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, dx, dy, dw, dh);
                softBlur(canvas, ctx, sigma);
            }

            return await new Promise((resolve, reject) => {
                canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.92);
            });
        } finally {
            if (typeof source.close === 'function') source.close();
            if (canvas) { canvas.width = 0; canvas.height = 0; }           // free the pixel buffer right away
        }
    }

    function saveBlob(blob, filename) {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }

    async function downloadBlurred(button, blur) {
        const meta = lbItems[lbIndex];
        const label = button.querySelector('.btn-label') || button;
        const originalText = label.textContent;
        label.textContent = t('downloading');
        button.disabled = true;
        try {
            const blob = await renderBlurredBlob(button, meta, blur);
            saveBlob(blob, `green-wings-${button.dataset.photoId || Date.now()}-blurred.jpg`);
            trackDownload(button.dataset.photoId);
            showToast(t('dl_ok'));
        } catch (error) {
            console.error('Blurred download failed:', error);
            showToast(t('dl_blur_fail'), true);
        } finally {
            const key = label.dataset && label.dataset.i18n;
            if (key) {
                let vars;
                try { vars = label.dataset.i18nVars ? JSON.parse(label.dataset.i18nVars) : undefined; } catch { /* ignore */ }
                label.textContent = t(key, vars);
            } else {
                label.textContent = originalText;
            }
            button.disabled = false;
        }
    }

    // Capture phase: runs BEFORE the existing download handler in script.js. Blur 0 -> we return and
    // that handler runs exactly as before. Blur > 0 -> we take over and stop it.
    document.addEventListener('click', e => {
        const button = e.target.closest('#detailActions .download-btn');
        if (!button || button.dataset.action === 'share' || button.disabled) return;
        const blur = Number(range.value);
        if (!(blur > 0)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        downloadBlurred(button, blur);
    }, true);
})();