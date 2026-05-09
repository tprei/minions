import { createAuditFeed } from './audit-feed.js';
import { createAlertCenter } from './alert-center.js';

export function createActivityTab({ apiBase = '' } = {}) {
  const root = document.createElement('div');
  root.className = 'activity-tab';

  const segmented = document.createElement('div');
  segmented.className = 'activity-segmented';

  const auditBtn = document.createElement('button');
  auditBtn.className = 'activity-segment active';
  auditBtn.dataset.view = 'audit';
  auditBtn.textContent = 'Audit';

  const alertsBtn = document.createElement('button');
  alertsBtn.className = 'activity-segment';
  alertsBtn.dataset.view = 'alerts';
  alertsBtn.textContent = 'Alerts';

  segmented.appendChild(auditBtn);
  segmented.appendChild(alertsBtn);
  root.appendChild(segmented);

  const body = document.createElement('div');
  body.className = 'activity-body';
  root.appendChild(body);

  let auditFeed = null;
  let alertCenter = null;
  let currentView = 'audit';

  function showAudit() {
    currentView = 'audit';
    auditBtn.classList.add('active');
    alertsBtn.classList.remove('active');
    body.innerHTML = '';

    if (!auditFeed) {
      auditFeed = createAuditFeed({ apiBase });
    }
    body.appendChild(auditFeed.element);
  }

  function showAlerts() {
    currentView = 'alerts';
    alertsBtn.classList.add('active');
    auditBtn.classList.remove('active');
    body.innerHTML = '';

    if (!alertCenter) {
      alertCenter = createAlertCenter({ apiBase });
    }
    body.appendChild(alertCenter.element);
  }

  auditBtn.addEventListener('click', () => {
    if (currentView !== 'audit') showAudit();
  });

  alertsBtn.addEventListener('click', () => {
    if (currentView !== 'alerts') showAlerts();
  });

  showAudit();

  return { element: root };
}
