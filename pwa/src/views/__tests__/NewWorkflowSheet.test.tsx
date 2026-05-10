import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";

vi.mock("../../transport/rest", () => ({
  createWorkflow: vi.fn().mockResolvedValue({ id: "wf-new" }),
}));

vi.mock("../../routing/router", () => ({
  navigate: vi.fn(),
}));

import { NewWorkflowSheet } from "../NewWorkflowSheet";

describe("NewWorkflowSheet — task remove dep remap", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("removes the deleted task id from other tasks dependsOn chips", () => {
    render(<NewWorkflowSheet />);

    const kindSelect = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(kindSelect, { target: { value: "manual-dag" } });

    const addBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("+ Add task"),
    );
    expect(addBtn).toBeDefined();
    fireEvent.click(addBtn!);

    fireEvent.click(addBtn!);

    const chips = document.querySelectorAll("button[class*='rounded-full']");
    expect(chips.length).toBeGreaterThan(0);

    const t1Chip = Array.from(chips).find((c) => c.textContent === "t1");
    if (t1Chip) {
      fireEvent.click(t1Chip);
    }

    const removeButtons = Array.from(document.querySelectorAll("button")).filter((b) =>
      b.getAttribute("aria-label")?.startsWith("Remove task"),
    );
    expect(removeButtons.length).toBeGreaterThan(0);
    fireEvent.click(removeButtons[0]!);

    const remainingChips = document.querySelectorAll("button[class*='rounded-full']");
    const t1RemainingChip = Array.from(remainingChips).find(
      (c) => c.textContent === "t1" && c.classList.toString().includes("bg-accent"),
    );
    expect(t1RemainingChip).toBeUndefined();
  });
});
