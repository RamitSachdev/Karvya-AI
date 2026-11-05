// A small table interface with two drivers: Supabase's REST API in production, and
// a JSON file when the local dev server opts in. Same rule as server/store.js: with
// neither configured it refuses, so a deployed site can't quietly lose data.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StorageError, StorageNotConfigured } from './store.js';

export class Conflict extends Error {}

function supabaseDb(url, key) {
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  async function call(pathAndQuery, init = {}) {
    const res = await fetch(`${base}/${pathAndQuery}`, { ...init, headers: { ...headers, ...init.headers } });
    if (res.status === 409) throw new Conflict(await res.text());
    if (!res.ok) throw new StorageError(`Supabase responded ${res.status}: ${await res.text()}`);
    const body = await res.text();
    return body ? JSON.parse(body) : null;
  }
  const eqQuery = (eq = {}) => Object.entries(eq).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`);

  return {
    async insert(table, rows) {
      await call(table, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
    },
    async select(table, { eq, order, limit } = {}) {
      const q = ['select=*', ...eqQuery(eq)];
      if (order) q.push(`order=${order.column}.${order.ascending ? 'asc' : 'desc'}`);
      if (limit) q.push(`limit=${limit}`);
      return call(`${table}?${q.join('&')}`);
    },
    async update(table, eq, patch) {
      const rows = await call(`${table}?${eqQuery(eq).join('&')}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      return rows?.[0] ?? null;
    },
    // Words are limited to letters and numbers by the caller, so they can't break out of the filter.
    async search(table, { eq, columns, words, limit }) {
      const terms = columns.flatMap((c) => words.map((w) => `${c}.ilike.*${w}*`));
      const q = ['select=*', ...eqQuery(eq), `or=${encodeURIComponent(`(${terms.join(',')})`)}`, `limit=${limit}`];
      return call(`${table}?${q.join('&')}`);
    },
  };
}

function fileDb(file) {
  // Writes are queued so concurrent requests in the dev server can't overwrite each other.
  let queue = Promise.resolve();
  const load = async () => {
    try { return JSON.parse(await readFile(file, 'utf8')); } catch (err) {
      if (err.code === 'ENOENT') return {};
      throw err;
    }
  };
  const save = async (data) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data, null, 2));
  };
  const write = (fn) => {
    const run = queue.then(async () => {
      const data = await load();
      const result = fn(data);
      await save(data);
      return result;
    });
    queue = run.catch(() => {});
    return run;
  };
  const matches = (row, eq = {}) => Object.entries(eq).every(([k, v]) => row[k] === v);
  // Mirrors the unique constraints in supabase/schema.sql that the app relies on.
  const UNIQUE = { agent_messages: ['session_id', 'seq'], agent_memories: ['workspace_id', 'title'], agent_workspaces: ['lead_id'] };

  return {
    insert: (table, rows) => write((data) => {
      data[table] ??= [];
      for (const row of rows) {
        const keys = UNIQUE[table];
        if (keys && data[table].some((r) => keys.every((k) => r[k] === row[k]))) throw new Conflict(`${table} unique violation`);
      }
      data[table].push(...rows);
    }),
    async select(table, { eq, order, limit } = {}) {
      await queue;
      let rows = ((await load())[table] ?? []).filter((r) => matches(r, eq));
      if (order) {
        const dir = order.ascending ? 1 : -1;
        rows = rows.sort((a, b) => (a[order.column] > b[order.column] ? dir : a[order.column] < b[order.column] ? -dir : 0));
      }
      return limit ? rows.slice(0, limit) : rows;
    },
    update: (table, eq, patch) => write((data) => {
      const row = (data[table] ?? []).find((r) => matches(r, eq));
      if (row) Object.assign(row, patch);
      return row ?? null;
    }),
    async search(table, { eq, columns, words, limit }) {
      await queue;
      return ((await load())[table] ?? [])
        .filter((r) => matches(r, eq) && columns.some((c) => words.some((w) => String(r[c] ?? '').toLowerCase().includes(w.toLowerCase()))))
        .slice(0, limit);
    },
  };
}

const fileDbs = new Map();

export function getDb() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LEADS_STORE, AGENT_DB_FILE } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) return supabaseDb(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  if (LEADS_STORE === 'file') {
    const file = AGENT_DB_FILE || path.join(process.cwd(), '.data', 'agent.json');
    if (!fileDbs.has(file)) fileDbs.set(file, fileDb(file));
    return fileDbs.get(file);
  }
  throw new StorageNotConfigured('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}
