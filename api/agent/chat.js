// POST /api/agent/chat: runs one turn of the agent and streams it to the browser
// as server-sent events.
//
// History rule: the API needs conversations replayed exactly as they happened,
// thinking blocks included, and every tool_use followed by its tool_result. So a
// step is only saved once it has fully succeeded, and saved blocks are never edited.
// A refused, failed or cancelled step leaves nothing behind.
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { BadRequest, readJson, sendJson } from '../../server/http.js';
import { Conflict } from '../../server/db.js';
import { addUsage, createSession, getSession, insertMessages, listMemories, listMessages, listSessions, touchSession, usageUnits } from '../../server/agent-store.js';
import { buildSessionContext, buildSystemPrompt, fromTag } from '../../server/agents.js';
import { runTool, TOOL_LABELS, TOOLS } from '../../server/agent-tools.js';
import { CANCELLED_TURN_USD, costUsd, overSpendLimit, recordSpend } from '../../server/spend.js';
import { agentErrorResponse, authenticate } from './_auth.js';

const MAX_MESSAGE_CHARS = 12_000;
const MAX_ROUNDS = 6; // Model calls in one turn, so a confused tool loop can't run up the bill.
const MAX_JSON_RETRIES = 2;
const SESSION_INPUT_LIMIT = 80_000; // Past this every message gets expensive, so we ask for a new session.

const MODEL = () => process.env.AGENT_MODEL || 'claude-opus-5-5';
const EFFORT = () => process.env.AGENT_EFFORT || 'medium';
// Long enough for a solid draft, and with MAX_ROUNDS it bounds what one message can ever cost.
const MAX_TOKENS = () => Number(process.env.AGENT_MAX_TOKENS) || 8000;
const SPEND_MESSAGE = 'This demo has reached its AI spending limit, so the agent has stopped replying.';

const textOf = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('');

