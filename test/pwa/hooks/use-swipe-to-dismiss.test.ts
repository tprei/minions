import { describe, it, expect, beforeEach, vi } from "vitest";
import { attachSwipeToDismiss } from "../../../pwa/assets/hooks/use-swipe-to-dismiss.js";

function makePointerEvent(type: string, init: Partial<PointerEventInit> & { target?: EventTarget }) {
  const { target, ...rest } = init;
  const event = new PointerEvent(type, { pointerId: 1, bubbles: true, cancelable: true, ...rest });
  if (target) {
    Object.defineProperty(event, "target", { value: target, configurable: true });
  }
  return event;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("attachSwipeToDismiss — interactive guard", () => {
  it("does not capture pointer when pointerdown target is a button", () => {
    const panel = document.createElement("div");
    panel.setPointerCapture = vi.fn();
    const onDismiss = vi.fn();
    attachSwipeToDismiss(panel, { direction: "down", threshold: 80, onDismiss });

    const btn = document.createElement("button");
    panel.appendChild(btn);
    const event = makePointerEvent("pointerdown", { clientX: 100, clientY: 100, target: btn });
    panel.dispatchEvent(event);

    expect(panel.setPointerCapture).not.toHaveBeenCalled();
  });

  it("does not capture pointer when pointerdown target is a nested icon inside a button", () => {
    const panel = document.createElement("div");
    panel.setPointerCapture = vi.fn();
    const onDismiss = vi.fn();
    attachSwipeToDismiss(panel, { direction: "down", threshold: 80, onDismiss });

    const btn = document.createElement("button");
    const icon = document.createElement("span");
    btn.appendChild(icon);
    panel.appendChild(btn);

    const event = makePointerEvent("pointerdown", { clientX: 100, clientY: 100, target: icon });
    panel.dispatchEvent(event);

    expect(panel.setPointerCapture).not.toHaveBeenCalled();
  });

  it("does not capture pointer when pointerdown target is an SVG inside a button", () => {
    const panel = document.createElement("div");
    panel.setPointerCapture = vi.fn();
    const onDismiss = vi.fn();
    attachSwipeToDismiss(panel, { direction: "down", threshold: 80, onDismiss });

    const btn = document.createElement("button");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    btn.appendChild(svg);
    panel.appendChild(btn);

    const event = makePointerEvent("pointerdown", { clientX: 100, clientY: 100, target: svg });
    panel.dispatchEvent(event);

    expect(panel.setPointerCapture).not.toHaveBeenCalled();
  });

  it("captures pointer when pointerdown target is a plain div", () => {
    const panel = document.createElement("div");
    panel.setPointerCapture = vi.fn();
    const onDismiss = vi.fn();
    attachSwipeToDismiss(panel, { direction: "down", threshold: 80, onDismiss });

    const div = document.createElement("div");
    panel.appendChild(div);
    const event = makePointerEvent("pointerdown", { clientX: 100, clientY: 100, target: div });
    panel.dispatchEvent(event);

    expect(panel.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("does not capture pointer when target is an [role=button] element", () => {
    const panel = document.createElement("div");
    panel.setPointerCapture = vi.fn();
    const onDismiss = vi.fn();
    attachSwipeToDismiss(panel, { direction: "down", threshold: 80, onDismiss });

    const el = document.createElement("div");
    el.setAttribute("role", "button");
    panel.appendChild(el);

    const event = makePointerEvent("pointerdown", { clientX: 100, clientY: 100, target: el });
    panel.dispatchEvent(event);

    expect(panel.setPointerCapture).not.toHaveBeenCalled();
  });
});
