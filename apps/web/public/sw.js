/* Foody service worker — offline-first shell, stale-while-revalidate API, mutation queue */
const VERSION = 'foody-v4';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const IMAGES_CACHE = `${VERSION}-images`;

/* ── IndexedDB offline queue ─────────────────────────────────────────────── */
const QUEUE_DB = 'foody-offline-v1';
const QUEUE_STORE = 'mutations';

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

/**
 * Only queue mutations that are safe to replay: toggle-cart and individual
 * product stock patches. Avoids queuing auth, voice, or complete-shopping.
 */
function isMutableApiCall(url, origin) {
  if (url.origin !== origin) return false;
  const { pathname } = url;
  if (pathname.includes('/toggle-cart')) return true;
  if (/\/api\/proxy\/products\/[^/]+$/.test(pathname)) return true;
  return false;
}

/* ── IndexedDB helpers ─────────────────────────────────────────────────────── */
function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(QUEUE_STORE, { autoIncrement: true });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueEntry(entry) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).add(entry);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllQueued() {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const results = [];
    tx.objectStore(QUEUE_STORE).openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        results.push({ key: cursor.key, entry: cursor.value });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteByKeys(keys) {
  if (keys.length === 0) return;
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    for (const key of keys) store.delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueueCount() {
  const db = await openQueueDB();
  return new Promise((resolve) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(0);
  });
}

/* ── Broadcast helpers ─────────────────────────────────────────────────────── */
async function broadcastCount() {
  const count = await getQueueCount();
  const allClients = await globalThis.clients.matchAll({ type: 'window' });
  for (const client of allClients) {
    client.postMessage({ type: 'OFFLINE_QUEUE_COUNT', count });
  }
}

async function replayAndBroadcast() {
  const queued = await getAllQueued();
  if (queued.length === 0) {
    const allClients = await globalThis.clients.matchAll({ type: 'window' });
    for (const client of allClients) {
      client.postMessage({ type: 'SYNC_COMPLETE', synced: 0, remaining: 0 });
    }
    return;
  }

  const successKeys = [];
  for (const { key, entry } of queued) {
    try {
      const headers = new Headers(entry.headers);
      const res = await fetch(entry.url, {
        method: entry.method,
        headers,
        body: entry.body || undefined,
        credentials: 'include',
      });
      // 409 conflict = already processed server-side → still dequeue
      if (res.ok || res.status === 409) successKeys.push(key);
    } catch {
      break; // Still offline — stop replaying
    }
  }

  await deleteByKeys(successKeys).catch(() => null);

  const remaining = queued.length - successKeys.length;
  const allClients = await globalThis.clients.matchAll({ type: 'window' });
  for (const client of allClients) {
    client.postMessage({ type: 'SYNC_COMPLETE', synced: successKeys.length, remaining });
  }
}

/* ── Mutation handler ──────────────────────────────────────────────────────── */
async function handleMutation(req) {
  const clone = req.clone(); // Clone before consuming stream with fetch()
  try {
    return await fetch(req);
  } catch {
    // Network unavailable — queue and return 503
    const body = await clone.text().catch(() => '');
    await enqueueEntry({
      url: req.url,
      method: req.method,
      headers: [...req.headers.entries()],
      body,
      timestamp: Date.now(),
    }).catch(() => null);
    await broadcastCount().catch(() => null);
    return new Response(JSON.stringify({ offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'X-Foody-Offline': '1' },
    });
  }
}

/* ── Background Sync ───────────────────────────────────────────────────────── */
globalThis.addEventListener('sync', (event) => {
  if (event.tag === 'foody-sync') {
    event.waitUntil(replayAndBroadcast());
  }
});

/* ── Network restored ──────────────────────────────────────────────────────── */
globalThis.addEventListener('online', () => {
  void replayAndBroadcast();
});

/* ── Messages from client ──────────────────────────────────────────────────── */
globalThis.addEventListener('message', (event) => {
  // Only trust messages originating from a window client on the same origin
  if (event.origin !== globalThis.location.origin) return;

  if (event.data?.type === 'TRIGGER_SYNC') {
    event.waitUntil(replayAndBroadcast());
  }
  if (event.data?.type === 'GET_QUEUE_COUNT') {
    getQueueCount()
      .then((count) => event.source?.postMessage({ type: 'OFFLINE_QUEUE_COUNT', count }))
      .catch(() => null);
  }
});

globalThis.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Non-GET: intercept mutable API calls; pass everything else through
  if (req.method !== 'GET') {
    if (isMutableApiCall(url, globalThis.location.origin)) {
      event.respondWith(handleMutation(req));
    }
    return;
  }

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
