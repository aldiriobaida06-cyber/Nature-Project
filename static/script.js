'use strict';

const $ = sel => document.querySelector(sel);

const searchInput = $('#search-input');
const searchBtn = $('#search-btn');
const container = $('.grid-layout');
const sectionTitle = $('#section-title');
const loadMoreBtn = $('#loadMoreBtn');
const orientationBar = $('#orientation-filter');
const hero = $('.hero-section');
const header = $('.main-header');
const uploadDetails = $('.upload-trigger-wrapper');

const DEFAULT_TITLE = sectionTitle.textContent;
const BASE_DOC_TITLE = document.title;
const HOME_HTML = container.innerHTML;     // snapshot of the static cards so "Home" can restore them
const MAX_EMPTY_RUNS = 3;                  // fully-duplicate pages "Load more" skips automatically
const THUMB_WIDTH = 800;                   // card images
const MAX_SCREEN_EDGE = 3840;              // "download for my screen" never exceeds 4K
const UTM = { utm_source: 'green_wings', utm_medium: 'referral' };   // required by Unsplash for attribution links

// No API key here: the server talks to Unsplash (GET /api/photos).

/* ---------- header height -> CSS variable ---------- */

function syncHeaderHeight() {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
}
syncHeaderHeight();
if ('ResizeObserver' in window) {
    new ResizeObserver(syncHeaderHeight).observe(header);
} else {
    window.addEventListener('resize', syncHeaderHeight);
}

/* ---------- toast ---------- */

function showToast(message, isError = false) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification' + (isError ? ' toast-error' : '');
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

/* ---------- URL helpers (Unsplash images) ---------- */

const isUnsplashHost = u => u.hostname === 'unsplash.com' || u.hostname.endsWith('.unsplash.com');

// Adds/overrides imgix parameters (w, h, q, fm, fit ...) on an Unsplash image URL.
function sizedUrl(url, params) {
    try {
        const u = new URL(url, location.href);
        if (!isUnsplashHost(u)) return url;
        Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
        return u.toString();
    } catch { return url; }
}

// Stable identity of a photo. Unsplash URLs carry changing query params (ixid ...), so only the path counts.
function photoKey(url) {
    try {
        const u = new URL(url, location.href);
        if (isUnsplashHost(u)) return u.origin + u.pathname;
    } catch { /* fall through */ }
    return url;
}

// Only https links to unsplash.com, with the required UTM parameters (also blocks javascript: URLs).
function unsplashLink(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' || !isUnsplashHost(u)) return null;
        Object.entries(UTM).forEach(([k, v]) => u.searchParams.set(k, v));
        return u.toString();
    } catch { return null; }
}

/* ---------- smart download: sized for THIS device's screen ---------- */

function screenTarget() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let w = Math.round(screen.width * dpr);
    let h = Math.round(screen.height * dpr);
    const longEdge = Math.max(w, h);
    if (longEdge > MAX_SCREEN_EDGE) {
        const k = MAX_SCREEN_EDGE / longEdge;
        w = Math.round(w * k);
        h = Math.round(h * k);
    }
    return { w, h };
}

// Never larger than the photo itself (no upscaling), always the exact aspect ratio of the screen.
function smartSize(meta) {
    const t = screenTarget();
    let k = 1;
    if (meta.width && meta.height) k = Math.min(1, meta.width / t.w, meta.height / t.h);
    return { w: Math.max(1, Math.floor(t.w * k)), h: Math.max(1, Math.floor(t.h * k)) };
}

function smartUrl(meta, size) {
    return sizedUrl(meta.rawUrl, { w: size.w, h: size.h, fit: 'crop', crop: 'entropy', fm: 'jpg', q: 85 });
}

const lightboxWidth = () =>
    Math.max(1080, Math.min(2560, Math.round(window.innerWidth * Math.min(window.devicePixelRatio || 1, 2))));

/* ---------- state + orientation ---------- */

const ORIENTATIONS = ['any', 'landscape', 'portrait'];
const ORIENTATION_KEY = 'greenWingsOrientation';

