import https from "node:https";
import webpush from "web-push";
import type { WebPushError } from "web-push";

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface PushSendTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushSendResult {
  ok: boolean;
  statusCode?: number;
  error?: Error;
}

export interface PushSender {
  send(target: PushSendTarget, payload: string): Promise<PushSendResult>;
}

const SEND_TIMEOUT_MS = 10_000;

export class WebPushSender implements PushSender {
  private readonly agent: https.Agent | undefined;

  constructor(vapid: VapidConfig, agent?: https.Agent) {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    this.agent = agent;
  }

  async send(target: PushSendTarget, payload: string): Promise<PushSendResult> {
    const subscription = {
      endpoint: target.endpoint,
      keys: { p256dh: target.keys.p256dh, auth: target.keys.auth },
    };
    const options: { agent?: https.Agent } = {};
    if (this.agent) options.agent = this.agent;

    const sendPromise = webpush
      .sendNotification(subscription, payload, options)
      .then(() => ({ ok: true } as PushSendResult))
      .catch((err: unknown) => {
        const wpErr = err as WebPushError;
        if (wpErr && typeof wpErr === "object" && "statusCode" in wpErr) {
          return { ok: false, statusCode: wpErr.statusCode } as PushSendResult;
        }
        return { ok: false, error: err instanceof Error ? err : new Error(String(err)) } as PushSendResult;
      });

    const timeoutPromise = new Promise<PushSendResult>((resolve) => {
      setTimeout(() => {
        resolve({ ok: false, error: new Error("push send timeout") });
      }, SEND_TIMEOUT_MS);
    });

    return Promise.race([sendPromise, timeoutPromise]);
  }
}
