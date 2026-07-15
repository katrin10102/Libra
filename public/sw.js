const CACHE_NAME = 'libra-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Detect if running in AI Studio development or preview environment
const isDev = self.location.hostname.includes('ais-dev') || 
              self.location.hostname.includes('ais-pre') || 
              self.location.hostname.includes('localhost') || 
              self.location.hostname.includes('127.0.0.1');

if (isDev) {
  console.log('[Service Worker] Development environment detected. Self-destructing to prevent caching issues...');
  
  self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => caches.delete(key)));
      }).then(() => {
        return self.clients.claim();
      }).then(() => {
        return self.registration.unregister();
      }).then(() => {
        console.log('[Service Worker] Successfully cleaned up dev caches and unregistered self.');
      })
    );
  });
} else {
  // Production Service Worker
  // Install Event - Pre-cache critical core shell assets
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        console.log('[Service Worker] Caching App Shell and core assets');
        return cache.addAll(ASSETS_TO_CACHE);
      }).then(() => {
        return self.skipWaiting();
      })
    );
  });

  // Activate Event - Clean up stale caches from previous sessions
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((keyList) => {
        return Promise.all(
          keyList.map((key) => {
            if (key !== CACHE_NAME) {
              console.log('[Service Worker] Removing old cache', key);
              return caches.delete(key);
            }
          })
        );
      }).then(() => {
        return self.clients.claim();
      })
    );
  });

  // Fetch Event - Serve assets cache-first, or fallback to index.html/cache on network error
  self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Avoid intercepting API calls to mbooks.com.ua or our own proxy routes
    if (url.pathname.startsWith('/api') || url.hostname === 'mbooks.com.ua') {
      return;
    }

    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Fetch in background to update cache (stale-while-revalidate strategy)
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
              }
            })
            .catch(() => { /* Ignore background update failures */ });
          return cachedResponse;
        }

        // If not in cache, fallback to network
        return fetch(event.request)
          .then((networkResponse) => {
            // Cache successful responses for our static assets
            if (networkResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // If network fails completely (offline) and this is a navigation request, serve index.html
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html') || caches.match('./') || Response.error();
            }
            // Otherwise, return error
            return Response.error();
          });
      })
    );
  });
}
