// The agent's tools. They only reach the current company's data: the workspace id
// comes from the verified access link, and the model has no way to name another.
import { getSession, listMessages, saveMemory, searchWorkspace } from './agent-store.js';

const MAX_TRANSCRIPT_CHARS = 20_000;
const MAX_MEMORY_CHARS = 4_000;

// Kept in a fixed order, because changing the tool list would invalidate the prompt cache.
export const TOOLS = [
  {
    name: 'search_company_memory',
    description: 'Search everything saved in company memory and everything the team has discussed with you in earlier sessions. Call this when someone mentions a client, project, decision or piece of earlier work that you can’t see in this conversation, before asking them to explain it.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A few keywords, such as a client name or topic.' } },
      required: ['query'],
    },
  },
  {
    name: 'read_work_session',
    description: 'Read the transcript of an earlier session by its id. Call this when someone picks up work a colleague started and you need the detail, or when a search result points to a session.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The session id from the team context or a search result.' },
        offset: { type: 'integer', description: 'Character position to continue from, if an earlier read said there was more.' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'save_to_company_memory',
    description: 'Save something the whole team should be able to rely on later: a client detail, a decision, a preference, how the company does something, or where a piece of work was left. Saving under an existing title replaces that entry, so include what should still be kept.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A short, specific title, such as "Sharma Textiles proposal status".' },
        content: { type: 'string', description: 'What to remember, written so a colleague can understand it on its own.' },
      },
      required: ['title', 'content'],
    },
  },
];

export const TOOL_LABELS = {
  search_company_memory: 'Checking company memory',
  read_work_session: 'Reading earlier work',
  save_to_company_memory: 'Saving to company memory',
};

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

// Tool inputs stream unvalidated (eager_input_streaming), so each one is checked here.
function inputProblem(name, input) {
  if (typeof input !== 'object' || input === null) return 'Input must be an object.';
  if (name === 'search_company_memory') return isText(input.query) ? null : 'query must be a non-empty string.';
  if (name === 'read_work_session') {
    if (!isText(input.session_id)) return 'session_id must be a non-empty string.';
    if (input.offset !== undefined && !(Number.isInteger(input.offset) && input.offset >= 0)) return 'offset must be a whole number.';
    return null;
  }
  if (name === 'save_to_company_memory') {
    if (!isText(input.title) || input.title.length > 120) return 'title must be a non-empty string of at most 120 characters.';
    if (!isText(input.content) || input.content.length > MAX_MEMORY_CHARS) return `content must be non-empty and at most ${MAX_MEMORY_CHARS} characters.`;
    return null;
  }
  return `Unknown tool: ${name}`;
}

const snippet = (text, words) => {
  const lower = text.toLowerCase();
  const at = Math.max(0, Math.min(...words.map((w) => { const i = lower.indexOf(w.toLowerCase()); return i < 0 ? Infinity : i; })));
  const start = Number.isFinite(at) ? Math.max(0, at - 100) : 0;
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 400)}`;
};

async function search(workspaceId, { query }) {
  const words = [...new Set(query.match(/[\p{L}\p{N}]+/gu) ?? [])].filter((w) => w.length > 1).slice(0, 6);
  if (!words.length) return 'That search had no usable keywords. Try a client name or topic.';
  const { memories, messages } = await searchWorkspace(workspaceId, words);
  if (!memories.length && !messages.length) return 'Nothing found in company memory or earlier sessions.';
  const parts = [];
  for (const m of memories) parts.push(`Memory "${m.title}" (updated by ${m.updated_by}, ${m.updated_at.slice(0, 10)}):\n${m.content}`);
  for (const m of messages) parts.push(`Session ${m.session_id}, ${m.author || 'Agent'} (${m.created_at.slice(0, 10)}):\n${snippet(m.text, words)}`);
  return parts.join('\n\n');
}

async function readSession(workspaceId, { session_id: id, offset = 0 }) {
  const session = await getSession(workspaceId, id);
  if (!session) return { error: `No session with id ${id} in this company.` };
  const transcript = (await listMessages(id))
    .filter((m) => m.text)
    .map((m) => `${m.role === 'user' ? m.author : 'Agent'}: ${m.text}`)
    .join('\n\n');
  const part = transcript.slice(offset, offset + MAX_TRANSCRIPT_CHARS);
  const next = offset + part.length;
  const more = next < transcript.length ? `\n\n[More remains. Continue with offset ${next}.]` : '';
  return { text: `Session "${session.title}", started by ${session.started_by}.\n\n${part}${more}` };
}

export async function runTool(block, { workspaceId, author }) {
  const result = (content, isError = false) => ({ type: 'tool_result', tool_use_id: block.id, content, ...(isError ? { is_error: true } : {}) });
  const problem = inputProblem(block.name, block.input);
  if (problem) return result(JSON.stringify({ INVALID_JSON: JSON.stringify(block.input ?? null), problem }), true);
  try {
    if (block.name === 'search_company_memory') return result(await search(workspaceId, block.input));
    if (block.name === 'read_work_session') {
      const { text, error } = await readSession(workspaceId, block.input);
      return error ? result(error, true) : result(text);
    }
    await saveMemory(workspaceId, { title: block.input.title.trim(), content: block.input.content.trim(), author });
    return result('Saved. The whole team can now rely on this.');
  } catch (err) {
    console.error(`[agent] tool ${block.name} failed:`, err);
    return result('This tool failed just now. Carry on without it, and tell the person if it matters.', true);
  }
}
