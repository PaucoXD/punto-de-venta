// Guarda la app para que abra sin internet. Cambia VERSION al publicar cambios.
const VERSION = 'pdv-3';
const ARCHIVOS = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'iconos/icono.svg', 'iconos/icono-192.png', 'iconos/icono-512.png', 'fuentes/inter.woff2', 'vendor/JsBarcode.all.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red (para recibir actualizaciones) y si no hay internet, lo guardado
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
