import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { CommandPalette, type PaletteAction } from "../CommandPalette";

describe("CommandPalette", () => {
  afterEach(cleanup);

  it("renders disabled actions with disabled attribute", () => {
    const run = vi.fn();
    const actions: PaletteAction[] = [
      { id: "open-pr", label: "Open current PR", group: "Workflow", disabled: true, run },
      { id: "land-pr", label: "Land current PR", group: "Workflow", disabled: false, run },
    ];

    render(<CommandPalette open onClose={() => {}} actions={actions} />);

    const openBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Open current PR",
    ) as HTMLButtonElement;
    const landBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Land current PR",
    ) as HTMLButtonElement;

    expect(openBtn).toBeDefined();
    expect(landBtn).toBeDefined();
    expect(openBtn.disabled).toBe(true);
    expect(landBtn.disabled).toBe(false);
  });

  it("does not invoke run() when a disabled action is clicked", () => {
    const run = vi.fn();
    const actions: PaletteAction[] = [
      { id: "open-pr", label: "Open current PR", group: "Workflow", disabled: true, run },
    ];

    render(<CommandPalette open onClose={() => {}} actions={actions} />);

    const openBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Open current PR",
    ) as HTMLButtonElement;

    fireEvent.click(openBtn);
    expect(run).not.toHaveBeenCalled();
  });

  it("invokes run() when an enabled action is clicked", async () => {
    const run = vi.fn();
    const onClose = vi.fn();
    const actions: PaletteAction[] = [
      { id: "land-pr", label: "Land current PR", group: "Workflow", run },
    ];

    render(<CommandPalette open onClose={onClose} actions={actions} />);

    const landBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Land current PR",
    ) as HTMLButtonElement;

    fireEvent.click(landBtn);

    await new Promise((r) => queueMicrotask(() => r(undefined)));

    expect(onClose).toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
