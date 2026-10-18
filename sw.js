// Service Worker: hält alle App-Dateien offline bereit.
// Bei jeder Änderung an einer App-Datei VERSION erhöhen, sonst bleibt am iPhone die alte Version.
const VERSION = 'v5';
const CACHE = `bauchgefuehl-${VERSION}`;

const DATEIEN = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/symbole.js',
  'js/hilfen.js',
  'js/konfiguration.js',
  'js/felder.js',
  'js/formular.js',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Am Server-Cache vorbei laden, damit wirklich die neue Version landet.
    await cache.addAll(DATEIEN.map((d) => new Request(d, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('bauchgefuehl-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const anfrage = event.request;
  if (anfrage.method !== 'GET' || new URL(anfrage.url).origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (anfrage.mode === 'navigate') {
      return (await cache.match('index.html')) ?? fetch(anfrage);
    }
    return (await cache.match(anfrage, { ignoreSearch: true })) ?? fetch(anfrage);
  })());
});
