const CACHE = 'warmwrite-v1-4';
const ASSETS = ['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./icons/favicon.png'];
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))); });
self.addEventListener('activate', event => event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))])));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    const copy=response.clone(); caches.open(CACHE).then(cache => cache.put(event.request,copy)); return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html'))));
});
