import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFab } from "../../../pwa/assets/components/fab.js";

beforeEach(() => {
  document.body.innerHTML = "";
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe("createFab", () => {
  it("renders a button element", () => {
    const { element } = createFab({ label: "Test", icon: "+", onClick: vi.fn() });
    expect(element.tagName).toBe("BUTTON");
  });

  it("has fab class", () => {
    const { element } = createFab({ label: "Test", icon: "+", onClick: vi.fn() });
    expect(element.classList.contains("fab")).toBe(true);
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    const { element } = createFab({ label: "Test", icon: "+", onClick });
    element.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("on mobile (width < 768) shows icon and has fab-mobile class", () => {
    Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true });
    const { element } = createFab({ label: "+ New Workflow", icon: "+", onClick: vi.fn() });
    expect(element.classList.contains("fab-mobile")).toBe(true);
    expect(element.textContent).toBe("+");
  });

  it("on desktop (width >= 768) shows label and has fab-desktop class", () => {
    Object.defineProperty(window, "innerWidth", { value: 1280, writable: true, configurable: true });
    const { element } = createFab({ label: "+ New Workflow", icon: "+", onClick: vi.fn() });
    expect(element.classList.contains("fab-desktop")).toBe(true);
    expect(element.textContent).toBe("+ New Workflow");
  });

  it("sets aria-label to provided label", () => {
    const { element } = createFab({ label: "+ New Workflow", icon: "+", onClick: vi.fn() });
    expect(element.getAttribute("aria-label")).toBe("+ New Workflow");
  });
});
