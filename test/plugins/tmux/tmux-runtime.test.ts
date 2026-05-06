import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeOutputChunk } from "../../../src/plugins/runtime-backend.js";

// Shared mock instance — all TmuxClient constructions return the same mock methods
const mockClient = {
  newSession: vi.fn().mockResolvedValue(undefined),
  setWindowOption: vi.fn().mockResolvedValue(undefined),
  pipePane: vi.fn().mockResolvedValue(undefined),
  waitForSignal: vi.fn().mockResolvedValue(undefined),
  sessionExists: vi.fn().mockResolvedValue(true),
  paneDead: vi.fn().mockResolvedValue(false),
  killSession: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../../../src/plugins/tmux/tmux-client.js", () => {
  const TmuxNoSuchSessionError = class extends Error {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
    constructor(stdout = "", stderr = "no such session", exitCode = 1) {
      super("no such session");
      this.name = "TmuxNoSuchSessionError";
      this.stdout = stdout;
      this.stderr = stderr;
      this.exitCode = exitCode;
    }
  };

  const TmuxError = class extends Error {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
    constructor(msg: string, stdout: string, stderr: string, exitCode: number) {
      super(msg);
      this.name = "TmuxError";
      this.stdout = stdout;
      this.stderr = stderr;
      this.exitCode = exitCode;
    }
  };

  const mockClientInner = {
    newSession: vi.fn().mockResolvedValue(undefined),
    setWindowOption: vi.fn().mockResolvedValue(undefined),
    pipePane: vi.fn().mockResolvedValue(undefined),
    waitForSignal: vi.fn().mockResolvedValue(undefined),
    sessionExists: vi.fn().mockResolvedValue(true),
    paneDead: vi.fn().mockResolvedValue(false),
    killSession: vi.fn().mockResolvedValue(undefined),
  };

  // Use class syntax so `new` works correctly with vitest
  class TmuxClient {
    newSession = mockClientInner.newSession;
    setWindowOption = mockClientInner.setWindowOption;
    pipePane = mockClientInner.pipePane;
    waitForSignal = mockClientInner.waitForSignal;
    sessionExists = mockClientInner.sessionExists;
    paneDead = mockClientInner.paneDead;
    killSession = mockClientInner.killSession;
  }

  return { TmuxClient, TmuxError, TmuxNoSuchSessionError, _mockClientInner: mockClientInner };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../../src/plugins/tmux/log-follow.js", () => ({
  followLog: vi.fn().mockImplementation(async function* () {}),
}));

interface MockClientInner {
  newSession: Mock;
  setWindowOption: Mock;
  pipePane: Mock;
  waitForSignal: Mock;
  sessionExists: Mock;
  paneDead: Mock;
  killSession: Mock;
}

async function getMockClientInner(): Promise<MockClientInner> {
  const mod = (await import("../../../src/plugins/tmux/tmux-client.js")) as unknown as {
    _mockClientInner: MockClientInner;
  };
  return mod._mockClientInner;
}

async function getFollowLogMock() {
  const mod = await import("../../../src/plugins/tmux/log-follow.js");
  return mod.followLog as unknown as Mock;
}

async function getFsMock() {
  const mod = await import("node:fs/promises");
  return {
    mkdir: mod.mkdir as unknown as Mock,
    writeFile: mod.writeFile as unknown as Mock,
  };
}

async function makeBackend(dataDir = "/data") {
  const { TmuxRuntimeBackend } = await import("../../../src/plugins/tmux/tmux-runtime.js");
  return new TmuxRuntimeBackend({ dataDir });
}

beforeEach(async () => {
  const client = await getMockClientInner();
  client.newSession.mockReset().mockResolvedValue(undefined);
  client.setWindowOption.mockReset().mockResolvedValue(undefined);
  client.pipePane.mockReset().mockResolvedValue(undefined);
  client.waitForSignal.mockReset().mockResolvedValue(undefined);
  client.sessionExists.mockReset().mockResolvedValue(true);
  client.paneDead.mockReset().mockResolvedValue(false);
  client.killSession.mockReset().mockResolvedValue(undefined);

  const fs = await getFsMock();
  fs.mkdir.mockReset().mockResolvedValue(undefined);
  fs.writeFile.mockReset().mockResolvedValue(undefined);
  const fsp = await import("node:fs/promises");
  (fsp.unlink as unknown as Mock).mockReset().mockResolvedValue(undefined);

  const followLog = await getFollowLogMock();
  followLog.mockReset().mockImplementation(async function* () {});

  void mockClient;
});

