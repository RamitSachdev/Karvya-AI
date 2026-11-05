import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import './styles/base.css';
import './styles/app.css';
import { renderMarkdown } from './markdown.js';

const $ = (name) => document.querySelector(`[data-${name}]`);
const el = {
  shell: $('shell'), side: $('side'), menu: $('menu'), log: $('log'), banner: $('banner'), composer: $('composer'),
  input: $('input'), send: $('send'), newSession: $('new'), sessions: $('sessions'), sessionsEmpty: $('sessions-empty'),
  memories: $('memories'), memoriesEmpty: $('memories-empty'), meter: $('meter'), trial: $('trial'),
  nameScreen: $('name-screen'), nameForm: $('name-form'), stopScreen: $('stop-screen'),
};

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* still works for this visit */ } },
};

// The key travels in the # part of the link. Once read, it's moved out of the address bar.
const hashKey = new URLSearchParams(location.hash.slice(1)).get('key');
if (hashKey) {
  // A different company's link on this browser means whoever was remembered no longer applies.
  if (hashKey !== store.get('karvya.agent.key')) store.set('karvya.agent.author', '');
  store.set('karvya.agent.key', hashKey);
  history.replaceState(null, '', location.pathname);
}
const token = hashKey || store.get('karvya.agent.key');
let author = store.get('karvya.agent.author') || '';
let info = null;
let sessionId = null;
let controller = null;

const authHeaders = () => ({ Authorization: `Bearer ${token}` });

function stop(title, text) {
  $('stop-title').textContent = title;
  $('stop-text').textContent = text;
  el.shell.hidden = true;
  el.nameScreen.hidden = true;
  el.stopScreen.hidden = false;
}

function showBanner(message) {
  el.banner.textContent = message;
  el.banner.hidden = !message;
}

function setBusy(busy) {
  el.send.textContent = busy ? 'Stop' : 'Send';
  el.send.type = busy ? 'button' : 'submit';
}

const autosize = () => {
  el.input.style.height = 'auto';
  el.input.style.height = `${el.input.scrollHeight + 3}px`;
};
const atBottom = () => el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 80;
const toBottom = () => { el.log.scrollTop = el.log.scrollHeight; };

function addUserTurn(name, text) {
  const turn = document.createElement('div');
  turn.className = 'turn turn-user';
  const who = document.createElement('small');
  who.textContent = name;
  turn.append(who, text);
  el.log.append(turn);
}

function addAgentTurn(text = '') {
  const turn = document.createElement('div');
  turn.className = 'turn turn-agent';
  const who = document.createElement('small');
  who.textContent = info.agent.name;
  const body = document.createElement('div');
  body.className = 'md';
  turn.append(who, body);
  if (text) renderMarkdown(text, body);
  el.log.append(turn);
  return { turn, body };
}

function renderIntro() {
  const wrap = document.createElement('div');
  wrap.className = 'chat-intro';
  const h = document.createElement('h1');
  h.textContent = `Hi ${author.split(/\s+/)[0]}. What are we working on?`;
  const p = document.createElement('p');
  p.textContent = `I’m the ${info.agent.name} for ${info.company}. Anything we work on here stays available to your whole team.`;
  const starters = document.createElement('div');
  starters.className = 'starters';
  for (const s of info.agent.starters) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s;
    b.addEventListener('click', () => { el.input.value = s; autosize(); el.input.focus(); });
    starters.append(b);
  }
  wrap.append(h, p, starters);
  el.log.replaceChildren(wrap);
}

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function renderSide() {
  $('company').textContent = info.company;
  $('agent-name').textContent = info.agent.name;
  $('who').textContent = author;

  el.sessions.replaceChildren(...info.sessions.map((s) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-current', String(s.id === sessionId));
    const meta = document.createElement('small');
    meta.textContent = `${s.startedBy}, ${shortDate(s.updatedAt)}`;
    b.append(s.title, meta);
    b.addEventListener('click', () => openSession(s.id));
    li.append(b);
    return li;
  }));
  el.sessionsEmpty.hidden = info.sessions.length > 0;

  el.memories.replaceChildren(...info.memories.map((m) => {
    const li = document.createElement('li');
    li.className = 'app-mem';
    const meta = document.createElement('small');
    meta.textContent = `${m.updatedBy}, ${shortDate(m.updatedAt)}`;
    li.append(m.title, meta);
    return li;
  }));
  el.memoriesEmpty.hidden = info.memories.length > 0;

  renderTrial();
}

function renderTrial() {
  el.meter.style.width = `${info.trial.percentUsed}%`;
  const days = Math.max(0, Math.ceil((new Date(info.trial.expiresAt) - Date.now()) / 86_400_000));
  el.trial.textContent = info.trial.percentUsed >= 100
    ? 'Your free trial’s allowance is used up. Talk to the Karvya team to keep going.'
    : `Free trial: ${info.trial.percentUsed}% of your allowance used, ${days} ${days === 1 ? 'day' : 'days'} left.`;
}

