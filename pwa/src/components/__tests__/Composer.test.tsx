import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { ProviderEvent } from "../../domain/providerEvent";
import type { TaskExecutionStatus } from "../../domain/types";

vi.mock("../../transport/rest", () => ({
  postCommand: vi.fn().mockResolvedValue(undefined),
}));

import { Composer } from "../Composer";
import { postCommand } from "../../transport/rest";

const approval: ProviderEvent = {
  kind: "permission_request",
  id: "req-1",
  tool: "bash",
  input: { command: "ls" },
};

function renderApprovalComposer(extraProps?: { onApprovalResolved?: () => void }) {
  return render(
    <Composer
      workflowId="wf-1"
      taskId="t-1"
      executionStatus="running"
      pendingApproval={approval}
      queuedMessage={null}
      onQueue={() => undefined}
      onApprovalResolved={extraProps?.onApprovalResolved}
    />,
  );
}

function renderComposer(executionStatus: TaskExecutionStatus) {
  return render(
    <Composer
      workflowId="wf-1"
      taskId="t-1"
      executionStatus={executionStatus}
      pendingApproval={null}
      queuedMessage={null}
      onQueue={() => undefined}
    />,
  );
}

describe("Composer unavailable states", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders textarea and disabled submit button for merged status", () => {
    const { container } = renderComposer("merged");
    const textarea = container.querySelector("textarea");
    const button = container.querySelector("button[disabled]");
    expect(textarea).not.toBeNull();
    expect(button).not.toBeNull();
  });

  it("renders textarea and disabled submit button for completed status", () => {
    const { container } = renderComposer("completed");
    const textarea = container.querySelector("textarea");
    const button = container.querySelector("button[disabled]");
    expect(textarea).not.toBeNull();
    expect(button).not.toBeNull();
  });

  it("shows reason text for merged", () => {
    const { getByRole } = renderComposer("merged");
    const status = getByRole("status");
    expect(status.textContent).toContain("complete");
  });

  it("shows reason text for cancelled", () => {
    const { getByRole } = renderComposer("cancelled");
    const status = getByRole("status");
    expect(status.textContent).toContain("cancelled");
  });

  it("shows reason text for pending", () => {
    const { getByRole } = renderComposer("pending");
    const status = getByRole("status");
    expect(status.textContent).toContain("waiting");
  });

  it("shows reason text for finalizing", () => {
    const { getByRole } = renderComposer("finalizing");
    const status = getByRole("status");
    expect(status.textContent).toContain("finaliz");
  });
});

describe("Composer approval mode", () => {
  beforeEach(() => {
    vi.mocked(postCommand).mockClear();
    vi.mocked(postCommand).mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("approves on 'a' keydown when no input is focused", async () => {
    renderApprovalComposer();
    fireEvent.keyDown(document, { key: "a" });
    expect(postCommand).toHaveBeenCalledTimes(1);
    expect(postCommand).toHaveBeenCalledWith({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "t-1",
      requestId: "req-1",
      decision: "approve",
    });
  });

  it("approves on uppercase 'A' keydown", () => {
    renderApprovalComposer();
    fireEvent.keyDown(document, { key: "A" });
    expect(postCommand).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "approve", requestId: "req-1" }),
    );
  });

  it("denies on 'd' keydown with a non-empty reason", () => {
    renderApprovalComposer();
    fireEvent.keyDown(document, { key: "d" });
    expect(postCommand).toHaveBeenCalledTimes(1);
    const call = vi.mocked(postCommand).mock.calls[0][0];
    expect(call).toMatchObject({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "t-1",
      requestId: "req-1",
      decision: "deny",
    });
    if (call.kind === "approve-permission" && call.decision === "deny") {
      expect(call.reason).toBeTruthy();
      expect(call.reason!.length).toBeGreaterThan(0);
    }
  });

  it("does NOT trigger A/D when an input element is focused", () => {
    renderApprovalComposer();

    const externalInput = document.createElement("input");
    document.body.appendChild(externalInput);
    externalInput.focus();
    expect(document.activeElement).toBe(externalInput);

    fireEvent.keyDown(document, { key: "a" });
    fireEvent.keyDown(document, { key: "d" });

    expect(postCommand).not.toHaveBeenCalled();

    document.body.removeChild(externalInput);
  });

  it("does NOT trigger A/D when a textarea is focused", () => {
    renderApprovalComposer();

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    fireEvent.keyDown(document, { key: "a" });
    expect(postCommand).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it("calls onApprovalResolved after a successful approve", async () => {
    const onResolved = vi.fn();
    renderApprovalComposer({ onApprovalResolved: onResolved });
    fireEvent.keyDown(document, { key: "a" });
    await vi.waitFor(() => {
      expect(onResolved).toHaveBeenCalledTimes(1);
    });
  });

  it("approves on Approve button click", async () => {
    const onResolved = vi.fn();
    const { getByText } = renderApprovalComposer({ onApprovalResolved: onResolved });
    fireEvent.click(getByText("Approve (A)"));
    expect(postCommand).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "approve" }),
    );
    await vi.waitFor(() => {
      expect(onResolved).toHaveBeenCalledTimes(1);
    });
  });
});
