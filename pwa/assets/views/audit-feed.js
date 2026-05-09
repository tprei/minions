import { attachPullToRefresh } from '../hooks/use-pull-to-refresh.js';

const DEFAULT_LIMIT = 50;

function relativeTime(ts) {
  const now = Date.now();
  const then = new Date(ts).getTime();
  if (isNaN(then)) return ts;
  const diffMs = now - then;
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

export function createAuditFeed({ apiBase = '' } = {}) {
  let events = [];
  let beforeTs = null;
  let hasMore = false;
  let loading = false;

  let filterAction = '';
  let filterWorkflow = '';
  let filterRange = 'all';

  const root = document.createElement('div');
  root.className = 'audit-feed';

  const chips = document.createElement('div');
  chips.className = 'audit-chips';

  const rangeOptions = [
    { id: 'all', label: 'All' },
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Week' },
  ];

  rangeOptions.forEach(({ id, label }) => {
    const chip = document.createElement('button');
    chip.className = 'audit-chip' + (id === filterRange ? ' active' : '');
    chip.dataset.range = id;
    chip.textContent = label;
    chip.addEventListener('click', () => {
      filterRange = id;
      chips.querySelectorAll('.audit-chip[data-range]').forEach((c) => {
        c.classList.toggle('active', c.dataset.range === filterRange);
      });
      reset();
    });
    chips.appendChild(chip);
  });

  const workflowInput = document.createElement('input');
  workflowInput.className = 'audit-workflow-filter';
  workflowInput.type = 'text';
  workflowInput.placeholder = 'workflow id…';
  workflowInput.addEventListener('input', () => {
    filterWorkflow = workflowInput.value.trim();
    reset();
  });
  chips.appendChild(workflowInput);

  root.appendChild(chips);

  const list = document.createElement('div');
  list.className = 'audit-list';
  root.appendChild(list);

  const loadMoreBtn = document.createElement('button');
  loadMoreBtn.className = 'audit-load-more';
  loadMoreBtn.textContent = 'Load more';
  loadMoreBtn.style.display = 'none';
  loadMoreBtn.addEventListener('click', () => {
    if (!loading) fetchPage(false);
  });
  root.appendChild(loadMoreBtn);

  attachPullToRefresh(root, { onRefresh: refresh });

  function buildUrl() {
    const params = new URLSearchParams();
    params.set('limit', String(DEFAULT_LIMIT));
    if (beforeTs) params.set('beforeTs', beforeTs);
    if (filterAction) params.set('action', filterAction);
    if (filterWorkflow) params.set('workflowId', filterWorkflow);
    if (filterRange === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      params.set('beforeTs', new Date().toISOString());
    } else if (filterRange === 'week') {
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      params.set('beforeTs', new Date().toISOString());
    }
    return `${apiBase}/audit/events?${params.toString()}`;
  }

  function fetchPage(isReset) {
    loading = true;
    renderLoadMore();

    fetch(buildUrl())
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const incoming = data.events ?? [];
        if (isReset) {
          events = incoming;
        } else {
          events = events.concat(incoming);
        }
        hasMore = incoming.length === DEFAULT_LIMIT;
        if (incoming.length > 0) {
          beforeTs = incoming[incoming.length - 1].timestamp;
        }
        loading = false;
        renderList();
        renderLoadMore();
      })
      .catch(() => {
        loading = false;
        renderLoadMore();
      });
  }

  function reset() {
    events = [];
    beforeTs = null;
    hasMore = false;
    fetchPage(true);
  }

  function refresh() {
    return new Promise((resolve) => {
      events = [];
      beforeTs = null;
      hasMore = false;
      loading = true;
      renderLoadMore();

      fetch(buildUrl())
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data) => {
          events = data.events ?? [];
          hasMore = events.length === DEFAULT_LIMIT;
          if (events.length > 0) {
            beforeTs = events[events.length - 1].timestamp;
          }
          loading = false;
          renderList();
          renderLoadMore();
          resolve();
        })
        .catch(() => {
          loading = false;
          renderLoadMore();
          resolve();
        });
    });
  }

  function renderList() {
    list.innerHTML = '';
    for (const ev of events) {
      list.appendChild(buildRow(ev));
    }
  }

  function buildRow(ev) {
    const row = document.createElement('div');
    row.className = 'audit-row';

    const top = document.createElement('div');
    top.className = 'audit-row-top';

    const action = document.createElement('span');
    action.className = 'audit-action';
    action.textContent = ev.action ?? '';

    const ts = document.createElement('span');
    ts.className = 'audit-ts';
    ts.textContent = relativeTime(ev.timestamp);

    top.appendChild(action);
    top.appendChild(ts);

    const meta = document.createElement('div');
    meta.className = 'audit-meta';

    if (ev.actor) {
      const actor = document.createElement('span');
      actor.className = 'audit-actor';
      actor.textContent = ev.actor;
      meta.appendChild(actor);
    }

    if (ev.targetKind || ev.targetId) {
      const target = document.createElement('span');
      target.className = 'audit-target';
      target.textContent = [ev.targetKind, ev.targetId].filter(Boolean).join(':');
      meta.appendChild(target);
    }

    row.appendChild(top);
    row.appendChild(meta);

    if (ev.detail) {
      const details = document.createElement('details');
      details.className = 'audit-detail';
      const summary = document.createElement('summary');
      summary.textContent = 'detail';
      const pre = document.createElement('pre');
      pre.className = 'audit-detail-json';
      pre.textContent = JSON.stringify(ev.detail, null, 2);
      details.appendChild(summary);
      details.appendChild(pre);
      row.appendChild(details);
    }

    return row;
  }

  function renderLoadMore() {
    loadMoreBtn.style.display = hasMore && !loading ? 'block' : 'none';
  }

  fetchPage(true);

  return { element: root, refresh };
}
