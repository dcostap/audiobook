// tools/prepare_pwa.py updates the version and asset list before deployment.
const VERSION = "ad3cfcf59e3ea0a7";
// BEGIN PRECACHE
const ASSETS = [
  "./",
  "index.html",
  "app.js",
  "pwa.js",
  "style.css",
  "manifest.webmanifest",
  "library.json",
  "fonts/literata-italic.woff2",
  "fonts/literata.woff2",
  "icons/apple-touch-icon.png",
  "icons/favicon-16.png",
  "icons/favicon-32.png",
  "icons/favicon.ico",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "books/hp1/cover.jpg"
];
// END PRECACHE
const PREFIX = `audiolibros:${self.registration.scope}:`;
const SHELL = `${PREFIX}shell:${VERSION}`;
const DATA = `${PREFIX}data`;
const absolute = (path) => new URL(path, self.registration.scope).href;
const shellURLs = new Set(ASSETS.map(absolute));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(
    ASSETS.map((path) => new Request(absolute(path), { cache: "reload" })),
  )));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(`${PREFIX}shell:`) && key !== SHELL)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function shellFile(url) {
  try {
    const saved = await (await caches.open(SHELL)).match(url);
    if (saved) return saved;
  } catch {
    // Storage can be unavailable, or the browser can remove cached files.
  }
  return fetch(url);
}

async function chapterData(request, event) {
  let cache, saved;
  try {
    cache = await caches.open(DATA);
    saved = await cache.match(request);
  } catch {
    return fetch(request);
  }
  const controller = new AbortController();
  // A weak connection must not stop an already cached chapter from opening.
  const timer = saved ? setTimeout(() => controller.abort(), 3000) : null;
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    return response;
  } catch {
    return saved || new Response('{"error":"offline"}', {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || !url.href.startsWith(self.registration.scope)) return;
  // Leave audio and byte-range requests to the browser. Never download a book in the background.
  if (request.headers.has("range") || /\.mp3$/i.test(url.pathname)) return;
  if (request.mode === "navigate") {
    event.respondWith(shellFile(absolute("index.html")));
  } else if (shellURLs.has(`${url.origin}${url.pathname}`)) {
    event.respondWith(shellFile(`${url.origin}${url.pathname}`));
  } else if (/\.(json|jpe?g|png|webp)$/i.test(url.pathname)) {
    event.respondWith(chapterData(request, event));
  }
});
