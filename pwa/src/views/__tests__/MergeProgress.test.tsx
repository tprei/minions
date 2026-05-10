import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import type { WorkflowEvent } from "../../domain/types";
import { MergeProgress } from "../MergeProgress";

function makeSubscribe() {
  const listeners = new Set<(evt: WorkflowEvent) => void>();
  function subscribeProviderEvents(listener: (evt: WorkflowEvent) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function emit(evt: WorkflowEvent): void {
    for (const l of listeners) l(evt);
  }
  return { subscribeProviderEvents, emit };
}

function makeMergePhaseEvent(
  taskId: string,
  phase: string,
  status: "started" | "completed",
  error?: string,
): WorkflowEvent {
  return {
    cursor: 1,
    workflowId: "wf-1",
    occurredAt: new Date().toISOString(),
    kind: "merge-phase",
    payload: { taskId, phase, status, error } as WorkflowEvent extends { kind: "merge-phase"; payload: infer P } ? P : never,
  } as WorkflowEvent;
}

describe("MergeProgress", () => {
  it("starts all phases as pending", () => {
    const { subscribeProviderEvents } = makeSubscribe();
    const { getByText } = render(
      <MergeProgress taskId="t-1" subscribeProviderEvents={subscribeProviderEvents} />,
    );
    expect(getByText("Prepare merge")).toBeTruthy();
    expect(getByText("Finalize")).toBeTruthy();
  });

  it("advances through phases on merge-phase events", () => {
    const { subscribeProviderEvents, emit } = makeSubscribe();
    const { getAllByText } = render(
      <MergeProgress taskId="t-1" subscribeProviderEvents={subscribeProviderEvents} />,
    );

    act(() => {
      emit(makeMergePhaseEvent("t-1", "prepareMerge", "started"));
    });

    act(() => {
      emit(makeMergePhaseEvent("t-1", "prepareMerge", "completed"));
    });

    const matches = getAllByText("Prepare merge");
    expect(matches.length).toBeGreaterThan(0);
    const completed = matches.find((el) => el.className.includes("line-through"));
    expect(completed).toBeTruthy();
  });

  it("ignores events for different taskId", () => {
    const { subscribeProviderEvents, emit } = makeSubscribe();
    const { container } = render(
      <MergeProgress taskId="t-1" subscribeProviderEvents={subscribeProviderEvents} />,
    );

    act(() => {
      emit(makeMergePhaseEvent("t-99", "prepareMerge", "completed"));
    });

    const checkmarks = container.querySelectorAll("[class*='text-ok']");
    expect(checkmarks.length).toBe(0);
  });

  it("shows success card after finalize completed", () => {
    const { subscribeProviderEvents, emit } = makeSubscribe();
    const { getByText } = render(
      <MergeProgress taskId="t-1" subscribeProviderEvents={subscribeProviderEvents} />,
    );

    act(() => {
      emit(makeMergePhaseEvent("t-1", "finalize", "completed"));
    });

    expect(getByText("Merge complete")).toBeTruthy();
  });

  it("shows error phase on error payload", () => {
    const { subscribeProviderEvents, emit } = makeSubscribe();
    const { getByText } = render(
      <MergeProgress taskId="t-1" subscribeProviderEvents={subscribeProviderEvents} />,
    );

    act(() => {
      emit(makeMergePhaseEvent("t-1", "commit", "completed", "rebase conflict"));
    });

    expect(getByText("rebase conflict")).toBeTruthy();
  });
});
