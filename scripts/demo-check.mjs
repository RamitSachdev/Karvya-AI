// npm run demo:check: runs the demo's key moment against the real Claude API, using
// throwaway data, so you find problems before class. It costs a few cents.
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadEnv } from 'vite';

for (const [key, value] of Object.entries(loadEnv('production', process.cwd(), ''))) process.env[key] ??= value;

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.log('\nNo Claude API key yet. Paste it after ANTHROPIC_API_KEY= in .env.local, then run this again.\n');
  process.exit(1);
}

// Everything here is throwaway, so this can't touch your demo data.
const dir = mkdtempSync(path.join(tmpdir(), 'karvya-check-'));
Object.assign(process.env, {
  SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', TRIAL_WEBHOOK_URL: '', PUBLIC_SITE_URL: '',
  LEADS_STORE: 'file', LEADS_FILE: path.join(dir, 'leads.json'), AGENT_DB_FILE: path.join(dir, 'agent.json'),
  ADMIN_TOKEN: 'check', AGENT_LINK_SECRET: 'check',
});

const { spendLimitUsd, spentUsd } = await import('../server/spend.js');
const spendBefore = await spentUsd();
const usage = [];
const errors = [];
const realLog = console.log;
console.log = (...args) => {
  const m = String(args[0]).match(/input (\d+) cache_read (\d+) cache_write (\d+) output (\d+)/);
  if (m) usage.push({ input: +m[1], read: +m[2], write: +m[3], output: +m[4] });
  else realLog(...args);
};
console.error = (...args) => errors.push(args.map((a) => a?.message ?? String(a)).join(' '));

const routes = {
  '/api/leads': (await import('../api/leads.js')).default,
  '/api/admin/approve': (await import('../api/admin/approve.js')).default,
  '/api/agent/chat': (await import('../api/agent/chat.js')).default,
  '/api/agent/workspace': (await import('../api/agent/workspace.js')).default,
};
const server = createServer((req, res) => routes[new URL(req.url, 'http://x').pathname](req, res));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const post = (url, body, auth) => fetch(base + url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
  body: JSON.stringify(body),
});

async function say(token, author, message) {
  const started = Date.now();
  const res = await post('/api/agent/chat', { message, author }, token);
  const events = (await res.text()).split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')));
  const failed = events.find((e) => e.type === 'error');
  if (failed) throw new Error(failed.message);
  return { seconds: ((Date.now() - started) / 1000).toFixed(1), text: events.filter((e) => e.type === 'text').map((e) => e.delta).join('') };
}

let ok = true;
const report = (pass, label, detail = '') => {
  if (!pass) ok = false;
  realLog(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

try {
  realLog(`\nTesting ${process.env.AGENT_MODEL || 'claude-opus-5-5'} with a real conversation. This takes a minute...\n`);
  const lead = await (await post('/api/leads', {
    category: 'consulting', companyName: 'Asha Advisory', city: 'Pune', services: 'Strategy and market entry projects',
    employees: '11–50', departments: ['consulting'], intent: 'discover', contactName: 'Asha Rao', contactEmail: 'asha@example.com', consent: true,
  })).json();
  const approved = await (await post('/api/admin/approve', { id: lead.id }, 'check')).json();
  const token = approved.access_url.split('#key=')[1];
  report(Boolean(token), 'A request can be approved and gets an access link');

  const first = await say(token, 'Asha', 'Remember Sharma Textiles status: they want to enter the South India market, the budget is about ₹4 lakh, we finished sections 1 to 3, and the scope of the site visit is still open. I’m logging off, so please save where this stands.');
  report(first.text.length > 0, 'Asha gets a real reply', `${first.seconds}s`);

  const info = await (await fetch(`${base}/api/agent/workspace`, { headers: { Authorization: `Bearer ${token}` } })).json();
  report(info.memories.length > 0, 'The agent saved it to company memory', info.memories.map((m) => m.title).join(', '));

  const second = await say(token, 'Rahul', 'Where are we on Sharma Textiles?');
  report(/section\s*3|sections 1|4 lakh|site visit/i.test(second.text), 'Rahul, in a new session, gets the answer with no briefing', `${second.seconds}s`);
  realLog(`\n  Rahul asked: Where are we on Sharma Textiles?\n  Agent said:  ${second.text.replace(/\n+/g, '\n               ')}\n`);

  const later = await say(token, 'Rahul', 'Thanks. In one sentence, what should I do first?');
  const reads = usage.reduce((sum, u) => sum + u.read, 0);
  report(reads > 0, 'Prompt caching is saving tokens', `${reads.toLocaleString('en-IN')} tokens read from cache`);
  report(later.text.length > 0, 'The conversation continues', `${later.seconds}s`);

  const spendAfter = await spentUsd();
  realLog(`\n  This check cost about $${(spendAfter - spendBefore).toFixed(3)}. Total spent so far: $${spendAfter.toFixed(2)} of your $${spendLimitUsd().toFixed(2)} limit.`);
} catch (err) {
  ok = false;
  realLog(`  FAIL  ${err.message}`);
  if (errors.length) realLog(`\n  Details:\n  ${errors.at(-1).slice(0, 600)}`);
}

server.closeAllConnections();
server.close();
rmSync(dir, { recursive: true, force: true });
realLog(ok ? '\nAll good. You are ready to rehearse with npm run demo.\n' : '\nSomething needs fixing before class. See the lines marked FAIL.\n');
process.exit(ok ? 0 : 1);
