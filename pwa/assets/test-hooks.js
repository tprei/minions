import { createSheet } from './components/sheet.js';
import { createStatusDot } from './components/status-dot.js';
import { createAppHeader } from './components/header.js';
import { createBottomTabs } from './components/bottom-tabs.js';
import { createThemeToggle } from './components/theme-toggle.js';

if (new URLSearchParams(location.search).get('test') === '1') {
  window.__ui = { createSheet, createStatusDot, createAppHeader, createBottomTabs, createThemeToggle };
}
