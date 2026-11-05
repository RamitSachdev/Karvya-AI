// A hard ceiling on what the agents can spend across every company, on top of the
// allowance per trial. Spending is kept outside .data/ so that clearing demo data
// can't make the app forget money that has already gone.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb } from './db.js';

// Dollars per million tokens, from Anthropic's published prices.
const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
};
const FALLBACK_PRICE = { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 }; // Unknown model: assume the dearest.

// A cancelled reply never reports its usage, so it's charged this rough amount.
export const CANCELLED_TURN_USD = 0.03;

export function costUsd(model, u = {}) {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  return ((u.input_tokens ?? 0) * p.input
    + (u.output_tokens ?? 0) * p.output
    + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite
    + (u.cache_read_input_tokens ?? 0) * p.cacheRead) / 1e6;
}

export const spendLimitUsd = () => {
  const n = Number(process.env.SPEND_LIMIT_USD);
  return Number.isFinite(n) && n > 0 ? n : 4;
};

const ledgerFile = () => process.env.SPEND_FILE || path.join(process.cwd(), '.karvya-spend.json');
const hosted = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

function readLedger() {
  try { return Number(JSON.parse(readFileSync(ledgerFile(), 'utf8')).usd) || 0; } catch { return 0; }
}

export async function spentUsd() {
  // A hosted site has no lasting files, so it adds up the workspaces instead (usage units at Opus 5.5's input price).
  if (hosted()) {
    const rows = await getDb().select('agent_workspaces');
    return rows.reduce((sum, r) => sum + (Number(r.used_units) || 0), 0) * (4 / 1e6);
  }
  return readLedger();
}

export async function recordSpend(usd) {
  if (hosted()) return;
  writeFileSync(ledgerFile(), JSON.stringify({ usd: readLedger() + usd }));
}

export const overSpendLimit = async () => (await spentUsd()) >= spendLimitUsd();
