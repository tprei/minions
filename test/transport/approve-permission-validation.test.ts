import { describe, expect, it } from "vitest";
import { validateCommand } from "../../src/transport/validators.js";

describe("validateCommand approve-permission", () => {
  it("valid approve without reason is accepted", () => {
    const result = validateCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "task-1",
      requestId: "req-abc",
      decision: "approve",
    });
    expect(result.ok).toBe(true);
  });

  it("valid approve with reason is accepted", () => {
    const result = validateCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "task-1",
      requestId: "req-abc",
      decision: "approve",
      reason: "looks safe",
    });
    expect(result.ok).toBe(true);
  });

  it("valid deny with reason is accepted", () => {
    const result = validateCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "task-1",
      requestId: "req-abc",
      decision: "deny",
      reason: "not allowed",
    });
    expect(result.ok).toBe(true);
  });

  it("deny without reason is rejected", () => {
    const result = validateCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "task-1",
      requestId: "req-abc",
      decision: "deny",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.field).toBe("reason");
      expect(result.failure.expected).toBe("non-empty string");
    }
  });

  it("deny with empty reason is rejected", () => {
    const result = validateCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "task-1",
      requestId: "req-abc",
      decision: "deny",
      reason: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.field).toBe("reason");
    }
  });

  it("unknown decision value is rejected", () => {
    const result = validateCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "task-1",
      requestId: "req-abc",
      decision: "maybe",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.field).toBe("decision");
    }
  });

  it("missing requestId is rejected", () => {
    const result = validateCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "task-1",
      decision: "approve",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.field).toBe("requestId");
    }
  });

  it("missing taskId is rejected", () => {
    const result = validateCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      requestId: "req-abc",
      decision: "approve",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.field).toBe("taskId");
    }
  });

  it("missing workflowId is rejected", () => {
    const result = validateCommand({
      kind: "approve-permission",
      taskId: "task-1",
      requestId: "req-abc",
      decision: "approve",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.field).toBe("workflowId");
    }
  });

  it("non-string reason is rejected on approve", () => {
    const result = validateCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "task-1",
      requestId: "req-abc",
      decision: "approve",
      reason: 99,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.field).toBe("reason");
      expect(result.failure.expected).toBe("string");
    }
  });

  it("empty string reason is rejected on deny", () => {
    const result = validateCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "task-1",
      requestId: "req-abc",
      decision: "deny",
      reason: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.field).toBe("reason");
    }
  });

  it("valid string reason is accepted on approve", () => {
    const result = validateCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "task-1",
      requestId: "req-abc",
      decision: "approve",
      reason: "looks good",
    });
    expect(result.ok).toBe(true);
  });
});
