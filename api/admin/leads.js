// GET /api/admin/leads?status=pending: lists leads for review. Needs ADMIN_TOKEN.
import { isAdmin, sendJson } from '../../server/http.js';
import { getStore } from '../../server/store.js';
import { spendLimitUsd, spentUsd } from '../../server/spend.js';

const STATUSES = new Set(['pending', 'approved', 'rejected']);

export default async function handler(req, res) {
  if (!isAdmin(req)) return sendJson(res, 401, { error: 'Unauthorized.' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  const status = new URL(req.url, 'http://x').searchParams.get('status');
  if (status && !STATUSES.has(status)) return sendJson(res, 400, { error: 'Unknown status.' });
  try {
    const leads = await getStore().list(status);
    const spentNow = await spentUsd().catch(() => null);
    return sendJson(res, 200, { leads, spend: spentNow === null ? null : { spentUsd: spentNow, limitUsd: spendLimitUsd() } });
  } catch (err) {
    console.error('[admin/leads]', err);
    return sendJson(res, 502, { error: 'Could not read leads.' });
  }
}
