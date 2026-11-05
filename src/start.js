import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import './styles/base.css';
import './styles/start.css';
import { CATEGORIES, OTHER_CATEGORY, DEPARTMENTS, EMPLOYEE_BANDS, INTENTS, findCategory } from '../shared/catalog.js';
import { normalizeLead, validateLead, STEP_FIELDS } from '../shared/validate.js';

const STEPS = [
  { key: 'category', nav: 'Your category' },
  { key: 'company', nav: 'Your company' },
  { key: 'departments', nav: 'Your departments' },
  { key: 'automate', nav: 'What to automate' },
  { key: 'contact', nav: 'Where to send it' },
];
const DRAFT_KEY = 'karvya.onboarding.v1';

const form = document.querySelector('[data-ob-form]');
const stepList = document.querySelector('[data-ob-steps]');
const progress = document.querySelector('[data-ob-progress]');
const agentCard = document.querySelector('[data-ob-agent]');
const agentName = document.querySelector('[data-ob-agent-name]');

const blank = {
  category: '', categoryOther: '', companyName: '', city: '', services: '', employees: '',
  departments: [], departmentsOther: '', intent: '', tasks: [], automateNotes: '', tools: '',
  contactName: '', contactEmail: '', contactRole: '', contactPhone: '', consent: false,
};

// Storage can be unavailable (private mode, blocked site data), and the form must still work.
function readDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; }
}
function writeDraft() {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ data, step, source })); } catch { /* keep going without a draft */ }
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
}

const draft = readDraft();
const data = { ...blank, ...draft.data };
let step = Number.isInteger(draft.step) && draft.step >= 0 && draft.step < STEPS.length ? draft.step : 0;
let source = draft.source || '';
let errors = {};
let submitting = false;
let formError = '';
let result = null;

// A category link from the landing page chooses the category and moves on. The
// parameter is then removed so reloading later can't undo a change of mind.
const params = new URLSearchParams(location.search);
source ||= params.get('utm_source') || document.referrer || '';
const linked = params.get('category');
if (linked && findCategory(linked)) {
  data.category = linked;
  step = 1;
}
if (params.has('category')) history.replaceState(null, '', location.pathname);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'checked' || k === 'disabled' || k === 'required') el[k] = Boolean(v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

// Tasks picked under a department that was later removed shouldn't be submitted.
function liveTasks() {
  const allowed = new Set(DEPARTMENTS.filter((d) => data.departments.includes(d.key)).flatMap((d) => d.tasks));
  return data.tasks.filter((t) => allowed.has(t));
}
const payload = () => ({ ...normalizeLead({ ...data, tasks: liveTasks() }), source });
const stepErrors = (key) => {
  const all = validateLead(normalizeLead({ ...data, tasks: liveTasks() }));
  return Object.fromEntries(Object.entries(all).filter(([field]) => STEP_FIELDS[key].includes(field)));
};

function errorNode(field) {
  return errors[field] ? h('p', { class: 'error', id: `${field}-error` }, errors[field]) : null;
}

function textField(field, label, opts = {}) {
  const { type = 'text', optional, placeholder, multiline, autocomplete, hint, inputmode } = opts;
  const tag = multiline ? 'textarea' : 'input';
  const control = h(tag, {
    class: 'input', id: field, name: field, type: multiline ? undefined : type, value: data[field],
    placeholder, autocomplete, inputmode,
    'aria-required': optional ? undefined : 'true',
    'aria-invalid': errors[field] ? 'true' : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
    onInput: (e) => { data[field] = e.target.value; writeDraft(); },
  });
  return h('div', { class: `field${errors[field] ? ' has-error' : ''}` },
    h('label', { for: field }, label, optional ? h('span', { class: 'opt' }, ' (optional)') : null),
    hint ? h('p', { class: 'hint' }, hint) : null,
    control,
    errorNode(field));
}

function choice(type, name, value, checked, face, onChange) {
  return h('label', { class: 'choice' },
    h('input', { type, name, value, checked, onChange }),
    h('span', { class: 'choice-face' }, face));
}

function toggleIn(list, value, on) {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value);
}

function taskChips(department) {
  return h('div', { class: 'chips' }, department.tasks.map((task) =>
    choice('checkbox', 'tasks', task, data.tasks.includes(task), task, (e) => {
      data.tasks = toggleIn(data.tasks, task, e.target.checked);
      writeDraft();
    })));
}

