import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { NoopRestackExecutor } from "../../src/application/restack-executor.js";
import { createRecoveryService } from "../../src/application/recovery-service.js";
import { StubRuntimeBackend } from "../../src/plugins/stub-runtime.js";
import { createServer } from "../../src/transport/server.js";
import { silentLogger } from "../test-helpers.js";

const now = "2026-05-08T00:00:00.000Z";

function makeApp(opts: { githubToken?: string } = {}) {
  const repo = new InMemoryWorkflowRepository();
  const executor = new NoopRestackExecutor();
  const runtime = new StubRuntimeBackend();
  const recoveryService = createRecoveryService(repo, executor, runtime, () => now, silentLogger());
  const app = createServer({ repo, recoveryService, executor, ...opts });
  return app;
}

describe("GET /github/pr-detail", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.stubGlobal("fetch", originalFetch);
  });

  it("returns 400 when url param is missing", async () => {
    const app = makeApp();
    const res = await app.request("/github/pr-detail");
    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("invalid_request");
  });

  it("returns 400 when url param does not match github API pattern", async () => {
    const app = makeApp();
    const res = await app.request("/github/pr-detail?url=https://evil.com/hack");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a github html url (not api)", async () => {
    const app = makeApp();
    const url = encodeURIComponent("https://github.com/org/repo/pull/42");
    const res = await app.request(`/github/pr-detail?url=${url}`);
    expect(res.status).toBe(400);
  });

  it("returns 200 with upstream JSON on success", async () => {
    const prData = { title: "Test PR", state: "open", number: 1 };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(prData), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const app = makeApp();
    const url = encodeURIComponent("https://api.github.com/repos/org/repo/pulls/1");
    const res = await app.request(`/github/pr-detail?url=${url}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { title: string };
    expect(body.title).toBe("Test PR");
  });

  it("sends Authorization header when githubToken is set", async () => {
    const prData = { title: "Secured PR", state: "open" };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(prData), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const app = makeApp({ githubToken: "ghp_test123" });
    const url = encodeURIComponent("https://api.github.com/repos/org/repo/pulls/1");
    await app.request(`/github/pr-detail?url=${url}`);
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer ghp_test123");
  });

  it("does not send Authorization header when githubToken is absent", async () => {
    const prData = { title: "No auth PR", state: "open" };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(prData), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const app = makeApp();
    const url = encodeURIComponent("https://api.github.com/repos/org/repo/pulls/1");
    await app.request(`/github/pr-detail?url=${url}`);
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("returns 502 when upstream fetch throws", async () => {
    fetchSpy.mockRejectedValue(new Error("network failure"));
    const app = makeApp();
    const url = encodeURIComponent("https://api.github.com/repos/org/repo/pulls/1");
    const res = await app.request(`/github/pr-detail?url=${url}`);
    expect(res.status).toBe(502);
  });

  it("returns 502 when upstream responds non-2xx", async () => {
    fetchSpy.mockResolvedValue(new Response("{}", { status: 404 }));
    const app = makeApp();
    const url = encodeURIComponent("https://api.github.com/repos/org/repo/pulls/1");
    const res = await app.request(`/github/pr-detail?url=${url}`);
    expect(res.status).toBe(502);
  });

  it("accepts valid url with digits in owner and repo names", async () => {
    const prData = { title: "OK", state: "open" };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(prData), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const app = makeApp();
    const url = encodeURIComponent("https://api.github.com/repos/my-org123/my-repo456/pulls/999");
    const res = await app.request(`/github/pr-detail?url=${url}`);
    expect(res.status).toBe(200);
  });

  it("returns 502 with upstream_error code when upstream returns 200 with invalid JSON", async () => {
    fetchSpy.mockResolvedValue(
      new Response("not valid json{{", { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const app = makeApp();
    const url = encodeURIComponent("https://api.github.com/repos/org/repo/pulls/1");
    const res = await app.request(`/github/pr-detail?url=${url}`);
    expect(res.status).toBe(502);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("upstream_error");
  });
});