describe("TmuxRuntimeBackend", () => {
  it("start sequence: newSession → setWindowOption(remain-on-exit, on) → pipePane → waitForSignal", async () => {
    const backend = await makeBackend();
    const client = await getMockClientInner();

    const callOrder: string[] = [];
    client.newSession.mockImplementation(async () => { callOrder.push("newSession"); });
    client.setWindowOption.mockImplementation(async () => { callOrder.push("setWindowOption"); });
    client.pipePane.mockImplementation(async () => { callOrder.push("pipePane"); });
    client.waitForSignal.mockImplementation(async () => { callOrder.push("waitForSignal"); });

    await backend.start({ taskId: "t1", workflowId: "wf-1", command: ["echo"] });

    expect(callOrder).toEqual(["newSession", "setWindowOption", "pipePane", "waitForSignal"]);
    expect(client.setWindowOption).toHaveBeenCalledWith(
      expect.any(String),
      "remain-on-exit",
      "on",
    );
  });

  it("launcher script is written before newSession runs", async () => {
    const backend = await makeBackend();
    const client = await getMockClientInner();
    const fs = await getFsMock();

    const callOrder: string[] = [];
    fs.writeFile.mockImplementation(async () => { callOrder.push("writeFile"); });
    client.newSession.mockImplementation(async () => { callOrder.push("newSession"); });

    await backend.start({ taskId: "t1", workflowId: "wf-1", command: ["echo"] });

    const writeIdx = callOrder.indexOf("writeFile");
    const newSessionIdx = callOrder.indexOf("newSession");
    expect(writeIdx).toBeGreaterThanOrEqual(0);
    expect(newSessionIdx).toBeGreaterThan(writeIdx);
  });

  it("sessionId matches mwf-<slug>-<hash8>-<shortid> pattern", async () => {
    const backend = await makeBackend();
    const result = await backend.start({ taskId: "wf-1:task", workflowId: "wf-1", command: [] });
    expect(result.sessionId).toMatch(/^mwf-[a-zA-Z0-9_-]+-[a-f0-9]{8}-[a-f0-9]{6}$/);
  });

  it("sanitizes task id: strips colon, keeps valid chars", async () => {
    const backend = await makeBackend();
    const result = await backend.start({ taskId: "wf-1:task", workflowId: "wf-1", command: [] });
    const parts = result.sessionId.split("-");
    // mwf + slug parts + hash8 + shortid; colon stripped so slug won't contain it
    const slugPart = parts.slice(1, parts.length - 2).join("-");
    expect(slugPart).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(slugPart).not.toContain(":");
  });

  it("two starts with same taskId produce different sessionIds", async () => {
    const backend = await makeBackend();
    const r1 = await backend.start({ taskId: "t1", workflowId: "wf-1", command: [] });
    const r2 = await backend.start({ taskId: "t1", workflowId: "wf-1", command: [] });
    expect(r1.sessionId).not.toBe(r2.sessionId);
  });

  it("partial failure: pipePane throws after newSession → killSession is called", async () => {
    const backend = await makeBackend();
    const client = await getMockClientInner();

    client.pipePane.mockRejectedValue(new Error("pipe failed"));

    await expect(
      backend.start({ taskId: "t1", workflowId: "wf-1", command: [] }),
    ).rejects.toThrow("pipe failed");

    expect(client.killSession).toHaveBeenCalledOnce();
  });

  it("start failure does NOT delete script or log files", async () => {
    const backend = await makeBackend();
    const client = await getMockClientInner();
    const fsp = await import("node:fs/promises");

    client.pipePane.mockRejectedValue(new Error("pipe failed"));

    await expect(
      backend.start({ taskId: "t1", workflowId: "wf-1", command: [] }),
    ).rejects.toThrow();

    expect(fsp.unlink).not.toHaveBeenCalled();
  });

  it("stop calls killSession and swallows TmuxNoSuchSessionError; does NOT delete log or script", async () => {
    const backend = await makeBackend();
    const client = await getMockClientInner();
    const fsp = await import("node:fs/promises");
    const { TmuxNoSuchSessionError: TNSE } = await import("../../../src/plugins/tmux/tmux-client.js");

    client.killSession.mockRejectedValue(new TNSE("", "no such session", 1));

    await expect(backend.stop("any-session")).resolves.toBeUndefined();
    expect(client.killSession).toHaveBeenCalledWith("any-session");
    expect(fsp.unlink).not.toHaveBeenCalled();
  });

  it("stop propagates non-TmuxNoSuchSession errors and does NOT delete log or script", async () => {
    const backend = await makeBackend();
    const client = await getMockClientInner();
    const fsp = await import("node:fs/promises");
    const { TmuxError } = await import("../../../src/plugins/tmux/tmux-client.js");

    client.killSession.mockRejectedValue(
      new TmuxError("socket error", "", "socket", 1),
    );

    await expect(backend.stop("session")).rejects.toThrow("socket error");
    expect(fsp.unlink).not.toHaveBeenCalled();
  });

  it("probe: sessionExists=false → 'missing'", async () => {
    const backend = await makeBackend();
    const client = await getMockClientInner();
    client.sessionExists.mockResolvedValue(false);

    expect(await backend.probe("x")).toBe("missing");
  });

  it("probe: sessionExists=true, paneDead=true → 'dead'", async () => {
    const backend = await makeBackend();
    const client = await getMockClientInner();
    client.sessionExists.mockResolvedValue(true);
    client.paneDead.mockResolvedValue(true);

    expect(await backend.probe("x")).toBe("dead");
  });

  it("probe: sessionExists=true, paneDead=false → 'live'", async () => {
    const backend = await makeBackend();
    const client = await getMockClientInner();
    client.sessionExists.mockResolvedValue(true);
    client.paneDead.mockResolvedValue(false);

    expect(await backend.probe("x")).toBe("live");
  });

  it("attach propagates fromOffset to followLog and yields RuntimeOutputChunk shape", async () => {
    const backend = await makeBackend();
    const followLog = await getFollowLogMock();

    const fakeBytes = new Uint8Array([1, 2, 3]);
    followLog.mockImplementation(async function* (
      _path: string,
      fromOffset: number,
    ) {
      yield { offset: fromOffset, bytes: fakeBytes };
    });

    const chunks: RuntimeOutputChunk[] = [];
    for await (const chunk of backend.attach("my-session", { fromOffset: 42 })) {
      chunks.push(chunk);
    }

    expect(followLog).toHaveBeenCalledWith(
      expect.stringContaining("my-session.log"),
      42,
      expect.any(AbortSignal),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ sessionId: "my-session", offset: 42 });
  });

  it("attach on missing log file yields nothing without exception", async () => {
    const backend = await makeBackend();
    const followLog = await getFollowLogMock();
    followLog.mockImplementation(async function* () {});

    const chunks: RuntimeOutputChunk[] = [];
    for await (const chunk of backend.attach("no-log-session")) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(0);
  });
});
