import { useState, useEffect } from "react";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator !== "undefined") return navigator.onLine;
    return true;
  });

  useEffect(() => {
    function handleOnline(): void { setOnline(true); }
    function handleOffline(): void { setOnline(false); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