function loadOrientation() {
    try {
        const v = localStorage.getItem(ORIENTATION_KEY);
        return ORIENTATIONS.includes(v) ? v : 'any';
    } catch { return 'any'; }
}

const wallpaperRegistry = new Map();   // imageUrl -> metadata (favorites, smart download)
let currentView = 'home';              // 'home' | 'search' | 'favorites'
let latestRequest = 0;                 // ignores out-of-date responses
let currentQuery = '';
let nextPage = null;                   // next Unsplash page for "Load more" (null = no more)
let orientation = loadOrientation();   // 'any' | 'landscape' | 'portrait'
let uploadedWallpapers = [];

function paintOrientation() {
    if (!orientationBar) return;
    orientationBar.querySelectorAll('button[data-orientation]').forEach(b => {
        const on = b.dataset.orientation === orientation;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
    });
}

function storeOrientation() {
    try { localStorage.setItem(ORIENTATION_KEY, orientation); } catch { /* storage unavailable */ }
}

/* ---------- URL <-> state (?q=forest&o=portrait, ?view=favorites) ---------- */

function readUrlState() {
    const p = new URLSearchParams(location.search);
    const o = p.get('o');
    return {
        q: (p.get('q') || '').trim().slice(0, 100).toLowerCase(),
        o: ORIENTATIONS.includes(o) ? o : null,
        view: p.get('view')
    };
}

function currentUrl() {
    const p = new URLSearchParams();
    if (currentView === 'search' && currentQuery) {
        p.set('q', currentQuery);
        if (orientation !== 'any') p.set('o', orientation);
    } else if (currentView === 'favorites') {
        p.set('view', 'favorites');
    }
    const s = p.toString();
    return location.pathname + (s ? '?' + s : '');
}

// mode: 'push' (new history entry), 'replace' (same entry) or null (URL already correct, e.g. back button)
function syncUrl(mode) {
    if (!mode) return;
    const url = currentUrl();
    if (url === location.pathname + location.search) return;
    history[mode === 'push' ? 'pushState' : 'replaceState']({}, '', url);
}

function applyUrlState(initial = false) {
    const { q, o, view } = readUrlState();
    if (o) { orientation = o; paintOrientation(); }
    if (q) {
        searchInput.value = q;
        fetchWallpapers(q, { historyMode: null });
    } else if (view === 'favorites') {
        showFavoritesPage(null);
    } else if (!initial) {
        showHome(null);
    }
}

window.addEventListener('popstate', () => applyUrlState());

/* ---------- views ---------- */

