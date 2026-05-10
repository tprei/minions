import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("notificationclick", (evt) => {
  evt.notification.close();
  const { workflowId, taskId, urlPath } = (evt.notification.data ?? {}) as {
    workflowId?: string;
    taskId?: string;
    urlPath?: string;
  };

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
      }),
  );
});
