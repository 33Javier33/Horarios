const CACHE_NAME = 'ninera-registro-v5';
const ASSETS = [
  './index.html',
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
  // Cachear assets y activar de inmediato sin esperar a que se cierren pestañas
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      // Eliminar cachés viejos
      caches.keys().then(keys =>
        Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
      ),
      // Tomar control de todas las pestañas abiertas de inmediato
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
