// Shared by the agent endpoints: turns an access link into a workspace, or replies with the reason it can't.
import { sendJson } from '../../server/http.js';
import { getWorkspace, workspaceIdFromToken } from '../../server/agent-store.js';

export async function authenticate(req, res) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const id = token ? workspaceIdFromToken(token) : null;
  const workspace = id ? await getWorkspace(id) : null;
  if (!workspace) {
    sendJson(res, 401, { code: 'invalid_link', error: 'This access link isn’t valid.' });
    return null;
  }
  if (new Date(workspace.expires_at) <= new Date()) {
    sendJson(res, 403, { code: 'expired', error: 'This free trial has ended.' });
    return null;
  }
  return workspace;
}

export function agentErrorResponse(res, err) {
  console.error('[agent]', err);
  sendJson(res, 503, { error: 'The agent can’t be reached just now. Please try again shortly.' });
}
