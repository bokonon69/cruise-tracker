self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open('lloydkade-shell-v1').then(c => c.addAll([
    '/','/index.html','/manifest.webmanifest',
  ])));
});
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin === location.origin) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
