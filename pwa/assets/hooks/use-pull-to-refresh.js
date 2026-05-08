export function attachPullToRefresh(scrollable, { threshold = 64, onRefresh } = {}) {
  let startY = null;
  let pulling = false;
  let refreshing = false;

  function findInnerScrollable(target) {
    let el = target;
    while (el && el !== scrollable) {
      const overflow = window.getComputedStyle(el).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function onTouchStart(e) {
    if (refreshing) return;
    if (scrollable.scrollTop !== 0) return;
    const inner = findInnerScrollable(e.target);
    if (inner && inner !== scrollable) return;
    startY = e.touches[0].clientY;
    pulling = false;
  }

  function onTouchMove(e) {
    if (refreshing || startY === null) return;
    if (scrollable.scrollTop > 0) {
      startY = null;
      return;
    }
    const deltaY = e.touches[0].clientY - startY;
    if (deltaY > 10) {
      pulling = true;
      e.preventDefault();
    }
  }

  function onTouchEnd() {
    if (refreshing || startY === null || !pulling) {
      startY = null;
      pulling = false;
      return;
    }
    const deltaY = (window._lastTouchY ?? 0) - startY;
    startY = null;
    pulling = false;

    if (deltaY >= threshold) {
      refreshing = true;
      Promise.resolve(onRefresh?.()).finally(() => {
        refreshing = false;
      });
    }
  }

  function onTouchMoveTrack(e) {
    window._lastTouchY = e.touches[0]?.clientY;
    onTouchMove(e);
  }

  scrollable.addEventListener('touchstart', onTouchStart, { passive: true });
  scrollable.addEventListener('touchmove', onTouchMoveTrack, { passive: false });
  scrollable.addEventListener('touchend', onTouchEnd);
  scrollable.addEventListener('touchcancel', onTouchEnd);

  return {
    destroy() {
      scrollable.removeEventListener('touchstart', onTouchStart);
      scrollable.removeEventListener('touchmove', onTouchMoveTrack);
      scrollable.removeEventListener('touchend', onTouchEnd);
      scrollable.removeEventListener('touchcancel', onTouchEnd);
    },
  };
}
