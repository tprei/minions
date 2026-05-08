export function createFab({ label = '+ New Workflow', icon = '+', onClick } = {}) {
  const isDesktop = () => window.innerWidth >= 768;

  const btn = document.createElement('button');
  btn.className = 'fab';
  btn.setAttribute('aria-label', label);

  function applyLayout() {
    if (isDesktop()) {
      btn.classList.add('fab-desktop');
      btn.classList.remove('fab-mobile');
      btn.textContent = label;
    } else {
      btn.classList.add('fab-mobile');
      btn.classList.remove('fab-desktop');
      btn.textContent = icon;
    }
  }

  applyLayout();

  const mq = window.matchMedia('(min-width: 768px)');
  const onMqChange = () => applyLayout();
  if (mq.addEventListener) {
    mq.addEventListener('change', onMqChange);
  }

  if (onClick) {
    btn.addEventListener('click', onClick);
  }

  return { element: btn };
}
