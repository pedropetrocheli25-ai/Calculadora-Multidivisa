const CACHE_NAME = 'remesas-pwa-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json'
];

// Instalar y guardar archivos base. Se activa de inmediato para que las mejoras lleguen rápido.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Activar y borrar cachés antiguas
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

// Estrategia: red primero (siempre lo más nuevo) y, si no hay internet, lo guardado.
// Nunca se guardan ni se interceptan las consultas de tasas (/api) ni otros dominios.
self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

    event.respondWith(
        fetch(req)
            .then(res => {
                if (res && res.ok) {
                    const copia = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(req, copia));
                }
                return res;
            })
            .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('/index.html') : undefined)))
    );
});