const CACHE_NAME = 'ninera-registro-v6';

// Assets estáticos que se cachean para funcionar offline
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

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

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

self.addEventListener('fetch', (e) => {
  // Navegación (index.html): NETWORK FIRST → siempre la versión más nueva si hay internet
  // Si no hay red, sirve la caché como fallback offline
  if(e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Guardar la respuesta fresca en caché para uso offline
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Assets estáticos (imágenes, fuentes, CDN): CACHE FIRST → rápido + offline
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
