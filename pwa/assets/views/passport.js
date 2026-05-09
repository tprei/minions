import { cityAlias } from '../utils/city-alias.js';
import { attachPullToRefresh } from '../hooks/use-pull-to-refresh.js';

const SORT_OPTIONS = ['name', 'created', 'status'];

const STATUS_ORDER = ['active', 'completed', 'failed', 'cancelled'];

function sortWorkflows(workflows, sortBy) {
  const copy = [...workflows];
  if (sortBy === 'name') {
    copy.sort((a, b) => {
      const aliasA = cityAlias(a.id);
      const aliasB = cityAlias(b.id);
      return aliasA.localeCompare(aliasB);
    });
  } else if (sortBy === 'created') {
    copy.sort((a, b) => {
      const tA = new Date(a.createdAt ?? 0).getTime();
      const tB = new Date(b.createdAt ?? 0).getTime();
      return tB - tA;
    });
  } else if (sortBy === 'status') {
    copy.sort((a, b) => {
      const iA = STATUS_ORDER.indexOf(a.status ?? 'active');
      const iB = STATUS_ORDER.indexOf(b.status ?? 'active');
      return iA - iB;
    });
  }
  return copy;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toISOString().slice(0, 10);
}

export function createPassport({ workflows: initialWorkflows = [] } = {}) {
  let workflows = initialWorkflows;
  let currentSort = 'created';

  const root = document.createElement('div');
  root.className = 'passport';

  const toolbar = document.createElement('div');
  toolbar.className = 'passport-toolbar';

  const sortLabel = document.createElement('span');
  sortLabel.className = 'passport-sort-label';
  sortLabel.textContent = 'Sort:';
  toolbar.appendChild(sortLabel);

  for (const opt of SORT_OPTIONS) {
    const btn = document.createElement('button');
    btn.className = 'passport-sort-btn';
    btn.dataset.sort = opt;
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      currentSort = opt;
      updateSortButtons();
      renderList();
    });
    toolbar.appendChild(btn);
  }

  root.appendChild(toolbar);

  const list = document.createElement('div');
  list.className = 'passport-list';
  root.appendChild(list);

  attachPullToRefresh(root, { onRefresh: refresh });

  function updateSortButtons() {
    toolbar.querySelectorAll('.passport-sort-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sort === currentSort);
    });
  }

  function renderList() {
    list.innerHTML = '';
    const sorted = sortWorkflows(workflows, currentSort);
    for (const wf of sorted) {
      list.appendChild(buildRow(wf));
    }
  }

  function buildRow(wf) {
    const row = document.createElement('div');
    row.className = 'passport-row';
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      window.location.hash = `#/workflow/${wf.id}`;
    });

    const alias = document.createElement('span');
    alias.className = 'passport-alias';
    alias.textContent = cityAlias(wf.id);

    const pill = document.createElement('span');
    pill.className = `passport-status-pill passport-status-${wf.status ?? 'active'}`;
    pill.textContent = wf.status ?? 'active';

    const ts = document.createElement('span');
    ts.className = 'passport-created';
    ts.textContent = formatDate(wf.createdAt);

    row.appendChild(alias);
    row.appendChild(pill);
    row.appendChild(ts);

    return row;
  }

  function refresh() {
    return Promise.resolve();
  }

  updateSortButtons();
  renderList();

  return {
    element: root,
    refresh() {
      renderList();
    },
    update(newWorkflows) {
      workflows = newWorkflows;
      renderList();
    },
  };
}
