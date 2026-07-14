const CACHE = 'warmwrite-v1-5';
const ASSETS = [
  './','./index.html','./style.css','./app.js','./manifest.webmanifest',
  './version.json','./icon.svg','./icons/apple-touch-icon.png',
  './icons/favicon.png','./icons/icon-192.png','./icons/icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE).map(key => caches.delete(key))
    ))
  ]));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(event.request, {cache:'no-store'}));
    return;
  }

  event.respondWith(
    fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then(
      cached => cached || caches.match('./index.html')
    ))
  );
});
