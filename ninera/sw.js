const CACHE_NAME = 'ninera-registro-v3';
const ASSETS = [
  './index.html',
  './manifest.json',
  './bg.png',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k))))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

// Permite activación inmediata cuando el usuario aprueba la actualización
self.addEventListener('message', (e) => {
  if(e.data === 'SKIP_WAITING') self.skipWaiting();
});
