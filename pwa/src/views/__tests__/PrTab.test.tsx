import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import type { TaskNode, WorkflowEvent } from "../../domain/types";

vi.mock("../../transport/rest", () => ({
  getPrDetail: vi.fn(),
  getPrFiles: vi.fn(),
  getPrChecks: vi.fn(),
  mergeTask: vi.fn().mockResolvedValue(undefined),
}));

import { PrTab } from "../PrTab";
import { getPrDetail, getPrChecks } from "../../transport/rest";

function makeTask(extras: Partial<TaskNode> = {}): TaskNode {
  return {
    id: "t-1",
    workflowId: "wf-1",
    title: "Test task",
    prompt: "do work",
    dependsOn: [],
    executionStatus: "pr-open",
    stackStatus: "clean",
    priority: 0,
    claims: [],
    contract: { summary: "", expectedArtifacts: [] },
    artifacts: [
      {
        kind: "pr",
        ref: "https://github.com/org/repo/pull/42",
        producedBy: "t-1",
        createdAt: new Date().toISOString(),
      },
    ],
    runs: [],
    readiness: "ready",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extras,
  };
}

const prData = {
  number: 42,
  title: "Add feature",
  html_url: "https://github.com/org/repo/pull/42",
  state: "open",
  mergeable_state: "clean",
  base: { ref: "main" },
  head: { ref: "feature/foo", sha: "abc123def456abc1" },
};

const concludedChecks = {
  check_runs: [
    { id: 1, name: "CI", status: "completed", conclusion: "success" },
    { id: 2, name: "lint", status: "completed", conclusion: "success" },
  ],
  total_count: 2,
};

function noop(): () => void { return () => {}; }

describe("PrTab", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getPrDetail).mockResolvedValue(prData);
    vi.mocked(getPrChecks).mockResolvedValue({ check_runs: [], total_count: 0 });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders PR title after loading", async () => {
    const { getByText } = render(
      <PrTab task={makeTask()} workflowId="wf-1" subscribeProviderEvents={noop} />,
    );
    await act(async () => {});
    expect(getByText("Add feature")).toBeTruthy();
  });

  it("stops polling checks when all checks are conclusive and PR is clean", async () => {
    vi.mocked(getPrChecks).mockResolvedValue(concludedChecks);

    render(
      <PrTab task={makeTask()} workflowId="wf-1" subscribeProviderEvents={noop} />,
    );

    await act(async () => {});

    const callsBefore = vi.mocked(getPrChecks).mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(8000 * 3);
    });

    const callsAfter = vi.mocked(getPrChecks).mock.calls.length;
    expect(callsAfter).toBe(callsBefore);
  });

  it("shows no PR artifact message when task has no pr artifact", () => {
    const task = makeTask({ artifacts: [] });
    const { getByText } = render(
      <PrTab task={task} workflowId="wf-1" subscribeProviderEvents={noop} />,
    );
    expect(getByText(/No PR artifact/)).toBeTruthy();
  });

  it("fires exactly one fetch per 8s tick when checks are non-conclusive", async () => {
    const inflightChecks = {
      check_runs: [
        { id: 1, name: "CI", status: "in_progress", conclusion: null },
      ],
      total_count: 1,
    };
    vi.mocked(getPrChecks).mockResolvedValue(inflightChecks);

    render(
      <PrTab task={makeTask()} workflowId="wf-1" subscribeProviderEvents={noop} />,
    );

    await act(async () => {});

    const callsAfterMount = vi.mocked(getPrChecks).mock.calls.length;
    expect(callsAfterMount).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(vi.mocked(getPrChecks).mock.calls.length).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(vi.mocked(getPrChecks).mock.calls.length).toBe(3);
  });

  it("continues polling when mergeable_state is blocked even with conclusive checks", async () => {
    vi.mocked(getPrDetail).mockResolvedValue({ ...prData, mergeable_state: "blocked" });
    vi.mocked(getPrChecks).mockResolvedValue(concludedChecks);

    render(
      <PrTab task={makeTask()} workflowId="wf-1" subscribeProviderEvents={noop} />,
    );

    await act(async () => {});

    const callsAfterMount = vi.mocked(getPrChecks).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(vi.mocked(getPrChecks).mock.calls.length).toBe(callsAfterMount + 1);
  });
});
