// AUM Engine — Service Worker v1
// Minimal passthrough SW — enables Chrome PWA install prompt.
// No offline caching: all requests go to the network.
// iOS "Add to Home Screen" works via apple-mobile-web-app-capable meta tags (already in index.html).
const CACHE_NAME = 'aum-engine-sw-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Passthrough: always fetch from network. If network fails, return a blank offline response.
self.addEventListener('fetch', e => {
  // Only handle GET requests — skip POST/PUT/DELETE (Firestore writes etc.)
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => new Response('', {
      status: 503,
      statusText: 'Service Unavailable',
    }))
  );
});
