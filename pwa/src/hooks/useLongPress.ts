import { useRef } from "react";

const HOLD_DURATION_MS = 500;
const MOVE_CANCEL_PX = 10;

interface LongPressOptions {
  onLongPress: (x: number, y: number) => void;
}

interface LongPressBind {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

export function useLongPress({ onLongPress }: LongPressOptions): { bind: LongPressBind } {
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancel(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }

  const bind: LongPressBind = {
    onPointerDown(e) {
      startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      timerRef.current = setTimeout(() => {
        if (startRef.current !== null) {
          onLongPress(startRef.current.x, startRef.current.y);
          startRef.current = null;
        }
      }, HOLD_DURATION_MS);
    },
    onPointerMove(e) {
      if (!startRef.current || startRef.current.pointerId !== e.pointerId) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) {
        cancel();
      }
    },
    onPointerUp() {
      cancel();
    },
    onPointerCancel() {
      cancel();
    },
  };

  return { bind };
}
