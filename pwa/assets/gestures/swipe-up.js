function isGestureEnabled() {
  if (new URLSearchParams(window.location.search).get('gestures') === 'force') return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

export function attachSwipeUp(target, { threshold = 64, edgeZone = 24, onTrigger } = {}) {
  let startX = null;
  let startY = null;
  let tracking = false;

  function onPointerDown(e) {
    if (!isGestureEnabled()) return;
    const isInteractive = e.target && e.target.closest('button, input, textarea, select, a, label, [role="button"], [contenteditable="true"]');
    if (isInteractive) return;

    const viewportHeight = window.innerHeight;
    const fromBottom = viewportHeight - e.clientY;
    if (fromBottom > edgeZone) return;

    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
  }

  function onPointerMove(e) {
    if (!tracking) return;
    const deltaY = e.clientY - startY;
    if (deltaY < -threshold) {
      tracking = false;
      onTrigger?.();
    }
  }

  function onPointerUp() {
    tracking = false;
    startX = null;
    startY = null;
  }

  function onPointerCancel() {
    tracking = false;
    startX = null;
    startY = null;
  }

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerCancel);

  return {
    destroy() {
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerCancel);
    },
  };
}
