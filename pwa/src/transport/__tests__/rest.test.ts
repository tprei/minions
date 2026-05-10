import { describe, it, expect, vi, beforeEach } from "vitest";
import { listWorkflows, getWorkflow, RestError } from "../rest";

describe("RestError on non-2xx", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws RestError with status when response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ code: "not_found" }),
      }),
    );

    await expect(listWorkflows()).rejects.toSatisfy(
      (e: unknown) => e instanceof RestError && e.status === 404,
    );
  });

  it("throws RestError with null body when json parsing fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new SyntaxError("bad json")),
      }),
    );

    const err = await listWorkflows().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RestError);
    expect((err as RestError).status).toBe(500);
    expect((err as RestError).body).toBeNull();
  });

  it("returns parsed data on 2xx", async () => {
    const payload = [{ id: "wf1", kind: "single-task", status: "active", createdAt: "", updatedAt: "" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(payload),
      }),
    );

    const result = await listWorkflows();
    expect(result).toEqual(payload);
  });

  it("encodes workflow id in getWorkflow URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getWorkflow("wf/with spaces").catch(() => void 0);

    const calledUrl = (fetchMock.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toBe("/workflows/wf%2Fwith%20spaces");
  });
});