// The SDK has no dedicated class for these two, so they're recognised by message.
// If the wording ever changes, the result is a generic error and no retry, which is safe.
const isUnparseableToolInput = (err) => /parse tool parameter JSON/i.test(err?.message ?? '');
const isMissingCredentials = (err) => /resolve authentication method/i.test(err?.message ?? '');

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError || isMissingCredentials(err)) return 'The agent isn’t connected yet. Please let the Karvya team know.';
  if (err instanceof Anthropic.RateLimitError) return 'The agent is busy right now. Please try again in a minute.';
  if (err instanceof Anthropic.APIConnectionError) return 'The agent couldn’t be reached. Please try again.';
  if (err instanceof Conflict) return 'A colleague replied in this session at the same moment. Reload the session and try again.';
  return 'Something went wrong on our side, and your last message wasn’t saved. Please try again.';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  let workspace;
  let body;
  let history = [];
  let session = null;
  try {
    workspace = await authenticate(req, res);
    if (!workspace) return undefined;
    body = await readJson(req);
    if (typeof body.message !== 'string' || !body.message.trim()) return sendJson(res, 400, { error: 'Write a message first.' });
    if (body.message.length > MAX_MESSAGE_CHARS) return sendJson(res, 413, { error: `Please keep a message under ${MAX_MESSAGE_CHARS.toLocaleString('en-IN')} characters.` });
    if (typeof body.author !== 'string' || !body.author.trim()) return sendJson(res, 400, { error: 'Tell us your name first.' });
    if (workspace.used_units >= workspace.budget_units) return sendJson(res, 402, { code: 'budget', error: 'This free trial has used all of its allowance.' });
    if (await overSpendLimit()) return sendJson(res, 402, { code: 'budget', error: SPEND_MESSAGE });

    if (body.sessionId) {
      session = await getSession(workspace.id, String(body.sessionId));
      if (!session) return sendJson(res, 404, { error: 'Session not found.' });
      if (session.last_input_tokens > SESSION_INPUT_LIMIT) return sendJson(res, 409, { code: 'session_full', error: 'This session has grown long. Start a new one, and the agent can look up this work.' });
      history = await listMessages(session.id);
    }
  } catch (err) {
    if (err instanceof BadRequest) return sendJson(res, 400, { error: err.message });
    return agentErrorResponse(res, err);
  }

  const author = body.author.trim().slice(0, 60);
  const text = body.message.trim();

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');

  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  const send = (event) => { if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`); };

  const client = new Anthropic();
  const sessionId = session?.id ?? randomUUID();
  // The system prompt comes first and stays identical, so it is cached and shared across sessions.
  const system = [{ type: 'text', text: buildSystemPrompt(workspace), cache_control: { type: 'ephemeral' } }];

  let context = '';
  if (!session) {
    const [memories, sessions] = await Promise.all([listMemories(workspace.id), listSessions(workspace.id, 10)]).catch(() => [[], []]);
    context = `${buildSessionContext({ memories, sessions, today: new Date().toISOString().slice(0, 10) })}\n\n`;
  }

  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  let seq = history.length;
  const unsaved = [];
  const queue = (role, content, plain) => {
    unsaved.push({ id: randomUUID(), session_id: sessionId, workspace_id: workspace.id, seq: seq++, role, content, author: role === 'user' && plain ? author : null, text: plain || null, created_at: new Date().toISOString() });
    messages.push({ role, content });
  };
  const flush = async (inputTokens) => {
    if (!session) session = await createSession(workspace.id, { id: sessionId, title: text.slice(0, 70), author });
    await insertMessages(unsaved.splice(0));
    await touchSession(workspace.id, sessionId, inputTokens);
  };

  queue('user', [{ type: 'text', text: `${context}${fromTag(author)}\n${text}` }], text);

  let finished = false;
  let cut = false;
  let inputTokens = 0;
  try {
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const final = await streamRound({
        client, system, messages, send, signal: controller.signal, lastRound: round === MAX_ROUNDS,
      });
      await recordSpend(costUsd(MODEL(), final.usage));
      await addUsage(workspace, usageUnits(final.usage));
      const u = final.usage;
      inputTokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      console.log(`[agent] ${workspace.id} round ${round}: input ${u.input_tokens} cache_read ${u.cache_read_input_tokens} cache_write ${u.cache_creation_input_tokens} output ${u.output_tokens}`);

      const toolCalls = final.content.filter((b) => b.type === 'tool_use');

      if (final.stop_reason === 'refusal') {
        send({ type: 'error', message: 'The agent can’t help with that request. Try rephrasing it, or ask for something else.', keepInput: true });
        return res.end();
      }
      if (final.stop_reason === 'max_tokens' && toolCalls.length) {
        // A tool call cut off here may parse as valid but incomplete, so it must not run.
        send({ type: 'error', message: 'That answer got too long and was cut off. Try asking for a smaller piece.', keepInput: true });
        return res.end();
      }

      queue('assistant', final.content, textOf(final.content));

      if (final.stop_reason !== 'tool_use') {
        cut = final.stop_reason === 'max_tokens';
        await flush(inputTokens);
        finished = true;
        break;
      }

      const results = await Promise.all(toolCalls.map((block) => runTool(block, { workspaceId: workspace.id, author })));
      // All results go in one message, and are saved together with the call they answer.
      queue('user', results, '');
      await flush(inputTokens);

      if (workspace.used_units >= workspace.budget_units) {
        send({ type: 'error', code: 'budget', message: 'This free trial has used all of its allowance.' });
        return res.end();
      }
      if (await overSpendLimit()) {
        send({ type: 'error', code: 'budget', message: SPEND_MESSAGE });
        return res.end();
      }
    }

    if (!finished) send({ type: 'error', message: 'The agent took too many steps on this one. Try breaking it into smaller requests.' });
    else {
      send({
        type: 'done',
        sessionId,
        cutOff: cut,
        sessionFull: inputTokens > SESSION_INPUT_LIMIT,
        percentUsed: Math.min(100, Math.round((workspace.used_units / workspace.budget_units) * 100)),
      });
    }
    return res.end();
  } catch (err) {
    if (controller.signal.aborted) {
      await recordSpend(CANCELLED_TURN_USD).catch(() => {});
      return res.end();
    }
    console.error('[agent] turn failed:', err);
    send({ type: 'error', message: friendlyError(err), keepInput: !session || unsaved.length > 0 });
    return res.end();
  }
}

async function streamRound({ client, system, messages, send, signal, lastRound }) {
  for (let attempt = 0; ; attempt++) {
    try {
      const stream = client.beta.messages.stream({
        model: MODEL(),
        max_tokens: MAX_TOKENS(),
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        cache_control: { type: 'ephemeral' }, // Also caches the conversation so far on each step.
        output_config: { effort: EFFORT() },
        system,
        tools: TOOLS,
        ...(lastRound ? { tool_choice: { type: 'none' } } : {}),
        messages,
      }, { signal });

      for await (const event of stream) {
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          send({ type: 'tool', label: TOOL_LABELS[event.content_block.name] ?? 'Working' });
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          send({ type: 'text', delta: event.delta.text });
        }
      }
      return await stream.finalMessage();
    } catch (err) {
      // Tool input the SDK can't parse at all leaves no block to answer, so the step is
      // re-issued a limited number of times. Every other error goes straight to the caller.
      if (!isUnparseableToolInput(err) || attempt >= MAX_JSON_RETRIES) throw err;
      console.error('[agent] retrying after unparseable tool input:', err.message);
      send({ type: 'retry' });
    }
  }
}
