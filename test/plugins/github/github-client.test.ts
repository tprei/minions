import { describe, expect, it, vi } from "vitest";
import { GitHubClient, GitHubApiError } from "../../../src/plugins/github/github-client.js";
import { TokenBucket } from "../../../src/plugins/github/rate-limiter.js";

function makeBucket(): TokenBucket {
  return new TokenBucket({ capacity: 20, refillPerSec: 10 });
}

function makeClient(fetchMock: typeof fetch): GitHubClient {
  return new GitHubClient({ token: "test-pat", bucket: makeBucket(), fetchImpl: fetchMock });
}

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    headers: { get: () => null },
  }) as unknown as typeof fetch;
}

describe("GitHubClient", () => {
  it("injects PAT as Authorization: Bearer header", async () => {
    const fetch = mockFetch(200, []);
    const client = makeClient(fetch);
    await client.findPRByHead("owner", "repo", "feature-branch", "main");
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = call[1].headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-pat");
  });

  it("findPRByHead returns null on 404", async () => {
    const client = makeClient(mockFetch(404, "Not Found"));
    const result = await client.findPRByHead("owner", "repo", "feature-branch", "main");
    expect(result).toBeNull();
  });

  it("findPRByHead returns null when response is empty array", async () => {
    const client = makeClient(mockFetch(200, []));
    const result = await client.findPRByHead("owner", "repo", "feature-branch", "main");
    expect(result).toBeNull();
  });

  it("findPRByHead returns PR ref on match", async () => {
    const pr = { number: 42, html_url: "https://github.com/owner/repo/pull/42", head: { ref: "feature-branch" }, base: { ref: "main" }, state: "open" };
    const client = makeClient(mockFetch(200, [pr]));
    const result = await client.findPRByHead("owner", "repo", "feature-branch", "main");
    expect(result).toEqual({ number: 42, url: pr.html_url, headRef: "feature-branch", baseRef: "main", state: "open" });
  });

  it("createPR sends correct URL and body", async () => {
    const fetch = mockFetch(201, {
      number: 99,
      html_url: "https://github.com/owner/repo/pull/99",
      head: { ref: "feature" },
      base: { ref: "main" },
      state: "open",
    });
    const client = makeClient(fetch);
    await client.createPR("owner", "repo", { title: "My PR", body: "body text", head: "feature", base: "main" });
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(call[0]).toContain("/repos/owner/repo/pulls");
    const bodyParsed = JSON.parse(call[1].body as string) as Record<string, unknown>;
    expect(bodyParsed["head"]).toBe("feature");
    expect(bodyParsed["base"]).toBe("main");
  });

  it("throws GitHubApiError on non-2xx", async () => {
    const client = makeClient(mockFetch(422, "Unprocessable Entity"));
    await expect(client.createPR("owner", "repo", { title: "T", body: "B", head: "h", base: "b" }))
      .rejects.toBeInstanceOf(GitHubApiError);
  });

  it("mergePR throws GitHubApiError with status 405", async () => {
    const client = makeClient(mockFetch(405, "Method Not Allowed"));
    await expect(client.mergePR("owner", "repo", 1))
      .rejects.toMatchObject({ status: 405 });
  });

  it("mergePR throws GitHubApiError with status 409", async () => {
    const client = makeClient(mockFetch(409, "Conflict"));
    await expect(client.mergePR("owner", "repo", 1))
      .rejects.toMatchObject({ status: 409 });
  });
});
