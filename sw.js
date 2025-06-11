const CACHE_NAME = 'file-combiner-cache-v1.5'; // Increment version to clear old caches
const assetsToCache = [
    './', // Alias for index.html. Important for GitHub Pages.
    './index.html',
    './index.tsx', // The browser fetches this as a module
    './manifest.json',
    // Icons (ensure these paths match your icon files in an 'icons' folder)
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
    './icons/icon-maskable-192x192.png',
    './icons/icon-maskable-512x512.png',
    // JSZip (local first, then CDNs)
    './jszip.min.js', // User needs to add this file to the root for optimal offline
    // Tailwind CSS CDN (the script itself)
    'https://cdn.tailwindcss.com',
    // Font Awesome CSS (Free Tier)
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
    // Note: JSZip CDNs and Font Awesome font files (.woff2, etc.) will be cached on first use 
    // if local jszip.min.js is not found or if the FA CSS requests them.
];

// Install event: open cache and add core assets
self.addEventListener('install', event => {
    console.log('[ServiceWorker] Install');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[ServiceWorker] Caching app shell');
                // Use addAll for atomic additions. If one fails, none are added.
                // However, for CDNs or optional local files, it's better to cache them individually
                // and not fail the entire SW install if one isn't available.
                const promises = assetsToCache.map(assetUrl => {
                    return cache.add(assetUrl).catch(err => {
                        // Log errors for individual asset caching failures, but don't break install
                        console.warn(`[ServiceWorker] Failed to cache ${assetUrl}:`, err);
                    });
                });
                return Promise.all(promises);
            })
            .then(() => self.skipWaiting()) // Activate new SW immediately
    );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
    console.log('[ServiceWorker] Activate');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[ServiceWorker] Clearing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of all open clients
    );
});

// Fetch event: serve assets from cache first, then network
self.addEventListener('fetch', event => {
    // console.log('[ServiceWorker] Fetching:', event.request.url);
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // console.log('[ServiceWorker] Found in cache:', event.request.url);
                    return cachedResponse;
                }
                // console.log('[ServiceWorker] Not in cache, fetching from network:', event.request.url);
                return fetch(event.request).then(
                    networkResponse => {
                        // If the request is for a CDN or something we want to cache dynamically
                        if (event.request.url.startsWith('https://cdn.jsdelivr.net') ||
                            event.request.url.startsWith('https://cdnjs.cloudflare.com') || // Covers JSZip and FontAwesome (CSS & fonts)
                            event.request.url.startsWith('https://cdn.tailwindcss.com')) {
                            
                            // Check if response is valid (basic check, for opaque responses it's harder)
                            if(!networkResponse || networkResponse.status !== 200 ) { // Removed type check, as opaque responses are fine for caching
                                if (networkResponse && networkResponse.status !== 0) { // status 0 can be opaque success
                                     console.warn(`[ServiceWorker] Bad response for ${event.request.url}:`, networkResponse.status);
                                }
                                return networkResponse;
                            }

                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    // console.log('[ServiceWorker] Caching new resource from network:', event.request.url);
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        return networkResponse;
                    }
                ).catch(error => {
                    console.error('[ServiceWorker] Fetch failed; returning offline page or error for:', event.request.url, error);
                    // Optionally, return a generic offline fallback page here if appropriate
                    // For example, if (event.request.mode === 'navigate') return caches.match('./offline.html');
                });
            })
    );
});