const CACHE = 'dg-equipment-v1';
const SHELL = [
  './',
  './index.html'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(SHELL); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Only cache GET requests for the app shell
  if (e.request.method !== 'GET') return;
  // Don't cache Supabase API calls
  if (e.request.url.includes('supabase.co')) return;
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var networkFetch = fetch(e.request).then(function(r) {
        if (r.ok) {
          var clone = r.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return r;
      }).catch(function() { return cached; });
      // Return cached immediately if available, update in background
      return cached || networkFetch;
    })
  );
});
