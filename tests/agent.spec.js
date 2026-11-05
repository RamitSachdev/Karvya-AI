import { expect, test } from '@playwright/test';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { ADMIN_TOKEN, AGENT_DB_FILE, LEADS_FILE, SPEND_FILE } from '../playwright.config.js';

const VALID = {
  category: 'consulting', companyName: 'Asha Advisory', city: 'Pune', services: 'Strategy projects',
  employees: '11–50', departments: ['consulting'], intent: 'discover',
  contactName: 'Asha Rao', contactEmail: 'asha@example.com', consent: true,
};

function watch(page) {
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`exception: ${e.message}`));
  return problems;
}

async function signInAndApprove(page, email = VALID.contactEmail) {
  await page.goto('/admin');
  await page.getByLabel('Admin token').fill(ADMIN_TOKEN);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const card = page.locator(`[data-lead="${email}"]`);
  await card.getByRole('button', { name: 'Approve' }).click();
  const link = card.locator('[data-access-link]');
  await expect(link).toBeVisible();
  return link.inputValue();
}
const newLead = (request, overrides = {}) => request.post('/api/leads', { data: { ...VALID, ...overrides } });

async function openAs(browser, link, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const problems = watch(page);
  await page.goto(link);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  return { page, context, problems };
}
async function say(page, text) {
  await page.getByLabel('Your message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

test.beforeEach(async () => {
  await rm(LEADS_FILE, { force: true });
  await rm(AGENT_DB_FILE, { force: true });
  await rm(SPEND_FILE, { force: true });
});

test('admin: a wrong token is refused, and nothing shows without signing in', async ({ page, request }) => {
  await newLead(request);
  await page.goto('/admin');
  await expect(page.locator('[data-lead]')).toHaveCount(0);
  await page.getByLabel('Admin token').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('[data-login-error]')).toContainText('wasn’t accepted');
  await expect(page.locator('[data-lead]')).toHaveCount(0);
});

test('admin: shows the request details, and approving moves it out of Waiting', async ({ page, request }) => {
  const problems = watch(page);
  await newLead(request, { tools: 'Excel, Tally', contactRole: 'Partner' });
  const link = await signInAndApprove(page);
  expect(link).toMatch(/\/agent#key=/);
  const card = page.locator('[data-lead]');
  await expect(card).toContainText('Asha Advisory');
  await expect(card).toContainText('Asha Rao, Partner');
  await expect(card).toContainText('Excel, Tally');
  await expect(card).toContainText('send this link to them yourself');

  await page.reload();
  await expect(page.locator('[data-leads-empty]')).toBeVisible();
  await page.getByRole('button', { name: 'Approved' }).click();
  await expect(page.locator('[data-lead]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show access link' }).click();
  await expect(page.locator('[data-access-link]')).toHaveValue(link);
  expect(problems).toEqual([]);
});

test('THE WHOLE JOURNEY: form, approval, agent, and a colleague picking up the work', async ({ page, browser }) => {
  // A customer fills in the real onboarding form.
  await page.goto('/start?category=consulting');
  await page.getByLabel('Company name').fill('Asha Advisory');
  await page.getByLabel('City').fill('Pune');
  await page.getByLabel('What services do you offer?').fill('Strategy projects');
  await page.locator('input[name="employees"][value="11–50"]').check({ force: true });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('input[name="departments"][value="consulting"]').check({ force: true });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('input[name="intent"][value="discover"]').check({ force: true });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Your name').fill('Asha Rao');
  await page.getByLabel('Work email').fill('asha@example.com');
  await page.locator('#consent').check();
  await page.getByRole('button', { name: 'Request my free trial' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('You’re on the list');

  // You approve it.
  const link = await signInAndApprove(page);

  // The first employee works with the agent. The key leaves the address bar straight away.
  const asha = await openAs(browser, link, 'Asha Rao');
  await expect(asha.page).toHaveURL(/\/agent$/);
  await expect(asha.page.getByRole('heading', { level: 1 })).toHaveText('Hi Asha. What are we working on?');
  await expect(asha.page.locator('[data-agent-name]')).toHaveText('Research & proposal agent');
  await expect(asha.page.locator('[data-company]')).toHaveText('Asha Advisory');
  await expect(asha.page.locator('.starters button')).toHaveCount(3);

  await say(asha.page, 'remember Sharma Textiles status: section 3 done, scope still open');
  await expect(asha.page.locator('.turn-agent').last()).toContainText('Saved. The whole team');
  await expect(asha.page.locator('[data-memories]')).toContainText('Sharma Textiles status');
  await expect(asha.page.locator('[data-sessions]')).toContainText('Asha Rao');
  await expect(asha.page.locator('[data-trial]')).toContainText('% of your allowance used');

  // A colleague opens the same link on another device and asks, with no briefing.
  const rahul = await openAs(browser, link, 'Rahul');
  await expect(rahul.page.locator('[data-memories]')).toContainText('Sharma Textiles status');
  await say(rahul.page, 'where are we on Sharma Textiles?');
  await expect(rahul.page.locator('.turn-agent').last()).toContainText('section 3 done, scope still open');

  // They can also open Asha's session and continue it.
  const menu = rahul.page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
  await rahul.page.locator('[data-sessions] button').filter({ hasText: 'Asha Rao' }).click();
  await expect(rahul.page.locator('.turn-user').first()).toContainText('Asha Rao');
  await expect(rahul.page.locator('.turn-agent').first()).toContainText('Saved. The whole team');
  await say(rahul.page, 'carry on from here');
  await expect(rahul.page.locator('.turn-agent').last()).toContainText('Echo: carry on from here');

  // A returning visitor doesn't need the link again, or to re-enter their name.
  await rahul.page.reload();
  await expect(rahul.page.getByRole('heading', { level: 1 })).toHaveText('Hi Rahul. What are we working on?');

  expect(asha.problems).toEqual([]);
  expect(rahul.problems).toEqual([]);
  await asha.context.close();
  await rahul.context.close();
  // The database holds the conversation in full, including tool steps.
  const db = JSON.parse(await readFile(AGENT_DB_FILE, 'utf8'));
  expect(db.agent_memories).toHaveLength(1);
  expect(db.agent_messages.some((m) => m.content.some((b) => b.type === 'tool_use'))).toBe(true);
});

test('the reply streams in piece by piece, and Stop cancels it', async ({ page, request, browser }) => {
  await newLead(request);
  const link = await signInAndApprove(page);
  const { page: agent, context, problems } = await openAs(browser, link, 'Asha');
  await say(agent, 'wait 2500');
  await expect(agent.locator('.turn-agent').last()).toContainText('Starting a long');
  await expect(agent.locator('.turn-agent').last()).not.toContainText('Finished now');
  await agent.getByRole('button', { name: 'Stop' }).click();
  await expect(agent.getByRole('button', { name: 'Send' })).toBeVisible();
  await agent.waitForTimeout(3000);
  await expect(agent.locator('.turn-agent').last()).not.toContainText('Finished now');
  await say(agent, 'hello again');
  await expect(agent.locator('.turn-agent').last()).toContainText('Echo: hello again');
  expect(problems).toEqual([]);
  await context.close();
});

test('markup in replies stays text, and Markdown is formatted', async ({ page, request, browser }) => {
  await newLead(request);
  const link = await signInAndApprove(page);
  const { page: agent, context } = await openAs(browser, link, 'Asha');
  let dialog = false;
  agent.on('dialog', (d) => { dialog = true; d.dismiss(); });
  await say(agent, '**bold** <img src=x onerror=alert(1)> `code`');
  const reply = agent.locator('.turn-agent').last();
  await expect(reply.locator('strong')).toHaveText('bold');
  await expect(reply.locator('code')).toHaveText('code');
  await expect(reply).toContainText('<img src=x onerror=alert(1)>');
  await expect(agent.locator('.chat img')).toHaveCount(0);
  expect(dialog).toBe(false);
  await context.close();
});

test('admin shows spend, and a spent limit gives a clear message and keeps what was typed', async ({ page, request, browser }) => {
  await newLead(request);
  const link = await signInAndApprove(page);
  await expect(page.locator('[data-spend]')).toContainText('$0.00 of $4.00');
  const { page: agent, context } = await openAs(browser, link, 'Asha');
  await writeFile(SPEND_FILE, JSON.stringify({ usd: 4 }));
  await say(agent, 'hello');
  await expect(agent.locator('[data-banner]')).toContainText('spending limit');
  await expect(agent.getByLabel('Your message')).toHaveValue('hello');
  await page.reload();
  await expect(page.locator('[data-spend]')).toContainText('$4.00 of $4.00');
  await context.close();
});

test('invalid links get a clear screen, and no chat', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/agent');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This link isn’t valid');
  await page.goto('/agent#key=fake.key');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This link isn’t valid');
  await expect(page.locator('[data-shell]')).toBeHidden();
  await context.close();
});

test('Enter sends, Shift+Enter makes a new line, and starters fill the box', async ({ page, request, browser }) => {
  await newLead(request);
  const link = await signInAndApprove(page);
  const { page: agent, context } = await openAs(browser, link, 'Asha');
  await agent.locator('.starters button').first().click();
  await expect(agent.getByLabel('Your message')).toHaveValue(/proposal outline/);
  const box = agent.getByLabel('Your message');
  await box.fill('line one');
  await box.press('Shift+Enter');
  await box.pressSequentially('line two');
  await expect(box).toHaveValue('line one\nline two');
  await box.press('Enter');
  await expect(agent.locator('.turn-user').last()).toContainText('line two');
  await expect(box).toHaveValue('');
  await context.close();
});

test('a failed turn tells the person and gives their message back', async ({ page, request, browser }) => {
  await newLead(request);
  const link = await signInAndApprove(page);
  const { page: agent, context } = await openAs(browser, link, 'Asha');
  await say(agent, 'please refuse');
  await expect(agent.locator('[data-banner]')).toContainText('can’t help with that');
  await expect(agent.getByLabel('Your message')).toHaveValue('please refuse');
  await expect(agent.locator('[data-sessions] button')).toHaveCount(0);
  await context.close();
});

test('one laptop: Switch person starts fresh, and the new person still gets the team’s context', async ({ page, request, browser }) => {
  await newLead(request);
  const link = await signInAndApprove(page);
  const { page: agent, context, problems } = await openAs(browser, link, 'Asha Rao');
  await say(agent, 'remember Sharma Textiles status: section 3 done');
  await expect(agent.locator('.turn-agent').last()).toContainText('Saved');

  const menu = agent.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
  await expect(agent.locator('[data-who]')).toHaveText('Asha Rao');
  await agent.getByRole('button', { name: 'Switch person' }).click();
  await agent.getByLabel('Your name').fill('Rahul');
  await agent.getByRole('button', { name: 'Continue' }).click();

  await expect(agent.getByRole('heading', { level: 1 })).toHaveText('Hi Rahul. What are we working on?');
  await expect(agent.locator('.turn-user')).toHaveCount(0);
  await say(agent, 'where are we on Sharma Textiles?');
  await expect(agent.locator('.turn-agent').last()).toContainText('section 3 done');
  await expect(agent.locator('.turn-user').last()).toContainText('Rahul');
  expect(problems).toEqual([]);
  await context.close();
});

test('admin gives a one-click way to open the agent, and a new company’s link asks who’s working', async ({ page, request, context }) => {
  await newLead(request);
  const first = await signInAndApprove(page);
  await expect(page.getByRole('link', { name: 'Open agent' })).toHaveAttribute('href', first);
  await expect(page.getByRole('link', { name: 'Open agent' })).toHaveAttribute('target', '_blank');

  const agent = await context.newPage();
  await agent.goto(first);
  await agent.getByLabel('Your name').fill('Asha');
  await agent.getByRole('button', { name: 'Continue' }).click();
  await expect(agent.getByRole('heading', { level: 1 })).toContainText('Hi Asha');
  // The same link on the same browser remembers the person.
  await agent.goto('/');
  await agent.goto(first);
  await agent.reload();
  await expect(agent.getByRole('heading', { level: 1 })).toContainText('Hi Asha');

  await newLead(request, { companyName: 'Other Co', contactEmail: 'other@example.com' });
  await page.reload();
  const card = page.locator('[data-lead="other@example.com"]');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card.locator('[data-access-link]')).toBeVisible();
  const link = await card.locator('[data-access-link]').inputValue();
  await agent.goto('/');
  await agent.goto(link);
  await expect(agent.getByLabel('Your name')).toBeVisible();
});

test('phone layout: no sideways scroll, and the menu opens the team’s work', async ({ page, request, browser }) => {
  await newLead(request);
  const link = await signInAndApprove(page);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const agent = await context.newPage();
  await agent.goto(link);
  await agent.getByLabel('Your name').fill('Asha');
  await agent.getByRole('button', { name: 'Continue' }).click();
  await say(agent, 'remember Client list: Sharma and Mehta');
  await expect(agent.locator('.turn-agent').last()).toContainText('Saved');
  expect(await agent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(agent.locator('[data-memories]')).toBeHidden();
  await agent.getByRole('button', { name: 'Menu' }).click();
  await expect(agent.locator('[data-memories]')).toContainText('Client list');
  await agent.getByRole('button', { name: 'New session' }).click();
  await expect(agent.getByRole('heading', { level: 1 })).toContainText('Hi Asha');
  await expect(agent.getByLabel('Your message')).toBeVisible();
  await context.close();
});
