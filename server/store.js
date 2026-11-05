// Lead storage. Supabase in production. A local JSON file only when the dev or
// preview server opts in with LEADS_STORE=file, because a serverless host would
// discard that file and quietly lose real leads.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class StorageNotConfigured extends Error {}
export class StorageError extends Error {}

function supabaseStore(url, key) {
  const base = `${url.replace(/\/$/, '')}/rest/v1/leads`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  async function call(query, init = {}) {
    const res = await fetch(`${base}${query}`, { ...init, headers: { ...headers, ...init.headers } });
    if (!res.ok) throw new StorageError(`Supabase responded ${res.status}: ${await res.text()}`);
    const body = await res.text(); // Inserts with return=minimal reply 201 and an empty body.
    return body ? JSON.parse(body) : null;
  }

  return {
    async insert(record) {
      await call('', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(record) });
    },
    async list(status) {
      const filter = status ? `&status=eq.${encodeURIComponent(status)}` : '';
      return call(`?select=*&order=created_at.desc${filter}`);
    },
    async get(id) {
      const rows = await call(`?select=*&id=eq.${encodeURIComponent(id)}`);
      return rows[0] ?? null;
    },
    async update(id, patch) {
      const rows = await call(`?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      return rows[0] ?? null;
    },
  };
}

function fileStore(file) {
  const load = async () => {
    try { return JSON.parse(await readFile(file, 'utf8')); } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  };
  const save = async (rows) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(rows, null, 2));
  };
  return {
    async insert(record) { await save([record, ...(await load())]); },
    async list(status) { const rows = await load(); return status ? rows.filter((r) => r.status === status) : rows; },
    async get(id) { return (await load()).find((r) => r.id === id) ?? null; },
    async update(id, patch) {
      const rows = await load();
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return null;
      rows[i] = { ...rows[i], ...patch };
      await save(rows);
      return rows[i];
    },
  };
}

export function getStore() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LEADS_STORE, LEADS_FILE } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) return supabaseStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  if (LEADS_STORE === 'file') return fileStore(LEADS_FILE || path.join(process.cwd(), '.data', 'leads.json'));
  throw new StorageNotConfigured('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}
