// "A very busy Monday": every frame is computed from the timeline position, so
// playing, scrubbing, jumping to a chapter and reduced motion all draw the same way.
const DURATION = 36;
const CHAPTERS = [
  { t: 0, end: 5.6, label: 'The company' },
  { t: 6, end: 14.8, label: 'The pile-up' },
  { t: 15, end: 21.8, label: 'The agents land' },
  { t: 22, end: DURATION, label: 'The growth' },
];
const CAPTIONS = [
  [0, 'Meet a company of 1,000 people. Smart, hardworking and very busy.'],
  [6, 'Monday, 9:00 AM. The work that repeats every single week starts to arrive.'],
  [8.6, 'Priya reformats the same spreadsheet for the fourteenth time this year.'],
  [11, 'Rohan explains the client’s history to the new analyst. Again.'],
  [13, 'Someone asks who has the latest version. Nobody knows.'],
  [15, 'Karvya deploys agents into each department. One for finance, one for sales, and so on.'],
  [18.5, 'The repeat work goes to them. The people stay, and get their time back.'],
  [22, 'Priya finishes her actual job before lunch.'],
  [25, 'The new analyst asks the agent and gets going on day one.'],
  [28, 'Same 1,000 people. Those hours now go into clients and new business.'],
  [32, 'And Priya left at 6:00 PM. Nobody knows how to react.'],
];
const AGENTS = ['Finance', 'Sales', 'Legal', 'Ops', 'Research'];
const COLORS = { idle: [116, 165, 145], swamped: [240, 88, 52], happy: [70, 214, 160], marigold: [255, 180, 0] };
const NEVER = 1e9; // Not Infinity: progress() would divide Infinity by Infinity and colour the dot NaN.
const PEOPLE = 1000;
const PEAK_QUEUE = 8400;
const HOURS_BACK = 2400; // 1,000 people × 8 repeat hours × 30% taken over.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const progress = (t, start, end) => clamp((t - start) / (end - start));
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const easeOut = (x) => 1 - (1 - x) ** 3;
const bounce = (x) => {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
};
// Seeded, so a replay always looks the same.
const seeded = (s) => () => ((s = Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5), ((s ^ (s >>> 14)) >>> 0) / 4294967296);
const mix = (a, b, x) => a.map((v, i) => Math.round(v + (b[i] - v) * x));
const fmt = (n) => Math.round(n).toLocaleString('en-IN');

