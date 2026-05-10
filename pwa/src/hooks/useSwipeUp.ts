import { useEffect, useRef, useCallback } from "react";

const EDGE_HEIGHT_PX = 60;
const DRAG_THRESHOLD_PX = 100;

interface SwipeUpOptions {
  onSwipeUp: () => void;
}

interface SwipeUpBind {
  ref: (el: HTMLElement | null) => void;
}

export function useSwipeUp({ onSwipeUp }: SwipeUpOptions): SwipeUpBind {
  const elRef = useRef<HTMLElement | null>(null);
  const onSwipeUpRef = useRef(onSwipeUp);
  onSwipeUpRef.current = onSwipeUp;
  const cleanupRef = useRef<(() => void) | null>(null);

  const attach = useCallback((el: HTMLElement): void => {
    let startY: number | null = null;
    let pointerId: number | null = null;
    let armed = false;

    function onPointerDown(e: PointerEvent): void {
      const rect = el.getBoundingClientRect();
      const fromBottom = rect.bottom - e.clientY;
      if (fromBottom <= EDGE_HEIGHT_PX) {
        startY = e.clientY;
        pointerId = e.pointerId;
        armed = true;
      }
    }

    function onPointerUp(e: PointerEvent): void {
      if (!armed || pointerId !== e.pointerId || startY === null) return;
      const dy = startY - e.clientY;
      armed = false;
      startY = null;
      pointerId = null;
      if (dy >= DRAG_THRESHOLD_PX) {
        onSwipeUpRef.current();
      }
    }

    function onPointerCancel(): void {
      armed = false;
      startY = null;
      pointerId = null;
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);

    cleanupRef.current = () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
    };
  }, []);

  const ref = useCallback(
    (el: HTMLElement | null) => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      elRef.current = el;
      if (el) attach(el);
    },
    [attach],
  );

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return { ref };
}
