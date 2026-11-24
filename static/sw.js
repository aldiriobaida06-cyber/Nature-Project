'use strict';

const VERSION = 'v4.7.0';                 // bump on EVERY deploy that touches shell files
const SHELL = `shell-${VERSION}`;
const API = `api-${VERSION}`;
const IMG = 'img-v1';
const LIMITS = { [IMG]: 150, [API]: 40 };  // max entries, oldest evicted first

// Must match the URLs in your HTML exactly, including ?v= (the cache matches full URLs).
const SHELL_ASSETS = [
  '/',
  '/style_23.css?v87',
  '/theme-init.js?v3',
  '/static/js/script.js?v10',
  '/static/js/blur-tool.js?v1',
  '/static/js/smart-preload.js?v1',
  '/static/fonts/plus-jakarta-sans-latin-wght-normal.woff2',
  '/static/js/gradient-studio.js?v1',
];

// Never intercepted: admin/private routes. Prefix match.
const BYPASS = ['/admin', '/api/get-messages', '/api/admin', '/api/messages', '/api/send-message', '/healthz'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // 'reload' skips the HTTP cache so a new version never precaches an hour-old file;
    // allSettled so one missing file cannot abort the whole install.
    await Promise.allSettled(SHELL_ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, API, IMG]);
    await Promise.all((await caches.keys()).filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.disable();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range') ||
      req.headers.has('authorization') || req.headers.has('x-admin-token')) return;

  const url = new URL(req.url);

  if (url.origin === location.origin) {
    const p = url.pathname;
    if (BYPASS.some((b) => p.startsWith(b))) {
      if (e.preloadResponse) e.waitUntil(e.preloadResponse.catch(() => {}));
      return;
    }
    if (p.startsWith('/api/')) return e.respondWith(networkFirstApi(e));
    if (p.startsWith('/static/uploads/')) return e.respondWith(cacheFirst(e, IMG));
    if (p.startsWith('/static/') || p.startsWith('/fonts/') || p === '/style_23.css' || p === '/theme-init.js')
      return e.respondWith(cacheFirst(e, SHELL));
    if (req.mode === 'navigate') return e.respondWith(navigate(e));
    return;
  }

  // Unsplash: only real <img> loads. fetch() (downloads, canvas crop) is multi-MB and must not fill the cache.
  if (url.hostname === 'images.unsplash.com' && req.destination === 'image') {
    e.respondWith(cacheFirst(e, IMG, true));
  }
});

// Cache-first: static files, uploads, Unsplash images
async function cacheFirst(e, cacheName, cors = false) {
  const req = e.request;
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  // CORS re-fetch avoids opaque responses, which are padded to several MB each in storage quota.
  const res = await fetch(cors ? new Request(req.url, { mode: 'cors', credentials: 'omit' }) : req);
  if (res.status === 200) e.waitUntil(put(cache, cacheName, req, res.clone()));
  return res;
}

// Network-first: public API reads (photo search, random mix, /api/photos/ID for shared links)
async function networkFirstApi(e) {
  const req = e.request;
  const cache = await caches.open(API);
  try {
    const res = await fetch(req);
    if (res.status === 200) {
      if (!/no-store/.test(res.headers.get('Cache-Control') || '')) e.waitUntil(put(cache, API, req, res.clone()));
      return res;
    }
    // Rate-limited or server error: serve stale data if we have it
    if (res.status === 429 || res.status >= 500) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    return res;   // 4xx pass through untouched, never cached
  } catch {
    return (await cache.match(req)) ||
      new Response('{"detail":"offline"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

// Navigations: network-first with preload; offline falls back to the cached shell.
// Any /?... navigation (including ?photo=ID and ?q=...) gets the same page.
async function navigate(e) {
  try {
    const res = (await e.preloadResponse) || (await fetch(e.request));
    const url = new URL(e.request.url);
    if (res.status === 200 && url.pathname === '/' && !url.search) {
      const copy = res.clone();
      e.waitUntil(caches.open(SHELL).then((c) => c.put('/', copy)));
    }
    return res;
  } catch {
    return (await caches.match('/')) || Response.error();
  }
}

// Off the critical path: store, then trim oldest entries
async function put(cache, name, req, res) {
  await cache.put(req, res);
  const max = LIMITS[name];
  if (!max) return;
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}