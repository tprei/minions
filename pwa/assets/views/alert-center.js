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

export function createAlertCenter({ apiBase = '' } = {}) {
  let alerts = [];
  let beforeTs = null;
  let hasMore = false;
  let loading = false;

  const root = document.createElement('div');
  root.className = 'alert-center';

  const list = document.createElement('div');
  list.className = 'alert-list';
  root.appendChild(list);

  const loadMoreBtn = document.createElement('button');
  loadMoreBtn.className = 'alert-load-more';
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
    return `${apiBase}/alerts?${params.toString()}`;
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
        const incoming = data.alerts ?? [];
        if (isReset) {
          alerts = incoming;
        } else {
          alerts = alerts.concat(incoming);
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

  function refresh() {
    return new Promise((resolve) => {
      alerts = [];
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
          alerts = data.alerts ?? [];
          hasMore = alerts.length === DEFAULT_LIMIT;
          if (alerts.length > 0) {
            beforeTs = alerts[alerts.length - 1].timestamp;
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
    for (const alert of alerts) {
      list.appendChild(buildCard(alert));
    }
  }

  function buildCard(alert) {
    const card = document.createElement('div');
    card.className = `alert-card alert-card-${alert.severity}`;

    const header = document.createElement('div');
    header.className = 'alert-card-header';

    const severity = document.createElement('span');
    severity.className = `alert-severity alert-severity-${alert.severity}`;
    severity.textContent = alert.severity;

    const kind = document.createElement('span');
    kind.className = 'alert-kind';
    kind.textContent = alert.kind ?? '';

    const ts = document.createElement('span');
    ts.className = 'alert-ts';
    ts.textContent = relativeTime(alert.timestamp);

    header.appendChild(severity);
    header.appendChild(kind);
    header.appendChild(ts);

    const message = document.createElement('div');
    message.className = 'alert-message';
    message.textContent = alert.message ?? '';

    card.appendChild(header);
    card.appendChild(message);

    if (alert.workflowId || alert.taskId) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        if (alert.workflowId && alert.taskId) {
          window.location.hash = `#/workflow/${alert.workflowId}/task/${alert.taskId}`;
        } else if (alert.workflowId) {
          window.location.hash = `#/workflow/${alert.workflowId}`;
        }
      });

      const link = document.createElement('div');
      link.className = 'alert-link';
      if (alert.workflowId) {
        const wfLink = document.createElement('span');
        wfLink.className = 'alert-wf-link';
        wfLink.textContent = alert.workflowId;
        link.appendChild(wfLink);
      }
      if (alert.taskId) {
        const taskLink = document.createElement('span');
        taskLink.className = 'alert-task-link';
        taskLink.textContent = alert.taskId;
        link.appendChild(taskLink);
      }
      card.appendChild(link);
    }

    return card;
  }

  function renderLoadMore() {
    loadMoreBtn.style.display = hasMore && !loading ? 'block' : 'none';
  }

  fetchPage(true);

  return { element: root, refresh };
}
