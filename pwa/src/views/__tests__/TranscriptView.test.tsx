import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import type { WorkflowEvent } from "../../domain/types";
import type { SseConnectionState } from "../../transport/types";

vi.mock("../../transport/rest", () => ({
  getTaskTranscript: vi.fn(),
}));

let mockConnectionState: SseConnectionState = "connected";

vi.mock("../../store/useConnectionStore", () => ({
  useConnectionStore: vi.fn((selector: Parameters<typeof import("../../store/useConnectionStore").useConnectionStore>[0]) =>
    selector({
      state: mockConnectionState,
      lastEventAt: undefined,
      currentWorkflowId: undefined,
      setState: () => {},
      setLastEventAt: () => {},
      setCurrentWorkflowId: () => {},
    }),
  ),
}));

import { TranscriptView } from "../TranscriptView";
import { getTaskTranscript } from "../../transport/rest";

type SubscribeFn = (listener: (evt: WorkflowEvent) => void) => () => void;

function makeSubscriber(emitter: { emit?: (evt: WorkflowEvent) => void } = {}): SubscribeFn {
  const listeners = new Set<(evt: WorkflowEvent) => void>();
  emitter.emit = (evt) => { for (const fn of listeners) fn(evt); };
  return (listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
}

function makeProviderEvent(runId: string, seq: number, text: string): WorkflowEvent {
  return {
    cursor: 0,
    workflowId: "wf-1",
    occurredAt: "2025-01-01T00:00:00Z",
    kind: "provider-event",
    payload: {
      taskId: "t-1",
      runId,
      seq,
      providerEvent: { kind: "assistant_text", text },
    },
  };
}

describe("TranscriptView", () => {
  beforeEach(() => {
    mockConnectionState = "connected";
    vi.clearAllMocks();
    vi.mocked(getTaskTranscript).mockResolvedValue({ events: [], cutoff: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders events from history fetch", async () => {
    vi.mocked(getTaskTranscript).mockResolvedValue({
      events: [
        { runId: "run-1", attempt: 1, seq: 0, event: { kind: "assistant_text", text: "history event" } },
      ],
      cutoff: { runId: "run-1", seq: 0 },
    });

    const subscriber = makeSubscriber();
    render(
      <TranscriptView
        workflowId="wf-1"
        taskId="t-1"
        subscribeProviderEvents={subscriber}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("history event");
  });

  it("renders live events while history is loading, no duplicates", async () => {
    let resolveHistory!: (v: Awaited<ReturnType<typeof getTaskTranscript>>) => void;
    vi.mocked(getTaskTranscript).mockReturnValue(
      new Promise((r) => { resolveHistory = r; }),
    );

    const emitter: { emit?: (evt: WorkflowEvent) => void } = {};
    const subscriber = makeSubscriber(emitter);

    render(
      <TranscriptView
        workflowId="wf-1"
        taskId="t-1"
        subscribeProviderEvents={subscriber}
      />,
    );

    await act(async () => {
      emitter.emit!(makeProviderEvent("run-1", 0, "live event"));
      await Promise.resolve();
    });

    resolveHistory({
      events: [
        { runId: "run-1", attempt: 1, seq: 0, event: { kind: "assistant_text", text: "live event" } },
      ],
      cutoff: { runId: "run-1", seq: 0 },
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const matches = document.body.textContent?.match(/live event/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("fetches transcript on mount (connection store connected)", async () => {
    const subscriber = makeSubscriber();
    render(
      <TranscriptView
        workflowId="wf-1"
        taskId="t-1"
        subscribeProviderEvents={subscriber}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getTaskTranscript).toHaveBeenCalledWith("wf-1", "t-1");
  });

  it("no duplicates when live event arrives during in-flight fetch then RAF flushes", async () => {
    let resolveHistory!: (v: Awaited<ReturnType<typeof getTaskTranscript>>) => void;
    vi.mocked(getTaskTranscript).mockReturnValue(
      new Promise((r) => { resolveHistory = r; }),
    );

    const emitter: { emit?: (evt: WorkflowEvent) => void } = {};
    const subscriber = makeSubscriber(emitter);

    render(
      <TranscriptView
        workflowId="wf-1"
        taskId="t-1"
        subscribeProviderEvents={subscriber}
      />,
    );

    await act(async () => {
      emitter.emit!(makeProviderEvent("run-1", 1, "concurrent event"));
      await Promise.resolve();
    });

    await act(async () => {
      resolveHistory({
        events: [
          { runId: "run-1", attempt: 1, seq: 1, event: { kind: "assistant_text", text: "concurrent event" } },
        ],
        cutoff: { runId: "run-1", seq: 1 },
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const matches = document.body.textContent?.match(/concurrent event/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("SSE reconnect triggers re-fetch of transcript", async () => {
    vi.mocked(getTaskTranscript)
      .mockResolvedValueOnce({ events: [], cutoff: null })
      .mockResolvedValueOnce({ events: [], cutoff: null });

    const subscriber = makeSubscriber();

    function makeJsx() {
      return (
        <TranscriptView
          workflowId="wf-1"
          taskId="t-1"
          subscribeProviderEvents={subscriber}
        />
      );
    }

    const { rerender } = render(makeJsx());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(vi.mocked(getTaskTranscript).mock.calls.length).toBe(1);

    await act(async () => {
      mockConnectionState = "reconnecting";
      rerender(makeJsx());
      await Promise.resolve();
    });

    await act(async () => {
      mockConnectionState = "connected";
      rerender(makeJsx());
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(vi.mocked(getTaskTranscript).mock.calls.length).toBe(2);
  });
});
