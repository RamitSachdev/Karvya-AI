// GET /api/agent/workspace: what the agent page needs when it opens.
import { sendJson } from '../../server/http.js';
import { listMemories, listSessions } from '../../server/agent-store.js';
import { describeAgent } from '../../server/agents.js';
import { agentErrorResponse, authenticate } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  try {
    const workspace = await authenticate(req, res);
    if (!workspace) return undefined;
    const agent = describeAgent(workspace.agent_key);
    const [sessions, memories] = await Promise.all([listSessions(workspace.id), listMemories(workspace.id)]);
    return sendJson(res, 200, {
      agent: { name: agent.name, starters: agent.starters },
      company: workspace.profile.company_name,
      trial: { percentUsed: Math.min(100, Math.round((workspace.used_units / workspace.budget_units) * 100)), expiresAt: workspace.expires_at },
      sessions: sessions.map(({ id, title, started_by, updated_at }) => ({ id, title, startedBy: started_by, updatedAt: updated_at })),
      memories: memories.map(({ title, updated_by, updated_at }) => ({ title, updatedBy: updated_by, updatedAt: updated_at })),
    });
  } catch (err) {
    return agentErrorResponse(res, err);
  }
}
