import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import './styles/base.css';
import './styles/landing.css';
import { CATEGORIES, OTHER_CATEGORY, DEPARTMENTS } from '../shared/catalog.js';
import { initHandoff } from './handoff.js';
import { initDemo } from './demo.js';
import { initCalculator } from './calculator.js';

// Nav: colour shift once past the hero, and the mobile menu.
const nav = document.querySelector('[data-nav]');
const hero = document.querySelector('.hero');
new IntersectionObserver(([e]) => nav.classList.toggle('is-stuck', !e.isIntersecting), { rootMargin: '-68px 0px 0px' }).observe(hero);

const toggle = document.querySelector('[data-nav-toggle]');
const links = document.getElementById('nav-links');
const setMenu = (open) => {
  links.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Close' : 'Menu';
};
toggle.addEventListener('click', () => setMenu(!links.classList.contains('is-open')));
links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

// Section headings fade in. The class is added here, so without JS nothing stays hidden.
document.documentElement.classList.add('reveal-ready');
const revealer = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); revealer.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.section-head').forEach((el) => revealer.observe(el));

// Category index: each row opens onboarding with the category already chosen.
const cats = document.querySelector('[data-cats]');
for (const c of [...CATEGORIES, OTHER_CATEGORY]) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = `/start?category=${c.key}`;
  const name = document.createElement('b');
  name.textContent = c.label;
  const agent = document.createElement('small');
  agent.textContent = c.agent;
  const go = document.createElement('span');
  go.className = 'go';
  go.setAttribute('aria-hidden', 'true');
  go.textContent = '→';
  a.append(name, agent, go);
  li.append(a);
  cats.append(li);
}

// Department explorer.
const tabs = document.querySelector('[data-dept-tabs]');
const panel = document.querySelector('[data-dept-panel]');
const before = document.querySelector('[data-dept-before]');
const after = document.querySelector('[data-dept-after]');
const taskList = document.querySelector('[data-dept-tasks]');
const buttons = DEPARTMENTS.map((d, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.role = 'tab';
  b.id = `dept-${d.key}`;
  b.textContent = d.label;
  b.addEventListener('click', () => selectDept(i));
  tabs.append(b);
  return b;
});
function selectDept(index, focus = false) {
  const d = DEPARTMENTS[index];
  buttons.forEach((b, i) => {
    b.setAttribute('aria-selected', String(i === index));
    b.tabIndex = i === index ? 0 : -1;
  });
  panel.setAttribute('aria-labelledby', buttons[index].id);
  before.textContent = d.before;
  after.textContent = d.after;
  taskList.replaceChildren(...d.tasks.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
  if (focus) buttons[index].focus();
}
tabs.addEventListener('keydown', (e) => {
  const current = buttons.indexOf(document.activeElement);
  if (current < 0) return;
  const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: buttons.length - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  selectDept((next + buttons.length) % buttons.length, true);
});
selectDept(0);

initHandoff(document.querySelector('[data-handoff]'));
initDemo(document.querySelector('[data-demo]'));
initCalculator(document.querySelector('[data-calc]'));
