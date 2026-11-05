// GET /api/agent/session?id=...: the readable transcript of one of this company's sessions.
import { sendJson } from '../../server/http.js';
import { getSession, listMessages } from '../../server/agent-store.js';
import { agentErrorResponse, authenticate } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  try {
    const workspace = await authenticate(req, res);
    if (!workspace) return undefined;
    const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
    const session = await getSession(workspace.id, id);
    if (!session) return sendJson(res, 404, { error: 'Session not found.' });
    const messages = (await listMessages(id))
      .filter((m) => m.text)
      .map((m) => ({ role: m.role, author: m.author, text: m.text }));
    return sendJson(res, 200, { id, title: session.title, messages });
  } catch (err) {
    return agentErrorResponse(res, err);
  }
}
