const VALID_STATUSES = [
  'pending', 'ready', 'running', 'completed', 'quality-pending',
  'finalizing', 'pr-open', 'ci-pending', 'needs-review', 'merged',
  'failed', 'cancelled',
];

export function createStatusDot(executionStatus, { busy = false, size = 'md' } = {}) {
  const span = document.createElement('span');
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', executionStatus);

  const classes = ['status-dot', size];

  if (VALID_STATUSES.includes(executionStatus)) {
    classes.push(`status-dot-${executionStatus}`);
  } else {
    classes.push('status-dot-pending');
  }

  if (busy) {
    classes.push('status-dot-busy');
  }

  span.className = classes.join(' ');
  return span;
}
