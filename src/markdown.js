// Renders the agent's Markdown with DOM nodes only. Text never goes through
// innerHTML, so anything an agent or a user writes stays plain text.
function inline(text) {
  const frag = document.createDocumentFragment();
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*)/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const token = m[0];
    const tag = token.startsWith('**') ? 'strong' : token.startsWith('`') ? 'code' : 'em';
    const size = tag === 'strong' ? 2 : 1;
    const el = document.createElement(tag);
    el.textContent = token.slice(size, -size);
    frag.append(el);
    last = m.index + token.length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/;
const isOrdered = (line) => /^\s*\d+[.)]\s+/.test(line);
const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line);
const cells = (line) => line.trim().slice(1, -1).split('|').map((c) => c.trim());

export function renderMarkdown(text, target) {
  const lines = text.split('\n');
  const out = document.createDocumentFragment();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.trimStart().startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) code.push(lines[i++]);
      i++;
      const pre = document.createElement('pre');
      const el = document.createElement('code');
      el.textContent = code.join('\n');
      pre.append(el);
      out.append(pre);
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      const el = document.createElement('h3');
      el.append(inline(heading[1]));
      out.append(el);
      i++;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const table = document.createElement('table');
      const headRow = table.createTHead().insertRow();
      for (const c of cells(line)) { const th = document.createElement('th'); th.append(inline(c)); headRow.append(th); }
      const body = table.createTBody();
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        const row = body.insertRow();
        for (const c of cells(lines[i])) row.insertCell().append(inline(c));
        i++;
      }
      const wrap = document.createElement('div');
      wrap.className = 'md-table';
      wrap.append(table);
      out.append(wrap);
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const list = document.createElement(isOrdered(line) ? 'ol' : 'ul');
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        const li = document.createElement('li');
        li.append(inline(lines[i].replace(LIST_ITEM, '')));
        list.append(li);
        i++;
      }
      out.append(list);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !LIST_ITEM.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !lines[i].trimStart().startsWith('```') && !isTableRow(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]); // A lone table-like line with no header rule.
    const p = document.createElement('p');
    para.forEach((l, n) => {
      if (n) p.append(document.createElement('br'));
      p.append(inline(l));
    });
    out.append(p);
  }
  target.replaceChildren(out);
}
