/**
 * MarketLens Mobile — router.js
 * Tab-based navigation with per-tab stack management
 * 
 * Each tab maintains its own view stack.
 * Supports push (drill into detail) and pop (go back).
 * Handles the reader as a global overlay.
 */

import { events } from './state.js';

const TABS = ['feed', 'library', 'research', 'workspaces', 'settings'];

let currentTab = 'feed';
let stacks = {
  feed: ['feed'],
  library: ['library'],
  research: ['research'],
  workspaces: ['workspaces'],
  settings: ['settings'],
};

// Reader state (overlay, not part of any tab stack)
let readerOpen = false;

function init() {
  // Set initial tab
  switchTab('feed');

  // Handle browser back button
  window.addEventListener('popstate', (e) => {
    if (readerOpen) {
      closeReader();
    } else {
      pop();
    }
  });
}

// --- Tab Switching ---

function switchTab(tab) {
  if (!TABS.includes(tab)) return;

  // Close reader if open
  if (readerOpen) closeReader();

  currentTab = tab;

  // Update tab bar active state
  document.querySelectorAll('.tab-bar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  // Show correct view
  TABS.forEach(t => {
    const view = document.getElementById(`view-${t}`);
    if (view) view.classList.toggle('active', t === tab);
  });

  events.emit('tab:changed', tab);
}

// --- Stack Navigation ---

function push(viewId, data = {}) {
  const stack = stacks[currentTab];
  stack.push(viewId);
  history.pushState({ tab: currentTab, view: viewId }, '');
  events.emit('view:push', { tab: currentTab, viewId, data });
}

function pop() {
  const stack = stacks[currentTab];
  if (stack.length <= 1) return; // Can't pop root
  const popped = stack.pop();
  events.emit('view:pop', { tab: currentTab, popped });
}

function resetStack(tab) {
  stacks[tab] = [tab];
}

// --- Reader (Global Overlay) ---

function openReader(docData) {
  readerOpen = true;
  history.pushState({ reader: true }, '');
  const el = document.getElementById('reader');
  if (el) el.classList.add('active');
  events.emit('reader:open', docData);
}

function closeReader() {
  readerOpen = false;
  const el = document.getElementById('reader');
  if (el) el.classList.remove('active');
  events.emit('reader:close');
}

function isReaderOpen() { return readerOpen; }

// --- Bottom Sheet ---

let activeSheet = null;

function openSheet(sheetId) {
  closeSheet(); // Close any existing
  activeSheet = sheetId;
  const backdrop = document.getElementById('sheet-backdrop');
  const sheet = document.getElementById(sheetId);
  if (backdrop) backdrop.classList.add('active');
  if (sheet) sheet.classList.add('active');
  events.emit('sheet:open', sheetId);
}

function closeSheet() {
  if (!activeSheet) return;
  const backdrop = document.getElementById('sheet-backdrop');
  const sheet = document.getElementById(activeSheet);
  if (backdrop) backdrop.classList.remove('active');
  if (sheet) sheet.classList.remove('active');
  const closed = activeSheet;
  activeSheet = null;
  events.emit('sheet:close', closed);
}

// --- Getters ---

function getCurrentTab() { return currentTab; }
function getCurrentView() {
  const stack = stacks[currentTab];
  return stack[stack.length - 1];
}
function getStackDepth() { return stacks[currentTab].length; }

export {
  init, switchTab, push, pop, resetStack,
  openReader, closeReader, isReaderOpen,
  openSheet, closeSheet,
  getCurrentTab, getCurrentView, getStackDepth,
  TABS,
};
