// Harman Haber servis çalışanı: sayfa çevrimdışı açılır, son indirilen haberler gösterilir.
const VERSION = "hh-v31";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Haberler: önce ağ, olmazsa son kaydedilen
  if (url.origin === location.origin && url.pathname.endsWith("/news.json")) {
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(VERSION).then(c => c.put(new Request("news.json"), copy));
      return r;
    }).catch(() => caches.match("news.json")));
    return;
  }
  // İçerik sürümlü uygulama dosyaları (app.<sürüm>.js/css, games.<sürüm>.js) hiç değişmez: önce önbellek
  if (url.origin === location.origin && /\.[0-9a-f]{10}\.(js|css)$/.test(url.pathname)) {
    e.respondWith(caches.open(VERSION + "-assets").then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // Sayfa iskeleti: önce ağ (güncel sürüm), olmazsa önbellek
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
    return;
  }
  // Yazı tipleri: önbellekten, arka planda yenile
  if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