const RENDER = {
  category() {
    const all = [...CATEGORIES, OTHER_CATEGORY];
    return {
      title: 'What kind of company are you?',
      intro: 'Pick the closest match. It tells us which agent to start you with.',
      body: [
        h('fieldset', { class: 'field' },
          h('legend', { class: 'sr-only' }, 'Company category'),
          h('div', { class: 'choices' }, all.map((c) =>
            choice('radio', 'category', c.key, data.category === c.key,
              [h('b', {}, c.label), h('small', {}, c.note)],
              () => { data.category = c.key; errors = {}; writeDraft(); paint({ keepFocus: true }); }))),
          errorNode('category')),
        data.category === OTHER_CATEGORY.key
          ? textField('categoryOther', 'What does your company do?', { placeholder: 'For example: hospitality group, NGO, travel agency' })
          : null,
      ],
    };
  },
  company() {
    return {
      title: 'Tell us about your company.',
      intro: 'The basics, so we can get the agent right for you.',
      body: [
        h('div', { class: 'field-row' },
          textField('companyName', 'Company name', { autocomplete: 'organization' }),
          textField('city', 'City', { autocomplete: 'address-level2', placeholder: 'For example: Gurugram' })),
        textField('services', 'What services do you offer?', { multiline: true, placeholder: 'For example: tax and audit for mid-sized manufacturers' }),
        h('fieldset', { class: `field${errors.employees ? ' has-error' : ''}` },
          h('legend', {}, 'How many people work there?'),
          h('div', { class: 'choices choices-tight' }, EMPLOYEE_BANDS.map((band) =>
            choice('radio', 'employees', band, data.employees === band, h('b', {}, band), () => { data.employees = band; writeDraft(); }))),
          errorNode('employees')),
      ],
    };
  },
  departments() {
    return {
      title: 'Which departments do you have?',
      intro: 'Select all that apply. These are the places an agent could sit.',
      body: [
        h('fieldset', { class: `field${errors.departments ? ' has-error' : ''}` },
          h('legend', { class: 'sr-only' }, 'Departments'),
          h('div', { class: 'chips' }, DEPARTMENTS.map((d) =>
            choice('checkbox', 'departments', d.key, data.departments.includes(d.key), d.label, (e) => {
              data.departments = toggleIn(data.departments, d.key, e.target.checked);
              writeDraft();
            }))),
          errorNode('departments')),
        textField('departmentsOther', 'Anything we missed?', { optional: true }),
      ],
    };
  },
  automate() {
    const selected = DEPARTMENTS.filter((d) => data.departments.includes(d.key));
    const shown = selected.length ? selected : DEPARTMENTS.slice(0, 3);
    const pick = (intent) => () => { data.intent = intent; errors = {}; writeDraft(); paint({ keepFocus: true }); };
    return {
      title: 'What are you looking to automate?',
      intro: 'Both answers are good ones. Plenty of companies aren’t sure yet.',
      body: [
        h('fieldset', { class: `field${errors.intent ? ' has-error' : ''}` },
          h('legend', { class: 'sr-only' }, 'Do you know what you want to automate?'),
          h('div', { class: 'choices' },
            choice('radio', 'intent', INTENTS.KNOWN, data.intent === INTENTS.KNOWN, [h('b', {}, 'I know what I want'), h('small', {}, 'Let me pick the tasks')], pick(INTENTS.KNOWN)),
            choice('radio', 'intent', INTENTS.DISCOVER, data.intent === INTENTS.DISCOVER, [h('b', {}, 'I’m not sure yet'), h('small', {}, 'Show me what’s possible')], pick(INTENTS.DISCOVER))),
          errorNode('intent')),
        data.intent === INTENTS.KNOWN
          ? h('div', { class: 'ob-body', style: 'margin-top:0' },
              selected.map((d) => h('div', { class: 'task-group' }, h('p', {}, d.label), taskChips(d))),
              errorNode('tasks'),
              textField('automateNotes', selected.length ? 'Anything else?' : 'Describe what you want to automate', { multiline: true, optional: selected.length > 0, placeholder: 'The task your team complains about the most' }))
          : null,
        data.intent === INTENTS.DISCOVER
          ? h('div', { class: 'ob-body', style: 'margin-top:0' },
              h('p', { class: 'hint' }, 'Here’s how it could look in your departments. Tick anything useful, or just carry on. We’ll walk you through it.'),
              shown.map((d) => h('article', { class: 'show-card' },
                h('h3', {}, d.label),
                h('div', { class: 'show-pair' },
                  h('p', { class: 'show-before' }, h('span', {}, 'Today'), h('br'), d.before),
                  h('p', { class: 'show-after' }, h('span', {}, 'With an agent'), h('br'), d.after)),
                selected.length ? taskChips(d) : null)))
          : null,
        data.intent
          ? textField('tools', 'What tools does your team use today?', { optional: true, placeholder: 'For example: Excel, Tally, Zoho, Google Workspace, Slack', hint: 'So we know what the agent has to work with.' })
          : null,
      ],
    };
  },
  contact() {
    const category = findCategory(data.category);
    const departmentNames = DEPARTMENTS.filter((d) => data.departments.includes(d.key)).map((d) => d.label);
    if (data.departmentsOther.trim()) departmentNames.push(data.departmentsOther.trim());
    const tasks = liveTasks();
    const reviewRow = (label, value, stepKey) => h('div', {},
      h('dt', {}, label),
      h('dd', {}, value || 'Not given'),
      h('button', { type: 'button', class: 'link-btn', 'aria-label': `Edit ${label.toLowerCase()}`, onClick: () => goTo(STEPS.findIndex((s) => s.key === stepKey)) }, 'Edit'));
    return {
      title: 'Where should we send your trial?',
      intro: 'We review every request ourselves. Once yours is approved, your trial access arrives at this email.',
      body: [
        h('div', { class: 'field-row' },
          textField('contactName', 'Your name', { autocomplete: 'name' }),
          textField('contactRole', 'Your role', { optional: true, autocomplete: 'organization-title' })),
        h('div', { class: 'field-row' },
          textField('contactEmail', 'Work email', { type: 'email', autocomplete: 'email', inputmode: 'email' }),
          textField('contactPhone', 'Phone', { type: 'tel', optional: true, autocomplete: 'tel', inputmode: 'tel' })),
        h('div', { class: 'hp', 'aria-hidden': 'true' },
          h('label', { for: 'website' }, 'Leave this empty'),
          h('input', { id: 'website', name: 'website', tabindex: '-1', autocomplete: 'off' })),
        h('dl', { class: 'review' },
          reviewRow('Category', data.category === OTHER_CATEGORY.key ? data.categoryOther : category?.label, 'category'),
          reviewRow('Company', [data.companyName, data.city, data.employees && `${data.employees} people`].filter(Boolean).join(', '), 'company'),
          reviewRow('Departments', departmentNames.join(', '), 'departments'),
          reviewRow('To automate', data.intent === INTENTS.DISCOVER && !tasks.length ? 'Show me what’s possible' : [...tasks, data.automateNotes.trim()].filter(Boolean).join(', '), 'automate')),
        h('div', { class: `field${errors.consent ? ' has-error' : ''}` },
          h('label', { class: 'consent' },
            h('input', { type: 'checkbox', id: 'consent', name: 'consent', checked: data.consent, 'aria-describedby': errors.consent ? 'consent-error' : undefined, onChange: (e) => { data.consent = e.target.checked; writeDraft(); } }),
            h('span', {}, 'Karvya AI may use these details to review my request and contact me about the free trial.')),
          errorNode('consent')),
      ],
    };
  },
};

