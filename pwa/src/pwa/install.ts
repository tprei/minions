import { useState, useEffect } from "react";

const DISMISSED_KEY = "installBanner:dismissed";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export interface InstallPromptState {
  canInstall: boolean;
  dismissed: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unsupported">;
  dismiss: () => void;
}

export function useInstallPrompt(): InstallPromptState {
  const [canInstall, setCanInstall] = useState(() => deferredPrompt !== null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === "1",
  );

  useEffect(() => {
    function update(): void {
      setCanInstall(deferredPrompt !== null);
    }
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  async function promptInstall(): Promise<"accepted" | "dismissed" | "unsupported"> {
    if (!deferredPrompt) return "unsupported";
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    notify();
    return outcome;
  }

  function dismiss(): void {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  return { canInstall, dismissed, promptInstall, dismiss };
}
