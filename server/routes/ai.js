// AI endpoints. Prompts are built here from structured input (see core.js), never taken raw from the browser.
const H = require('../http');
const A = require('../auth');
const { callClaude, AiError, imageBlockFromDataUrl } = require('../ai');
const { savePostRow } = require('./workspace');

function register(r, ctx) {
  const { db, config, C } = ctx;

  /** Auth, switch, configuration and daily quota checks. Returns {user, voice}. */
  function guard(req) {
    const u = ctx.requireUser(req);
    const s = ctx.settings();
    if (!s.aiEnabled) throw new H.HttpError(403, 'ai_disabled', 'AI features are turned off by the admin.');
    if (!config.anthropicKey) throw new H.HttpError(503, 'not_configured', 'AI is not set up on this server yet.');
    if (u.role !== 'admin') {
      const limit = (s.aiDailyLimits && s.aiDailyLimits[u.plan]) || 0;
      const since = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
      const used = db.prepare('SELECT COUNT(*) n FROM ai_usage WHERE user_id = ? AND ok = 1 AND created_at >= ?').get(u.id, since).n;
      if (used >= limit) throw new H.HttpError(429, 'quota_exceeded', `You have used today's ${limit} AI requests. They reset at midnight UTC.`, { limit });
    }
    return { user: u, voice: (ctx.getWorkspace(u).voice) || {} };
  }

  const model = tier => (tier === 'best' || tier === 'default' ? config.modelBest : config.modelFast);
  function record(userId, kind, mdl, usage, ok) {
    db.prepare('INSERT INTO ai_usage (user_id, kind, model, input_tokens, output_tokens, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, kind, mdl, (usage && usage.input) || 0, (usage && usage.output) || 0, ok ? 1 : 0, new Date().toISOString());
  }
  const fail = e => (e instanceof AiError ? new H.HttpError(e.status, e.code, e.message) : e);

  /** Streams NDJSON lines: {"t":"d","v":text} ... then {"t":"end"} or {"t":"err","code","message"}. */
  async function stream(req, res, { user, kind, mdl, system, messages, maxTokens }) {
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableFinished) ctl.abort(); });
    try {
      const out = await callClaude(config, { model: mdl, system, messages, maxTokens, signal: ctl.signal, onDelta: d => res.write(JSON.stringify({ t: 'd', v: d }) + '\n') });
      record(user.id, kind, mdl, out.usage, true);
      res.end(JSON.stringify({ t: 'end', truncated: out.stopReason === 'max_tokens' }) + '\n');
    } catch (e) {
      record(user.id, kind, mdl, null, false);
      if (!res.writableEnded) res.end(JSON.stringify({ t: 'err', code: e.code || 'upstream_error', message: e.code ? e.message : 'The AI request failed.' }) + '\n');
    }
  }

  async function once(user, kind, mdl, prompt, maxTokens) {
    try {
      const out = await callClaude(config, { model: mdl, messages: [{ role: 'user', content: prompt }], maxTokens });
      record(user.id, kind, mdl, out.usage, true);
      return out.text;
    } catch (e) { record(user.id, kind, mdl, null, false); throw fail(e); }
  }

  r.post('/api/ai/generate', async (req, res) => {
    const { user, voice } = guard(req);
    const b = await H.readJson(req, 6 * 1024 * 1024);
    const brief = b.brief || {};
    const networks = (Array.isArray(brief.networks) ? brief.networks : []).map(String).filter(n => C.getNetwork(n));
    const idea = String(brief.idea || '').trim().slice(0, 4000);
    if (!idea) throw new H.HttpError(400, 'idea_required', 'Describe the post idea first.');
    if (!networks.length) throw new H.HttpError(400, 'networks_required', 'Pick at least one channel.');
    const img = b.image ? imageBlockFromDataUrl(b.image) : null;
    if (b.image && !img) throw new H.HttpError(400, 'image_rejected', 'That image could not be used. Use a JPEG, PNG, GIF or WebP under 4 MB.');
    const prompt = C.buildComposePrompt({
      idea, networks, tone: String(brief.tone || 'voice').slice(0, 30), lang: brief.lang, format: brief.format, length: brief.length,
      hashtags: brief.hashtags !== false, cta: brief.cta !== false, emoji: brief.emoji !== false, hasImage: !!img, slot: String(brief.slot || '').slice(0, 80)
    }, voice);
    const content = img ? [img, { type: 'text', text: prompt }] : prompt;
    await stream(req, res, { user, kind: 'generate', mdl: model(b.tier), messages: [{ role: 'user', content }], maxTokens: 400 + networks.length * 450 });
  });

  r.post('/api/ai/enhance', async (req, res) => {
    const { user, voice } = guard(req);
    const b = await H.readJson(req, 128 * 1024);
    if (!C.ENHANCE_ACTIONS[b.action]) throw new H.HttpError(400, 'bad_action', 'Unknown action.');
    const text = String(b.text || '').slice(0, 20000);
    if (!text.trim()) throw new H.HttpError(400, 'text_required', 'There is no text to improve.');
    const prompt = C.buildEnhancePrompt(b.action, text, C.getNetwork(b.network) ? b.network : 'instagram', voice);
    await stream(req, res, { user, kind: 'enhance', mdl: config.modelFast, messages: [{ role: 'user', content: prompt }], maxTokens: 1500 });
  });

  r.post('/api/ai/brief', async (req, res) => {
    const { user, voice } = guard(req);
    const b = await H.readJson(req, 64 * 1024);
    if (!['analytics', 'listening'].includes(b.kind)) throw new H.HttpError(400, 'bad_kind', 'Unknown brief.');
    const prompt = C.buildBriefPrompt(b.kind, b.data || {}, voice);
    await stream(req, res, { user, kind: 'brief', mdl: config.modelFast, messages: [{ role: 'user', content: prompt }], maxTokens: 700 });
  });

  r.post('/api/ai/hashtags', async (req, res) => {
    const { user, voice } = guard(req);
    const b = await H.readJson(req, 64 * 1024);
    const text = await once(user, 'hashtags', config.modelFast, C.buildHashtagPrompt(String(b.text || '').slice(0, 8000), b.network, voice), 300);
    const arr = C.parseJsonLoose(text);
    if (!Array.isArray(arr)) throw new H.HttpError(502, 'invalid_json', 'The AI answer came back in an unexpected format. Try again.');
    H.sendJson(res, 200, { tags: arr.map(String).map(t => t.trim()).filter(t => /^#[\p{L}\p{N}_]+$/u.test(t)).slice(0, 12) });
  });

  r.post('/api/ai/replies', async (req, res) => {
    const { user, voice } = guard(req);
    const b = await H.readJson(req, 64 * 1024);
    const c = b.conversation || {};
    const conv = {
      kind: String(c.kind || 'message').slice(0, 30), network: C.getNetwork(c.network) ? c.network : 'instagram', sentiment: String(c.sentiment || '').slice(0, 20),
      context: String(c.context || '').slice(0, 400), name: String(c.name || '').slice(0, 80),
      msgs: (Array.isArray(c.msgs) ? c.msgs : []).slice(-10).map(m => ({ me: !!m.me, text: String(m.text || '').slice(0, 2000) }))
    };
    if (!conv.msgs.length) throw new H.HttpError(400, 'no_messages', 'There is nothing to reply to.');
    const text = await once(user, 'replies', config.modelFast, C.buildRepliesPrompt(conv, voice), 800);
    const arr = C.parseJsonLoose(text);
    if (!Array.isArray(arr)) throw new H.HttpError(502, 'invalid_json', 'The AI answer came back in an unexpected format. Try again.');
    H.sendJson(res, 200, { replies: arr.filter(o => o && typeof o.text === 'string').slice(0, 3).map(o => ({ label: String(o.label || 'Reply').slice(0, 40), text: o.text.slice(0, 1000) })) });
  });

  r.post('/api/ai/ideas', async (req, res) => {
    const { user, voice } = guard(req);
    const b = await H.readJson(req, 64 * 1024);
    const existing = (Array.isArray(b.existing) ? b.existing : []).slice(0, 60).map(x => String(x).slice(0, 120));
    const text = await once(user, 'ideas', config.modelFast, C.buildIdeasPrompt({ pillars: String(b.pillars || '').slice(0, 300), existing, date: new Date() }, voice), 1400);
    const arr = C.parseJsonLoose(text);
    if (!Array.isArray(arr)) throw new H.HttpError(502, 'invalid_json', 'The AI answer came back in an unexpected format. Try again.');
    H.sendJson(res, 200, { ideas: arr.filter(o => o && o.title).slice(0, 8).map(o => ({ title: String(o.title).slice(0, 120), note: String(o.note || '').slice(0, 300), pillar: String(o.pillar || '').slice(0, 40), format: ['post', 'carousel', 'video', 'thread'].includes(o.format) ? o.format : 'post' })) });
  });

  r.post('/api/ai/chat', async (req, res) => {
    const { user, voice } = guard(req);
    const b = await H.readJson(req, 256 * 1024);
    const turns = [];
    for (const t of (Array.isArray(b.turns) ? b.turns : []).slice(-12)) {
      const role = t && t.role === 'assistant' ? 'assistant' : 'user';
      const content = String((t && t.content) || '').slice(0, 8000);
      if (!content.trim()) continue;
      if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].content += '\n\n' + content;
      else turns.push({ role, content });
    }
    while (turns.length && turns[0].role !== 'user') turns.shift();
    if (!turns.length || turns[turns.length - 1].role !== 'user') throw new H.HttpError(400, 'no_question', 'Ask a question first.');
    const system = C.buildChatSystem(b.summary || {}, voice, config.appName, true);
    const messages = turns.map(t => ({ role: t.role, content: t.content }));
    const drafts = [];
    const usage = { input: 0, output: 0 };
    const mdl = config.modelFast;
    let text = '';
    try {
      for (let round = 0; round < 5; round++) {
        const last = round === 4;
        const out = await callClaude(config, { model: mdl, system, messages, maxTokens: 1600, tools: [C.SAVE_DRAFT_TOOL], toolChoice: last ? { type: 'none' } : undefined });
        usage.input += out.usage.input; usage.output += out.usage.output;
        text = out.text;
        if (out.stopReason !== 'tool_use') break;
        messages.push({ role: 'assistant', content: out.content });
        const results = [];
        for (const block of out.content.filter(x => x.type === 'tool_use')) {
          try {
            if (block.name !== 'save_draft') throw new Error('Unknown tool.');
            const d = C.cleanDraftInput(block.input);
            const now = new Date().toISOString();
            const post = savePostRow(db, user.id, {
              id: A.newId('p'), networks: d.networks, variants: Object.fromEntries(d.networks.map(n => [n, d.text])), media: [], status: 'draft',
              scheduledAt: null, sentAt: null, idea: turns[turns.length - 1].content.slice(0, 300), format: 'post', altText: '', author: 'AI assistant', aiWritten: true, createdAt: now, stats: null
            });
            drafts.push(post);
            results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ saved: true, id: post.id }) });
          } catch (e) {
            results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Error: ' + e.message, is_error: true });
          }
        }
        messages.push({ role: 'user', content: results });
      }
      record(user.id, 'chat', mdl, usage, true);
    } catch (e) { record(user.id, 'chat', mdl, usage, false); throw fail(e); }
    H.sendJson(res, 200, { text, drafts });
  });
}

module.exports = { register };
