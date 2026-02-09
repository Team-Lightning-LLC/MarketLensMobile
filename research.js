/**
 * MarketLens Mobile — research.js
 * Research creation, frameworks, prompt engineering, job lifecycle
 * 
 * This is the core product logic. Frameworks define what MarketLens can do.
 * Prompt builder translates user intent into Scout instructions.
 * Job system manages the async research lifecycle.
 */

import { state, events } from './state.js';

// --- Research Frameworks ---
// 5 categories, 20 frameworks — the product's analytical vocabulary

const CATEGORIES = {
  company:     { label: 'Asset Analysis', icon: '📊' },
  competitive: { label: 'Competitive', icon: '⚔️' },
  ecosystem:   { label: 'Ecosystem', icon: '🌐' },
  scenarios:   { label: 'Scenarios & Risk', icon: '⚠️' },
  custom:      { label: 'Custom', icon: '✏️' },
};

const FRAMEWORKS = {
  company: [
    { id: 'general',    name: 'General Analysis',      desc: 'Comprehensive overview' },
    { id: 'valuation',  name: 'Valuation Analysis',    desc: 'DCF, comps, intrinsic value' },
    { id: 'financial',  name: 'Financial Health',       desc: 'Margins, debt, returns' },
    { id: 'swot',       name: 'SWOT Analysis',          desc: 'Strengths, weaknesses, opportunities, threats' },
    { id: 'leadership', name: 'Leadership Assessment',  desc: 'Management track record' },
  ],
  competitive: [
    { id: 'headtohead',  name: 'Head-to-Head',                desc: 'Direct company comparison' },
    { id: 'porter',      name: "Porter's Five Forces",        desc: 'Industry competitive dynamics' },
    { id: 'marketshare', name: 'Market Share Dynamics',        desc: 'Who is winning over time' },
    { id: 'response',    name: 'Competitive Response Patterns', desc: 'Historical competitive behavior' },
  ],
  ecosystem: [
    { id: 'ecosystem',     name: 'Ecosystem Mapping',       desc: 'Suppliers, partners, customers' },
    { id: 'supplychain',   name: 'Supply Chain Contagion',   desc: 'Disruption ripple effects' },
    { id: 'concentration', name: 'Concentration Risk',       desc: 'Customer/supplier dependency' },
    { id: 'geographic',    name: 'Geographic Exposure',      desc: 'Regional risk analysis' },
    { id: 'relationship',  name: 'Relationship Evolution',   desc: 'How relationships change over time' },
  ],
  scenarios: [
    { id: 'riskcorr',  name: 'Risk Correlation',          desc: 'Interconnected risks' },
    { id: 'ma',        name: 'M&A Scenarios',              desc: 'Consolidation analysis' },
    { id: 'rates',     name: 'Interest Rate Sensitivity',  desc: 'Rate impact analysis' },
    { id: 'recession', name: 'Recession Stress Test',      desc: 'Downturn performance' },
    { id: 'narrative', name: 'Narrative Momentum',          desc: 'Market story shifts' },
  ],
  custom: [
    { id: 'custom', name: 'Custom Framework', desc: 'Your specific question' },
  ],
};

// Context hints — what to type based on selected framework
const CONTEXT_HINTS = {
  'General Analysis':              'Enter company or topic (e.g., NVIDIA, semiconductor industry)',
  'Valuation Analysis':            'Enter company for DCF, comps, multiples (e.g., NVDA fair value)',
  'Financial Health':              'Enter company for margins, debt, returns (e.g., Apple profitability)',
  'SWOT Analysis':                 'Enter company (e.g., Microsoft SWOT)',
  'Leadership Assessment':         'Enter company to evaluate leadership (e.g., Microsoft under Nadella)',
  'Head-to-Head':                  'Enter 2+ companies to compare (e.g., Tesla vs Rivian vs Lucid)',
  "Porter's Five Forces":          'Enter company/industry (e.g., EV industry, streaming wars)',
  'Market Share Dynamics':          'Enter market and players (e.g., Cloud: AWS vs Azure vs GCP)',
  'Competitive Response Patterns':  'Enter companies (e.g., Amazon vs Walmart pricing wars)',
  'Ecosystem Mapping':             'Enter company to map (e.g., Apple ecosystem, TSMC)',
  'Supply Chain Contagion':         'Describe disruption (e.g., Taiwan semiconductor shutdown)',
  'Concentration Risk':             'Enter company (e.g., NVIDIA customer concentration)',
  'Geographic Exposure':            'Enter company (e.g., Apple China exposure)',
  'Relationship Evolution':         'Enter two entities (e.g., Apple-Samsung 2010-2024)',
  'Risk Correlation':               'Enter scenario (e.g., oil price impact on airlines)',
  'M&A Scenarios':                  'Enter industry (e.g., semiconductor consolidation)',
  'Interest Rate Sensitivity':      'Enter companies/sectors (e.g., REITs, utilities)',
  'Recession Stress Test':          'Enter company/sector (e.g., consumer discretionary)',
  'Narrative Momentum':             'Enter company and shift (e.g., NVIDIA: gaming → AI)',
  'Custom Framework':               'Describe your specific research question in detail...',
};

