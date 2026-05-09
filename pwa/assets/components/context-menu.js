import { attachLongPress } from '../hooks/use-long-press.js';

export function createContextMenu({ target, items = [] } = {}) {
  let menuEl = null;
  let longPressHandle = null;

  function showMenu(e) {
    closeMenu();

    menuEl = document.createElement('div');
    menuEl.className = 'context-menu';
    menuEl.setAttribute('role', 'menu');

    const x = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const y = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    menuEl.style.position = 'fixed';
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;

    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'context-menu-item';
      btn.setAttribute('role', 'menuitem');
      btn.type = 'button';
      btn.textContent = item.label ?? '';
      btn.addEventListener('click', () => {
        item.onClick?.();
        closeMenu();
      });
      menuEl.appendChild(btn);
    }

    document.body.appendChild(menuEl);

    setTimeout(() => {
      document.addEventListener('click', onOutsideClick);
      document.addEventListener('keydown', onKeyDown);
    }, 0);
  }

  function closeMenu() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onKeyDown);
  }

  function onOutsideClick(e) {
    if (menuEl && !menuEl.contains(e.target)) {
      closeMenu();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      closeMenu();
    }
  }

  if (target) {
    longPressHandle = attachLongPress(target, {
      duration: 500,
      onLongPress(e) {
        showMenu(e);
      },
    });
  }

  function destroy() {
    closeMenu();
    longPressHandle?.destroy();
  }

  return {
    destroy,
    showMenu,
    closeMenu,
  };
}

export function createKanbanCardContextMenu(card, { workflowId, taskId, hasPr = false, executionStatus = '' } = {}) {
  const PINNED_KEY = 'pinned-workflows';

  function getPinned() {
    try {
      return new Set(JSON.parse(localStorage.getItem(PINNED_KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  }

  function setPinned(set) {
    localStorage.setItem(PINNED_KEY, JSON.stringify([...set]));
  }

  const items = [
    {
      label: 'Pin',
      onClick() {
        const pinned = getPinned();
        if (pinned.has(workflowId)) {
          pinned.delete(workflowId);
        } else {
          pinned.add(workflowId);
        }
        setPinned(pinned);
      },
    },
  ];

  const isFailedOrCancelled = executionStatus === 'failed' || executionStatus === 'cancelled';
  if (isFailedOrCancelled) {
    items.push({
      label: 'Retry',
      onClick() {
        fetch('/commands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'retry-task', workflowId, taskId }),
        }).catch(() => {});
      },
    });
  }

  if (hasPr) {
    items.push({
      label: 'Jump to PR',
      onClick() {
        window.location.hash = `#/workflow/${workflowId}/task/${taskId}`;
      },
    });
  }

  return createContextMenu({ target: card, items });
}
