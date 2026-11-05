import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import './styles/base.css';
import './styles/app.css';
import { findCategory } from '../shared/catalog.js';

const $ = (name) => document.querySelector(`[data-${name}]`);
const KEY = 'karvya.admin.token';
const FILTERS = [['pending', 'Waiting'], ['approved', 'Approved'], ['', 'All']];

let token = '';
try { token = sessionStorage.getItem(KEY) || ''; } catch { /* sign in each visit */ }
let filter = 'pending';

const api = (path, init = {}) => fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });

function h(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}
const meta = (label, value) => (value ? h('p', 'admin-meta', h('b', '', `${label}: `), String(value)) : null);

function boardError(message) {
  const box = $('board-error');
  box.textContent = message;
  box.hidden = !message;
}

function showLink(actions, data) {
  actions.querySelector('.admin-link')?.remove();
  actions.querySelector('.admin-note')?.remove();
  const input = document.createElement('input');
  input.className = 'input';
  input.readOnly = true;
  input.value = data.access_url;
  input.setAttribute('aria-label', 'Agent access link');
  input.dataset.accessLink = '';
  const copy = h('button', 'btn btn-line btn-sm', 'Copy');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    input.select();
    try { await navigator.clipboard.writeText(input.value); copy.textContent = 'Copied'; } catch { copy.textContent = 'Press Ctrl+C'; }
  });
  const open = h('a', 'btn btn-ink btn-sm', 'Open agent');
  open.href = data.access_url;
  open.target = '_blank';
  open.rel = 'noopener';
  const note = data.trial?.sent
    ? (data.trial.alreadySent ? 'The trial email already went out.' : 'The trial email has been sent.')
    : data.error
      ? 'Approved, but the email hand-off failed. Approve again to retry, or send this link yourself.'
      : 'No email tool is connected yet, so send this link to them yourself.';
  actions.append(h('div', 'admin-link', input, copy, open), h('p', 'admin-note', note));
}

function leadCard(lead) {
  const tag = h('span', `admin-tag admin-tag-${lead.status}`, lead.status === 'pending' ? 'Waiting' : lead.status === 'approved' ? 'Approved' : 'Rejected');
  const actions = h('div', 'admin-actions');
  const approve = h('button', 'btn btn-ink btn-sm', lead.status === 'approved' ? 'Show access link' : 'Approve');
  approve.type = 'button';
  approve.addEventListener('click', async () => {
    approve.disabled = true;
    boardError('');
    try {
      const res = await api('/api/admin/approve', { method: 'POST', body: JSON.stringify({ id: lead.id }) });
      const data = await res.json().catch(() => ({}));
      if (data.access_url) {
        showLink(actions, data);
        if (data.lead) {
          lead.status = data.lead.status;
          tag.textContent = 'Approved';
          tag.className = 'admin-tag admin-tag-approved';
          approve.textContent = 'Show access link';
        }
      } else {
        boardError(data.error || 'Could not approve this request.');
      }
    } catch {
      boardError('Could not reach the server. Please try again.');
    } finally {
      approve.disabled = false;
    }
  });
  actions.append(approve);

  const category = lead.category_other || findCategory(lead.category)?.label || lead.category;
  const wants = lead.intent === 'discover' && !lead.tasks?.length
    ? 'Not sure yet, wants to see what’s possible'
    : [...(lead.tasks ?? []), lead.automate_notes].filter(Boolean).join(', ');
  const card = h('li', 'admin-lead',
    h('div', 'admin-lead-head', h('h2', '', lead.company_name), tag),
    h('p', 'admin-meta', `${lead.contact_name}${lead.contact_role ? `, ${lead.contact_role}` : ''} · ${lead.contact_email}${lead.contact_phone ? ` · ${lead.contact_phone}` : ''}`),
    h('p', 'admin-meta', `${category} · ${lead.city} · ${lead.employees} people · received ${new Date(lead.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`),
    meta('What they do', lead.services),
    meta('Wants automated', wants),
    meta('Tools', lead.tools),
    actions);
  card.dataset.lead = lead.contact_email;
  return card;
}

async function loadLeads() {
  boardError('');
  try {
    const res = await api(`/api/admin/leads${filter ? `?status=${filter}` : ''}`);
    if (res.status === 401) return signOut('That token wasn’t accepted.');
    if (!res.ok) throw new Error(String(res.status));
    const { leads, spend } = await res.json();
    if (spend) {
      const line = $('spend');
      const label = document.createElement('b');
      label.textContent = `$${spend.spentUsd.toFixed(2)} of $${spend.limitUsd.toFixed(2)}`;
      line.replaceChildren('AI spend so far: ', label, '. The agent stops replying at the limit.');
      line.hidden = false;
    }
    $('login').hidden = true;
    $('board').hidden = false;
    $('leads').replaceChildren(...leads.map(leadCard));
    $('leads-empty').hidden = leads.length > 0;
  } catch {
    $('login').hidden = true;
    $('board').hidden = false;
    boardError('Could not load requests. Check that storage is set up, then reload.');
  }
  return undefined;
}

function signOut(message = '') {
  token = '';
  try { sessionStorage.removeItem(KEY); } catch { /* nothing stored */ }
  $('board').hidden = true;
  $('login').hidden = false;
  const error = $('login-error');
  error.textContent = message;
  error.hidden = !message;
}

const tabs = FILTERS.map(([value, label]) => {
  const b = h('button', '', label);
  b.type = 'button';
  b.setAttribute('aria-pressed', String(value === filter));
  b.addEventListener('click', () => {
    filter = value;
    tabs.forEach((t, i) => t.setAttribute('aria-pressed', String(FILTERS[i][0] === filter)));
    loadLeads();
  });
  return b;
});
$('tabs').append(...tabs);

$('login').addEventListener('submit', (e) => {
  e.preventDefault();
  token = document.getElementById('token').value.trim();
  try { sessionStorage.setItem(KEY, token); } catch { /* sign in each visit */ }
  loadLeads();
});

if (token) loadLeads();
else signOut();
