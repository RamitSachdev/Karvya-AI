// POST /api/admin/approve { "id": "<lead id>" }: approves a lead, opens its agent
// workspace and fires the trial hand-off. The response always includes the access
// link. Safe to retry: a lead whose trial already went out is not resent.
import { BadRequest, isAdmin, readJson, sendJson } from '../../server/http.js';
import { getStore } from '../../server/store.js';
import { dispatchTrial } from '../../server/trial.js';
import { accessToken, ensureWorkspace, LinkSecretMissing, requireLinkSecret } from '../../server/agent-store.js';
import { describeAgent } from '../../server/agents.js';

function accessUrlFor(req, workspace) {
  const host = String(req.headers.host || 'localhost');
  const site = process.env.PUBLIC_SITE_URL || `${/^(localhost|127\.)/.test(host) ? 'http' : 'https'}://${host}`;
  // The key sits after the # so it is never sent to a server or written to a log.
  return `${site.replace(/\/$/, '')}/agent#key=${accessToken(workspace)}`;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return sendJson(res, 401, { error: 'Unauthorized.' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  try {
    requireLinkSecret();
    const { id } = await readJson(req);
    if (typeof id !== 'string' || !id) return sendJson(res, 400, { error: 'Missing lead id.' });

    const store = getStore();
    let lead = await store.get(id);
    if (!lead) return sendJson(res, 404, { error: 'Lead not found.' });

    const workspace = await ensureWorkspace(lead);
    const access_url = accessUrlFor(req, workspace);
    if (lead.trial_sent_at) return sendJson(res, 200, { lead, access_url, trial: { sent: true, alreadySent: true } });

    if (lead.status !== 'approved') lead = await store.update(id, { status: 'approved', approved_at: new Date().toISOString() });

    try {
      const trial = await dispatchTrial(lead, { accessUrl: access_url, agentName: describeAgent(lead.agent_key).name });
      if (trial.sent) lead = await store.update(id, { trial_sent_at: new Date().toISOString() });
      return sendJson(res, 200, { lead, access_url, trial });
    } catch (err) {
      console.error('[admin/approve] trial hand-off failed:', err);
      return sendJson(res, 502, { lead, access_url, trial: { sent: false, reason: err.message }, error: 'Lead approved, but the trial was not sent. Retry to resend.' });
    }
  } catch (err) {
    if (err instanceof BadRequest) return sendJson(res, 400, { error: err.message });
    if (err instanceof LinkSecretMissing) return sendJson(res, 503, { error: 'Set AGENT_LINK_SECRET before approving leads.' });
    console.error('[admin/approve]', err);
    return sendJson(res, 502, { error: 'Could not approve lead.' });
  }
}
