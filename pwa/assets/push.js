export function setupPush({ onUpdateAvailable, onInstallPromptAvailable }) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      trackRegistration(reg, onUpdateAvailable);
      reg.addEventListener("updatefound", () => {
        trackRegistration(reg, onUpdateAvailable);
      });
    });

    setupNotificationNavigationBridge();
  }

  if (!localStorage.getItem("install-prompt:dismissed")) {
    window.addEventListener("beforeinstallprompt", (evt) => {
      evt.preventDefault();
      onInstallPromptAvailable?.(evt);

      evt.userChoice.then((choice) => {
        if (choice.outcome === "dismissed") {
          localStorage.setItem("install-prompt:dismissed", "1");
        }
      }).catch(() => {});
    });
  }
}

function setupNotificationNavigationBridge() {
  navigator.serviceWorker.addEventListener("message", (evt) => {
    if (evt.data?.type === "notification:navigate") {
      const { workflowId, urlPath } = evt.data;
      const hash = urlPath?.startsWith("/") ? urlPath.replace(/^[^#]*/, "") : urlPath;
      window.location.hash = hash ?? `#/workflow/${workflowId}`;
    }
  });
}

function trackRegistration(reg, onUpdateAvailable) {
  const worker = reg.installing ?? reg.waiting;
  if (!worker) return;

  worker.addEventListener("statechange", () => {
    if (worker.state === "installed" && reg.waiting) {
      onUpdateAvailable?.(buildActivate(reg.waiting));
    }
  });

  if (worker.state === "installed" && reg.waiting) {
    onUpdateAvailable?.(buildActivate(reg.waiting));
  }
}

function buildActivate(swInstance) {
  return function activate() {
    if (!swInstance) return;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => { location.reload(); },
      { once: true }
    );
    swInstance.postMessage({ type: "sw:skip-waiting" });
  };
}

export async function subscribePush(workflowId, vapidPublicKey) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push not supported");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permission not granted");

  const reg = await navigator.serviceWorker.ready;
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  const res = await fetch("/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId, subscription: subscription.toJSON() }),
  });
  if (!res.ok) throw new Error(`Subscribe failed: ${res.status}`);

  return subscription;
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
