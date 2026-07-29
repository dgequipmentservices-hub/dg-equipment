const CACHE = 'dg-equipment-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    // Cache each shell entry on its own — addAll() rejects the whole install
    // if any single file 404s, which would leave the app with no worker at all.
    caches.open(CACHE).then(function(c) {
      return Promise.all(SHELL.map(function(url) {
        return c.add(url).catch(function(){});
      }));
    })
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

// Is this a request for the app itself, rather than an asset?
function isAppShell(request) {
  if (request.mode === 'navigate') return true;
  var url = new URL(request.url);
  return url.pathname === '/' ||
         url.pathname.endsWith('/') ||
         url.pathname.endsWith('index.html');
}

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  // Never cache Supabase — data and auth must always hit the network.
  if (e.request.url.includes('supabase.co')) return;

  // The whole app is one HTML file, so serving it cache-first meant a fix
  // could not reach a phone that already had a copy: the cached page rendered
  // immediately and the update only landed on some later open. That stranded
  // real bugs on real devices. Go to the network first for the app itself and
  // fall back to cache only when offline — which is what the fallback is for.
  if (isAppShell(e.request)) {
    e.respondWith(
      fetch(e.request).then(function(r) {
        if (r.ok) {
          var clone = r.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return r;
      }).catch(function() {
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Everything else (icons, fonts) is versioned or static: cache-first with a
  // background refresh is fine and keeps the app fast on a bad connection.
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var networkFetch = fetch(e.request).then(function(r) {
        if (r.ok) {
          var clone = r.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return r;
      }).catch(function() { return cached; });
      return cached || networkFetch;
    })
  );
});
