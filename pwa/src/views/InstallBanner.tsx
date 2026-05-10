import { useState } from "react";
import { Banner } from "../components/Banner";
import { useInstallPrompt } from "../pwa/install";
import {
  urlBase64ToUint8Array,
  subscribeToPush,
  getPushSubscription,
} from "../pwa/push";
import {
  subscribeAlerts,
  getVapidPublicKey,
  type PushSubscriptionBody,
} from "../transport/rest";

export function InstallBanner(): JSX.Element | null {
  const { canInstall, dismissed, promptInstall, dismiss } = useInstallPrompt();
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canInstall || dismissed) return null;

  async function handleSubscribeAlerts(): Promise<void> {
    setSubscribing(true);
    setError(null);
    try {
      const { publicKey } = await getVapidPublicKey();
      const key = urlBase64ToUint8Array(publicKey);

      let sub = await getPushSubscription();
      if (!sub) {
        sub = await subscribeToPush(key);
      }

      const json = sub.toJSON();
      const keys = json.keys as { p256dh: string; auth: string } | undefined;
      if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
        throw new Error("Incomplete push subscription");
      }

      const body: PushSubscriptionBody = {
        endpoint: json.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      };
      await subscribeAlerts(body);
      setSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscription failed");
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <Banner
      tone="info"
      message={
        <div className="flex items-center gap-2 flex-wrap">
          <span>Install Minions for offline access and push notifications</span>
          {error && <span className="text-err text-[11px]">{error}</span>}
          <div className="flex gap-2 ml-auto">
            {!subscribed && (
              <button
                type="button"
                disabled={subscribing}
                onClick={() => void handleSubscribeAlerts()}
                className="text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
              >
                {subscribing ? "Subscribing…" : "Subscribe to alerts"}
              </button>
            )}
            {subscribed && (
              <span className="text-[11px] text-ok">Subscribed</span>
            )}
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="text-[11px] font-medium text-accent hover:underline"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="text-[11px] text-fg-subtle hover:text-fg"
            >
              Dismiss
            </button>
          </div>
        </div>
      }
    />
  );
}
