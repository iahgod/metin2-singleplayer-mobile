// sw.js - Test-safe Service Worker for Metin2 Mobile PWA
// Intercepts ONLY graphic files in /icons/ so it never interferes with
// COOP/COEP (Cross-Origin-Isolated) headers or fresh reloads of client.html,
// client.js, client.wasm, client.data, preload.js, or mobile_overlay.js.

var ICON_CACHE = "m2w-icons-v2";

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== ICON_CACHE && k !== "m2w-corpus") return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (!req || req.method !== "GET") return;
  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (!url.pathname.includes("/icons/")) return;

  event.respondWith(
    caches.open(ICON_CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var netFetch = fetch(req).then(function (resp) {
          if (resp && resp.status === 200) {
            cache.put(req, resp.clone());
          }
          return resp;
        }).catch(function () {
          return cached;
        });
        return cached || netFetch;
      });
    })
  );
});
