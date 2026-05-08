const CACHE_VERSION = "v2-2026-05-08";
const MANIFEST_CACHE = `manifest-${CACHE_VERSION}`;

const MANIFEST_PRECACHE = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

const PASSTHROUGH_PREFIXES = [
  "/workflows",
  "/commands",
  "/audit",
  "/alerts",
  "/push",
  "/sse",
];

const VERSIONED_ASSET_RE = /\/assets\/.*-v\d+\.(js|css)$/;
const ICON_RE = /\/icons\/.*/;

self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches.open(MANIFEST_CACHE).then((c) => c.addAll(MANIFEST_PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== MANIFEST_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evt) => {
  const url = new URL(evt.request.url);
  const path = url.pathname;

  if (path === "/sw.js") return;

  if (PASSTHROUGH_PREFIXES.some((prefix) => path.startsWith(prefix))) return;

  if (evt.request.mode === "navigate") {
    evt.respondWith(
      fetch(evt.request).catch(() =>
        new Response(
          "<!doctype html><html><head><meta charset=utf-8><title>Offline</title></head><body><p>Offline — pull to refresh</p></body></html>",
          { headers: { "Content-Type": "text/html" } }
        )
      )
    );
    return;
  }

  if (VERSIONED_ASSET_RE.test(path)) {
    evt.respondWith(
      caches.open(MANIFEST_CACHE).then((cache) =>
        cache.match(evt.request).then((cached) => {
          if (cached) return cached;
          return fetch(evt.request).then((response) => {
            cache.put(evt.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  if (ICON_RE.test(path) || path === "/manifest.json") {
    evt.respondWith(
      caches.match(evt.request).then((cached) => cached ?? fetch(evt.request))
    );
    return;
  }
});

self.addEventListener("push", (evt) => {
  const p = evt.data?.json() ?? {};
  const { taskId, kind, code, title, body, urlPath, workflowId } = p;

  evt.waitUntil(
    self.registration.showNotification(title ?? "Minions", {
      body: body ?? "",
      tag: `${taskId}:${code}`,
      renotify: true,
      icon: "/icons/icon-192.png",
      data: { workflowId, taskId, urlPath: urlPath ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (evt) => {
  evt.notification.close();
  const { workflowId, taskId, urlPath } = evt.notification.data ?? {};

  evt.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const target = clientList.find((c) => c.url.startsWith(self.location.origin));
        if (target) {
          target.postMessage({ type: "notification:navigate", workflowId, taskId, urlPath });
          return target.focus();
        }
        return self.clients.openWindow(urlPath ?? "/");
      })
  );
});

self.addEventListener("message", (evt) => {
  if (evt.data?.type === "sw:skip-waiting") {
    self.skipWaiting();
  }
});
