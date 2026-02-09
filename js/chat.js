/**
 * MarketLens Mobile — chat.js
 * Unified chat interface for document chat and workspace chat
 * 
 * Uses Vertesia's async execute → stream pattern.
 * Only listens for type: "answer" events (ignores "update" spam).
 * Maintains conversation history per context (doc or workspace).
 */

import { state, events, escapeHtml } from './state.js';
import { VERTESIA_CONFIG } from './api.js';

// --- Chat History ---
// Keyed by context: "doc:{docId}" or "ws:{wsId}"

const _histories = {};

function getHistory(contextKey) {
  return _histories[contextKey] || [];
}

function addMessage(contextKey, role, content) {
  if (!_histories[contextKey]) _histories[contextKey] = [];
  _histories[contextKey].push({ role, content, time: Date.now() });
  // Keep last 20 messages per context
  if (_histories[contextKey].length > 20) {
    _histories[contextKey] = _histories[contextKey].slice(-20);
  }
}

function clearHistory(contextKey) {
  delete _histories[contextKey];
}

// --- Extract Answer ---
// Agent returns structured format: **3. Agent Answer:** [content]

function extractAnswer(fullMessage) {
  const match = fullMessage.match(/\*\*3\.\s*Agent Answer:\*\*\s*([\s\S]*?)(?=\*\*\d+\.|$)/i);
  return match ? match[1].trim() : fullMessage;
}

// --- Send Chat Message ---

let _activeStream = null;

async function sendDocChat(docId, docTitle, question) {
  const contextKey = `doc:${docId}`;

  addMessage(contextKey, 'user', question);
  events.emit('chat:user-message', { contextKey, question });

  if (!state.liveMode || !state.api) {
    // Demo fallback
    setTimeout(() => {
      const answer = `This is a demo response about "${docTitle}". In live mode, Scout would analyze the document and provide insights based on your question.`;
      addMessage(contextKey, 'assistant', answer);
      events.emit('chat:response', { contextKey, answer });
    }, 1500);
    return;
  }

  events.emit('chat:thinking', { contextKey });

  try {
    // Build task with history context
    const history = getHistory(contextKey);
    let task = `DOCUMENT CONTEXT: Analyze document ID ${docId} (${docTitle})\n\n`;

    if (history.length > 2) {
      const historyStr = history.slice(-10, -1)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');
      task += `Previous conversation:\n${historyStr}\n\n`;
    }

    task += `Current question: ${question}`;

    const { runId, workflowId } = await state.api.executeResearch(task);

    // Stream for the answer
    _activeStream = { workflowId, runId };
    await state.api.streamResponse(workflowId, runId, (data) => {
      if (data.type === 'answer' && data.message) {
        const answer = extractAnswer(data.message);
        addMessage(contextKey, 'assistant', answer);
        events.emit('chat:response', { contextKey, answer });
        _activeStream = null;
      }
    });

    // If stream ended without answer, poll for result
    if (_activeStream) {
      const run = await state.api.getRunStatus(workflowId, runId);
      if (run?.result?.message) {
        const answer = extractAnswer(run.result.message);
        addMessage(contextKey, 'assistant', answer);
        events.emit('chat:response', { contextKey, answer });
      } else {
        events.emit('chat:error', { contextKey, error: 'No response received' });
      }
      _activeStream = null;
    }
  } catch (e) {
    console.error('Chat error:', e);
    events.emit('chat:error', { contextKey, error: e.message });
    _activeStream = null;
  }
}

async function sendWorkspaceChat(wsId, wsName, question) {
  const contextKey = `ws:${wsId}`;

  addMessage(contextKey, 'user', question);
  events.emit('chat:user-message', { contextKey, question });

  if (!state.liveMode || !state.api) {
    setTimeout(() => {
      const answer = `Demo response for workspace "${wsName}". In live mode, Scout would analyze all documents in this workspace.`;
      addMessage(contextKey, 'assistant', answer);
      events.emit('chat:response', { contextKey, answer });
    }, 1500);
    return;
  }

  events.emit('chat:thinking', { contextKey });

  try {
    const docs = state.workspaceDocs(wsId);
    const docList = docs.map(d => `- ${d.title} (ID: ${d.id})`).join('\n');

    let task = `WORKSPACE CONTEXT: "${wsName}"\nDocuments in workspace:\n${docList}\n\n`;
    
    const history = getHistory(contextKey);
    if (history.length > 2) {
      const historyStr = history.slice(-10, -1)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');
      task += `Previous conversation:\n${historyStr}\n\n`;
    }

    task += `Question: ${question}`;

    const { runId, workflowId } = await state.api.executeResearch(task);

    await state.api.streamResponse(workflowId, runId, (data) => {
      if (data.type === 'answer' && data.message) {
        const answer = extractAnswer(data.message);
        addMessage(contextKey, 'assistant', answer);
        events.emit('chat:response', { contextKey, answer });
      }
    });
  } catch (e) {
    console.error('Workspace chat error:', e);
    events.emit('chat:error', { contextKey, error: e.message });
  }
}

function cancelActiveStream() {
  _activeStream = null;
}

export {
  sendDocChat, sendWorkspaceChat,
  getHistory, clearHistory, cancelActiveStream,
};
