// A local stand-in for the Claude API, speaking its real streaming format. It lets
// the tests run the whole agent loop with no API key and no cost. It proves our code
// handles the protocol correctly; it says nothing about the quality of real answers.
//
// It decides what to do from the latest user text:
//   "remember <title>: <content>"  saves to memory via the tool, then confirms
//   "where are we on <x>"          searches memory via the tool, then answers from the result
//   "read session <id>"            reads a transcript via the tool, then answers
//   "bad tool input"               sends invalid tool input
//   "truncated json"               sends tool input the SDK's tolerant parser half-accepts
//   "broken json"                  sends tool input the SDK can't parse at all
//   "cut off tool"                 stops at max_tokens in the middle of a tool call
//   "please refuse"                returns a refusal
//   "loop forever"                 keeps calling tools until tools are turned off
//   "wait <ms>"                    pauses mid-answer, for cancel tests
//   anything else                  echoes, with a thinking block first
import { createServer } from 'node:http';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function latestUserText(messages) {
  const last = messages[messages.length - 1];
  if (typeof last.content === 'string') return { text: last.content, toolResults: [] };
  const toolResults = last.content.filter((b) => b.type === 'tool_result');
  const text = last.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').replace(/<team_context>[\s\S]*?<\/team_context>\s*/, '');
  return { text, toolResults };
}

function plan(body) {
  const { text, toolResults } = latestUserText(body.messages);
  const toolsOff = body.tool_choice?.type === 'none';

  if (toolResults.length) {
    const result = toolResults.map((r) => r.content).join('\n');
    if (toolResults.some((r) => r.is_error)) return { text: `Tool problem: ${result}` };
    if (/loop forever/.test(JSON.stringify(body.messages))) {
      return toolsOff ? { text: 'Giving up on the loop.' } : { tool: ['search_company_memory', { query: 'loop-marker' }] };
    }
    return { text: `From what I found: ${result}` };
  }
  let m;
  if (/please refuse/i.test(text)) return { refusal: true };
  if (/truncated json/i.test(text)) return { tool: ['save_to_company_memory', {}], rawJson: '{"title": oops' };
  if (/broken json/i.test(text)) return { tool: ['save_to_company_memory', {}], rawJson: 'not json' };
  if (/bad tool input/i.test(text)) return { tool: ['save_to_company_memory', { title: 42 }] };
  if (/cut off tool/i.test(text)) return { tool: ['save_to_company_memory', { title: 'half' }], stop: 'max_tokens' };
  if (/loop forever/i.test(text)) return { tool: ['search_company_memory', { query: 'loop-marker' }] };
  if ((m = text.match(/remember ([^:]+): (.+)/i))) return { tool: ['save_to_company_memory', { title: m[1], content: m[2] }] };
  if ((m = text.match(/where are we on (.+?)\??$/im))) return { tool: ['search_company_memory', { query: m[1] }] };
  if ((m = text.match(/read session (\S+)/i))) return { tool: ['read_work_session', { session_id: m[1] }] };
  if ((m = text.match(/wait (\d+)/i))) return { wait: Number(m[1]), text: 'Starting a long answer. Finished now.' };
  return { thinking: true, text: `Echo: ${text.split('\n').pop()}` };
}

export function startFakeAnthropic(port = 0) {
  const requests = [];
  let failNext = null;
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      if (req.url === '/_requests') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(requests));
      }
      if (req.url === '/_reset') {
        requests.length = 0;
        return res.end('ok');
      }
      const body = JSON.parse(raw || '{}');
      requests.push({ headers: req.headers, body: JSON.parse(raw || '{}') });
      if (failNext) {
        const status = failNext;
        failNext = null;
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ type: 'error', error: { type: status === 401 ? 'authentication_error' : 'rate_limit_error', message: 'fake failure' } }));
      }

      const p = plan(body);
      res.setHeader('Content-Type', 'text/event-stream');
      const send = (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 };
      send({ type: 'message_start', message: { id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } });

      let index = 0;
      if (p.thinking) {
        send({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } });
        send({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: `sig-${requests.length}` } });
        send({ type: 'content_block_stop', index });
        index++;
      }
      if (p.text) {
        send({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
        const middle = Math.ceil(p.text.length / 2);
        send({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: p.text.slice(0, middle) } });
        if (p.wait) await sleep(p.wait);
        send({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: p.text.slice(middle) } });
        send({ type: 'content_block_stop', index });
        index++;
      }
      if (p.tool) {
        const [name, input] = p.tool;
        send({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_${requests.length}`, name, input: {} } });
        send({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: p.rawJson ?? JSON.stringify(input) } });
        send({ type: 'content_block_stop', index });
        index++;
      }
      const stop = p.refusal ? 'refusal' : p.stop ?? (p.tool ? 'tool_use' : 'end_turn');
      send({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 20 } });
      send({ type: 'message_stop' });
      return res.end();
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      requests,
      failNextWith(status) { failNext = status; },
      close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
    });
  }));
}

if (process.argv[1]?.endsWith('fake-anthropic.js')) {
  await startFakeAnthropic(Number(process.argv[2]) || 4180);
}