function setView(view, title, navKey) {
    currentView = view;
    sectionTitle.textContent = title || DEFAULT_TITLE;
    hero.style.display = view === 'home' ? '' : 'none';
    if (orientationBar) orientationBar.hidden = view !== 'search';
    if (view !== 'search') loadMoreBtn.hidden = true;

    document.title = view === 'search' ? `${currentQuery} – ${BASE_DOC_TITLE}`
        : view === 'favorites' ? `Favorites – ${BASE_DOC_TITLE}`
        : BASE_DOC_TITLE;

    document.querySelectorAll('.nav-links a').forEach(a => {
        const on = a.dataset.nav === navKey;
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
}

function showHome(historyMode = 'push') {
    latestRequest++;                   // cancel any search still in flight
    container.innerHTML = HOME_HTML;
    initStaticCards();
    setView('home', DEFAULT_TITLE, 'home');
    syncUrl(historyMode);
    renderUploaded();
    updateFavoriteButtons();
    window.scrollTo({ top: 0 });
}

function showFavoritesPage(historyMode = 'push') {
    latestRequest++;                   // cancel any search still in flight
    setView('favorites', 'Your favorites', 'favorites');
    syncUrl(historyMode);
    displayWallpapers(favorites, {
        heading: 'No Favorites Yet',
        text: 'Tap the heart on any wallpaper to save it here.'
    });
}

/* ---------- messages / errors ---------- */

function showMessage(text, color) {
    container.innerHTML = '';
    const p = document.createElement('p');
    p.style.cssText = `text-align:center;color:${color || 'white'};width:100%;grid-column:1/-1;`;
    p.textContent = text;
    container.appendChild(p);
}

function showError(message, retry) {
    showMessage(message, '#f87171');
    if (retry) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'retry-btn';
        btn.textContent = 'Try again';
        btn.addEventListener('click', retry);
        container.appendChild(btn);
    }
}

/* ---------- Unsplash search (via our own backend) ---------- */

async function fetchWallpapers(query, { append = false, historyMode = 'push', emptyRuns = 0 } = {}) {
    const requestId = ++latestRequest;
    const cleanQuery = (query || 'nature').trim().toLowerCase();
    let retry = false;

    if (append) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Loading...';
    } else {
        currentQuery = cleanQuery;
        nextPage = null;
        setView('search', `Results for “${cleanQuery}”`, cleanQuery);
        syncUrl(historyMode);
        showMessage('Loading...');
    }

    try {
        let url = `/api/photos?query=${encodeURIComponent(cleanQuery)}&page=${append ? nextPage : 1}`;
        if (orientation !== 'any') url += `&orientation=${orientation}`;

        const response = await fetch(url);
        if (requestId !== latestRequest) return;
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const message = typeof err.detail === 'string'
                ? err.detail
                : (append ? 'Could not load more wallpapers.' : 'Failed to load images from server.');
            if (append) showToast(message, true);
            else showError(message, () => fetchWallpapers(cleanQuery, { historyMode: null }));
            return;
        }

        const data = await response.json();
        if (requestId !== latestRequest) return;

        nextPage = data.next_page || null;
        const added = displayWallpapers(Array.isArray(data.results) ? data.results : [], undefined, append);
        loadMoreBtn.hidden = !nextPage;

        // Everything on this page was already shown: quietly fetch the next one.
        if (append && added === 0) {
            if (nextPage && emptyRuns < MAX_EMPTY_RUNS) retry = true;
            else showToast('No more wallpapers found for this search.');
        }
    } catch (error) {
        console.error('Error:', error);
        if (requestId === latestRequest) {
            if (append) showToast('Could not load more wallpapers.', true);
            else showError('Sorry, unable to load images at the moment.', () => fetchWallpapers(cleanQuery, { historyMode: null }));
        }
    } finally {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Load more';
    }

    // Runs after `finally` so the retry's "Loading..." state isn't overwritten.
    if (retry) fetchWallpapers(cleanQuery, { append: true, emptyRuns: emptyRuns + 1 });
}

loadMoreBtn.addEventListener('click', () => {
    if (nextPage) fetchWallpapers(currentQuery, { append: true });
});

/* ---------- orientation filter ---------- */

if (orientationBar) {
    orientationBar.addEventListener('click', e => {
        const btn = e.target.closest('button[data-orientation]');
        if (!btn || btn.dataset.orientation === orientation) return;
        orientation = btn.dataset.orientation;
        storeOrientation();
        paintOrientation();
        if (currentView === 'search') fetchWallpapers(currentQuery, { historyMode: 'replace' });
    });
}

/* ---------- resolution badge ---------- */

function getQualityLabel(w, h) {
    const longEdge = Math.max(w, h);
    if (longEdge >= 3840) return { text: '4K UHD' };
    if (longEdge >= 2560) return { text: '2K QHD' };
    if (longEdge >= 1920) return { text: 'FULL HD' };
    if (longEdge >= 1280) return { text: 'HD', subtle: true };
    return { text: 'SD', subtle: true };
}

// knownW/knownH = real original size (from the API). Cards load resized thumbnails, so measuring
// the loaded image would always say "HD". Without known sizes, full-size images are measured instead.
function attachQualityBadge(card, knownW, knownH) {
    const apply = (w, h) => {
        if (!w || !h || card.querySelector('.quality-badge')) return;
        const { text, subtle } = getQualityLabel(w, h);
        const badge = document.createElement('span');
        badge.className = 'quality-badge' + (subtle ? ' hd-subtle' : '');
        badge.textContent = text;
        card.appendChild(badge);
    };

    if (knownW && knownH) { apply(knownW, knownH); return; }

    const imgEl = card.querySelector('img');
    if (!imgEl || card.dataset.thumb) return;
    if (imgEl.complete) apply(imgEl.naturalWidth, imgEl.naturalHeight);
    else imgEl.addEventListener('load', () => apply(imgEl.naturalWidth, imgEl.naturalHeight), { once: true });
}

