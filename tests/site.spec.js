import { expect, test } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';
import { LEADS_FILE } from '../playwright.config.js';

const leads = async () => JSON.parse(await readFile(LEADS_FILE, 'utf8').catch(() => '[]'));

// Any console error, CSP block, uncaught exception or failed asset fails the test.
function watch(page) {
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`exception: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/')) problems.push(`${r.status()}: ${r.url()}`); });
  return problems;
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const next = (page) => page.getByRole('button', { name: 'Continue' }).click();
const pick = (page, name) => page.getByLabel(name, { exact: false }).check({ force: true });

async function fillCompany(page, name = 'Mehta & Co') {
  await page.getByLabel('Company name').fill(name);
  await page.getByLabel('City').fill('Indore');
  await page.getByLabel('What services do you offer?').fill('Audit and tax');
  await page.locator('input[name="employees"][value="11–50"]').check({ force: true });
}
async function fillContact(page, email = 'asha@example.com') {
  await page.getByLabel('Your name').fill('Asha Mehta');
  await page.getByLabel('Your role').fill('Partner');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Phone').fill('+91 98765 43210');
  await page.locator('#consent').check();
}

test.beforeEach(async () => { await rm(LEADS_FILE, { force: true }); });

test.describe('landing page', () => {
  test('loads clean under the production security policy and explains itself', async ({ page }) => {
    const problems = watch(page);
    const res = await page.goto('/');
    expect(res.headers()['content-security-policy']).toContain("script-src 'self'");
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('An AI colleague that never needs briefing twice.');
    await expect(page.locator('.hero-facts')).toContainText('₹15,000');
    await page.waitForTimeout(600);
    expect(problems).toEqual([]);
    expect(await noSideScroll(page)).toBe(true);
  });

  test('fonts really load, and the rupee sign uses them', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const ok = await page.evaluate(() => ({
      display: document.fonts.check('700 40px "Bricolage Grotesque Variable"', '₹15,000'),
      body: document.fonts.check('400 16px "Figtree Variable"', '₹15,000'),
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    }));
    expect(ok.display).toBe(true);
    expect(ok.body).toBe(true);
    expect(ok.loaded.join()).toContain('Bricolage');
    expect(ok.loaded.join()).toContain('Figtree');
  });

  test('all nav anchors point at real sections', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page.locator('#nav-links a').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
    expect(hrefs.length).toBe(5);
    for (const h of hrefs) await expect(page.locator(h)).toHaveCount(1);
  });

  test('founders and Ashoka are shown', async ({ page }) => {
    await page.goto('/');
    for (const name of ['Ramit Sachdev', 'Shubhay Agarwal', 'Mohammad Rahman']) await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.locator('#team')).toContainText('Ashoka University');
  });

  test('story: chapters drive the counters and the ending adds up', async ({ page }) => {
    const problems = watch(page);
    await page.goto('/');
    const demo = page.locator('[data-demo]');
    await demo.scrollIntoViewIfNeeded();
    await demo.getByRole('button', { name: 'The agents land' }).click();
    await expect(demo.getByRole('button', { name: 'The agents land' })).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-demo-caption]')).toContainText('Karvya deploys agents');

    await page.locator('[data-demo-scrub]').fill('50');
    await expect(demo.locator('[data-demo-toggle]')).toHaveText('Play');
    await expect(page.locator('[data-stat="people"]')).toHaveText('1,000');

    await page.locator('[data-demo-scrub]').fill('100');
    await expect(page.locator('[data-stat="hours"]')).toHaveText('2,400');
    await expect(page.locator('[data-stat="fte"]')).toHaveText('60');
    await expect(page.locator('[data-stat="queue"]')).toHaveText('300');
    await expect(page.locator('[data-demo-caption]')).toContainText('Priya left at 6:00 PM');
    // Canvas really drew something.
    const painted = await page.locator('[data-demo-canvas]').evaluate((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
      return n;
    });
    expect(painted).toBeGreaterThan(1000);
    expect(problems).toEqual([]);
  });

  test('story: plays by itself when scrolled to, and can be paused and replayed', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('[data-demo-toggle]');
    await expect(toggle).toHaveText('Play');
    await page.locator('[data-demo-canvas]').scrollIntoViewIfNeeded();
    await expect(toggle).toHaveText('Pause');
    const a = Number(await page.locator('[data-demo-scrub]').inputValue());
    await page.waitForTimeout(700);
    const b = Number(await page.locator('[data-demo-scrub]').inputValue());
    expect(b).toBeGreaterThan(a);
    await toggle.click();
    await expect(toggle).toHaveText('Play');
    await page.locator('[data-demo-scrub]').fill('100');
    await expect(toggle).toHaveText('Replay');
    await toggle.click();
    await expect(toggle).toHaveText('Pause');
    expect(Number(await page.locator('[data-demo-scrub]').inputValue())).toBeLessThan(5);
  });

  test('calculator: defaults are correct, and it admits when it does not pay off', async ({ page }) => {
    await page.goto('/');
    // 20 × 8 × 4.33 × 30% = 207.84 hours. × (60000/173) = ₹72,084. − 3 × 15000 = ₹27,084.
    await expect(page.locator('[data-calc-out="value"]')).toHaveText('₹72,083');
    await expect(page.locator('[data-calc-out="cost"]')).toHaveText('₹45,000');
    await expect(page.locator('[data-calc-net]')).toHaveText('₹27,083');
    await expect(page.locator('[data-gain="hours"]')).toHaveText('208');
    await expect(page.locator('[data-gain="fte"]')).toHaveText('1.2');
    await expect(page.locator('[data-gain="pct"]')).toHaveText('6.0%');
    await expect(page.locator('[data-gain="ratio"]')).toHaveText('6.7');

    await page.locator('[data-calc-input="agents"]').fill('10');
    await expect(page.locator('[data-calc-verdict]')).toContainText('fall short');
    await expect(page.locator('[data-gain="year-label"]')).toContainText('below break-even');

    await page.locator('[data-calc-input="team"]').fill('300');
    await page.locator('[data-calc-input="agents"]').fill('3');
    await expect(page.locator('[data-calc-verdict]')).toContainText('come out ahead');
    await expect(page.locator('[data-calc-net]')).toContainText(' L');
  });

  test('department explorer switches content, including by keyboard', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('[data-dept-after]');
    await page.getByRole('tab', { name: 'Legal & compliance' }).click();
    await expect(panel).toContainText('marks those three clauses');
    await page.getByRole('tab', { name: 'Legal & compliance' }).press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'HR & recruitment' })).toBeFocused();
    await expect(panel).toContainText('shortlists');
  });

  test('every category row opens onboarding with that category chosen', async ({ page }) => {
    await page.goto('/');
    const rows = page.locator('[data-cats] a');
    await expect(rows).toHaveCount(13);
    await rows.filter({ hasText: 'IT & software services' }).click();
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tell us about your company.');
    await page.getByRole('button', { name: '← Back' }).click();
    await expect(page.locator('input[name="category"][value="it"]')).toBeChecked();
  });

  test('calculator and story text never show broken values', async ({ page }) => {
    await page.goto('/');
    for (const selector of ['[data-calc]', '.gains', '.stage-stats']) await expect(page.locator(selector)).not.toContainText(/NaN|undefined|Infinity/);
  });

  test('every call to action reaches onboarding', async ({ page }) => {
    await page.goto('/');
    const ctas = await page.locator('a[href="/start"]').count();
    expect(ctas).toBeGreaterThanOrEqual(4);
    await page.locator('.closer a[href="/start"]').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What kind of company are you?');
  });
});

test.describe('onboarding', () => {
  test('full journey, "I know what I want": what is typed is what gets stored', async ({ page }) => {
    const problems = watch(page);
    const noStrayText = () => expect(page.locator('.ob-form')).not.toContainText(/\b(null|undefined|NaN)\b|\[object/);
    await page.goto('/start');
    await noStrayText();
    await pick(page, 'Financial consulting & CA firms');
    await next(page);
    await noStrayText();
    await fillCompany(page);
    await next(page);
    await noStrayText();
    await page.locator('input[name="departments"][value="finance"]').check({ force: true });
    await page.locator('input[name="departments"][value="sales"]').check({ force: true });
    await next(page);
    await noStrayText();
    await page.locator('input[name="intent"][value="known"]').check({ force: true });
    await page.locator('input[name="tasks"][value="Reconciliations"]').check({ force: true });
    await page.locator('input[name="tasks"][value="Proposal drafting"]').check({ force: true });
    await page.getByLabel('Anything else?').fill('Month-end reports');
    await page.getByLabel('What tools does your team use today?').fill('Tally, Excel');
    await next(page);
    await fillContact(page);
    await noStrayText();
    await expect(page.locator('.review')).toContainText('Mehta & Co, Indore, 11–50 people');
    await expect(page.locator('.review')).toContainText('Reconciliations, Proposal drafting, Month-end reports');
    await page.getByRole('button', { name: 'Request my free trial' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You’re on the list, Asha.');
    await expect(page.locator('.done-steps')).toContainText('asha@example.com');
    await expect(page.locator('.done-steps')).toContainText('Reporting & reconciliation agent');

    const rows = await leads();
    expect(rows).toHaveLength(1);
    const ref = await page.locator('[data-ob-ref]').innerText();
    await noStrayText();
    expect(rows[0].id.slice(0, 8).toUpperCase()).toBe(ref);
    expect(rows[0]).toMatchObject({
      status: 'pending', category: 'financial', agent_key: 'finance-ops', company_name: 'Mehta & Co', city: 'Indore',
      services: 'Audit and tax', employees: '11–50', departments: ['finance', 'sales'], intent: 'known',
      tasks: ['Reconciliations', 'Proposal drafting'], automate_notes: 'Month-end reports', tools: 'Tally, Excel',
      contact_name: 'Asha Mehta', contact_email: 'asha@example.com', contact_role: 'Partner', contact_phone: '+91 98765 43210',
    });
    expect(problems).toEqual([]);
    expect(await noSideScroll(page)).toBe(true);
  });

  test('full journey, "not sure yet": shows examples for their departments, then submits', async ({ page }) => {
    await page.goto('/start?category=legal');
    await fillCompany(page, 'Rao Legal');
    await next(page);
    await page.locator('input[name="departments"][value="legal"]').check({ force: true });
    await next(page);
    await page.locator('input[name="intent"][value="discover"]').check({ force: true });
    await expect(page.locator('.show-card')).toHaveCount(1);
    await expect(page.locator('.show-card')).toContainText('marks those three clauses');
    await next(page);
    await fillContact(page, 'rao@example.com');
    await expect(page.locator('.review')).toContainText('Show me what’s possible');
    await page.getByRole('button', { name: 'Request my free trial' }).click();
    await expect(page.locator('.done-steps')).toContainText('still exploring');
    const rows = await leads();
    expect(rows[0]).toMatchObject({ intent: 'discover', category: 'legal', agent_key: 'legal-drafting', tasks: [] });
  });

  test('"Something else" category asks what they do, and stores it', async ({ page }) => {
    await page.goto('/start');
    await page.locator('input[name="category"][value="other"]').check({ force: true });
    await next(page);
    await expect(page.locator('#categoryOther-error')).toBeVisible();
    await page.getByLabel('What does your company do?').fill('Hospitality group');
    await next(page);
    await fillCompany(page);
    await next(page);
    await page.getByLabel('Anything we missed?').fill('Front office');
    await next(page);
    await page.locator('input[name="intent"][value="known"]').check({ force: true });
    await page.getByLabel('Describe what you want to automate').fill('Guest emails');
    await next(page);
    await fillContact(page);
    await page.getByRole('button', { name: 'Request my free trial' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('You’re on the list');
    expect((await leads())[0]).toMatchObject({ category: 'other', category_other: 'Hospitality group', departments_other: 'Front office', agent_key: 'custom', automate_notes: 'Guest emails' });
  });

  test('every step blocks on missing answers and says why', async ({ page }) => {
    await page.goto('/start');
    await next(page);
    await expect(page.locator('#category-error')).toBeVisible();
    await pick(page, 'IT & software services');
    await next(page);

    await next(page);
    for (const f of ['companyName', 'city', 'services', 'employees']) await expect(page.locator(`#${f}-error`)).toBeVisible();
    await expect(page.locator('#companyName')).toBeFocused();
    await fillCompany(page);
    await next(page);

    await next(page);
    await expect(page.locator('#departments-error')).toBeVisible();
    await page.locator('input[name="departments"][value="engineering"]').check({ force: true });
    await next(page);

    await next(page);
    await expect(page.locator('#intent-error')).toBeVisible();
    await page.locator('input[name="intent"][value="known"]').check({ force: true });
    await next(page);
    await expect(page.locator('#tasks-error')).toBeVisible();
    await page.locator('input[name="tasks"][value="Ticket triage"]').check({ force: true });
    await next(page);

    await page.getByRole('button', { name: 'Request my free trial' }).click();
    for (const f of ['contactName', 'contactEmail', 'consent']) await expect(page.locator(`#${f}-error`)).toBeVisible();
    await page.getByLabel('Work email').fill('not-an-email');
    await page.getByLabel('Phone').fill('abc');
    await page.getByRole('button', { name: 'Request my free trial' }).click();
    await expect(page.locator('#contactEmail-error')).toBeVisible();
    await expect(page.locator('#contactPhone-error')).toBeVisible();
    expect(await leads()).toHaveLength(0);
  });

  test('browser back/forward moves between steps, and answers survive a reload', async ({ page }) => {
    await page.goto('/start');
    await pick(page, 'Startups & tech products');
    await next(page);
    await page.getByLabel('Company name').fill('Tiny Rocket');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tell us about your company.');
    await expect(page.getByLabel('Company name')).toHaveValue('Tiny Rocket');
    await page.getByLabel('City').fill('Bengaluru');
    await page.getByLabel('What services do you offer?').fill('SaaS');
    await page.locator('input[name="employees"][value="1–10"]').check({ force: true });
    await next(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Which departments do you have?');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tell us about your company.');
    await expect(page.getByLabel('City')).toHaveValue('Bengaluru');
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Which departments do you have?');
  });

  test('a task under a removed department is not submitted', async ({ page }) => {
    await page.goto('/start?category=it');
    await fillCompany(page);
    await next(page);
    await page.locator('input[name="departments"][value="finance"]').check({ force: true });
    await page.locator('input[name="departments"][value="sales"]').check({ force: true });
    await next(page);
    await page.locator('input[name="intent"][value="known"]').check({ force: true });
    await page.locator('input[name="tasks"][value="Reconciliations"]').check({ force: true });
    await page.locator('input[name="tasks"][value="CRM updates"]').check({ force: true });
    await page.getByRole('button', { name: '← Back' }).click();
    await page.locator('input[name="departments"][value="finance"]').uncheck({ force: true });
    await next(page);
    await next(page);
    await fillContact(page);
    await page.getByRole('button', { name: 'Request my free trial' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('You’re on the list');
    expect((await leads())[0].tasks).toEqual(['CRM updates']);
  });

  async function toFinalStep(page) {
    await page.goto('/start?category=hr');
    await fillCompany(page);
    await next(page);
    await page.locator('input[name="departments"][value="hr"]').check({ force: true });
    await next(page);
    await page.locator('input[name="intent"][value="discover"]').check({ force: true });
    await next(page);
    await fillContact(page);
  }

  test('server failure: tells the person, keeps their answers, and retry works', async ({ page }) => {
    await toFinalStep(page);
    await page.route('/api/leads', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'We could not save your request just now.' }) }));
    await page.getByRole('button', { name: 'Request my free trial' }).click();
    await expect(page.locator('.banner')).toContainText('could not save');
    await expect(page.getByLabel('Work email')).toHaveValue('asha@example.com');

    await page.unroute('/api/leads');
    await page.route('/api/leads', (r) => r.abort());
    await page.getByRole('button', { name: 'Request my free trial' }).click();
    await expect(page.locator('.banner')).toContainText('could not reach our server');

    await page.unroute('/api/leads');
    await page.getByRole('button', { name: 'Request my free trial' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('You’re on the list');
    expect(await leads()).toHaveLength(1);
  });

  test('double-clicking submit creates one lead, and the draft is gone afterwards', async ({ page }) => {
    await toFinalStep(page);
    await page.getByRole('button', { name: 'Request my free trial' }).dblclick();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('You’re on the list');
    expect(await leads()).toHaveLength(1);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What kind of company are you?');
  });

  test('server-side rejection sends the person back to the step that needs fixing', async ({ page }) => {
    await toFinalStep(page);
    await page.route('/api/leads', (r) => r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'x', fieldErrors: { city: 'Enter the city you are based in.' } }) }));
    await page.getByRole('button', { name: 'Request my free trial' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tell us about your company.');
    await expect(page.locator('#city-error')).toBeVisible();
  });

  test('markup typed into the form stays plain text', async ({ page }) => {
    let fired = false;
    page.on('dialog', (d) => { fired = true; d.dismiss(); });
    const evil = '<img src=x onerror=alert(1)>';
    await page.goto('/start?category=hr');
    await fillCompany(page, evil);
    await next(page);
    await page.locator('input[name="departments"][value="hr"]').check({ force: true });
    await next(page);
    await page.locator('input[name="intent"][value="discover"]').check({ force: true });
    await next(page);
    await fillContact(page);
    await expect(page.locator('.review')).toContainText(evil);
    await page.getByRole('button', { name: 'Request my free trial' }).click();
    await expect(page.locator('.ob-intro')).toContainText(evil);
    expect(fired).toBe(false);
    await expect(page.locator('.ob-main img')).toHaveCount(0);
  });

  test('keyboard only: can complete step one', async ({ page }) => {
    await page.goto('/start');
    await page.locator('input[name="category"]').first().focus();
    await page.keyboard.press('Space');
    await expect(page.locator('input[name="category"]').first()).toBeChecked();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tell us about your company.');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('story sits at its ending, never autoplays, and chapters jump to finished states', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-demo-canvas]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await expect(page.locator('[data-demo-toggle]')).toHaveText('Replay');
    await expect(page.locator('[data-stat="hours"]')).toHaveText('2,400');
    await page.getByRole('button', { name: 'The pile-up' }).click();
    await expect(page.locator('[data-demo-toggle]')).toHaveText('Play');
    await expect(page.locator('[data-stat="queue"]')).not.toHaveText('0');
    await expect(page.locator('.scene.is-on .msg').first()).toHaveClass(/is-in/);
  });
});
