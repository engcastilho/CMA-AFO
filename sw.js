// Service worker do Câmara AFO.
// - Arquivos do app: ficam guardados no aparelho (abre mesmo sem internet).
// - Dados do SAPL: busca na internet primeiro; sem sinal, usa a última cópia salva.

const VERSION = 'v5';
const SHELL = 'cma-shell-' + VERSION;
const DATA = 'cma-data-' + VERSION;
const SAPL_API = 'https://sapl.altaflorestadoeste.ro.leg.br/api/';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // Dados da Câmara: rede primeiro, cópia salva como reserva.
  if (url.startsWith(SAPL_API)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || Response.error()))
    );
    return;
  }

  // Arquivos do próprio app: usa o salvo e atualiza em segundo plano.
  if (new URL(url).origin === self.location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => {
        const net = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached || caches.match('./index.html'));
        return cached || net;
      })
    );
  }
});
