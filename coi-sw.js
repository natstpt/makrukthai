/* Adds the cross-origin isolation headers (COOP/COEP) that GitHub Pages cannot set, so the hard AI's
 * WebAssembly engine can use SharedArrayBuffer. Only same-origin responses are changed; the site loads nothing
 * from other origins. Registered by engine-ai.js when the hard AI is chosen. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (new URL(req.url).origin !== self.location.origin) return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  // Pages are checked with the server each time (a 304 when unchanged), so an update reaches the game at once.
  e.respondWith(fetch(req, req.mode === 'navigate' ? { cache: 'no-cache' } : undefined).then(function (res) {
    if (res.status === 0) return res;
    var headers = new Headers(res.headers);
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: headers });
  }));
});
