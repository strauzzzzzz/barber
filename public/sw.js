/* Service worker: кэш оболочки приложения + офлайн-страница. API никогда не кэшируется. */
const VERSION = 'v5';
const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;
// Vary: Origin у ответов сервера ломает сопоставление crossorigin-запросов модулей с кэшем
const V = { ignoreVary: true };
const CORE = ['/', '/offline.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(CORE);
    // хэшированные файлы сборки берём из самого index.html, чтобы оболочка открывалась офлайн с первого раза
    const html = await (await fetch('/', { cache: 'reload' })).text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (![SHELL, RUNTIME].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req, V);
  const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL)).put('/', res.clone()); // SPA: одна оболочка на все пути
        return res;
      } catch {
        return (await caches.match('/', V)) || (await caches.match('/offline.html', V));
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req, V);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
      return res;
    })());
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});
