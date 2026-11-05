// Every number is derived from the sliders. Nothing here is a claim about real customers.
import { PRICE_PER_AGENT } from '../shared/catalog.js';

const HOURS_PER_MONTH = 173; // 40 hours × 4.33 weeks.
const WEEKS_PER_MONTH = 4.33;

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
function inrShort(n) {
  const v = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(2)} L`;
  return `${sign}${inr(v)}`;
}

const FIELDS = [
  { key: 'team', label: 'People who would work with the agents', min: 5, max: 300, step: 5, value: 20, show: (v) => `${v}` },
  { key: 'hours', label: 'Repeat work per person, per week', min: 2, max: 25, step: 1, value: 8, show: (v) => `${v} hrs` },
  { key: 'share', label: 'Share of that work agents take over', min: 10, max: 60, step: 5, value: 30, show: (v) => `${v}%` },
  { key: 'salary', label: 'Average monthly cost of an employee', min: 20000, max: 200000, step: 5000, value: 60000, show: (v) => inr(v) },
  { key: 'agents', label: 'Agents you’d deploy', min: 1, max: 10, step: 1, value: 3, show: (v) => `${v}` },
];

export function calculate({ team, hours, share, salary, agents }) {
  const hoursBack = team * hours * WEEKS_PER_MONTH * (share / 100);
  const value = hoursBack * (salary / HOURS_PER_MONTH);
  const cost = agents * PRICE_PER_AGENT;
  return {
    hoursBack,
    value,
    cost,
    net: value - cost,
    fte: hoursBack / HOURS_PER_MONTH,
    pct: ((hours * (share / 100)) / 40) * 100,
    ratio: team / agents,
  };
}

export function initCalculator(root) {
  const form = root.querySelector('.calc-inputs');
  form.addEventListener('submit', (e) => e.preventDefault());
  const values = {};
  const out = (k) => root.querySelector(`[data-calc-out="${k}"]`);
  const bar = (k) => root.querySelector(`[data-calc-bar="${k}"]`);
  const gain = (k) => document.querySelector(`[data-gain="${k}"]`);
  const verdict = root.querySelector('[data-calc-verdict]');
  const net = root.querySelector('[data-calc-net]');

  function update() {
    const r = calculate(values);
    const ahead = r.net >= 0;
    verdict.textContent = ahead ? 'You come out ahead by about' : 'At these numbers, you’d fall short by about';
    net.textContent = `${inrShort(Math.abs(r.net))}`;
    net.style.color = ahead ? 'var(--marigold)' : '#ff9d84';
    out('value').textContent = inrShort(r.value);
    out('cost').textContent = inrShort(r.cost);
    const top = Math.max(r.value, r.cost) || 1;
    bar('value').style.width = `${(r.value / top) * 100}%`;
    bar('cost').style.width = `${(r.cost / top) * 100}%`;

    gain('hours').textContent = Math.round(r.hoursBack).toLocaleString('en-IN');
    gain('fte').textContent = r.fte.toFixed(1);
    gain('pct').textContent = `${r.pct.toFixed(r.pct < 10 ? 1 : 0)}%`;
    gain('team').textContent = values.team;
    gain('year').textContent = inrShort(Math.abs(r.net) * 12);
    gain('year-label').textContent = ahead ? 'left over each year after paying for your agents' : 'a year below break-even, so start with fewer agents';
    gain('ratio').textContent = r.ratio >= 10 ? Math.round(r.ratio) : r.ratio.toFixed(1).replace(/\.0$/, '');
  }

  for (const f of FIELDS) {
    values[f.key] = f.value;
    const wrap = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'slider-head';
    const label = document.createElement('label');
    label.htmlFor = `calc-${f.key}`;
    label.textContent = f.label;
    const output = document.createElement('output');
    output.htmlFor = `calc-${f.key}`;
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider';
    input.id = `calc-${f.key}`;
    input.dataset.calcInput = f.key;
    input.min = f.min;
    input.max = f.max;
    input.step = f.step;
    input.value = f.value;
    const sync = () => {
      values[f.key] = Number(input.value);
      output.textContent = f.show(values[f.key]);
      input.setAttribute('aria-valuetext', f.show(values[f.key]));
      input.style.setProperty('--fill', `${((values[f.key] - f.min) / (f.max - f.min)) * 100}%`);
    };
    input.addEventListener('input', () => { sync(); update(); });
    sync();
    head.append(label, output);
    wrap.append(head, input);
    form.append(wrap);
  }
  update();
}