function getContextHint(frameworkName) {
  return CONTEXT_HINTS[frameworkName] || 'What would you like to research?';
}

// --- Input Validation ---

const BLOCKED_PATTERNS = [
  /\b(underwear|naked|nude|sex|porn|xxx)\b/i,
  /\b(kill|murder|bomb|weapon|drug)\b/i,
  /\b(hack|crack|pirate|steal)\b/i,
];

function validateContext(text) {
  if (!text) return { valid: true };
  if (BLOCKED_PATTERNS.some(p => p.test(text))) {
    return { valid: false, reason: 'Please enter a financial services topic.' };
  }
  return { valid: true };
}

// --- Prompt Builder ---

function buildPrompt({ framework, scope, rigor, context, workspaceId, workspaceName, parentDoc }) {
  
  if (parentDoc) {
    return `FOLLOW-UP RESEARCH REQUEST

First, access and analyze Document ID: ${parentDoc.id} from the content object library.
Parent document: ${parentDoc.title}

The user wants to explore: ${context || 'Further analysis based on the parent document'}

Framework: ${framework}
Scope: ${scope}
Analytical Rigor: ${rigor}
Context: ${context || 'General analysis'}

Generate a comprehensive research document with hyperlinked sources.
The final output must be a document uploaded to the content object library.

CRITICAL METADATA - set these properties:
- parent_document_id: "${parentDoc.id}"
- parent_document_title: "${parentDoc.title}"
- relationship_type: "follow_up_research"

FINAL STEP: After uploading, search for collections containing parent doc ID: ${parentDoc.id}
Add the new document to ALL of those collections.`;
  }

  let prompt = `Framework: ${framework}
Scope: ${scope}
Analytical Rigor: ${rigor}
Context: ${context || 'General analysis'}

Generate a comprehensive research document with hyperlinked sources.
The final output must be a document uploaded to the content object library.`;

  if (workspaceId) {
    prompt += `

FINAL STEP: After uploading, add the document to collection ID: ${workspaceId} (named "${workspaceName}").`;
  } else {
    prompt += `

NOTE: Save to library only — do NOT add to any collection.`;
  }

  return prompt;
}

// --- Job Management ---

let _nextJobId = 0;

function createJob({ name, workspaceId, workflowId, runId, isLive = true }) {
  _nextJobId++;
  const job = {
    id: _nextJobId,
    name,
    status: 'running',
    workspaceId: workspaceId || null,
    workflowId: workflowId || null,
    runId: runId || null,
    isLive,
    startedAt: Date.now(),
    completedAt: null,
    docId: null,
    statusText: 'Starting...',
  };

  state.addJob(job);
  
  if (isLive && workflowId && runId) {
    pollForCompletion(job.id, workflowId, runId);
  } else if (!isLive) {
    // Demo: complete after 8 seconds
    setTimeout(() => completeJob(job.id), 8000);
  }

  return job.id;
}

