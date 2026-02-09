/**
 * MarketLens Mobile — state.js
 * Centralized state management with event bus
 * 
 * Single source of truth. Components subscribe to changes.
 * Replaces all scattered global variables from v8.3.
 */

const STORAGE_KEYS = {
  JOBS: 'ml_jobs',
  STARRED: 'ml_starred',
  PINNED: 'ml_pinned',
  COMPLETED: 'ml_completed',
  NOTES: 'ml_notes',
  CUSTOM_NAMES: 'ml_names',
  API_KEY: 'ml_api_key',
  ENV_ID: 'ml_env_id',
};

// --- Event Bus ---

const _listeners = {};

const events = {
  on(event, fn) {
    (_listeners[event] = _listeners[event] || []).push(fn);
  },
  off(event, fn) {
    if (_listeners[event]) {
      _listeners[event] = _listeners[event].filter(f => f !== fn);
    }
  },
  emit(event, data) {
    (_listeners[event] || []).forEach(fn => fn(data));
  },
};

// --- Persistence ---

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadSet(key) {
  return new Set(loadJSON(key, []));
}

function saveSet(key, set) {
  saveJSON(key, [...set]);
}

// --- App State ---

const state = {
  // Connection
  liveMode: false,
  api: null,

  // Data from API
  workspaces: [],
  allDocuments: [],          // all docs from Vertesia
  collectionMembers: {},     // wsId → [docIds]

  // Active context
  activeWorkspaceId: null,
  activeDocumentId: null,

  // Jobs (persisted)
  jobs: loadJSON(STORAGE_KEYS.JOBS, []),

  // User preferences (persisted)
  starred: loadSet(STORAGE_KEYS.STARRED),
  pinned: loadSet(STORAGE_KEYS.PINNED),
  completed: loadSet(STORAGE_KEYS.COMPLETED),
  notes: loadJSON(STORAGE_KEYS.NOTES, {}),
  customNames: loadJSON(STORAGE_KEYS.CUSTOM_NAMES, {}),

  // --- Computed getters ---

  get activeWorkspace() {
    return this.workspaces.find(w => w.id === this.activeWorkspaceId) || null;
  },

  get activeDocument() {
    return this.allDocuments.find(d => d.id === this.activeDocumentId) || null;
  },

  workspaceDocs(wsId) {
    const memberIds = this.collectionMembers[wsId] || [];
    return memberIds.map(id => this.allDocuments.find(d => d.id === id)).filter(Boolean);
  },

  getDocName(doc) {
    if (!doc) return 'Untitled';
    return this.customNames[doc.id] || cleanDocTitle(doc.title);
  },

  isStarred(docId) { return this.starred.has(docId); },
  isPinned(wsId) { return this.pinned.has(wsId); },
  isCompleted(wsId) { return this.completed.has(wsId); },

  get activeJobs() { return this.jobs.filter(j => j.status === 'running'); },
  get completedJobs() { return this.jobs.filter(j => j.status === 'completed'); },

  get sortedWorkspaces() {
    return [...this.workspaces].sort((a, b) => {
      const aPinned = this.pinned.has(a.id);
      const bPinned = this.pinned.has(b.id);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      const aComplete = this.completed.has(a.id);
      const bComplete = this.completed.has(b.id);
      if (aComplete !== bComplete) return aComplete ? 1 : -1;
      return 0;
    });
  },

  // --- Mutators (always emit events) ---

  setWorkspaces(workspaces) {
    this.workspaces = workspaces;
    events.emit('workspaces:changed', workspaces);
  },

  setDocuments(docs) {
    this.allDocuments = docs;
    events.emit('documents:changed', docs);
  },

  setCollectionMembers(wsId, memberIds) {
    this.collectionMembers[wsId] = memberIds;
    events.emit('workspace:members', { wsId, memberIds });
  },

  selectWorkspace(wsId) {
    this.activeWorkspaceId = wsId;
    events.emit('workspace:selected', this.activeWorkspace);
  },

  selectDocument(docId) {
    this.activeDocumentId = docId;
    events.emit('document:selected', this.activeDocument);
  },

  // Jobs
  addJob(job) {
    this.jobs.unshift(job);
    this._saveJobs();
    events.emit('jobs:changed', this.jobs);
  },

  updateJob(jobId, updates) {
    const job = this.jobs.find(j => j.id === jobId);
    if (job) {
      Object.assign(job, updates);
      this._saveJobs();
      events.emit('jobs:changed', this.jobs);
    }
  },

  removeJob(jobId) {
    this.jobs = this.jobs.filter(j => j.id !== jobId);
    this._saveJobs();
    events.emit('jobs:changed', this.jobs);
  },

  _saveJobs() { saveJSON(STORAGE_KEYS.JOBS, this.jobs); },

  // Stars
  toggleStar(docId) {
    this.starred.has(docId) ? this.starred.delete(docId) : this.starred.add(docId);
    saveSet(STORAGE_KEYS.STARRED, this.starred);
    events.emit('starred:changed', { docId, starred: this.starred.has(docId) });
  },

  // Pins
  togglePin(wsId) {
    this.pinned.has(wsId) ? this.pinned.delete(wsId) : this.pinned.add(wsId);
    saveSet(STORAGE_KEYS.PINNED, this.pinned);
    events.emit('pinned:changed', { wsId, pinned: this.pinned.has(wsId) });
  },

  // Complete
  toggleComplete(wsId) {
    this.completed.has(wsId) ? this.completed.delete(wsId) : this.completed.add(wsId);
    saveSet(STORAGE_KEYS.COMPLETED, this.completed);
    events.emit('completed:changed', { wsId, completed: this.completed.has(wsId) });
  },

  // Notes
  setNote(docId, text) {
    if (text.trim()) {
      this.notes[docId] = text;
    } else {
      delete this.notes[docId];
    }
    saveJSON(STORAGE_KEYS.NOTES, this.notes);
    events.emit('notes:changed', { docId });
  },

  getNote(docId) {
    return this.notes[docId] || '';
  },

  // Custom names
  setCustomName(docId, name) {
    if (name.trim()) {
      this.customNames[docId] = name;
    } else {
      delete this.customNames[docId];
    }
    saveJSON(STORAGE_KEYS.CUSTOM_NAMES, this.customNames);
    events.emit('names:changed', { docId });
  },
};

// --- Utilities ---

function cleanDocTitle(title) {
  if (!title) return 'Untitled';
  let clean = title.replace(/^Deep Research:\s*/i, '');
  clean = clean.replace(/\s+-\s+[\w\s]+-\s+[\w\s]+-\s+[\w\s]+$/, '');
  return clean || title;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const el = document.createElement('div');
  el.textContent = str;
  return el.innerHTML;
}

export { state, events, STORAGE_KEYS, cleanDocTitle, formatDate, escapeHtml };
