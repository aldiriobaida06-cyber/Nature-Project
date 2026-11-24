'use strict';

/* =====================================================================
   Smart Hover Preloading
   Load AFTER script.js and blur-tool.js:
     <script src="/static/js/smart-preload.js?v1" defer></script>

   Warms the browser cache with the exact full-size image the Lightbox will ask for, the moment a
   visitor shows intent to open a card:
   - mouse / pen : pointer rests on a card for 150 ms (leaving earlier cancels, so fast scrolling costs nothing)
   - touch       : touchstart (a tap is about to open the card)
   Zero waste: off on Data Saver / 2g, each URL at most once (Set capped at 50), max 2 downloads at a time.
   Uses one global from script.js: wallpaperRegistry (Map: card key -> wallpaper metadata).
   ===================================================================== */
(function () {
    const grid = document.querySelector('.grid-layout');
    if (!grid || typeof wallpaperRegistry === 'undefined') return;

    const HOVER_DELAY = 150;        // ms the pointer must rest on a card
    const MAX_CONCURRENT = 2;       // simultaneous preloads
    const MAX_REMEMBERED = 50;      // size of the "already preloaded" Set
    const IGNORE_TOUCH_ON = '.favorite-btn, .download-btn, a';   // taps on these do not open the Lightbox

    const seen = new Set();         // URLs already preloaded (or on their way)
    const inflight = new Set();     // Image objects currently downloading (also keeps them from being garbage-collected)
    let pending = '';               // at most ONE waiting URL: the newest intent wins, older ones are dropped
    let timer = 0;
    let enabled = false;

    /* ---------- network / data-saver awareness ---------- */

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;

    function networkAllows() {
        try {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-data: reduce)').matches) return false;
        } catch { /* unsupported query: ignore */ }
        if (!connection) return true;                                   // Safari / Firefox: no Network Information API
        if (connection.saveData === true) return false;
        return connection.effectiveType !== '2g' && connection.effectiveType !== 'slow-2g';
    }

    /* ---------- which URL does the Lightbox use? ----------
       Same rule as renderDetail() in script.js:
         full    = meta.fullUrl || meta.imageUrl   (Unsplash: sized URL, uploads: the original file)
         preview = meta.thumbUrl || full           (already in the cache from the grid)
       If both are the same file there is nothing left to download. */

    function lightboxUrlFor(card) {
        if (!card || !card.isConnected) return '';
        const meta = wallpaperRegistry.get(card.dataset.key);
        if (!meta) return '';
        const full = meta.fullUrl || meta.imageUrl;
        const preview = meta.thumbUrl || full;
        if (!full || full === preview) return '';
        try {
            const u = new URL(full, location.href);
            // Only https or same-origin http(s): never data:, blob:, javascript: ...
            if (u.protocol !== 'https:' && u.origin !== location.origin) return '';
            return full;                                                // unchanged string = identical cache key to the Lightbox's request
        } catch { return ''; }
    }

    /* ---------- preload queue ---------- */

    function remember(url) {
        seen.add(url);
        if (seen.size > MAX_REMEMBERED) seen.delete(seen.values().next().value);   // drop the oldest
    }

    function start(url) {
        // Plain `new Image()` on purpose: NO crossOrigin, exactly like the Lightbox's own loader, so the
        // browser re-uses this download for it instead of fetching a second copy.
        const img = new Image();
        img.decoding = 'async';
        if ('fetchPriority' in img) img.fetchPriority = 'low';          // never compete with the grid's own images

        const done = ok => {
            img.onload = img.onerror = null;
            inflight.delete(img);
            if (!ok) seen.delete(url);                                  // a failed download may be retried later
            next();
        };
        img.onload = () => done(true);
        img.onerror = () => done(false);

        inflight.add(img);
        img.src = url;
    }

    function next() {
        if (!enabled || !pending || inflight.size >= MAX_CONCURRENT) return;
        const url = pending;
        pending = '';
        start(url);
    }

    function preload(url) {
        if (!enabled || !url || seen.has(url)) return;                  // deduplicated: never twice
        remember(url);
        if (inflight.size < MAX_CONCURRENT) { start(url); return; }
        if (pending) seen.delete(pending);                              // replaced before it ever ran: allow it again later
        pending = url;
    }

    /* ---------- intent detection (event delegation on the grid) ----------
       pointerenter / pointerleave do not bubble, so they are caught in the CAPTURE phase on the grid.
       e.target is the element that was entered, so `.card` itself is what we look for. Cards added by
       infinite scroll, the home mix or favorites need no extra wiring. */

    function onPointerEnter(e) {
        if (e.pointerType === 'touch') return;                          // touch is handled by touchstart
        const card = e.target;
        if (!card.matches || !card.matches('.card')) return;
        clearTimeout(timer);
        timer = setTimeout(() => { timer = 0; preload(lightboxUrlFor(card)); }, HOVER_DELAY);
    }

    function onPointerLeave(e) {
        if (e.pointerType === 'touch') return;
        if (!e.target.matches || !e.target.matches('.card')) return;
        clearTimeout(timer);                                            // left before 150 ms: no request at all
        timer = 0;
    }

    function onTouchStart(e) {
        const target = e.target;
        if (!target.closest || target.closest(IGNORE_TOUCH_ON)) return;
        preload(lightboxUrlFor(target.closest('.card')));               // immediately: a tap opens the Lightbox
    }

    /* ---------- on / off (follows Data Saver and connection changes live) ---------- */

    function enable() {
        grid.addEventListener('pointerenter', onPointerEnter, true);
        grid.addEventListener('pointerleave', onPointerLeave, true);
        grid.addEventListener('touchstart', onTouchStart, { passive: true });
    }

    function disable() {
        grid.removeEventListener('pointerenter', onPointerEnter, true);
        grid.removeEventListener('pointerleave', onPointerLeave, true);
        grid.removeEventListener('touchstart', onTouchStart);
        clearTimeout(timer);
        timer = 0;
        pending = '';
    }

    function sync() {
        const ok = networkAllows();
        if (ok && !enabled) { enabled = true; enable(); }
        else if (!ok && enabled) { enabled = false; disable(); }
    }

    sync();
    if (connection && typeof connection.addEventListener === 'function') connection.addEventListener('change', sync);
})();