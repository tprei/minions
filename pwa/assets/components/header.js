export function createAppHeader({ title, statusBadgeNode = null, rightSlot = null } = {}) {
  const el = document.createElement('header');
  el.className = 'app-header';
  el.style.cssText = 'position:sticky;top:0;z-index:10;padding:10px 16px;border-bottom:1px solid hsl(var(--border));display:flex;align-items:center;justify-content:space-between;';

  const left = document.createElement('div');
  left.style.cssText = 'display:flex;align-items:center;gap:8px;';

  const h1 = document.createElement('h1');
  h1.style.cssText = 'font-family:"Bricolage Grotesque",sans-serif;font-size:14px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:hsl(var(--accent));';
  h1.textContent = title ?? 'Minions';
  left.appendChild(h1);

  if (statusBadgeNode) {
    left.appendChild(statusBadgeNode);
  }

  el.appendChild(left);

  if (rightSlot) {
    el.appendChild(rightSlot);
  }

  return el;
}
