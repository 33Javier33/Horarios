const CACHE_NAME = 'ninera-registro-v12';
const SUPABASE_URL = "https://lpulmjzboogixbdxxayo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwdWxtanpib29naXhiZHh4YXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjY0NzMsImV4cCI6MjA5MTI0MjQ3M30.vjebyQb4Bb62ZQlNaJZveuxdBYDOmtC4bM7uwAilDzY";
const CLOUD_ID = 'ninera';

const STATIC_ASSETS = [
  './manifest.json',
  './bg.png',
  '../icons/icon2-72x72.png',
  '../icons/icon2-96x96.png',
  '../icons/icon2-128x128.png',
  '../icons/icon2-144x144.png',
  '../icons/icon2-152x152.png',
  '../icons/icon2-180x180.png',
  '../icons/icon2-192x192.png',
  '../icons/icon2-384x384.png',
  '../icons/icon2-512x512.png',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];

// ── IndexedDB helpers (persiste lastSeenTs entre sesiones) ───────────────
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ninera-sw-state', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbGet(key) {
  try {
    const db = await openDb();
    return new Promise(resolve => {
      const get = db.transaction('kv','readonly').objectStore('kv').get(key);
      get.onsuccess = () => resolve(get.result ?? '');
      get.onerror  = () => resolve('');
    });
  } catch { return ''; }
}
async function dbSet(key, value) {
  try {
    const db = await openDb();
    return new Promise(resolve => {
      const tx = db.transaction('kv','readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {}
}

// ── Install ──────────────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting(); // toma control inmediato; la página recarga vía controllerchange
});

// ── Activate ─────────────────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
      ),
      self.clients.claim()
    ])
  );
});

// ── Fetch: network-first para HTML, cache-first para assets ─────────────
self.addEventListener('fetch', (e) => {
  if(e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

// ── Mensajes desde la app ────────────────────────────────────────────────
self.addEventListener('message', (e) => {
  if(!e.data) return;
  if(e.data.type === 'MARK_READ' && e.data.lastTs) {
    dbSet('lastSeenTs', e.data.lastTs);
  }
  if(e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Periodic Background Sync ─────────────────────────────────────────────
self.addEventListener('periodicsync', (event) => {
  if(event.tag === 'check-ninera-msgs') {
    event.waitUntil(checkAndNotify());
  }
});

async function checkAndNotify() {
  try {
    // Si la app está en primer plano, no notificar (ella ya vibra/notifica)
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appVisible = clients.some(c => c.visibilityState === 'visible');
    if(appVisible) return;

    const lastSeen = await dbGet('lastSeenTs');
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/horarios_sync?id=eq.${CLOUD_ID}&select=payload`,
      { headers }
    );
    if(!res.ok) return;
    const rows = await res.json();
    if(!rows || !rows[0] || !rows[0].payload) return;

    const msgs = rows[0].payload.messages || [];
    const newMsgs = msgs.filter(m => m.ts > lastSeen);
    if(!newMsgs.length) return;

    const latest = newMsgs[newMsgs.length - 1];
    const body = newMsgs.length === 1
      ? `${latest.from || 'Alguien'}: ${latest.text || '📷 Foto'}`
      : `${newMsgs.length} mensajes nuevos`;

    await self.registration.showNotification('Registro Niñera 💬', {
      body,
      icon: '../icons/icon2-192x192.png',
      badge: '../icons/icon2-72x72.png',
      tag: 'ninera-msg',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: self.registration.scope + 'index.html' }
    });

    await dbSet('lastSeenTs', msgs[msgs.length - 1].ts);
  } catch(e) {}
}

// ── Notification click: abrir / enfocar la app ───────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.startsWith(self.registration.scope));
      if(existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
