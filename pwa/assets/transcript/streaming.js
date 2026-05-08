const DEFAULT_INTERVAL_MS = 33;

export function createStreamBuffer({ intervalMs = DEFAULT_INTERVAL_MS, onFlush } = {}) {
  let buffer = "";
  let accumulated = "";
  let timer = null;

  function flush() {
    if (!buffer) return;
    accumulated += buffer;
    const chunk = buffer;
    buffer = "";
    onFlush(chunk, accumulated);
  }

  function appendDelta(text) {
    buffer += text;
    if (timer === null) {
      timer = setInterval(() => {
        flush();
      }, intervalMs);
    }
  }

  function flushNow() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    flush();
  }

  function reset() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    buffer = "";
    accumulated = "";
  }

  function getAccumulated() {
    return accumulated;
  }

  return { appendDelta, flush: flushNow, reset, getAccumulated };
}