function renderDone() {
  const category = findCategory(data.category);
  const agent = category?.agent || 'agent';
  const dots = Array.from({ length: 25 }, (_, i) => h('i', { class: i % 6 === 0 || i % 4 === 0 ? 'm' : undefined, style: `--i:${i}` }));
  const nodes = [
    h('div', { class: 'done-mark', 'aria-hidden': 'true' }, dots),
    h('h1', { tabindex: '-1' }, `You’re on the list, ${data.contactName.trim().split(/\s+/)[0]}.`),
    h('p', { class: 'ob-intro' }, `We have ${data.companyName.trim()}’s request.`),
    h('ol', { class: 'done-steps' },
      h('li', {}, h('p', {}, 'We read your request and check we can genuinely help.')),
      h('li', {}, h('p', {}, `Once approved, you get an email at `, h('b', {}, data.contactEmail.trim()), ` with access to a free trial. We’d start you with: `, h('b', {}, agent), '.')),
      h('li', {}, h('p', {}, data.intent === INTENTS.DISCOVER
        ? 'Since you’re still exploring, we’ll show you how it’s done for companies like yours.'
        : 'If you like it, we fit the agent to your tools and your team.'))),
    h('p', { class: 'done-ref' }, 'Your reference: ', h('b', { 'data-ob-ref': '' }, result.id.slice(0, 8).toUpperCase())),
    h('div', { class: 'ob-nav' }, h('a', { class: 'btn btn-ink', href: '/' }, 'Back to the site')),
  ];
  form.replaceChildren(...nodes);
  stepList.querySelectorAll('li').forEach((li) => { li.className = 'is-done'; });
  progress.style.width = '100%';
  agentCard.hidden = !category;
  if (category) agentName.textContent = category.agent;
  form.querySelector('h1').focus();
  window.scrollTo(0, 0);
}

