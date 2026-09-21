// Self-destruct and purge all caches to ensure users always receive the latest live updates
self.addEventListener('install', (event) => {
  self.skipWaiting();
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
      console.log('[Service Worker] Cleaned up all caches and unregistered successfully.');
    })
  );
});

