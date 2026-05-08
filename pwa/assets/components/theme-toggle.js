const THEME_COLORS = {
  light: '#f7f4f0',
  dark: '#0a0908',
  system: '#0a0908',
};

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(pref) {
  if (pref === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = pref;
  }

  const resolved = pref === 'system' ? getSystemTheme() : pref;
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', THEME_COLORS[resolved]);
  }
}

function readPref() {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function createThemeToggle() {
  const wrapper = document.createElement('div');
  wrapper.className = 'theme-toggle';
  wrapper.setAttribute('role', 'group');
  wrapper.setAttribute('aria-label', 'Theme');

  const options = [
    { value: 'light', label: '☀️', title: 'Light' },
    { value: 'dark', label: '🌙', title: 'Dark' },
    { value: 'system', label: '⚙️', title: 'System' },
  ];

  let current = readPref();

  function render() {
    wrapper.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.value === current);
    });
  }

  options.forEach(({ value, label, title }) => {
    const btn = document.createElement('button');
    btn.className = 'theme-btn';
    btn.dataset.value = value;
    btn.title = title;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      current = value;
      localStorage.setItem('theme', value);
      applyTheme(value);
      render();
    });
    wrapper.appendChild(btn);
  });

  applyTheme(current);
  render();

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (current === 'system') {
      applyTheme('system');
    }
  });

  return wrapper;
}

export function restoreTheme() {
  applyTheme(readPref());
}
