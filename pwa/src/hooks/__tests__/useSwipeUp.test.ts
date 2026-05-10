import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useSwipeUp } from "../useSwipeUp";

function makeMockElement(): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "getBoundingClientRect", {
    value: () => ({ bottom: 800, top: 0, left: 0, right: 375, width: 375, height: 800 }),
  });
  document.body.appendChild(el);
  return el;
}

describe("useSwipeUp", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("triggers onSwipeUp when dragging up past threshold from bottom edge", () => {
    const onSwipeUp = vi.fn();
    const { result } = renderHook(() => useSwipeUp({ onSwipeUp }));
    const el = makeMockElement();
    result.current.ref(el);

    el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 780, bubbles: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 660, bubbles: true, pointerId: 1 }));

    expect(onSwipeUp).toHaveBeenCalledTimes(1);
  });

  it("does not trigger if drag is insufficient", () => {
    const onSwipeUp = vi.fn();
    const { result } = renderHook(() => useSwipeUp({ onSwipeUp }));
    const el = makeMockElement();
    result.current.ref(el);

    el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 780, bubbles: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 750, bubbles: true, pointerId: 1 }));

    expect(onSwipeUp).not.toHaveBeenCalled();
  });

  it("does not trigger if not starting from bottom edge", () => {
    const onSwipeUp = vi.fn();
    const { result } = renderHook(() => useSwipeUp({ onSwipeUp }));
    const el = makeMockElement();
    result.current.ref(el);

    el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 400, bubbles: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true, pointerId: 1 }));

    expect(onSwipeUp).not.toHaveBeenCalled();
  });
});
