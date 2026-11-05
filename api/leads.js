// POST /api/leads: receives a completed onboarding form.
import { randomUUID } from 'node:crypto';
import { BadRequest, readJson, sendJson } from '../server/http.js';
import { getStore, StorageNotConfigured } from '../server/store.js';
import { normalizeLead, validateLead } from '../shared/validate.js';
import { findCategory } from '../shared/catalog.js';

export function toRecord(lead, source) {
  return {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    status: 'pending',
    category: lead.category,
    category_other: lead.categoryOther || null,
    company_name: lead.companyName,
    city: lead.city,
    services: lead.services,
    employees: lead.employees,
    departments: lead.departments,
    departments_other: lead.departmentsOther || null,
    intent: lead.intent,
    tasks: lead.tasks,
    automate_notes: lead.automateNotes || null,
    tools: lead.tools || null,
    contact_name: lead.contactName,
    contact_email: lead.contactEmail,
    contact_role: lead.contactRole || null,
    contact_phone: lead.contactPhone || null,
    agent_key: findCategory(lead.category).agentKey,
    source: source || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  try {
    const body = await readJson(req);

    // Bots fill the hidden field. Reply as if it worked and store nothing.
    if (body.website) return sendJson(res, 201, { id: randomUUID(), status: 'pending' });

    const lead = normalizeLead(body);
    const fieldErrors = validateLead(lead);
    if (Object.keys(fieldErrors).length) return sendJson(res, 422, { error: 'Please check the highlighted fields.', fieldErrors });

    const source = typeof body.source === 'string' ? body.source.slice(0, 300) : null;
    const record = toRecord(lead, source);
    await getStore().insert(record);
    return sendJson(res, 201, { id: record.id, status: record.status });
  } catch (err) {
    if (err instanceof BadRequest) return sendJson(res, 400, { error: err.message });
    console.error('[leads] could not save lead:', err);
    const status = err instanceof StorageNotConfigured ? 503 : 502;
    return sendJson(res, status, { error: 'We could not save your request just now. Nothing was lost on your side, so please try again.' });
  }
}
