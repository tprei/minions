import { createSheet } from './components/sheet.js';
import { createStatusDot } from './components/status-dot.js';
import { createAppHeader, createTasksPill } from './components/header.js';
import { createBottomTabs } from './components/bottom-tabs.js';
import { createThemeToggle } from './components/theme-toggle.js';
import { createDagPanel } from './views/dag-panel.js';
import { createRunsPanel } from './views/runs.js';
import { createCostBadge } from './components/cost-badge.js';
import { createContextMenu } from './components/context-menu.js';
import { createPassport } from './views/passport.js';

if (new URLSearchParams(location.search).get('test') === '1') {
  window.__ui = { createSheet, createStatusDot, createAppHeader, createBottomTabs, createThemeToggle, createTasksPill, createDagPanel, createRunsPanel, createCostBadge, createContextMenu, createPassport };
}
