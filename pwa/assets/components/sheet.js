import { attachSwipeToDismiss } from '../hooks/use-swipe-to-dismiss.js';

export function createSheet({ title = '', body = null, side = 'bottom' } = {}) {
  const isMobile = () => window.innerWidth <= 768;
  const resolvedSide = () => (isMobile() ? 'bottom' : side === 'right' ? 'right' : 'bottom');

  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';

  const panel = document.createElement('div');
  panel.className = `sheet-panel ${resolvedSide()}`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const handle = document.createElement('div');
  handle.className = 'sheet-handle';
  handle.setAttribute('aria-hidden', 'true');

  const headerEl = document.createElement('div');
  headerEl.className = 'sheet-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'sheet-title';
  titleEl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sheet-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';

  headerEl.appendChild(titleEl);
  headerEl.appendChild(closeBtn);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'sheet-body';

  if (body instanceof Node) {
    bodyEl.appendChild(body);
  } else if (typeof body === 'string') {
    bodyEl.innerHTML = body;
  }

  panel.appendChild(handle);
  panel.appendChild(headerEl);
  panel.appendChild(bodyEl);

  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  let swipeHandle = null;

  function open() {
    const side = resolvedSide();
    panel.className = `sheet-panel ${side}`;
    overlay.classList.add('open');
    panel.classList.add('open');

    if (side === 'bottom') {
      swipeHandle = attachSwipeToDismiss(panel, {
        direction: 'down',
        threshold: 80,
        onDismiss: close,
      });
    }
  }

  function close() {
    overlay.classList.remove('open');
    panel.classList.remove('open');
    swipeHandle?.destroy();
    swipeHandle = null;
  }

  function destroy() {
    close();
    overlay.remove();
    panel.remove();
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) {
      close();
    }
  });

  open();

  return { open, close, destroy, panel, overlay };
}
