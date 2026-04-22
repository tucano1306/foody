/* Foody service worker — offline-first para el shell y cache-network para API */
const VERSION = 'foody-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const IMAGES_CACHE = `${VERSION}-images`;

const SHELL_ASSETS = [
  '/',
  '/home',
  '/supermarket',
  '/products',
  '/manifest.webmanifest',
];

globalThis.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => null),
  );
  globalThis.skipWaiting();
});

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  globalThis.clients.claim();
});

function isNavigation(req) {
  return req.mode === 'navigate';
}

function isImage(req) {
  return req.destination === 'image';
}

function isApiCall(url) {
  return /\/(products|shopping-list|payments|users)(\/|$|\?)/.test(url.pathname);
}

globalThis.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navigation: network first, fall back to cached shell
  if (isNavigation(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const home = await caches.match('/home');
          if (home) return home;
          return new Response('Sin conexión', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }),
    );
    return;
  }

  // Images: cache first
  if (isImage(req)) {
    event.respondWith(
      caches.open(IMAGES_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req)
            .then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            })
            .catch(() => Response.error());
        }),
      ),
    );
    return;
  }

  // API: stale-while-revalidate (crítico en el super si se cae la señal)
  if (isApiCall(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const fetched = fetch(req)
            .then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            })
            .catch(() => cached || Response.error());
          return cached || fetched;
        }),
      ),
    );
    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(async () => (await caches.match(req)) || Response.error()),
  );
});
