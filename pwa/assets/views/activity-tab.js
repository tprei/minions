import { createAuditFeed } from './audit-feed.js';
import { createAlertCenter } from './alert-center.js';
import { createPassport } from './passport.js';

export function createActivityTab({ apiBase = '', workflows: initialWorkflows = [], onRefresh } = {}) {
  let workflows = initialWorkflows;
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

  const passportBtn = document.createElement('button');
  passportBtn.className = 'activity-segment';
  passportBtn.dataset.view = 'passport';
  passportBtn.textContent = 'Passport';

  segmented.appendChild(auditBtn);
  segmented.appendChild(alertsBtn);
  segmented.appendChild(passportBtn);
  root.appendChild(segmented);

  const body = document.createElement('div');
  body.className = 'activity-body';
  root.appendChild(body);

  let auditFeed = null;
  let alertCenter = null;
  let passportView = null;
  let currentView = 'audit';

  function setActiveBtn(active) {
    auditBtn.classList.toggle('active', active === 'audit');
    alertsBtn.classList.toggle('active', active === 'alerts');
    passportBtn.classList.toggle('active', active === 'passport');
  }

  function showAudit() {
    currentView = 'audit';
    setActiveBtn('audit');
    body.innerHTML = '';

    if (!auditFeed) {
      auditFeed = createAuditFeed({ apiBase });
    }
    body.appendChild(auditFeed.element);
  }

  function showAlerts() {
    currentView = 'alerts';
    setActiveBtn('alerts');
    body.innerHTML = '';

    if (!alertCenter) {
      alertCenter = createAlertCenter({ apiBase });
    }
    body.appendChild(alertCenter.element);
  }

  function showPassport() {
    currentView = 'passport';
    setActiveBtn('passport');
    body.innerHTML = '';

    if (!passportView) {
      passportView = createPassport({ workflows, onRefresh });
    }
    body.appendChild(passportView.element);
  }

  auditBtn.addEventListener('click', () => {
    if (currentView !== 'audit') showAudit();
  });

  alertsBtn.addEventListener('click', () => {
    if (currentView !== 'alerts') showAlerts();
  });

  passportBtn.addEventListener('click', () => {
    if (currentView !== 'passport') showPassport();
  });

  showAudit();

  return {
    element: root,
    updateWorkflows(newWorkflows) {
      workflows = newWorkflows;
      if (passportView) passportView.update(newWorkflows);
    },
  };
}