function paint({ focusTitle = false, focusError = false, keepFocus = false } = {}) {
  if (result) return renderDone();
  const current = STEPS[step];
  const view = RENDER[current.key]();
  const isLast = step === STEPS.length - 1;
  const focused = keepFocus && document.activeElement;
  const focusedRef = focused ? { name: focused.name, value: focused.value } : null;

  // replaceChildren would print a null as the word "null", so empty slots are filtered out.
  const parts = [
    h('p', { class: 'ob-kicker' }, `Step ${step + 1} of ${STEPS.length}`),
    h('h1', { tabindex: '-1' }, view.title),
    h('p', { class: 'ob-intro' }, view.intro),
    h('div', { class: 'ob-body' }, view.body),
    formError ? h('p', { class: 'banner', role: 'alert' }, formError) : null,
    h('div', { class: 'ob-nav' },
      step > 0
        ? h('button', { type: 'button', class: 'ob-back', onClick: () => goTo(step - 1) }, '← Back')
        : h('a', { class: 'ob-back', href: '/', style: 'text-decoration:none' }, '← Back to site'),
      h('button', { type: 'submit', class: 'btn btn-ink', disabled: submitting },
        submitting ? 'Sending…' : isLast ? 'Request my free trial' : 'Continue')),
  ];
  form.replaceChildren(...parts.filter(Boolean));

  stepList.replaceChildren(...STEPS.map((s, i) =>
    h('li', { class: i === step ? 'is-now' : i < step ? 'is-done' : undefined, 'aria-current': i === step ? 'step' : undefined }, s.nav)));
  progress.style.width = `${((step + 1) / (STEPS.length + 1)) * 100}%`;
  const category = findCategory(data.category);
  agentCard.hidden = !category;
  if (category) agentName.textContent = category.agent;

  if (focusError) {
    const first = form.querySelector('[aria-invalid="true"], .has-error input');
    (first || form.querySelector('.error'))?.focus?.();
    form.querySelector('.error, .banner')?.scrollIntoView({ block: 'center' });
  } else if (focusTitle) {
    form.querySelector('h1').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } else if (focusedRef) {
    [...form.elements].find((el) => el.name === focusedRef.name && el.value === focusedRef.value)?.focus();
  }
}

function goTo(index, { push = true } = {}) {
  step = index;
  errors = {};
  formError = '';
  writeDraft();
  if (push) history.pushState({ step }, '', location.pathname);
  paint({ focusTitle: true });
}

async function submit() {
  submitting = true;
  formError = '';
  paint();
  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload(), website: form.querySelector('#website')?.value || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 201) {
      result = body;
      clearDraft();
      history.replaceState(null, '', location.pathname);
      return;
    }
    if (res.status === 422 && body.fieldErrors) {
      errors = body.fieldErrors;
      const bad = STEPS.findIndex((s) => STEP_FIELDS[s.key].some((f) => errors[f]));
      if (bad >= 0) step = bad;
      return;
    }
    formError = body.error || 'We could not save your request just now. Please try again.';
  } catch {
    formError = 'We could not reach our server. Check your connection and try again. Your answers are still here.';
  } finally {
    submitting = false;
    paint({ focusError: !result });
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (submitting || result) return;
  const current = STEPS[step].key;
  errors = stepErrors(current);
  if (Object.keys(errors).length) return paint({ focusError: true });
  if (step < STEPS.length - 1) return goTo(step + 1);
  submit();
});

window.addEventListener('popstate', (e) => {
  if (result) return;
  goTo(Number.isInteger(e.state?.step) ? e.state.step : 0, { push: false });
});

history.replaceState({ step }, '', location.pathname);
writeDraft();
paint();
