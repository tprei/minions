import { describe, it, expect } from "vitest";
import { parseHash } from "../../pwa/assets/app-v1.js";

describe("parseHash", () => {
  it("extracts workflow id from valid hash", () => {
    expect(parseHash("#/workflow/abc")).toEqual({ workflowId: "abc", taskId: null });
  });

  it("handles alphanumeric ids", () => {
    expect(parseHash("#/workflow/wf-123-xyz")).toEqual({ workflowId: "wf-123-xyz", taskId: null });
  });

  it("returns null for empty hash", () => {
    expect(parseHash("")).toBeNull();
  });

  it("returns null for wrong route", () => {
    expect(parseHash("#/something-else")).toBeNull();
  });

  it("returns null for bare workflow prefix with no id", () => {
    expect(parseHash("#/workflow/")).toBeNull();
  });

  it("returns null for workflow with unknown nested path", () => {
    expect(parseHash("#/workflow/abc/tasks")).toBeNull();
  });

  it("extracts workflow id and task id from /task/:taskId form", () => {
    expect(parseHash("#/workflow/wf-1/task/task-a")).toEqual({ workflowId: "wf-1", taskId: "task-a" });
  });

  it("extracts workflow id and task id with complex ids", () => {
    expect(parseHash("#/workflow/wf-ui5-test/task/task-xyz-999")).toEqual({
      workflowId: "wf-ui5-test",
      taskId: "task-xyz-999",
    });
  });
});
