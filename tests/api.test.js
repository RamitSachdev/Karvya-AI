import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import leads from '../api/leads.js';
import adminLeads from '../api/admin/leads.js';
import approve from '../api/admin/approve.js';

const VALID = {
  category: 'financial', companyName: 'Mehta & Co', city: 'Indore', services: 'Audit and tax',
  employees: '11–50', departments: ['finance'], intent: 'discover',
  contactName: 'Asha Mehta', contactEmail: 'ASHA@example.com', consent: true,
};

function call(handler, { method = 'POST', body, url = '/', headers = {}, rawBody } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(rawBody !== undefined ? [rawBody] : body ? [JSON.stringify(body)] : []);
    Object.assign(req, { method, url, headers });
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(text) { resolve({ status: this.statusCode, headers: this.headers, json: text ? JSON.parse(text) : null }); },
    };
    handler(req, res).catch(reject);
  });
}
const adminHeaders = { authorization: 'Bearer secret-token' };

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LEADS_STORE', 'LEADS_FILE', 'ADMIN_TOKEN', 'TRIAL_WEBHOOK_URL', 'AGENT_LINK_SECRET', 'AGENT_DB_FILE', 'SPEND_FILE'];
let dir;
beforeEach(async () => {
  ENV_KEYS.forEach((k) => delete process.env[k]);
  dir = await mkdtemp(path.join(tmpdir(), 'karvya-'));
  process.env.LEADS_STORE = 'file';
  process.env.LEADS_FILE = path.join(dir, 'leads.json');
  process.env.ADMIN_TOKEN = 'secret-token';
  process.env.AGENT_LINK_SECRET = 'link-secret';
  process.env.AGENT_DB_FILE = path.join(dir, 'agent.json');
  process.env.SPEND_FILE = path.join(dir, 'spend.json');
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
const consoleError = console.error;
console.error = () => {};
after(() => { console.error = consoleError; });

test('saves a valid lead as pending with the agent for its category', async () => {
  const res = await call(leads, { body: VALID });
  assert.equal(res.status, 201);
  const { json } = await call(adminLeads, { method: 'GET', headers: adminHeaders });
  assert.equal(json.leads.length, 1);
  const lead = json.leads[0];
  assert.equal(lead.id, res.json.id);
  assert.equal(lead.status, 'pending');
  assert.equal(lead.agent_key, 'finance-ops');
  assert.equal(lead.contact_email, 'asha@example.com');
});

test('rejects missing fields and names each one', async () => {
  const res = await call(leads, { body: { category: 'financial' } });
  assert.equal(res.status, 422);
  for (const f of ['companyName', 'city', 'services', 'employees', 'departments', 'intent', 'contactName', 'contactEmail', 'consent']) {
    assert.ok(res.json.fieldErrors[f], `expected an error for ${f}`);
  }
});

test('requires a description for the "something else" category', async () => {
  const res = await call(leads, { body: { ...VALID, category: 'other' } });
  assert.equal(res.status, 422);
  assert.ok(res.json.fieldErrors.categoryOther);
  assert.equal((await call(leads, { body: { ...VALID, category: 'other', categoryOther: 'NGO' } })).status, 201);
});

test('"I know what I want" needs a task or a note, "not sure" does not', async () => {
  assert.equal((await call(leads, { body: { ...VALID, intent: 'known' } })).status, 422);
  assert.equal((await call(leads, { body: { ...VALID, intent: 'known', tasks: ['Reconciliations'] } })).status, 201);
  assert.equal((await call(leads, { body: { ...VALID, intent: 'known', automateNotes: 'Invoices' } })).status, 201);
  assert.equal((await call(leads, { body: { ...VALID, intent: 'discover' } })).status, 201);
});

test('rejects bad email, unknown category and unknown department', async () => {
  assert.ok((await call(leads, { body: { ...VALID, contactEmail: 'nope' } })).json.fieldErrors.contactEmail);
  assert.ok((await call(leads, { body: { ...VALID, category: 'made-up' } })).json.fieldErrors.category);
  assert.ok((await call(leads, { body: { ...VALID, departments: ['made-up'] } })).json.fieldErrors.departments);
});

test('malformed JSON and wrong method get clean errors', async () => {
  assert.equal((await call(leads, { rawBody: '{oops' })).status, 400);
  assert.equal((await call(leads, { method: 'GET' })).status, 405);
});

test('a Vercel-style body getter that throws gets a 400, not a crash', async () => {
  const req = { method: 'POST', url: '/', headers: {}, get body() { throw new Error('invalid json'); } };
  const res = await new Promise((resolve, reject) => {
    leads(req, { statusCode: 200, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: JSON.parse(t) }); } }).catch(reject);
  });
  assert.equal(res.status, 400);
});

