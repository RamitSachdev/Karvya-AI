// npm run demo: builds the site and runs everything on this laptop.
// Requests, sessions and company memory are saved in .data/ and survive a restart.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';

const ENV_FILE = '.env.local';

function readEnv() {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(readFileSync(ENV_FILE, 'utf8').split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
}

// Fills in anything missing, and never overwrites a value that's already there.
function ensureEnv() {
  const env = readEnv();
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '# Local settings. Git ignores this file.\n';
  if (!text.endsWith('\n')) text += '\n';
  const add = (key, value) => {
    if (key in env) return;
    text += `${key}=${value}\n`;
    env[key] = value;
  };
  add('ANTHROPIC_API_KEY', '');
  add('ADMIN_TOKEN', randomBytes(16).toString('hex'));
  add('AGENT_LINK_SECRET', randomBytes(32).toString('hex'));
  writeFileSync(ENV_FILE, text);
  chmodSync(ENV_FILE, 0o600);
  return env;
}

// Connects the way a browser does, because "localhost" can mean IPv4 or IPv6 on a Mac.
const portInUse = (port) => new Promise((resolve) => {
  const probe = connect({ port, host: 'localhost' });
  probe.once('connect', () => { probe.destroy(); resolve(true); });
  probe.once('error', () => resolve(false));
});

async function freePort() {
  for (let port = 5173; port < 5190; port++) if (!(await portInUse(port))) return port;
  throw new Error('No free port between 5173 and 5189.');
}

if (!existsSync('node_modules')) {
  console.log('Installing packages (first run only)...');
  if (spawnSync('npm', ['install'], { stdio: 'inherit' }).status !== 0) process.exit(1);
}

const env = ensureEnv();

console.log('Building the site...');
const build = spawnSync('npx', ['vite', 'build', '--logLevel', 'warn'], { stdio: 'inherit' });
if (build.status !== 0) {
  console.error('\nThe build failed, so the demo did not start. See the error above.');
  process.exit(1);
}

const port = await freePort();
const share = process.argv.includes('--share');
const children = [];
const stopAll = () => children.forEach((c) => c.kill());
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stopAll);

// Opens the public link first, so the server can build access links from it.
async function openTunnel() {
  const found = spawnSync('which', ['cloudflared'], { encoding: 'utf8' }).stdout.trim();
  if (!found) {
    console.error('\nSharing needs cloudflared. Install it once with: brew install cloudflared');
    process.exit(1);
  }
  console.log('Opening a public link...');
  const tunnel = spawn(found, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(tunnel);
  tunnel.on('exit', () => { console.error('\nThe public link closed.'); stopAll(); process.exit(1); });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Cloudflare did not give us a link in time. Check your internet and try again.')), 45_000);
    const read = (chunk) => {
      const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    };
    tunnel.stdout.on('data', read);
    tunnel.stderr.on('data', read);
  });
}

let base = `http://localhost:${port}`;
const serverEnv = { ...process.env };
if (share) {
  base = await openTunnel().catch((err) => { console.error(`\n${err.message}`); stopAll(); process.exit(1); });
  serverEnv.PUBLIC_SITE_URL = base;
  // Keeps the Mac from going to sleep and dropping the link. Closing the lid still will.
  if (process.platform === 'darwin') spawn('caffeinate', ['-dis', '-w', String(process.pid)], { stdio: 'ignore' }).unref();
}

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', share ? '127.0.0.1' : 'localhost', '--logLevel', 'warn'], { stdio: ['ignore', 'inherit', 'inherit'], env: serverEnv });
children.push(server);
server.on('exit', (code) => { stopAll(); process.exit(code ?? 0); });

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  ready = await portInUse(port);
  if (!ready) await new Promise((r) => setTimeout(r, 250));
}
if (!ready) {
  console.error('\nThe server did not start. See any error above.');
  stopAll();
  process.exit(1);
}

// A new public link can take a few seconds to start working.
if (share) {
  for (let i = 0; i < 30; i++) {
    const up = await fetch(base, { signal: AbortSignal.timeout(4000) }).then((r) => r.ok).catch(() => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

let spent = 0;
try { spent = JSON.parse(readFileSync('.karvya-spend.json', 'utf8')).usd || 0; } catch { /* nothing spent yet */ }
const limit = Number(env.SPEND_LIMIT_USD) > 0 ? Number(env.SPEND_LIMIT_USD) : 4;

console.log(`
  Karvya AI is running. Keep this window open, and press Ctrl+C to stop.

  Landing page   ${base}
  Form           ${base}/start
  Admin          ${base}/admin
  Admin token    ${env.ADMIN_TOKEN}
  AI spend       $${spent.toFixed(2)} of your $${limit.toFixed(2)} limit
`);
if (share) {
  console.log(`  Anyone with these links can reach the site while this runs, so share them only
  with people you trust, and keep the admin token to yourself. Keep the laptop
  on with the lid open. This link stops working when you press Ctrl+C.
`);
}
if (!env.ANTHROPIC_API_KEY) {
  console.log(`  ! No Claude API key yet. Everything works except the agent's replies.
    Paste your key after ANTHROPIC_API_KEY= in .env.local, then run this again.
`);
}
if (process.platform === 'darwin' && !process.env.DEMO_NO_OPEN) spawn('open', [base], { stdio: 'ignore' });
