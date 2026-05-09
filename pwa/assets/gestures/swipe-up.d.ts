export interface SwipeUpOptions {
  threshold?: number;
  edgeZone?: number;
  onTrigger?: () => void;
}

export interface SwipeUpHandle {
  destroy(): void;
}

export declare function attachSwipeUp(
  target: EventTarget,
  options?: SwipeUpOptions,
): SwipeUpHandle;
