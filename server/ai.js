// Claude Messages API client (fetch + server-sent events), no SDK dependency.
class AiError extends Error {
  constructor(code, message, status) { super(message || code); this.code = code; this.status = status || 502; }
}

function mapHttpError(status, body) {
  const msg = (body && body.error && body.error.message) || '';
  if (status === 401 || status === 403) return new AiError('not_configured', 'The AI API key was rejected. An admin needs to check ANTHROPIC_API_KEY.', 503);
  if (status === 429) return new AiError('rate_limited', 'The AI service is busy. Try again in a moment.', 429);
  if (status === 413 || /too long|too large|exceed/i.test(msg)) return new AiError('prompt_too_large', 'That request is too long.', 413);
  if (status === 400) return new AiError('invalid_request', msg || 'The AI service rejected the request.', 400);
  return new AiError('upstream_error', 'The AI service failed. Try again.', 502);
}

/**
 * Call Claude. With onDelta the response streams and onDelta(text) fires per text chunk.
 * Resolves {text, content, stopReason, usage: {input, output}}.
 */
async function callClaude(config, { model, system, messages, maxTokens = 1024, tools, toolChoice, onDelta, signal }) {
  if (!config.anthropicKey) throw new AiError('not_configured', 'AI is not set up on this server yet.', 503);
  const body = { model, max_tokens: maxTokens, messages };
  if (system) body.system = system;
  if (tools && tools.length) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;
  if (onDelta) body.stream = true;
  let res;
  try {
    res = await fetch(config.anthropicUrl + '/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new AiError('cancelled', 'Cancelled.', 499);
    throw new AiError('upstream_error', 'Could not reach the AI service.', 502);
  }
  if (!res.ok) {
    let errBody = null;
    try { errBody = await res.json(); } catch (e) { /* not JSON */ }
    throw mapHttpError(res.status, errBody);
  }
  if (!onDelta) {
    const j = await res.json();
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (j.stop_reason === 'refusal') throw new AiError('refused', 'The AI declined this request. Try rewording it.', 422);
    return { text, content: j.content || [], stopReason: j.stop_reason, usage: { input: (j.usage && j.usage.input_tokens) || 0, output: (j.usage && j.usage.output_tokens) || 0 } };
  }
  const usage = { input: 0, output: 0 };
  let text = '', stopReason = null, buf = '';
  const decoder = new TextDecoder();
  const handle = block => {
    let data = '';
    for (const line of block.split('\n')) if (line.startsWith('data:')) data += line.slice(5).trim();
    if (!data) return;
    let ev;
    try { ev = JSON.parse(data); } catch (e) { return; }
    if (ev.type === 'message_start' && ev.message && ev.message.usage) usage.input = ev.message.usage.input_tokens || 0;
    else if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { text += ev.delta.text; onDelta(ev.delta.text); }
    else if (ev.type === 'message_delta') { if (ev.usage) usage.output = ev.usage.output_tokens || usage.output; if (ev.delta) stopReason = ev.delta.stop_reason || stopReason; }
    else if (ev.type === 'error') throw new AiError(ev.error && ev.error.type === 'overloaded_error' ? 'rate_limited' : 'upstream_error', 'The AI service failed mid-answer. Try again.', 502);
  };
  try {
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 2); }
    }
    if (buf.trim()) handle(buf);
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e && e.name === 'AbortError') throw new AiError('cancelled', 'Cancelled.', 499);
    throw new AiError('upstream_error', 'The AI answer was interrupted.', 502);
  }
  if (stopReason === 'refusal') throw new AiError('refused', 'The AI declined this request. Try rewording it.', 422);
  return { text, content: [{ type: 'text', text }], stopReason, usage };
}

/** "data:image/png;base64,..." -> Claude image block, or null when invalid. */
function imageBlockFromDataUrl(url, maxBytes = 4 * 1024 * 1024) {
  const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(url || ''));
  if (!m) return null;
  if (Math.floor(m[2].length * 3 / 4) > maxBytes) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

module.exports = { callClaude, AiError, imageBlockFromDataUrl };
