# Presenting Karvya AI

Everything runs on this laptop. There's no hosting to set up, but the agent's replies need internet.

## Once, before the day

1. Get a Claude API key at [platform.claude.com](https://platform.claude.com) and add a little credit. $5 is plenty.
2. Paste it after `ANTHROPIC_API_KEY=` in `.env.local`.
3. Run `npm run demo:check`. It tests the key moment of the demo against the real AI, and costs a few cents.
4. Rehearse the script below at least once, timing it.
5. **Screen-record a rehearsal,** so you have a backup if the internet fails in the room.

## Letting a friend try it

Run `npm run demo:share` instead of `npm run demo`. It prints public links that work from any laptop, for as long as the command keeps running.

1. Send your friend the **Landing page** or **Form** link. They fill in the form.
2. Open the **Admin** link, sign in with the token, approve their request and copy the access link.
3. Send them that access link. It opens their agent.

- **Keep the laptop on with the lid open, and the terminal running.** If it sleeps or you press Ctrl+C, the links stop working.
- **The link changes each time you start it,** so send new links after a restart. Access links made before the restart will also stop working.
- **Keep the admin token to yourself.** Only share links with people you trust.
- **Test it first** from your phone on mobile data. Replies may appear all at once rather than word by word through this kind of link.

## What it costs

Everything has a hard stop, so your $5 credit is safe:

| Limit | Amount |
| --- | --- |
| All agents stop replying at | $4 total, with the last $1 kept as a cushion |
| Each company's allowance | About $1 |
| One message at most | Under about $1 in the worst case, and normally 1 to 3 cents |

Spend so far shows on the admin page and when the demo starts. `npm run demo:reset` keeps that record, so it never forgets money already spent. To be doubly sure, check that **auto-reload is off** under Billing at [platform.claude.com](https://platform.claude.com). With it off, Anthropic can't charge past your credit either.

## On the day

1. Connect to the internet, and have a phone hotspot ready.
2. In the VS Code terminal, run `npm run demo:reset` to clear rehearsal data, then `npm run demo`.
3. Sign in to `/admin` in a second tab using the token shown in the terminal. Keep the terminal open.
4. Set browser zoom to about 125% so the back of the room can read it, and turn on Do Not Disturb.

## The script (about 5 minutes)

**1. The idea (1 min).** On the landing page, read the headline. Scroll to the 1,000-employee story and let it play. Scroll to **Do the maths** and move a slider.

**2. Sign up (1 min).** Click **Get a free trial** and fill in the form while you talk:

| Field | Type this |
| --- | --- |
| Category | Management & general consulting |
| Company | Asha Advisory, Pune |
| Services | Strategy and market entry projects |
| Team size | 11–50 |
| Departments | Consulting & client delivery, Sales & business development |
| To automate | I know what I want: Market research, Proposal drafting |
| Contact | Asha Rao, your own email address |

**3. Approve (20 sec).** Go to the admin tab and reload. Click **Approve**, then **Open agent**. Say: "Next, this link goes out by email automatically."

**4. The agent at work (1 min).** Enter the name **Asha Rao**, then paste:

> Here are my notes on the Sharma Textiles proposal. They want to enter the South India market, the budget is about ₹4 lakh, we finished sections 1 to 3, and the scope of the site visit is still open. I'm logging off, so please save where this stands.

Point out the new entry under **Company memory** in the sidebar.

**5. The moment that sells it (1 min).** Click **Switch person** and enter **Rahul**. Say: "Rahul is a colleague. New session, and he's explained nothing." Then type:

> Where are we on Sharma Textiles?

Then:

> Draft a short email to the client about the open site visit question.

The first reply can take several seconds while the agent thinks. Fill the pause by explaining what it's doing.

## If something goes wrong

| What happens | What to do |
| --- | --- |
| "The agent couldn't be reached" | Switch to the hotspot and resend. Otherwise play your recording. |
| "The agent isn't connected yet" | The key is missing or wrong. Check `.env.local`, then restart `npm run demo`. |
| The agent is slow | Keep talking, or add `AGENT_EFFORT=low` to `.env.local` before class for faster replies. |
| The agent forgot to save | Ask Rahul's question anyway. It also searches past sessions. |
| The page looks stuck or odd | Reload. Your data is saved. |
| Terminal closed by accident | Run `npm run demo` again. Your data is still there. |

## If you're asked

- **Is this a real AI?** Yes. Replies come live from Claude, and the agent's role and company memory are ours.
- **Where do the numbers come from?** The story and calculator are illustrative, and the calculator runs on whatever assumptions you set. We have no customers yet, so nothing on the page is customer data.
- **Does it connect to Tally or Excel?** Not yet. This version works from what people paste in. Connecting to a company's tools is the next build.
- **Is it live for customers?** This is an MVP running on this laptop. Hosting and automatic trial emails are designed in, but not switched on.
