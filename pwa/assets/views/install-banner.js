const DISMISSED_KEY = 'install-banner:dismissed';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function subscribePushForAlerts(vapidPublicKey) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push not supported');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permission not granted');

  const reg = await navigator.serviceWorker.ready;
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  const res = await fetch('/alerts/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });

  if (!res.ok) throw new Error(`Subscribe failed: ${res.status}`);
  return subscription;
}

export async function createInstallBanner({ apiBase = '' } = {}) {
  if (localStorage.getItem(DISMISSED_KEY)) {
    return null;
  }

  let vapidKey = null;

  try {
    const r = await fetch(`${apiBase}/push/vapid-public-key`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.publicKey) return null;
    vapidKey = data.publicKey;
  } catch {
    return null;
  }

  const banner = document.createElement('div');
  banner.className = 'install-banner';

  const text = document.createElement('span');
  text.className = 'install-banner-text';
  text.textContent = 'Subscribe to engine alerts for real-time notifications';

  const subscribeBtn = document.createElement('button');
  subscribeBtn.className = 'install-banner-subscribe';
  subscribeBtn.textContent = 'Subscribe';
  subscribeBtn.addEventListener('click', () => {
    subscribeBtn.disabled = true;
    subscribePushForAlerts(vapidKey)
      .then(() => {
        dismiss();
      })
      .catch(() => {
        subscribeBtn.disabled = false;
      });
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'install-banner-dismiss';
  dismissBtn.textContent = '✕';
  dismissBtn.setAttribute('aria-label', 'Dismiss');
  dismissBtn.addEventListener('click', () => {
    dismiss();
  });

  banner.appendChild(text);
  banner.appendChild(subscribeBtn);
  banner.appendChild(dismissBtn);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    banner.remove();
  }

  return { element: banner };
}
