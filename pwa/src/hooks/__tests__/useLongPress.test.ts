import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useLongPress } from "../useLongPress";

describe("useLongPress", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("triggers after 500ms without significant movement", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress }));
    const { bind } = result.current;

    act(() => {
      bind.onPointerDown({ clientX: 100, clientY: 200, pointerId: 1 } as React.PointerEvent);
    });

    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith(100, 200);
  });

  it("does not trigger if pointer moves more than 10px", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress }));
    const { bind } = result.current;

    act(() => {
      bind.onPointerDown({ clientX: 100, clientY: 200, pointerId: 1 } as React.PointerEvent);
      bind.onPointerMove({ clientX: 120, clientY: 200, pointerId: 1 } as React.PointerEvent);
      vi.advanceTimersByTime(500);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does not trigger if pointer is released before 500ms", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress }));
    const { bind } = result.current;

    act(() => {
      bind.onPointerDown({ clientX: 100, clientY: 200, pointerId: 1 } as React.PointerEvent);
      vi.advanceTimersByTime(300);
      bind.onPointerUp({} as React.PointerEvent);
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
