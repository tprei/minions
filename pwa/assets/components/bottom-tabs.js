export function createBottomTabs(tabs, activeId) {
  const nav = document.createElement('nav');
  nav.className = 'bottom-tabs';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Main navigation');

  let currentActive = activeId;

  const buttons = tabs.map(({ id, label, icon, onSelect }) => {
    const btn = document.createElement('button');
    btn.className = 'bottom-tab' + (id === currentActive ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', id === currentActive ? 'true' : 'false');
    btn.dataset.id = id;

    const iconEl = document.createElement('span');
    iconEl.className = 'bottom-tab-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;

    btn.appendChild(iconEl);
    btn.appendChild(labelEl);

    btn.addEventListener('click', () => {
      currentActive = id;
      buttons.forEach((b) => {
        const isActive = b.dataset.id === currentActive;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      onSelect(id);
    });

    return btn;
  });

  buttons.forEach((btn) => nav.appendChild(btn));

  return nav;
}