async function loadWorkspace() {
  let res;
  try {
    res = await fetch('/api/agent/workspace', { headers: authHeaders() });
  } catch {
    if (!info) stop('We couldn’t reach your agent', 'Check your connection and reload this page.');
    return;
  }
  if (res.status === 401) return stop('This link isn’t valid', 'Please use the access link from your email, or ask the Karvya team for a new one.');
  if (res.status === 403) return stop('Your free trial has ended', 'Thanks for trying your agent. Talk to the Karvya team to keep working with it. What your team saved is safe.');
  if (!res.ok) {
    if (!info) stop('We couldn’t reach your agent', 'Something went wrong on our side. Please reload this page in a minute.');
    return;
  }
  info = await res.json();
  renderSide();
}

function closeMenu() {
  el.side.classList.remove('is-open');
  el.menu.setAttribute('aria-expanded', 'false');
  el.menu.textContent = 'Menu';
}

function newSession() {
  controller?.abort();
  sessionId = null;
  showBanner('');
  renderIntro();
  renderSide();
  closeMenu();
  el.input.focus();
}

async function openSession(id) {
  controller?.abort();
  showBanner('');
  closeMenu();
  try {
    const res = await fetch(`/api/agent/session?id=${encodeURIComponent(id)}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const session = await res.json();
    sessionId = session.id;
    el.log.replaceChildren();
    for (const m of session.messages) {
      if (m.role === 'user') addUserTurn(m.author, m.text);
      else addAgentTurn(m.text);
    }
    renderSide();
    toBottom();
  } catch {
    showBanner('We couldn’t open that session. Please try again.');
  }
}

async function send(text) {
  showBanner('');
  el.log.querySelector('.chat-intro')?.remove();
  addUserTurn(author, text);
  const { turn, body } = addAgentTurn();
  const status = document.createElement('p');
  status.className = 'status';
  const dot = document.createElement('i');
  const label = document.createElement('span');
  label.textContent = 'Thinking';
  status.append(dot, label);
  turn.append(status);
  toBottom();

  controller = new AbortController();
  const mine = controller;
  setBusy(true);

  let reply = '';
  let finished = false;
  const fail = (message, keepInput) => {
    showBanner(message);
    if (keepInput && !el.input.value) { el.input.value = text; autosize(); }
    if (!reply) turn.remove();
  };

  const handle = (event) => {
    if (event.type === 'text') {
      const stick = atBottom();
      reply += event.delta;
      renderMarkdown(reply, body);
      status.hidden = true;
      if (stick) toBottom();
    } else if (event.type === 'tool') {
      label.textContent = event.label;
      status.hidden = false;
    } else if (event.type === 'retry') {
      reply = '';
      body.replaceChildren();
    } else if (event.type === 'done') {
      finished = true;
      sessionId = event.sessionId;
      if (event.cutOff) showBanner('That answer hit the length limit and was cut off. Ask the agent to continue.');
      if (event.sessionFull) showBanner('This session has grown long. Start a new one to keep costs down, and the agent can still look up this work.');
    } else if (event.type === 'error') {
      finished = true;
      fail(event.message, event.keepInput);
    }
  };

  try {
    const res = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, author, sessionId }),
      signal: mine.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      finished = true;
      fail(data.error || 'Something went wrong. Please try again.', true);
    } else {
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (chunk.startsWith('data: ')) handle(JSON.parse(chunk.slice(6)));
        }
      }
      if (!finished) fail('The connection dropped before the agent finished. Please try again.', true);
    }
  } catch (err) {
    if (mine.signal.aborted) {
      if (!reply) turn.remove();
    } else {
      fail('We couldn’t reach your agent. Check your connection and try again.', true);
    }
  } finally {
    status.remove();
    if (controller === mine) { controller = null; setBusy(false); }
    await loadWorkspace();
  }
}

el.composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = el.input.value.trim();
  if (!text || controller) return;
  el.input.value = '';
  autosize();
  send(text);
});
el.send.addEventListener('click', () => { if (el.send.type === 'button') controller?.abort(); });
el.input.addEventListener('input', autosize);
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    el.composer.requestSubmit();
  }
});
el.newSession.addEventListener('click', newSession);
$('switch').addEventListener('click', () => {
  controller?.abort();
  closeMenu();
  const box = document.getElementById('author');
  box.value = '';
  el.shell.hidden = true;
  el.nameScreen.hidden = false;
  box.focus();
});
el.menu.addEventListener('click', () => {
  const open = el.side.classList.toggle('is-open');
  el.menu.setAttribute('aria-expanded', String(open));
  el.menu.textContent = open ? 'Close' : 'Menu';
});

el.nameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = document.getElementById('author').value.trim();
  if (!value) return;
  author = value;
  store.set('karvya.agent.author', author);
  sessionId = null;
  showBanner('');
  el.nameScreen.hidden = true;
  el.shell.hidden = false;
  renderIntro();
  renderSide();
  el.input.focus();
});

async function boot() {
  if (!token) return stop('This link isn’t valid', 'Please use the access link from your email, or ask the Karvya team for a new one.');
  await loadWorkspace();
  if (!info) return undefined;
  document.title = `${info.agent.name} | Karvya AI`;
  if (!author) {
    el.nameScreen.hidden = false;
    document.getElementById('author').focus();
    return undefined;
  }
  el.shell.hidden = false;
  renderIntro();
  el.input.focus();
  return undefined;
}
boot();
