/**
 * MarketLens Mobile — api.js
 * Vertesia API integration layer
 * 
 * Extracted from v8.3, zero bloat. Handles:
 * - JWT authentication with auto-refresh
 * - Collections (workspaces) CRUD
 * - Objects (documents) loading
 * - Document content retrieval
 * - Research execution (async workflows)
 * - Document chat (async + stream)
 */

const VERTESIA_CONFIG = {
  VERTESIA_API_BASE: 'https://api.vertesia.io/api/v1',
  AUTH_URL: 'https://api.vertesia.io/api/v1/auth/api-key',
  INTERACTION_NAME: 'DocumentChat',
  MODEL: 'publishers/anthropic/models/claude-sonnet-4',
  ENVIRONMENT_ID: '',  // Set at runtime
  API_KEY: '',         // Set at runtime
};

class VertesiaAPI {
  constructor(apiKey, envId) {
    this.apiKey = apiKey;
    this.envId = envId;
    this.jwt = null;
    this.jwtExpiry = 0;
    VERTESIA_CONFIG.ENVIRONMENT_ID = envId;
    VERTESIA_CONFIG.API_KEY = apiKey;
  }

  // --- Auth ---

  async getAuthToken() {
    if (this.jwt && Date.now() < this.jwtExpiry - 60000) return this.jwt;
    const res = await fetch(VERTESIA_CONFIG.AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: this.apiKey }),
    });
    if (!res.ok) throw new Error('Auth failed');
    const data = await res.json();
    this.jwt = data.token || data.jwt || data.access_token;
    this.jwtExpiry = Date.now() + 3500000; // ~58 min
    return this.jwt;
  }

  async call(endpoint, options = {}) {
    const token = await this.getAuthToken();
    const res = await fetch(`${VERTESIA_CONFIG.VERTESIA_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${endpoint}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // --- Collections (Workspaces) ---

  async loadCollections() {
    return await this.call('/collections/search', {
      method: 'POST',
      body: JSON.stringify({ dynamic: false, status: 'active', limit: 100 }),
    });
  }

  async createCollection(name, description = '') {
    return await this.call('/collections', {
      method: 'POST',
      body: JSON.stringify({ name, description, dynamic: false }),
    });
  }

  async updateCollection(id, updates) {
    const token = await this.getAuthToken();
    return await this.call(`/collections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }

  async deleteCollection(id) {
    return await this.call(`/collections/${id}`, { method: 'DELETE' });
  }

  async getCollectionMembers(collectionId) {
    return await this.call(`/collections/${collectionId}/members?limit=1000`);
  }

  async addToCollection(collectionId, docIds) {
    return await this.call(`/collections/${collectionId}/members`, {
      method: 'POST',
      body: JSON.stringify({ action: 'add', members: docIds }),
    });
  }

  async removeFromCollection(collectionId, docIds) {
    return await this.call(`/collections/${collectionId}/members`, {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', members: docIds }),
    });
  }

  // --- Objects (Documents) ---

  async loadAllObjects() {
    const data = await this.call('/objects?limit=1000');
    return Array.isArray(data) ? data : data.objects || [];
  }

  async getObject(id) {
    return await this.call(`/objects/${id}`);
  }

  async getDownloadUrl(fileSource) {
    return await this.call('/objects/download-url', {
      method: 'POST',
      body: JSON.stringify({ file: fileSource, format: 'original' }),
    });
  }

  async getFileContent(fileSource) {
    const { url } = await this.getDownloadUrl(fileSource);
    const res = await fetch(url);
    return await res.text();
  }

  // --- Research Execution ---

  async executeResearch(prompt) {
    const result = await this.call('/execute/async', {
      method: 'POST',
      body: JSON.stringify({
        type: 'conversation',
        interaction: VERTESIA_CONFIG.INTERACTION_NAME,
        data: { task: prompt },
        config: {
          environment: this.envId,
          model: VERTESIA_CONFIG.MODEL,
        },
        interactive: true,
        max_iterations: 100,
      }),
    });
    return { runId: result.runId, workflowId: result.workflowId };
  }

  // --- Streaming ---

  async streamResponse(workflowId, runId, onEvent) {
    const token = await this.getAuthToken();
    const url = `${VERTESIA_CONFIG.VERTESIA_API_BASE}/workflows/runs/${workflowId}/${runId}/stream?since=${Date.now()}&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const data = JSON.parse(line.slice(5).trim());
          onEvent(data);
        } catch (e) { /* skip malformed */ }
      }
    }
  }

  // --- Run Status ---

  async getRunStatus(workflowId, runId) {
    return await this.call(`/workflows/runs/${workflowId}/${runId}`);
  }
}

export { VertesiaAPI, VERTESIA_CONFIG };
