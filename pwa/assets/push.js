export function setupPush({ onUpdateAvailable, onInstallPromptAvailable }) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        const activate = buildActivate(reg.waiting);
        onUpdateAvailable?.(activate);
      }
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      navigator.serviceWorker.ready.then((reg) => {
        const activate = buildActivate(reg.active);
        onUpdateAvailable?.(activate);
      });
    });
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

function buildActivate(swInstance) {
  return function activate() {
    if (swInstance) {
      swInstance.postMessage({ type: "sw:skip-waiting" });
    }
    window.location.reload();
  };
}

export async function subscribePush(vapidPublicKey) {
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

  await fetch("/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });

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
