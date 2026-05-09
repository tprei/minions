import { agentColor } from '../utils/agent-color.js';

const VALID_STATUSES = [
  'pending', 'ready', 'running', 'completed', 'quality-pending',
  'finalizing', 'pr-open', 'ci-pending', 'needs-review', 'merged',
  'failed', 'cancelled',
];

export function createStatusDot(executionStatus, { busy = false, size = 'md', providerName } = {}) {
  const span = document.createElement('span');
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', executionStatus);

  const classes = ['status-dot', size];

  if (VALID_STATUSES.includes(executionStatus)) {
    classes.push(`status-dot-${executionStatus}`);
  } else {
    throw new Error(`unknown executionStatus: ${executionStatus}`);
  }

  if (busy) {
    classes.push('status-dot-busy');
  }

  span.className = classes.join(' ');

  if (providerName) {
    const { accent } = agentColor(providerName);
    span.style.outline = `1px solid ${accent}`;
  }

  return span;
}
