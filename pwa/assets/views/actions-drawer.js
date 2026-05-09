import { createSheet } from '../components/sheet.js';

export function createActionsDrawer({ actions = [] } = {}) {
  let sheet = null;

  function buildSheet() {
    if (sheet) return sheet;

    const body = document.createElement('div');
    body.className = 'actions-drawer-body';

    for (const action of actions) {
      const row = document.createElement('button');
      row.className = 'actions-drawer-row';
      row.type = 'button';

      const icon = document.createElement('span');
      icon.className = 'actions-drawer-icon';
      icon.textContent = action.icon ?? '';

      const label = document.createElement('span');
      label.className = 'actions-drawer-label';
      label.textContent = action.label ?? '';

      row.appendChild(icon);
      row.appendChild(label);

      row.addEventListener('click', () => {
        action.onClick?.();
        close();
      });

      body.appendChild(row);
    }

    sheet = createSheet({ title: 'Actions', body, side: 'bottom' });
    sheet.close();
    return sheet;
  }

  function open() {
    buildSheet().open();
  }

  function close() {
    if (sheet) sheet.close();
  }

  function destroy() {
    if (sheet) {
      sheet.destroy();
      sheet = null;
    }
  }

  const placeholder = document.createElement('div');
  placeholder.className = 'actions-drawer-placeholder';
  placeholder.style.display = 'none';

  return {
    element: placeholder,
    open,
    close,
    destroy,
  };
}

export function createDefaultActionsDrawer({ onSwitchView, onToggleTheme } = {}) {
  const actions = [
    {
      label: 'Jump to workflow',
      icon: '⊕',
      onClick() {
        const id = window.prompt('Workflow ID:');
        if (id) window.location.hash = `#/workflow/${id.trim()}`;
      },
    },
    {
      label: 'Switch view',
      icon: '⇄',
      onClick() {
        if (typeof onSwitchView === 'function') {
          onSwitchView();
        } else {
          const hash = window.location.hash;
          if (hash.startsWith('#/activity')) {
            window.location.hash = '#/';
          } else {
            window.location.hash = '#/activity';
          }
        }
      },
    },
    {
      label: 'Toggle theme',
      icon: '◑',
      onClick() {
        if (typeof onToggleTheme === 'function') {
          onToggleTheme();
        }
      },
    },
    {
      label: 'Open audit',
      icon: '◈',
      onClick() {
        window.location.hash = '#/activity';
      },
    },
  ];

  return createActionsDrawer({ actions });
}
