// Service Worker for offline/fallback support (kiosk mode)
const CACHE = 'freequeue-v1'
const OFFLINE_URL = '/offline.html'

// Cache core assets on install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll([
        '/',
        '/kiosk',
        '/offline.html',
      ]).catch(() => {})
    )
  )
  self.skipWaiting()
})

// Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Network first for API, cache first for assets
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Don't cache API, SignalR, or cross-origin requests
  if (url.pathname.startsWith('/api') ||
      url.pathname.startsWith('/hubs') ||
      url.origin !== self.location.origin) {
    return
  }

  // Cache-first for static assets
  if (url.pathname.match(/\.(js|css|png|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then(cached => cached ?? fetch(request).then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(cache => cache.put(request, clone))
        return res
      }))
    )
    return
  }

  // Network-first for pages, fallback to offline page
  event.respondWith(
    fetch(request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(cache => cache.put(request, clone))
        return res
      })
      .catch(() => caches.match(request).then(cached => cached ?? caches.match(OFFLINE_URL)))
  )
})
