export function attachLongPress(target, { duration = 500, onLongPress } = {}) {
  let timer = null;
  let fired = false;

  function start(e) {
    fired = false;
    timer = setTimeout(() => {
      fired = true;
      onLongPress(e);
    }, duration);
  }

  function cancel() {
    clearTimeout(timer);
    timer = null;
  }

  function pointerUp() {
    if (!fired) cancel();
  }

  target.addEventListener('pointerdown', start);
  target.addEventListener('pointerup', pointerUp);
  target.addEventListener('pointercancel', cancel);
  target.addEventListener('pointermove', cancel);

  return {
    destroy() {
      cancel();
      target.removeEventListener('pointerdown', start);
      target.removeEventListener('pointerup', pointerUp);
      target.removeEventListener('pointercancel', cancel);
      target.removeEventListener('pointermove', cancel);
    },
  };
}
