export function attachSwipeToDismiss(panel, { direction = 'down', threshold = 80, onDismiss } = {}) {
  let startX = null;
  let startY = null;
  let dragging = false;
  let startTime = 0;

  function onPointerDown(e) {
    const isInteractive = e.target && e.target.closest('button, input, textarea, select, a, label, [role="button"], [contenteditable="true"]');
    if (isInteractive) return;
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;
    startTime = Date.now();
    panel.style.transition = 'none';
    panel.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    if (direction === 'down' && deltaY > 0) {
      const capped = Math.min(deltaY, threshold * 2);
      panel.style.transform = `translateY(${capped}px)`;
    } else if (direction === 'right' && deltaX > 0) {
      const capped = Math.min(deltaX, threshold * 2);
      panel.style.transform = `translateX(${capped}px)`;
    }
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    const elapsed = Date.now() - startTime;
    const velocity = Math.abs(direction === 'down' ? deltaY : deltaX) / elapsed;
    const delta = direction === 'down' ? deltaY : deltaX;

    panel.style.transition = 'transform 0.3s ease-out';

    if (delta > threshold || velocity > 0.5) {
      const translate = direction === 'down' ? 'translateY(100%)' : 'translateX(100%)';
      panel.style.transform = translate;
      setTimeout(() => {
        onDismiss?.();
      }, 300);
    } else {
      panel.style.transform = direction === 'down' ? 'translateY(0)' : 'translateX(0)';
    }
  }

  function onPointerCancel() {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = 'transform 0.3s ease-out';
    panel.style.transform = direction === 'down' ? 'translateY(0)' : 'translateX(0)';
  }

  panel.addEventListener('pointerdown', onPointerDown);
  panel.addEventListener('pointermove', onPointerMove);
  panel.addEventListener('pointerup', onPointerUp);
  panel.addEventListener('pointercancel', onPointerCancel);

  return {
    destroy() {
      panel.removeEventListener('pointerdown', onPointerDown);
      panel.removeEventListener('pointermove', onPointerMove);
      panel.removeEventListener('pointerup', onPointerUp);
      panel.removeEventListener('pointercancel', onPointerCancel);
    },
  };
}