test('honeypot looks like success but stores nothing', async () => {
  assert.equal((await call(leads, { body: { ...VALID, website: 'spam.example' } })).status, 201);
  assert.equal((await call(adminLeads, { method: 'GET', headers: adminHeaders })).json.leads.length, 0);
});

test('with no storage configured, it refuses with a 503 instead of losing the lead', async () => {
  delete process.env.LEADS_STORE;
  const res = await call(leads, { body: VALID });
  assert.equal(res.status, 503);
  assert.ok(res.json.error);
});

test('admin routes reject a missing, wrong or unconfigured token', async () => {
  assert.equal((await call(adminLeads, { method: 'GET' })).status, 401);
  assert.equal((await call(adminLeads, { method: 'GET', headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await call(approve, { body: { id: 'x' } })).status, 401);
  delete process.env.ADMIN_TOKEN;
  assert.equal((await call(adminLeads, { method: 'GET', headers: adminHeaders })).status, 401);
  assert.equal((await call(adminLeads, { method: 'GET', headers: { authorization: 'Bearer ' } })).status, 401);
});

test('approving without a webhook marks it approved and reports the trial unsent', async () => {
  const { json: { id } } = await call(leads, { body: VALID });
  const res = await call(approve, { body: { id }, headers: adminHeaders });
  assert.equal(res.status, 200);
  assert.equal(res.json.lead.status, 'approved');
  assert.equal(res.json.trial.sent, false);
  assert.equal(res.json.lead.trial_sent_at ?? null, null);
  const pending = await call(adminLeads, { method: 'GET', url: '/?status=pending', headers: adminHeaders });
  assert.equal(pending.json.leads.length, 0);
});

test('approve fires the webhook once, and a failed webhook can be retried', async () => {
  const hits = [];
  let fail = true;
  const hook = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { hits.push(JSON.parse(raw)); res.statusCode = fail ? 500 : 200; res.end(); });
  });
  await new Promise((r) => hook.listen(0, r));
  process.env.TRIAL_WEBHOOK_URL = `http://127.0.0.1:${hook.address().port}/`;
  try {
    const { json: { id } } = await call(leads, { body: VALID });

    const failed = await call(approve, { body: { id }, headers: adminHeaders });
    assert.equal(failed.status, 502);
    assert.equal(failed.json.lead.status, 'approved');

    fail = false;
    const ok = await call(approve, { body: { id }, headers: adminHeaders });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.trial.sent, true);
    assert.ok(ok.json.lead.trial_sent_at);

    const again = await call(approve, { body: { id }, headers: adminHeaders });
    assert.equal(again.json.trial.alreadySent, true);

    assert.equal(hits.length, 2, 'one failed attempt and one success, with no third send');
    assert.equal(hits[1].event, 'lead.approved');
    assert.equal(hits[1].agent_key, 'finance-ops');
    assert.equal(hits[1].email, 'asha@example.com');
  } finally {
    hook.close();
  }
});

test('approve returns 404 for an unknown lead', async () => {
  assert.equal((await call(approve, { body: { id: 'missing' }, headers: adminHeaders })).status, 404);
});

test('Supabase driver sends the right requests and copes with an empty insert reply', async () => {
  const seen = [];
  const rows = [];
  const fake = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, key: req.headers.apikey, auth: req.headers.authorization, prefer: req.headers.prefer });
      if (req.method === 'POST') { rows.push(JSON.parse(raw)); res.statusCode = 201; return res.end(); }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(rows));
    });
  });
  await new Promise((r) => fake.listen(0, r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}/`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  try {
    assert.equal((await call(leads, { body: VALID })).status, 201);
    assert.equal(seen[0].url, '/rest/v1/leads');
    assert.equal(seen[0].key, 'service-key');
    assert.equal(seen[0].auth, 'Bearer service-key');
    assert.equal(seen[0].prefer, 'return=minimal');
    assert.equal(rows[0].status, 'pending');
    assert.deepEqual(rows[0].departments, ['finance']);
    const list = await call(adminLeads, { method: 'GET', url: '/?status=pending', headers: adminHeaders });
    assert.equal(list.json.leads.length, 1);
    assert.match(seen[1].url, /status=eq\.pending/);
  } finally {
    fake.close();
  }
});

test('a Supabase failure returns an error, never a false success', async () => {
  const fake = createServer((req, res) => { req.resume(); res.statusCode = 500; res.end('{"message":"down"}'); });
  await new Promise((r) => fake.listen(0, r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  try {
    assert.equal((await call(leads, { body: VALID })).status, 502);
  } finally {
    fake.close();
  }
});