/* ---------- rendering (XSS-safe: no innerHTML with dynamic data) ---------- */

function downloadIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    [
        ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
        ['polyline', { points: '7 10 12 15 17 10' }],
        ['line', { x1: 12, y1: 15, x2: 12, y2: 3 }]
    ].forEach(([tag, attrs]) => {
        const el = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        svg.appendChild(el);
    });
    return svg;
}

function makeDownloadButton({ label, url, mode, key, photoId, secondary }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'download-btn' + (secondary ? ' secondary' : '');
    if (url) btn.dataset.downloadUrl = url;
    if (mode) btn.dataset.mode = mode;
    if (key) btn.dataset.key = key;
    if (photoId) btn.dataset.photoId = photoId;
    const text = document.createElement('span');
    text.className = 'btn-label';
    text.textContent = label;
    btn.append(downloadIcon(), text);
    return btn;
}

function makeLink(text, href) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
}

// "Photo by <name> on Unsplash" with links (required by the Unsplash API guidelines).
function buildSubtitle(meta) {
    const p = document.createElement('p');
    const authorHref = meta.authorName && meta.authorUrl ? unsplashLink(meta.authorUrl) : null;
    if (authorHref) {
        p.className = 'attribution';
        p.append('Photo by ', makeLink(meta.authorName, authorHref), ' on ', makeLink('Unsplash', unsplashLink('https://unsplash.com')));
    } else {
        p.textContent = meta.subtitle || '';
    }
    return p;
}

