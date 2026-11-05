# Karvya AI

Landing page and onboarding for Karvya AI: AI agents built for a role inside a company.

- `/` is the landing page.
- `/start` is the five-step onboarding form that collects a free trial request.
- `/admin` is where you review requests and approve them.
- `/agent` is the workspace a company's team uses during its free trial.

## Run it

For a demo on this laptop, see [DEMO.md](DEMO.md):

```bash
npm run demo        # builds and runs everything locally, and prints the addresses
npm run demo:share  # the same, with public links a friend can open from their own laptop
npm run demo:check  # tests the agent against the real Claude API (costs a few cents)
npm run demo:reset  # clears local requests, sessions and company memory
```

To work on the code, use `npm install` and `npm run dev` (http://localhost:5173).

Locally, requests are saved to `.data/leads.json` (ignored by git).

## Test it

```bash
npm test           # API tests, production build, then browser tests on desktop and mobile
```

The browser tests use your installed Chrome and run against the production build with the production security headers. Agent tests use a local stand-in for the Claude API ([`tests/fake-anthropic.js`](tests/fake-anthropic.js)), so they cost nothing and need no key. They check our handling of the protocol, not the quality of real answers.

## Go live

1. **Create a Supabase project** (the free tier is fine) and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor.
2. **Import this repo into Vercel.** It detects Vite and deploys `api/` as serverless functions, with no extra config.
3. **Add the environment variables** from [`.env.example`](.env.example) in Vercel > Settings > Environment Variables, then redeploy.
4. **Run a full test on the live site:** submit a request, approve it at `/admin`, open the link and chat with the agent. If Vercel rejects the 300-second limit in `vercel.json`, lower it to what your plan allows.
5. **Once you have a domain,** change `og:image` in `index.html` to a full URL (`https://yourdomain/og.png`) so link previews show the image.

Until step 3 is done, the form tells visitors it could not save and keeps their answers. It never claims success without saving.

## Where the leads go

Each request becomes one row in `leads` with `status = 'pending'` and an `agent_key` chosen from the category. Review them at `/admin`, or in the Supabase table editor.

## The agents

Approving a request opens a **workspace** for that company and creates an access link. The link opens `/agent`, where the whole team shares one agent set up for their kind of company.

```
Form (/start) → Leads table → You approve (/admin) → Access link → Agent (/agent)
```

**Run the flow locally:**

1. Paste a Claude API key into `.env.local` (from [platform.claude.com](https://platform.claude.com)), then restart `npm run dev`.
2. Submit a request at `/start`.
3. Open `/admin`, sign in with `ADMIN_TOKEN` from `.env.local`, and approve the request.
4. Open the link it gives you. Try it in a second browser under another name to see the shared memory.

**How shared memory works:** every session is saved, and the agent has three tools: search company memory and past sessions, read a colleague's session, and save something for the team. Each new session starts with a short index of what's saved. The agent fetches detail only when it needs it.

**How costs are controlled:**

| Control | Where | Default |
| --- | --- | --- |
| Total spend, across every company | `SPEND_LIMIT_USD` | $4, then all agents stop |
| Allowance per trial | `TRIAL_BUDGET_UNITS` | 250,000 units, about $1 on Opus 5.5 |
| Longest reply | `AGENT_MAX_TOKENS` | 8,000 tokens |
| Trial length | `TRIAL_DAYS` | 14 days |
| Model | `AGENT_MODEL` | `claude-opus-5-5` |
| Effort | `AGENT_EFFORT` | `medium` |
| Steps per message | `MAX_ROUNDS` in `api/agent/chat.js` | 6 |
| Session length | `SESSION_INPUT_LIMIT` in `api/agent/chat.js` | Asks for a new session past 80,000 input tokens |

A unit weighs each token by its cost: input 1, cache write 1.25, cache read 0.1, output 5. The allowance is a soft limit, since a turn already running is allowed to finish. Prompt caching is on, and each model call logs its token use, so check `cache_read` in the server logs to confirm it's working.

**To change what an agent does,** edit its `brief` and `starters` in [`server/agents.js`](server/agents.js). The shared instructions are in `buildSystemPrompt` in the same file. Keep that function free of dates or anything else that changes between requests, or caching stops working.

**What the trial agents can't do yet:** they work from what people paste into the chat and from company memory. They can't open files, reach a company's own tools or search the web. Anyone with the link can use the workspace, and they choose their own name, so there are no individual logins.

## Sending the trial email

Approving already works, and `/admin` shows the access link so you can email it yourself. To automate the email, point `TRIAL_WEBHOOK_URL` at something that sends it (Zapier, Make or n8n), or replace the fetch in [`server/trial.js`](server/trial.js) with a direct call to an email service. It receives the lead id, `access_url`, `agent_name`, `agent_key`, email, name, company, category and departments.

A failed hand-off can be retried by approving again. A lead whose trial has already gone out is not sent twice.

## Changing things

| To change | Edit |
| --- | --- |
| Categories, departments, tasks, starter agents, price | [`shared/catalog.js`](shared/catalog.js) (the page, form and server all read from it) |
| Which form fields are required | [`shared/validate.js`](shared/validate.js) (runs in the browser and on the server) |
| Page text | [`index.html`](index.html) |
| Colours and fonts | The top of [`src/styles/base.css`](src/styles/base.css) |
| What an agent does | [`server/agents.js`](server/agents.js) |
| The 1,000-employee story | [`src/demo.js`](src/demo.js): `CAPTIONS` for the jokes, `CHAPTERS` for timing |
| Calculator defaults | `FIELDS` in [`src/calculator.js`](src/calculator.js) |

## Layout

```
index.html, start.html,
agent.html, admin.html   the pages
src/                     page scripts and styles
shared/                  catalogue and validation, used by browser and server
api/                     serverless endpoints (leads, admin, agent)
server/                  storage, agent prompts and tools, and the trial hand-off
supabase/schema.sql      database tables
tests/                   API and browser tests
```
