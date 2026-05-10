export type RouteName =
  | "workflow-list"
  | "workflow-detail"
  | "audit"
  | "alerts"
  | "new-workflow"
  | "account"
  | "not-found";

export type Route =
  | { name: "workflow-list" }
  | { name: "workflow-detail"; id: string }
  | { name: "audit" }
  | { name: "alerts" }
  | { name: "new-workflow" }
  | { name: "account" }
  | { name: "not-found" };

export function parseUrl(): Route {
  const hash = window.location.hash.replace(/^#/, "");
  const [rawPath] = hash.split("?");
  const segments = (rawPath ?? "").replace(/^\//, "").split("/").filter(Boolean);

  const first = segments[0];

  if (!first || first === "") return { name: "workflow-list" };

  if (first === "workflow" && segments[1]) {
    return { name: "workflow-detail", id: segments[1] };
  }

  switch (first) {
    case "audit": return { name: "audit" };
    case "alerts": return { name: "alerts" };
    case "new": return { name: "new-workflow" };
    case "account": return { name: "account" };
    default: return { name: "workflow-list" };
  }
}
