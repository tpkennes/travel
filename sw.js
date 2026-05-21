/* ═══════════════════════════════════════════════
   Mon Planning Voyage — Service Worker
   Stratégie :
   - App HTML      → Network-first, fallback cache
   - CDN assets    → Cache-first (React, Babel, Fonts)
   - API / Gist    → Network-only (toujours frais)
   ═══════════════════════════════════════════════ */

const CACHE_VERSION = "voyage-v1";
const CACHE_CDN     = "voyage-cdn-v1";

/* Assets CDN à mettre en cache au premier chargement */
const CDN_ASSETS = [
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js",
  "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;1,500&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap",
];

/* URLs qui ne doivent JAMAIS passer par le cache */
const NETWORK_ONLY = [
  "api.github.com",
  "gist.githubusercontent.com",
  "drive.google.com",
  "dropbox.com",
];

/* ── Install : pré-cache les assets CDN ── */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_CDN).then(cache => {
      return Promise.allSettled(
        CDN_ASSETS.map(url =>
          cache.add(url).catch(() => {
            /* Silently fail if CDN unreachable during install */
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── Activate : supprime les vieux caches ── */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION && k !== CACHE_CDN)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch : stratégie selon l'URL ── */
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  /* 1. Network-only pour les appels API / Gist */
  if(NETWORK_ONLY.some(domain => url.hostname.includes(domain))) {
    return; /* Laisse le navigateur gérer normalement */
  }

  /* 2. Cache-first pour les assets CDN (unpkg, fonts) */
  if(
    url.hostname === "unpkg.com" ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(
      caches.open(CACHE_CDN).then(cache =>
        cache.match(event.request).then(cached => {
          if(cached) return cached;
          return fetch(event.request).then(response => {
            if(response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  /* 3. Network-first pour l'app HTML elle-même */
  if(event.request.mode === "navigate" || event.request.destination === "document") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if(response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(cached =>
            cached || caches.match("./index.html")
          )
        )
    );
    return;
  }

  /* 4. Default : réseau avec fallback cache */
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