function buildWallpaperCard(meta) {
    const { imageUrl, title } = meta;
    wallpaperRegistry.set(imageUrl, meta);

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.key = imageUrl;                         // used for duplicate detection (via photoKey)
    if (meta.thumbUrl && meta.thumbUrl !== imageUrl) card.dataset.thumb = '1';

    const img = document.createElement('img');
    img.className = 'main-card-img';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = meta.thumbUrl || imageUrl;                 // small version for the grid
    img.dataset.full = meta.fullUrl || imageUrl;         // bigger version for the lightbox
    img.alt = title;
    if (/^#[0-9a-f]{3,8}$/i.test(meta.color || '')) img.style.backgroundColor = meta.color;   // static placeholder

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'favorite-btn';
    favBtn.setAttribute('data-src', imageUrl);
    favBtn.setAttribute('aria-label', 'Add to favorites');
    favBtn.setAttribute('aria-pressed', 'false');
    favBtn.textContent = '🤍';

    const info = document.createElement('div');
    info.className = 'card-info';

    const h3 = document.createElement('h3');
    h3.textContent = title;

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    if (meta.rawUrl && meta.photoId) {
        const { w, h } = smartSize(meta);
        actions.append(
            makeDownloadButton({ label: `Download for my screen (${w}×${h})`, mode: 'screen', key: imageUrl, photoId: meta.photoId }),
            makeDownloadButton({ label: 'Download original', url: meta.rawUrl, photoId: meta.photoId, secondary: true })
        );
    } else {
        actions.append(makeDownloadButton({ label: 'Download Full Size', url: meta.downloadUrl }));
    }

    info.append(h3, buildSubtitle(meta), actions);
    card.append(img, favBtn, info);
    return card;
}

const capitalize = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Accepts: a URL string (legacy favorites), an Unsplash result from /api/photos, or a stored meta object.
function normalizeItem(item) {
    if (typeof item === 'string') {
        return { imageUrl: item, thumbUrl: sizedUrl(item, { w: THUMB_WIDTH, q: 75 }), title: 'Nature Wallpaper', subtitle: 'Favorite', downloadUrl: item };
    }
    if (item && item.urls) {
        const raw = item.urls.raw || '';
        const regular = item.urls.regular || raw;
        if (!regular) return null;
        return {
            imageUrl: regular,
            thumbUrl: raw ? sizedUrl(raw, { w: THUMB_WIDTH, q: 75, fm: 'webp', fit: 'max' }) : regular,
            fullUrl: raw ? sizedUrl(raw, { w: lightboxWidth(), q: 80, fm: 'jpg', fit: 'max' }) : regular,
            rawUrl: raw,
            downloadUrl: raw || regular,
            photoId: item.id,
            title: capitalize(item.description) || 'Nature Wallpaper',
            authorName: item.user?.name,
            authorUrl: item.user?.url,
            subtitle: `By ${item.user?.name || 'Unknown'}`,
            width: item.width,
            height: item.height,
            color: item.color
        };
    }
    if (item && item.imageUrl) {
        return {
            downloadUrl: item.imageUrl,
            title: 'Nature Wallpaper',
            subtitle: 'Favorite',
            ...item,
            thumbUrl: item.thumbUrl || sizedUrl(item.imageUrl, { w: THUMB_WIDTH, q: 75 })
        };
    }
    return null;
}

function uploadMeta(w) {
    return {
        imageUrl: w.image_url,
        thumbUrl: w.thumb_url || w.image_url,     // server-made 800px WebP
        title: w.title || 'Untitled Wallpaper',
        subtitle: w.description || 'Uploaded by a Green Wings visitor',
        downloadUrl: w.image_url,
        width: w.width || undefined,
        height: w.height || undefined
    };
}

function buildEmptyState(heading, text) {
    const box = document.createElement('div');
    box.style.cssText = 'text-align:center;width:100%;padding:60px 20px;color:#94a3b8;grid-column:1/-1;';

    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:2.5rem;margin-bottom:12px;';
    icon.textContent = '🌿';

    const h = document.createElement('h3');
    h.style.cssText = 'color:#f8fafc;margin-bottom:8px;font-size:1.2rem;';
    h.textContent = heading;

    const desc = document.createElement('p');
    desc.style.cssText = 'color:#94a3b8;max-width:400px;margin:0 auto;font-size:0.95rem;';
    desc.textContent = text;

    box.append(icon, h, desc);
    return box;
}

const hasCard = key => !!container.querySelector(`.card[data-key="${CSS.escape(key)}"]`);

// Returns how many NEW cards were added (0 when everything was a duplicate or empty).
function displayWallpapers(items, empty, append = false) {
    if (!append) container.innerHTML = '';

    // Stable keys of everything already shown + everything accepted from this batch:
    // a photo can never be rendered twice, even if it comes back with a different URL.
    const seen = new Set();
    if (append) {
        container.querySelectorAll('.card').forEach(card => {
            if (card.dataset.key) seen.add(photoKey(card.dataset.key));
        });
    }

    const metas = (items || [])
        .map(normalizeItem)
        .filter(Boolean)
        .filter(m => {
            const key = photoKey(m.imageUrl);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    if (metas.length === 0) {
        if (!append) {
            const { heading, text } = empty || {
                heading: 'No Nature Wallpapers Found',
                text: 'We couldn\'t find a match for that search. Try a keyword like "forest", "mountains", "ocean" or "sunset" instead.'
            };
            container.appendChild(buildEmptyState(heading, text));
        }
        return 0;
    }

    // Build off-DOM, insert once: a single layout pass instead of one per card.
    const fragment = document.createDocumentFragment();
    metas.forEach(meta => {
        const card = buildWallpaperCard(meta);
        attachQualityBadge(card, meta.width, meta.height);
        fragment.appendChild(card);
    });
    container.appendChild(fragment);
    updateFavoriteButtons();
    return metas.length;
}

function prependWallpaperCard(wallpaper) {
    if (!wallpaper || !wallpaper.image_url || hasCard(wallpaper.image_url)) return;
    const meta = uploadMeta(wallpaper);
    const card = buildWallpaperCard(meta);
    attachQualityBadge(card, meta.width, meta.height);
    container.prepend(card);
    updateFavoriteButtons();
}

function initStaticCards() {
    container.querySelectorAll('.card').forEach(card => {
        const img = card.querySelector('img');
        const dl = card.querySelector('.download-btn');
        if (img) {
            const src = img.getAttribute('src');
            card.dataset.key = src;
            wallpaperRegistry.set(src, {
                imageUrl: src,
                thumbUrl: src,
                title: card.querySelector('h3')?.textContent || 'Nature Wallpaper',
                subtitle: card.querySelector('p')?.textContent || '',
                downloadUrl: dl?.getAttribute('data-download-url') || src
            });
        }
        attachQualityBadge(card);
    });
}

/* Approved uploads: GET /api/wallpapers -> [{image_url, thumb_url, width, height, title, description}] newest first */
function renderUploaded() {
    if (currentView !== 'home') return;
    [...uploadedWallpapers].reverse().forEach(prependWallpaperCard);
}

async function loadUploadedWallpapers() {
    try {
        const response = await fetch('/api/wallpapers');
        if (!response.ok) return;
        const list = await response.json();
        if (Array.isArray(list)) {
            uploadedWallpapers = list;
            renderUploaded();
        }
    } catch { /* endpoint not available: ignore */ }
}

/* ---------- download handling ---------- */

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

// Unsplash API guidelines: report every download (the server holds the API key).
function trackDownload(photoId) {
    if (!photoId) return;
    fetch(`/api/photos/${encodeURIComponent(photoId)}/download`, { method: 'POST', keepalive: true }).catch(() => {});
}

container.addEventListener('click', async function (e) {
    const button = e.target.closest('.download-btn');
    if (!button) return;
    e.preventDefault();
    if (button.disabled) return;

    let imageUrl = button.getAttribute('data-download-url');
    let sizeTag = '';
    if (button.dataset.mode === 'screen') {
        const meta = wallpaperRegistry.get(button.dataset.key);
        if (meta && meta.rawUrl) {
            const size = smartSize(meta);          // recalculated now (the device may have been rotated)
            imageUrl = smartUrl(meta, size);
            sizeTag = `-${size.w}x${size.h}`;
        }
    }
    if (!imageUrl) return;

    const photoId = button.dataset.photoId;
    const label = button.querySelector('.btn-label') || button;
    const originalText = label.textContent;
    label.textContent = 'Downloading...';
    button.disabled = true;

    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Network response was not ok');

        const blob = await response.blob();
        const ext = EXTENSIONS[blob.type] || 'jpg';
        const blobUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `green-wings-${photoId || Date.now()}${sizeTag}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        trackDownload(photoId);
        showToast('Download successful! You can now set it as your device wallpaper from your downloads folder.');
    } catch (error) {
        console.error('Download failed:', error);
        window.open(imageUrl, '_blank', 'noopener');
        trackDownload(photoId);
        showToast('Download failed, so the image opened in a new tab. Long-press or right-click it to save.', true);
    } finally {
        label.textContent = originalText;
        button.disabled = false;
    }
});

/* ---------- image lightbox (arrows, swipe, keyboard) ---------- */

const imageModal = $('#imageModal');
const modalImg = $('#modalImg');
const closeModalBtn = $('.close-modal');
const prevBtn = $('#prevImg');
const nextBtn = $('#nextImg');

let lbImages = [];
let lbIndex = 0;
let lastFocused = null;

const lightboxOpen = () => imageModal.style.display === 'flex';

function renderLightbox() {
    const img = lbImages[lbIndex];
    modalImg.src = img.dataset.full || img.currentSrc || img.src;
    modalImg.alt = img.alt || '';
    prevBtn.hidden = nextBtn.hidden = lbImages.length < 2;
}

function openLightbox(clickedImg) {
    lbImages = [...container.querySelectorAll('.card img')];
    lbIndex = Math.max(0, lbImages.indexOf(clickedImg));
    lastFocused = document.activeElement;
    renderLightbox();
    imageModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    closeModalBtn.focus();
}

function closeLightbox() {
    imageModal.style.display = 'none';
    modalImg.removeAttribute('src');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
}

function stepLightbox(direction) {
    if (lbImages.length < 2) return;
    lbIndex = (lbIndex + direction + lbImages.length) % lbImages.length;
    renderLightbox();
}

container.addEventListener('click', function (e) {
    const img = e.target.closest('.card img');
    if (img) openLightbox(img);
});

closeModalBtn.addEventListener('click', closeLightbox);
prevBtn.addEventListener('click', () => stepLightbox(-1));
nextBtn.addEventListener('click', () => stepLightbox(1));
imageModal.addEventListener('click', e => { if (e.target === imageModal) closeLightbox(); });

let touchStartX = null;
imageModal.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
imageModal.addEventListener('touchend', e => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
});

document.addEventListener('keydown', function (e) {
    if (lightboxOpen()) {
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') stepLightbox(-1);
        else if (e.key === 'ArrowRight') stepLightbox(1);
    } else if (e.key === 'Escape' && uploadDetails && uploadDetails.open) {
        uploadDetails.open = false;
    }
});

/* ---------- upload popover: close when clicking elsewhere ---------- */

document.addEventListener('click', e => {
    if (uploadDetails && uploadDetails.open && !uploadDetails.contains(e.target)) {
        uploadDetails.open = false;
    }
});

/* ---------- search + navigation ---------- */

searchBtn.addEventListener('click', function () {
    const query = searchInput.value.trim().toLowerCase();
    if (query === '') {
        showToast('Please enter a keyword to search!', true);
        searchInput.focus();
        return;
    }
    searchInput.blur();                  // closes the on-screen keyboard on phones
    window.scrollTo({ top: 0 });
    fetchWallpapers(query);
});

searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') searchBtn.click();
});

function quickSearch(keyword) {
    searchInput.value = keyword;
    searchBtn.click();
}

$('.nav-links').addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link) return;
    if (link.dataset.search) {
        e.preventDefault();
        quickSearch(link.dataset.search);
    } else if (link.dataset.nav === 'home') {
        e.preventDefault();
        showHome();
    } else if (link.dataset.nav === 'favorites') {
        e.preventDefault();
        showFavoritesPage();
    }
});

/* ---------- contact form ---------- */

const usernameInput = $('#usernameInput');
const messageInput = $('#messageInput');
const sendBtn = $('#sendBtn');

sendBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const text = messageInput.value.trim();

    if (!username || !text) {
        showToast('Please enter your name and message first!', true);
        return;
    }

    sendBtn.disabled = true;
    try {
        const response = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, text })
        });

        if (response.ok) {
            showToast('Thank you! Your message has been sent. We will get back to you soon.');
            usernameInput.value = '';
            messageInput.value = '';
        } else {
            const err = await response.json().catch(() => ({}));
            showToast(typeof err.detail === 'string' ? err.detail : 'An error occurred while sending your message.', true);
        }
    } catch (error) {
        console.error('Error', error);
        showToast('Could not connect to the server; ensure that it is running.', true);
    } finally {
        sendBtn.disabled = false;
    }
});

/* ---------- wallpaper upload (saved as "pending" until approved in /admin) ---------- */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;   // convenience only; the server enforces limits too
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_FILE_TEXT = 'Choose Wallpaper (e.g. Alps Mountain.jpg)';

const uploadForm = $('#uploadForm');
if (uploadForm) {
    const fileInput = $('#uploadFile');
    const fileText = $('#uploadFileText');

    fileInput.addEventListener('change', () => {
        fileText.textContent = fileInput.files.length ? fileInput.files[0].name : DEFAULT_FILE_TEXT;
    });

    uploadForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const titleInput = $('#uploadTitle');
        const descriptionInput = $('#uploadDescription');
        const submitBtn = $('#uploadSubmitBtn');

        if (!fileInput.files || fileInput.files.length === 0) {
            showToast('Please choose an image file to upload.', true);
            return;
        }
        const file = fileInput.files[0];
        if (!UPLOAD_TYPES.includes(file.type)) {
            showToast('Only JPG, PNG or WEBP images can be uploaded.', true);
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            showToast('That image is too large (max 10 MB).', true);
            return;
        }

        const formData = new FormData();
        formData.append('title', titleInput.value.trim() || 'Untitled Wallpaper');
        formData.append('description', descriptionInput.value.trim());
        formData.append('file', file);

        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Uploading...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/upload-wallpaper', { method: 'POST', body: formData });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(typeof err.detail === 'string' ? err.detail : 'Upload failed');
            }

            uploadForm.reset();
            fileText.textContent = DEFAULT_FILE_TEXT;
            if (uploadDetails) uploadDetails.open = false;
            showToast('Thank you! Your wallpaper was uploaded and will appear after it has been reviewed.');
        } catch (error) {
            console.error('Upload error:', error);
            showToast(error.message || 'Something went wrong during upload.', true);
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

/* ---------- favorites ----------
   Kept in memory and mirrored to localStorage. Matching uses photoKey(), so a favorite still
   shows its heart when the same photo comes back from Unsplash with a different URL. */

const FAVORITES_KEY = 'greenWingsFavorites';

function readFavorites() {
    try {
        const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
        return raw.map(normalizeItem).filter(Boolean);
    } catch { return []; }
}

let favorites = readFavorites();
let favoriteKeys = new Set(favorites.map(f => photoKey(f.imageUrl)));

function saveFavorites(list) {
    favorites = list;
    favoriteKeys = new Set(list.map(f => photoKey(f.imageUrl)));
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
    } catch {
        showToast('Could not save favorites (storage unavailable).', true);
    }
}

function toggleFavorite(imageSrc) {
    const key = photoKey(imageSrc);
    const list = [...favorites];
    const index = list.findIndex(f => photoKey(f.imageUrl) === key);

    if (index === -1) {
        const meta = wallpaperRegistry.get(imageSrc) || normalizeItem(imageSrc);
        if (meta) list.push(meta);
    } else {
        list.splice(index, 1);
    }
    saveFavorites(list);

    if (currentView === 'favorites') showFavoritesPage(null);
    else updateFavoriteButtons();
}

// Only touches buttons whose state actually changed.
function updateFavoriteButtons() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        const isFav = favoriteKeys.has(photoKey(btn.getAttribute('data-src')));
        if (btn.getAttribute('aria-pressed') === String(isFav)) return;
        btn.classList.toggle('is-favorite', isFav);
        btn.textContent = isFav ? '❤️' : '🤍';
        btn.setAttribute('aria-pressed', String(isFav));
        btn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Add to favorites');
    });
}

// Keep several open tabs in sync.
window.addEventListener('storage', e => {
    if (e.key !== FAVORITES_KEY) return;
    favorites = readFavorites();
    favoriteKeys = new Set(favorites.map(f => photoKey(f.imageUrl)));
    if (currentView === 'favorites') showFavoritesPage(null);
    else updateFavoriteButtons();
});

document.addEventListener('click', function (event) {
    const btn = event.target.closest('.favorite-btn');
    if (!btn) return;
    event.stopPropagation();
    const imgSrc = btn.getAttribute('data-src');
    if (imgSrc) toggleFavorite(imgSrc);
});

/* ---------- back to top ----------
   IntersectionObserver on an invisible marker instead of a scroll listener:
   no JavaScript runs while the page is scrolling. */

const topBtn = $('#backToTop');
const topSentinel = $('#top-sentinel');
if (topBtn) {
    if (topSentinel && 'IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
            topBtn.classList.toggle('show', !entry.isIntersecting && entry.boundingClientRect.top < 0);
        }).observe(topSentinel);
    } else {
        window.addEventListener('scroll', () => {
            topBtn.classList.toggle('show', window.scrollY > 400);
        }, { passive: true });
    }
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0 }));
}

/* ---------- init ---------- */

paintOrientation();
initStaticCards();
updateFavoriteButtons();
loadUploadedWallpapers();
applyUrlState(true);   // opens ?q=... / ?view=favorites links directly





































