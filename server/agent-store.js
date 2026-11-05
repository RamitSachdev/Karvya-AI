// Workspaces, sessions, messages and company memory. A workspace is one company's
// trial. Every function here takes the workspace id from the caller's verified
// access link, never from anything the model or the browser supplies.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getDb } from './db.js';
import { profileFromLead } from './agents.js';

export class LinkSecretMissing extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Input tokens cost 1, cache writes 1.25, cache reads 0.1 and output 5. On Claude
// Opus 5.5 ($4 per million input tokens) the default budget is about $1 per trial.
export const usageUnits = (u = {}) =>
  Math.ceil((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1 + (u.output_tokens ?? 0) * 5);

const envInt = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function linkSecret() {
  const secret = process.env.AGENT_LINK_SECRET;
  if (!secret) throw new LinkSecretMissing('Set AGENT_LINK_SECRET.');
  return secret;
}
const sign = (id) => createHmac('sha256', linkSecret()).update(id).digest('base64url');

// The link is signed rather than stored, so it stays the same if an approval is retried.
export const accessToken = (workspace) => `${workspace.id}.${sign(workspace.id)}`;

export function requireLinkSecret() {
  linkSecret();
}

export function workspaceIdFromToken(token) {
  const [id, signature, extra] = String(token).split('.');
  if (!id || !signature || extra !== undefined || !UUID.test(id)) return null;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export async function ensureWorkspace(lead) {
  const db = getDb();
  const [existing] = await db.select('agent_workspaces', { eq: { lead_id: lead.id }, limit: 1 });
  if (existing) return existing;
  const now = Date.now();
  const workspace = {
    id: randomUUID(),
    lead_id: lead.id,
    agent_key: lead.agent_key,
    profile: profileFromLead(lead),
    budget_units: envInt('TRIAL_BUDGET_UNITS', 250_000),
    used_units: 0,
    expires_at: new Date(now + envInt('TRIAL_DAYS', 14) * 86_400_000).toISOString(),
    created_at: new Date(now).toISOString(),
  };
  await db.insert('agent_workspaces', [workspace]);
  return workspace;
}

export async function getWorkspace(id) {
  const [row] = await getDb().select('agent_workspaces', { eq: { id }, limit: 1 });
  return row ?? null;
}

export async function addUsage(workspace, units) {
  workspace.used_units += units;
  await getDb().update('agent_workspaces', { id: workspace.id }, { used_units: workspace.used_units });
}

export const listSessions = (workspaceId, limit = 15) =>
  getDb().select('agent_sessions', { eq: { workspace_id: workspaceId }, order: { column: 'updated_at', ascending: false }, limit });

export async function getSession(workspaceId, id) {
  // Postgres rejects a malformed uuid with an error, and this should read as "not found".
  if (!UUID.test(id)) return null;
  const [row] = await getDb().select('agent_sessions', { eq: { id, workspace_id: workspaceId }, limit: 1 });
  return row ?? null;
}

export async function createSession(workspaceId, { id, title, author }) {
  const now = new Date().toISOString();
  const session = { id, workspace_id: workspaceId, title, started_by: author, last_input_tokens: 0, created_at: now, updated_at: now };
  await getDb().insert('agent_sessions', [session]);
  return session;
}

export const touchSession = (workspaceId, id, lastInputTokens) =>
  getDb().update('agent_sessions', { id, workspace_id: workspaceId }, { updated_at: new Date().toISOString(), last_input_tokens: lastInputTokens });

export const listMessages = (sessionId) =>
  getDb().select('agent_messages', { eq: { session_id: sessionId }, order: { column: 'seq', ascending: true } });

export const insertMessages = (rows) => getDb().insert('agent_messages', rows);

export const listMemories = (workspaceId, limit = 60) =>
  getDb().select('agent_memories', { eq: { workspace_id: workspaceId }, order: { column: 'updated_at', ascending: false }, limit });

export async function saveMemory(workspaceId, { title, content, author }) {
  const db = getDb();
  const now = new Date().toISOString();
  const updated = await db.update('agent_memories', { workspace_id: workspaceId, title }, { content, updated_by: author, updated_at: now });
  if (updated) return updated;
  const row = { id: randomUUID(), workspace_id: workspaceId, title, content, updated_by: author, created_at: now, updated_at: now };
  await db.insert('agent_memories', [row]);
  return row;
}

export async function searchWorkspace(workspaceId, words) {
  const db = getDb();
  const [memories, messages] = await Promise.all([
    db.search('agent_memories', { eq: { workspace_id: workspaceId }, columns: ['title', 'content'], words, limit: 8 }),
    db.search('agent_messages', { eq: { workspace_id: workspaceId }, columns: ['text'], words, limit: 12 }),
  ]);
  return { memories, messages };
}
