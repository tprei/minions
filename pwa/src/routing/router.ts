import { useState, useEffect } from "react";
import { parseUrl, type Route } from "./parseUrl";

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseUrl());

  useEffect(() => {
    const handler = (): void => setRoute(parseUrl());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  return route;
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith("/") ? path : `/${path}`;
}
