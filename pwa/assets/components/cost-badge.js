const TIERS = [
  { max: 0.01, label: 'green', className: 'cost-badge-green' },
  { max: 0.10, label: 'yellow', className: 'cost-badge-yellow' },
  { max: 1.00, label: 'orange', className: 'cost-badge-orange' },
  { max: Infinity, label: 'red', className: 'cost-badge-red' },
];

function tierFor(costUsd) {
  for (const tier of TIERS) {
    if (costUsd < tier.max) return tier;
  }
  return TIERS[TIERS.length - 1];
}

function formatCost(usd) {
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function createCostBadge({ onUsageEvent } = {}) {
  let totalCost = 0;

  const el = document.createElement('span');
  el.className = 'cost-badge cost-badge-green';
  el.setAttribute('aria-label', 'Cost burn rate');
  el.textContent = '<$0.01';

  function handleUsageEvent(providerEvent) {
    if (providerEvent.kind !== 'usage') return;
    if (typeof providerEvent.costUsd === 'number') {
      totalCost += providerEvent.costUsd;
      render();
    }
  }

  function render() {
    const tier = tierFor(totalCost);
    el.className = `cost-badge ${tier.className}`;
    el.textContent = formatCost(totalCost);
    el.dataset.tier = tier.label;
  }

  function destroy() {
    el.remove();
  }

  if (typeof onUsageEvent === 'function') {
    onUsageEvent(handleUsageEvent);
  }

  return {
    element: el,
    handleUsageEvent,
    destroy,
  };
}
