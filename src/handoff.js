// Hero illustration: one person stops, a colleague picks up, the agent remembers.
const SCENES = [
  {
    title: 'Proposals agent, a consulting firm',
    messages: [
      ['human', 'Ananya, Tue 6:40 PM', 'Draft the Sharma Textiles proposal. Use the pricing from their last engagement.'],
      ['agent', 'Agent', 'Done up to section 3, with pricing from the March engagement. The scope is still open.'],
      ['switch', 'Ananya logs off. Rahul takes over.'],
      ['human', 'Rahul, Wed 9:05 AM', 'Where are we on Sharma Textiles?'],
      ['agent', 'Agent', 'Ananya got to section 3. It needs a call on the site visit, then I can finish it. Shall I?'],
    ],
  },
  {
    title: 'Finance agent, a CA firm',
    messages: [
      ['human', 'Meera, Thu 7:15 PM', 'Reconcile the Kapoor Traders ledger against their August bank statement.'],
      ['agent', 'Agent', 'Finished. Three entries don’t match, and one looks like a duplicate payment.'],
      ['switch', 'Meera goes on leave. Arjun takes over.'],
      ['human', 'Arjun, Mon 10:00 AM', 'Anything open for Kapoor Traders?'],
      ['agent', 'Agent', 'Three entries from Meera’s August check. I’ve drafted the query to the client for you to send.'],
    ],
  },
  {
    title: 'Contracts agent, a legal team',
    messages: [
      ['human', 'Sana, Fri 5:30 PM', 'Compare the vendor’s contract with our standard terms and mark what changed.'],
      ['agent', 'Agent', 'Marked. They changed the liability cap and the payment window, and added an exit clause.'],
      ['switch', 'Sana is out. Dev takes over.'],
      ['human', 'Dev, Mon 11:20 AM', 'Can you send me a summary of that vendor contract?'],
      ['agent', 'Agent', 'Here are the three changes Sana asked about, and how we settled similar ones in the past.'],
    ],
  },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function initHandoff(root) {
  const stage = root.querySelector('[data-handoff-stage]');
  const title = root.querySelector('[data-handoff-title]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scenes = SCENES.map((scene) => {
    const el = document.createElement('div');
    el.className = 'scene';
    el.setAttribute('aria-hidden', 'true');
    for (const [kind, a, b] of scene.messages) {
      const msg = document.createElement('p');
      msg.className = `msg msg-${kind}`;
      if (kind === 'switch') msg.textContent = a;
      else {
        const who = document.createElement('small');
        who.textContent = a;
        msg.append(who, b);
      }
      el.append(msg);
    }
    stage.append(el); // All scenes share one grid cell, so the card never changes height.
    return el;
  });

  const show = (i) => {
    scenes.forEach((s, n) => {
      s.classList.toggle('is-on', n === i);
      s.querySelectorAll('.msg').forEach((m) => m.classList.remove('is-in'));
    });
    title.textContent = SCENES[i].title;
  };

  if (reduced) {
    show(0);
    scenes[0].querySelectorAll('.msg').forEach((m) => m.classList.add('is-in'));
    return;
  }

  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(root);
  const playable = async () => { while (!visible || document.hidden) await wait(300); };

  (async () => {
    for (let i = 0; ; i = (i + 1) % scenes.length) {
      show(i);
      for (const msg of scenes[i].querySelectorAll('.msg')) {
        await playable();
        msg.classList.add('is-in');
        await wait(msg.classList.contains('msg-switch') ? 1200 : 1600);
      }
      await wait(3200);
    }
  })();
}
