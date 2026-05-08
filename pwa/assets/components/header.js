export function createTasksPill({ taskCount = 0, hasNonClean = false, onClick } = {}) {
  const btn = document.createElement("button");
  btn.className = `tasks-pill${hasNonClean ? " tasks-pill-dirty" : ""}`;
  btn.setAttribute("aria-label", `Tasks (${taskCount})`);

  const label = document.createTextNode(`Tasks · ${taskCount}`);
  btn.appendChild(label);

  if (hasNonClean) {
    const dot = document.createElement("span");
    dot.className = "tasks-pill-alert";
    btn.appendChild(dot);
  }

  if (onClick) {
    btn.addEventListener("click", onClick);
  }

  return btn;
}

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
