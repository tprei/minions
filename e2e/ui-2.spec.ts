import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test.beforeEach(async ({ page }) => {
  await page.route("**/workflows*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
});

async function waitForSwActivated(
  page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never
) {
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg?.active?.state === "activated";
    },
    { timeout: 10_000 }
  );
}

test("unversioned app-v1.js is never served from SW cache", async ({
  page,
}) => {
  const networkHits: string[] = [];
  await page.route("**/assets/app-v1.js", (route) => {
    networkHits.push(route.request().url());
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "/* live network version */",
    });
  });

  await page.goto("/");
  await waitForSwActivated(page);

  // Seed a stale response for app-v1.js into the SW cache
  await page.evaluate(async () => {
    const keys = await caches.keys();
    const cacheName = keys[0] ?? "stale-test";
    const cache = await caches.open(cacheName);
    await cache.put(
      "/assets/app-v1.js",
      new Response("/* stale cached version */", {
        headers: { "Content-Type": "application/javascript" },
      })
    );
  });

  const hitsBefore = networkHits.length;

  const body = await page.evaluate(async () => {
    const resp = await fetch("/assets/app-v1.js");
    return resp.text();
  });

  // The SW must pass through to network (not serve the stale cache entry)
  expect(networkHits.length - hitsBefore).toBe(1);
  expect(body).toBe("/* live network version */");
});

test("navigate request falls back to offline message when network is unavailable", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForSwActivated(page);

  await context.setOffline(true);

  let navResponse: { ok: boolean; status: number } | null = null;
  page.on("response", (resp) => {
    if (resp.url().endsWith("/") || resp.url().endsWith("localhost:3000")) {
      navResponse = { ok: resp.ok(), status: resp.status() };
    }
  });

  try {
    await page.goto("/", { waitUntil: "commit", timeout: 5_000 });
  } catch {
    // Navigation may throw when offline — the SW offline fallback should still respond
  }

  const bodyText = await page.evaluate(() => document.body.innerText || document.body.innerHTML);

  await context.setOffline(false);

  expect(bodyText).toContain("Offline");
});

test("/workflows always hits network, never served from cache", async ({ page }) => {
  const hitIds: string[] = [];

  await page.unroute("**/workflows*");
  await page.route("**/workflows", (route) => {
    const id = `hit-${hitIds.length + 1}`;
    hitIds.push(id);
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id, status: "active" }]),
    });
  });

  await page.goto("/");
  await waitForSwActivated(page);

  const hitsBefore = hitIds.length;

  const [r1, r2] = await page.evaluate(async () => {
    const a = await (await fetch("/workflows")).json() as Array<{ id: string }>;
    const b = await (await fetch("/workflows")).json() as Array<{ id: string }>;
    return [a[0]?.id, b[0]?.id] as [string, string];
  });

  expect(hitIds.length - hitsBefore).toBe(2);
  expect(r1).toBe(hitIds[hitsBefore]);
  expect(r2).toBe(hitIds[hitsBefore + 1]);
  expect(r1).not.toBe(r2);
});

test("SW postMessage notification:navigate reaches page without triggering full reload", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForSwActivated(page);

  let loadFired = false;
  page.on("load", () => {
    loadFired = true;
  });

  const swList = context.serviceWorkers();
  expect(swList.length).toBeGreaterThan(0);
  const sw = swList[0]!;

  const messagePromise = page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timeout")), 4_000);
        navigator.serviceWorker.addEventListener("message", (evt) => {
          if (evt.data?.type === "notification:navigate") {
            clearTimeout(timeout);
            resolve(evt.data as Record<string, unknown>);
          }
        });
      })
  );

  await sw.evaluate(async (data: { workflowId: string; taskId: string; urlPath: string }) => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({
        type: "notification:navigate",
        workflowId: data.workflowId,
        taskId: data.taskId,
        urlPath: data.urlPath,
      });
    }
  }, { workflowId: "wf-42", taskId: "task-1", urlPath: "#/workflow/wf-42" });

  const msg = await messagePromise;

  expect(msg["workflowId"]).toBe("wf-42");
  expect(msg["taskId"]).toBe("task-1");
  expect(loadFired).toBe(false);
});
