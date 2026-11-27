// La Ripresa — service worker
// Pages : réseau d'abord (la nouvelle version s'installe dès qu'il y a du réseau), cache en secours hors ligne.
// Fichiers /assets/ (noms uniques par version) : cache d'abord.
const CACHE = "laripresa-v7", PRECACHE = ["/", "/index.html"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const put = res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(put)));
  } else {
    e.respondWith(fetch(req).then(put).catch(() => caches.match(req).then(c => c || caches.match("/index.html"))));
  }
});
self.addEventListener("push", e => { const d = e.data?.json() || { title: "La Ripresa", body: "Alerte vignoble" }; e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: "/icon-192.png", tag: "alert", renotify: true })); });
self.addEventListener("notificationclick", e => { e.notification.close(); e.waitUntil(clients.openWindow("/")); });