async function pollForCompletion(jobId, workflowId, runId) {
  const MAX_ATTEMPTS = 120; // 10 min at 5s
  let attempts = 0;

  // Stream status updates in parallel
  streamJobStatus(jobId, workflowId, runId);

  const interval = setInterval(async () => {
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      clearInterval(interval);
      state.updateJob(jobId, { status: 'failed', statusText: 'Timed out' });
      return;
    }

    try {
      const run = await state.api.getRunStatus(workflowId, runId);
      const status = run?.status || run?.result?.status;

      if (status === 'completed' || status === 'succeeded') {
        clearInterval(interval);
        completeJob(jobId);
      } else if (status === 'failed' || status === 'error') {
        clearInterval(interval);
        state.updateJob(jobId, { status: 'failed', statusText: 'Research failed' });
      }
    } catch (e) {
      console.warn('Poll error:', e.message);
    }
  }, 5000);
}

async function streamJobStatus(jobId, workflowId, runId) {
  try {
    await state.api.streamResponse(workflowId, runId, (data) => {
      if (data.type === 'update' && data.message) {
        const bucket = bucketStatus(data.message);
        if (bucket) state.updateJob(jobId, { statusText: bucket });
      }
      if (data.type === 'answer') {
        completeJob(jobId);
      }
    });
  } catch (e) {
    console.warn('Stream error:', e.message);
  }
}

async function completeJob(jobId) {
  state.updateJob(jobId, {
    status: 'completed',
    completedAt: Date.now(),
    statusText: 'Complete',
  });

  // Reload documents to find the new one
  if (state.api) {
    try {
      const objects = await state.api.loadAllObjects();
      const docs = objects.filter(o => o.content?.source).map(mapDoc);
      state.setDocuments(docs);

      // Try to match job to newest doc
      const job = state.jobs.find(j => j.id === jobId);
      if (job?.workspaceId) {
        const members = await state.api.getCollectionMembers(job.workspaceId);
        state.setCollectionMembers(job.workspaceId, members.map(m => m.id || m));
      }
    } catch (e) {
      console.warn('Post-completion reload failed:', e);
    }
  }

  events.emit('research:completed', { jobId });
}

// Simple 3-bucket status mapping (replaces the complex IIFE from v8.3)
function bucketStatus(message) {
  const msg = message.toLowerCase();
  if (msg.includes('search') || msg.includes('finding') || msg.includes('looking'))
    return 'Researching...';
  if (msg.includes('writ') || msg.includes('compil') || msg.includes('generat') || msg.includes('upload'))
    return 'Finalizing...';
  if (msg.includes('start') || msg.includes('initializ') || msg.includes('plan'))
    return 'Starting...';
  return null; // Don't update for unrecognized messages
}

// --- Document Mapping ---

function mapDoc(obj) {
  return {
    id: obj.id,
    title: obj.name || 'Untitled',
    type: obj.properties?.framework || obj.properties?.document_type || 'Research',
    date: obj.created_at,
    source: obj.content?.source,
    parentId: obj.parent?.id || obj.parent || obj.properties?.parent_document_id || null,
    parentTitle: obj.parent?.name || obj.properties?.parent_document_title || null,
  };
}

// --- Start Research (high-level entry point) ---

async function startResearch({ category, framework, scope, rigor, context, workspaceId, parentDoc }) {
  const validation = validateContext(context);
  if (!validation.valid) {
    events.emit('toast', { message: validation.reason, type: 'error' });
    return null;
  }

  const ws = state.workspaces.find(w => w.id === workspaceId);
  const prompt = buildPrompt({
    framework,
    scope,
    rigor,
    context,
    workspaceId,
    workspaceName: ws?.name || 'Unknown',
    parentDoc,
  });

  const jobName = parentDoc
    ? `Follow-up: ${parentDoc.title.substring(0, 30)}...`
    : framework;

  if (state.liveMode && state.api) {
    try {
      const { workflowId, runId } = await state.api.executeResearch(prompt);
      return createJob({ name: jobName, workspaceId, workflowId, runId, isLive: true });
    } catch (e) {
      events.emit('toast', { message: 'Failed to start research. Try again.', type: 'error' });
      return null;
    }
  } else {
    return createJob({ name: jobName, workspaceId, isLive: false });
  }
}

export {
  CATEGORIES, FRAMEWORKS, CONTEXT_HINTS,
  getContextHint, validateContext, buildPrompt,
  startResearch, createJob, mapDoc,
};
