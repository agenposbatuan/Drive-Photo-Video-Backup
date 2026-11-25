// Service Worker untuk Progressive Web App (PWA) Drive Photo & Video Backup
// ATURAN KRUSIAL:
// Hanya menyimpan App Shell statis (HTML, JS, CSS, Font, Ikon lokal).
// DILARANG KERAS menyimpan file binary foto/video Google Drive, thumbnail gambar Drive,
// atau respon API Google Drive di dalam Cache Storage untuk mencegah lonjakan memori (300GB-600GB+).

const CACHE_NAME = 'gdrive-backup-shell-v1';

// Aset inti App Shell untuk offline skeleton / fast boot
const CORE_APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
];

// URLs/Domains yang TIDAK BOLEH disimpan ke Cache Storage sama sekali
const BYPASS_CACHE_PATTERNS = [
  'googleapis.com',
  'googleusercontent.com',
  'accounts.google.com',
  'apis.google.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  '/api/',
  'upload',
  'drive/v3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        // Pre-cache core shell safely (catch error jika ada aset opsional)
        return cache.addAll(CORE_APP_SHELL).catch((err) => {
          console.warn('[SW] Pre-caching non-fatal warning:', err);
        });
      })
      .then(() => {
        // Jangan auto skipWaiting agar client dapat menampilkan notifikasi update jika diinginkan,
        // namun siap dipicu via postMessage { type: 'SKIP_WAITING' }
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((existingCache) => {
            // Hapus cache versi lama yang tidak cocok
            if (existingCache !== CACHE_NAME && existingCache.startsWith('gdrive-backup-shell-')) {
              console.log('[SW] Menghapus cache versi lama:', existingCache);
              return caches.delete(existingCache);
            }
            return Promise.resolve();
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Listener untuk pesan pembaruan dari aplikasi
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  // 1. Lewatkan metode selain GET (POST upload resumable, PUT chunk, DELETE, dll)
  if (req.method !== 'GET') {
    return;
  }

  // 2. LEWATKAN LANGSUNG SEMUA GOOGLE DRIVE API, MEDIA, THUMBNAIL, DAN BACKEND ENDPOINT
  // Memastikan ribuan foto/video tidak pernah masuk ke Cache Storage
  const shouldBypass = BYPASS_CACHE_PATTERNS.some((pattern) => url.includes(pattern));
  if (shouldBypass) {
    return;
  }

  // 3. Lewatkan streaming video (Range requests)
  if (req.headers.has('range')) {
    return;
  }

  // 4. Navigasi halaman HTML (SPA Navigation) - Network First dengan Cache Fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return caches.match('/');
        })
    );
    return;
  }

  // 5. Aset Statis Lokal & Google Fonts - Stale While Revalidate
  // Hanya simpan jika origin sama (aset build vite) atau fonts CDN
  const isSameOrigin = url.startsWith(self.location.origin);
  const isFontCdn = url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');

  if (isSameOrigin || isFontCdn) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const resClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
            }
            return networkResponse;
          })
          .catch(() => {
            // Abaikan kegagalan jaringan jika offline
          });

        return cachedResponse || fetchPromise;
      })
    );
  }
});

// Penanganan notifikasi browser
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
