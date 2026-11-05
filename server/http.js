import { timingSafeEqual } from 'node:crypto';

const MAX_BODY_BYTES = 32 * 1024;

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export class BadRequest extends Error {}

// Vercel parses the body lazily and its getter throws on malformed JSON, so the
// read is guarded. The local dev server has no body parser and falls to the stream.
export async function readJson(req) {
  let parsed;
  try {
    parsed = req.body;
  } catch {
    throw new BadRequest('Request body is not valid JSON.');
  }
  if (parsed !== undefined && parsed !== null) {
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { throw new BadRequest('Request body is not valid JSON.'); }
    }
  } else {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) throw new BadRequest('Request body is too large.');
    }
    try { parsed = JSON.parse(raw || '{}'); } catch { throw new BadRequest('Request body is not valid JSON.'); }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new BadRequest('Request body must be a JSON object.');
  return parsed;
}

export function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