export function initDemo(root) {
  const canvas = root.querySelector('[data-demo-canvas]');
  const ctx = canvas.getContext('2d');
  const caption = root.querySelector('[data-demo-caption]');
  const toggle = root.querySelector('[data-demo-toggle]');
  const scrub = root.querySelector('[data-demo-scrub]');
  const chapterBox = root.querySelector('[data-demo-chapters]');
  const stat = (k) => root.querySelector(`[data-stat="${k}"]`);
  const stats = { people: stat('people'), queue: stat('queue'), hours: stat('hours'), fte: stat('fte') };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let time = reduced ? DURATION : 0;
  let playing = false;
  let visible = false;
  let started = reduced;
  let last = 0;
  let L = null; // Layout, recomputed on resize.

  const chapterButtons = CHAPTERS.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.label;
    b.addEventListener('click', () => {
      started = true;
      // Reduced motion gets the finished state of the chapter, not a mid-way frame.
      time = reduced ? c.end : c.t;
      setPlaying(!reduced);
      render();
    });
    chapterBox.append(b);
    return b;
  });

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const narrow = w < 520;
    const cols = narrow ? 40 : 50;
    const rows = PEOPLE / cols;
    const skyShare = narrow ? 0.34 : 0.36;
    const groundH = 34;
    const availH = h * (1 - skyShare) - groundH;
    const s = Math.min((w - 48) / cols, availH / rows);
    const bw = cols * s;
    const bh = rows * s;
    const bx = (w - bw) / 2;
    const groundY = h - groundH;
    const by = groundY - bh;

    const rand = seeded(41);
    const dots = [];
    const agentX = AGENTS.map((_, i) => bx + bw * ((i + 0.5) / AGENTS.length));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = bx + (c + 0.5) * s;
        const y = by + (r + 0.5) * s;
        const nearest = Math.min(...agentX.map((ax) => Math.hypot(ax - x, by - y)));
        dots.push({
          x, y,
          born: 0.3 + ((rows - r) / rows) * 3.8 + rand() * 0.8,
          swamp: rand() < 0.82 ? 6.4 + rand() * 7.8 : NEVER,
          fixed: 16.2 + (nearest / Math.max(bw, bh)) * 10 + rand() * 0.5,
          seed: rand() * 6.28,
        });
      }
    }

    const sheets = [];
    const pileW = Math.min(bw * 0.86, w - 40);
    const sheetCols = narrow ? 11 : 22;
    const count = narrow ? 88 : 154;
    for (let i = 0; i < count; i++) {
      const col = i % sheetCols;
      const layer = Math.floor(i / sheetCols);
      sheets.push({
        x: (w - pileW) / 2 + ((col + 0.5) / sheetCols) * pileW + (rand() - 0.5) * 9,
        y: by - 9 - layer * 11 - (rand() * 3),
        spin: (rand() - 0.5) * 0.7,
        drop: 6.6 + (i / count) * 8 + rand() * 0.3,
        leave: 16.4 + rand() * 4.6,
        target: Math.floor(rand() * AGENTS.length),
        startX: rand() * w,
      });
    }

    L = { w, h, s, bx, by, bw, bh, groundY, dots, agentX, sheets, narrow };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawChart(t) {
    const p = easeInOut(progress(t, 22, 33));
    if (p <= 0) return;
    const { w, by } = L;
    const baseY = by - 4;
    const topY = 26;
    const curve = (x) => baseY - (baseY - topY) * (0.06 + 0.94 * x ** 2.1);
    const end = 18 + (w - 36) * p;
    ctx.beginPath();
    ctx.moveTo(18, baseY);
    for (let x = 18; x <= end; x += 6) ctx.lineTo(x, curve((x - 18) / (w - 36)));
    ctx.lineTo(end, curve((end - 18) / (w - 36)));
    ctx.lineTo(end, baseY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 180, 0, 0.13)';
    ctx.fill();
    ctx.beginPath();
    for (let x = 18; x <= end; x += 6) ctx.lineTo(x, curve((x - 18) / (w - 36)));
    ctx.lineTo(end, curve((end - 18) / (w - 36)));
    ctx.strokeStyle = '#ffb400';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    const ey = curve((end - 18) / (w - 36));
    ctx.beginPath();
    ctx.arc(end, ey, 6, 0, 7);
    ctx.fillStyle = '#ffb400';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = "600 14px 'Figtree Variable', sans-serif";
    ctx.textAlign = end > w * 0.6 ? 'right' : 'left';
    ctx.fillText('Company growth', end > w * 0.6 ? end - 14 : end + 14, ey + 5);
  }

  function drawBuilding(t) {
    const { bx, by, bw, bh, groundY, w, s } = L;
    const a = progress(t, 0, 0.5);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    roundRect(bx - s * 0.6, by - s * 0.4, bw + s * 1.2, bh + s * 0.4, [6, 6, 0, 0]);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(0, groundY, w, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = "600 13px 'Figtree Variable', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('YOUR COMPANY PVT LTD', w / 2, groundY + 22);
    ctx.globalAlpha = 1;
  }

  function drawDots(t) {
    const r = Math.max(1.3, L.s * 0.34);
    for (const d of L.dots) {
      if (t < d.born) continue;
      const pop = easeOut(progress(t, d.born, d.born + 0.35));
      const swampMix = progress(t, d.swamp, d.swamp + 0.5);
      const fixMix = progress(t, d.fixed, d.fixed + 0.6);
      let color = mix(mix(COLORS.idle, COLORS.swamped, swampMix), COLORS.happy, fixMix);
      if (fixMix >= 1 && t > 24) {
        const glint = Math.sin(t * 1.5 + d.seed * 9);
        if (glint > 0.965) color = COLORS.marigold;
      }
      // Swamped people jitter. Everyone else sits still.
      const jitter = swampMix * (1 - fixMix) * 0.9;
      const jx = jitter ? Math.sin(t * 14 + d.seed) * jitter : 0;
      const jy = jitter ? Math.cos(t * 11 + d.seed * 2) * jitter : 0;
      ctx.fillStyle = `rgb(${color})`;
      ctx.beginPath();
      ctx.arc(d.x + jx, d.y + jy, r * pop, 0, 6.3);
      ctx.fill();
    }
  }

  function drawSheets(t) {
    const { by, agentX } = L;
    for (const p of L.sheets) {
      if (t < p.drop || t > p.leave + 0.8) continue;
      const fall = bounce(progress(t, p.drop, p.drop + 0.7));
      let x = p.startX + (p.x - p.startX) * fall;
      let y = -20 + (p.y + 20) * fall;
      let scale = 1;
      let spin = p.spin + (1 - fall) * 3;
      const out = easeInOut(progress(t, p.leave, p.leave + 0.8));
      if (out > 0) {
        x += (agentX[p.target] - x) * out;
        y += (by - 18 - y) * out;
        scale = 1 - out;
        spin += out * 5;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#f7f6ef';
      ctx.fillRect(-7, -9, 14, 18);
      ctx.fillStyle = '#9aa69f';
      ctx.fillRect(-4.5, -5.5, 9, 1.6);
      ctx.fillRect(-4.5, -1.5, 9, 1.6);
      ctx.fillRect(-4.5, 2.5, 6, 1.6);
      ctx.restore();
    }
  }

  function drawAgents(t) {
    const { by, agentX, narrow } = L;
    const size = narrow ? 30 : 42;
    AGENTS.forEach((name, i) => {
      const start = 15 + i * 0.4;
      if (t < start) return;
      const land = bounce(progress(t, start, start + 1.1));
      const hop = t > 22 ? Math.abs(Math.sin(t * 1.6 + i)) * 5 : 0;
      const cx = agentX[i];
      // Falls from above the canvas and lands with its feet on the roof.
      const restTop = by - L.s * 0.4 - size;
      const top = -size + (restTop + size) * land - hop;
      // The landing ripple.
      const rip = progress(t, start + 0.6, start + 3);
      if (rip > 0 && rip < 1) {
        ctx.beginPath();
        ctx.arc(cx, by, rip * Math.max(L.bw, L.bh) * 0.5, 0, 6.3);
        ctx.strokeStyle = `rgba(255,180,0,${0.55 * (1 - rip)})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.fillStyle = '#ffb400';
      ctx.strokeStyle = '#12211b';
      ctx.lineWidth = 2.5;
      roundRect(cx - size / 2, top, size, size, size * 0.24);
      ctx.fill();
      ctx.stroke();
      // Two eyes, blinking now and then.
      const blink = (t * 0.7 + i * 0.37) % 1 > 0.94;
      ctx.fillStyle = '#12211b';
      const ey = top + size * 0.42;
      const ex = size * 0.19;
      const eh = blink ? 1.2 : size * 0.1;
      ctx.fillRect(cx - ex - size * 0.05, ey - eh / 2, size * 0.1, eh);
      ctx.fillRect(cx + ex - size * 0.05, ey - eh / 2, size * 0.1, eh);
      // A small smile.
      ctx.beginPath();
      ctx.arc(cx, top + size * 0.58, size * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = 2;
      ctx.stroke();
      // Name above the head, once it has landed.
      const labelAlpha = progress(t, start + 0.9, start + 1.3);
      if (labelAlpha > 0) {
        ctx.globalAlpha = labelAlpha;
        // A dark pill keeps the name readable over the white paper.
        ctx.font = `600 ${narrow ? 11 : 13}px 'Figtree Variable', sans-serif`;
        ctx.textAlign = 'center';
        const pillW = ctx.measureText(name).width + 12;
        const pillH = narrow ? 16 : 20;
        const pillY = top - pillH - 4;
        ctx.fillStyle = '#12211b';
        roundRect(cx - pillW / 2, pillY, pillW, pillH, pillH / 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(name, cx, pillY + pillH - (narrow ? 4.5 : 6));
        ctx.globalAlpha = 1;
      }
    });
  }

  function queueAt(t) {
    if (t < 6) return 0;
    if (t < 15) return PEAK_QUEUE * easeInOut(progress(t, 6, 15));
    return PEAK_QUEUE - (PEAK_QUEUE - 300) * easeInOut(progress(t, 16, 24));
  }

  function updateText(t) {
    const hours = HOURS_BACK * easeInOut(progress(t, 16, 28));
    stats.people.textContent = fmt(PEOPLE * easeOut(progress(t, 0.2, 5)));
    stats.queue.textContent = fmt(queueAt(t));
    stats.hours.textContent = fmt(hours);
    stats.fte.textContent = fmt(hours / 40);
    let line = CAPTIONS[0][1];
    for (const [at, text] of CAPTIONS) if (t >= at) line = text;
    if (caption.textContent !== line) caption.textContent = line;
    scrub.value = String((t / DURATION) * 100);
    let current = 0;
    CHAPTERS.forEach((c, i) => { if (t >= c.t) current = i; });
    chapterButtons.forEach((b, i) => b.setAttribute('aria-current', String(i === current)));
  }

  function render() {
    updateText(time);
    if (!L) return;
    ctx.clearRect(0, 0, L.w, L.h);
    drawChart(time);
    drawBuilding(time);
    drawDots(time);
    drawSheets(time);
    drawAgents(time);
  }

  function setPlaying(next) {
    playing = next;
    toggle.textContent = next ? 'Pause' : time >= DURATION ? 'Replay' : 'Play';
    if (next) { last = performance.now(); requestAnimationFrame(frame); }
  }

  function frame(now) {
    if (!playing) return;
    if (!visible || document.hidden) { last = now; requestAnimationFrame(frame); return; }
    time = Math.min(DURATION, time + Math.min(now - last, 100) / 1000);
    last = now;
    render();
    if (time >= DURATION) { setPlaying(false); return; }
    requestAnimationFrame(frame);
  }

  toggle.addEventListener('click', () => {
    started = true;
    if (!playing && time >= DURATION) time = 0;
    setPlaying(!playing);
    render();
  });
  scrub.addEventListener('input', () => {
    started = true;
    time = (Number(scrub.value) / 100) * DURATION;
    setPlaying(false);
    render();
  });

  new ResizeObserver(() => { layout(); render(); }).observe(canvas);
  document.fonts?.ready.then(render);
  // Starts itself the first time it scrolls into view, then leaves the viewer in charge.
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !started) { started = true; setPlaying(true); }
  }, { threshold: 0.4 }).observe(canvas);

  layout();
  setPlaying(false);
  render();
}
