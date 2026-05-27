const CACHE = 'kp-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Network-first: always fresh from server, fall back to cache offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const clone = r.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return r
      })
      .catch(() => caches.match(e.request))
  )
})
