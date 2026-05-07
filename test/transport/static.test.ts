import { describe, expect, it } from "vitest";
import { NoopRestackExecutor } from "../../src/application/restack-executor.js";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { createRecoveryService } from "../../src/application/recovery-service.js";
import { StubRuntimeBackend } from "../../src/plugins/stub-runtime.js";
import { createServer } from "../../src/transport/server.js";

const now = "2026-05-04T11:19:00.000Z";

function makeApp(pwaRoot?: string) {
  const repo = new InMemoryWorkflowRepository();
  const executor = new NoopRestackExecutor();
  const runtime = new StubRuntimeBackend();
  const recoveryService = createRecoveryService(repo, executor, runtime, () => now);
  const app = createServer({
    repo,
    recoveryService,
    executor,
    ...(pwaRoot !== undefined ? { pwaRoot } : {}),
  });
  return app;
}

describe("static serving with pwaRoot set", () => {
  const pwaRoot = "test/fixtures/pwa-stub";

  it("GET / returns 200 with text/html content type", async () => {
    const app = makeApp(pwaRoot);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toMatch(/text\/html/);
  });

  it("GET / response body contains the fixture banner", async () => {
    const app = makeApp(pwaRoot);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("TEST FIXTURE — slice 16 pwa-stub");
  });

  it("GET /manifest.json returns 200 with parseable JSON", async () => {
    const app = makeApp(pwaRoot);
    const res = await app.request("/manifest.json");
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string };
    expect(body.name).toBe("TEST FIXTURE — slice 16 pwa-stub");
  });

  it("GET / includes Cache-Control: no-cache header", async () => {
    const app = makeApp(pwaRoot);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });
});

describe("static serving without pwaRoot", () => {
  it("GET / returns 404", async () => {
    const app = makeApp();
    const res = await app.request("/");
    expect(res.status).toBe(404);
  });

  it("GET /manifest.json returns 404", async () => {
    const app = makeApp();
    const res = await app.request("/manifest.json");
    expect(res.status).toBe(404);
  });
});
