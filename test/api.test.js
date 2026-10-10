// Integration tests: real HTTP server, in-memory SQLite, and a mock Claude API.
// Run with: npm test
process.removeAllListeners('warning');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { loadConfig } = require('../server/config');
const { createApp } = require('../server/app');
const { runScheduler } = require('../server/scheduler');

/* ---------- mock Claude Messages API ---------- */
function startMockClaude() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      calls.push({ headers: req.headers, body });
      const last = body.messages[body.messages.length - 1];
      const lastText = typeof last.content === 'string' ? last.content : (last.content.find(b => b.type === 'text') || {}).text || '';
      if (lastText.includes('FAIL_AUTH')) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"type":"error","error":{"type":"authentication_error","message":"bad key"}}'); }
      if (body.stream) {
        let text = 'Rewritten post. #Brand';
        if (lastText.includes('one JSON object per line')) {
          const ids = [...lastText.matchAll(/^- (\w+) \(/gm)].map(m => m[1]);
          text = ids.map(id => JSON.stringify({ network: id, text: `Post for ${id}`, hashtags: [] })).join('\n');
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":11,"output_tokens":1}}}\n\n');
        for (const piece of text.match(/[\s\S]{1,7}/g)) res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } })}\n\n`);
        res.write('event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":22}}\n\n');
        res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
        return;
      }
      const reply = (content, stop) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ content, stop_reason: stop, usage: { input_tokens: 5, output_tokens: 7 } })); };
      if (body.tools) {
        const hasResult = Array.isArray(last.content) && last.content.some(b => b.type === 'tool_result');
        if (!hasResult) return reply([{ type: 'text', text: 'Saving.' }, { type: 'tool_use', id: 'tu_1', name: 'save_draft', input: { text: 'National Day teaser', networks: ['linkedin', 'bogus'] } }], 'tool_use');
        return reply([{ type: 'text', text: 'I saved one draft for LinkedIn.' }], 'end_turn');
      }
      if (lastText.includes('Suggest 8 hashtags')) return reply([{ type: 'text', text: 'Here: ["#Coffee", "#Dubai", "not a tag"]' }], 'end_turn');
      if (lastText.includes('3 alternative replies')) return reply([{ type: 'text', text: '[{"label":"Warm","text":"Thanks!"}]' }], 'end_turn');
      if (lastText.includes('content ideas')) return reply([{ type: 'text', text: '[{"title":"Idea A","note":"n","pillar":"Menu","format":"reel"}]' }], 'end_turn');
      return reply([{ type: 'text', text: 'ok' }], 'end_turn');
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` })));
}

/* ---------- harness ---------- */
async function startApp(env = {}) {
  const mock = await startMockClaude();
  const config = loadConfig({
    NODE_ENV: 'test', DB_FILE: ':memory:', SCHEDULER_MS: '0', ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: mock.url,
    ADMIN_EMAIL: 'owner@socialistem.com', ADMIN_PASSWORD: 'Owner-pass-123', LOGIN_MAX_ATTEMPTS: '3', ...env
  });
  const app = createApp(config, { noScheduler: true });
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    app, mock, base,
    async close() { app.close(); await new Promise(r => server.close(r)); await new Promise(r => mock.server.close(r)); },
    client() {
      let cookie = '';
      const call = async (method, path, body, headers = {}) => {
        const res = await fetch(base + path, {
          method, redirect: 'manual',
          headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), 'x-socialistem': '1', ...(cookie ? { cookie } : {}), ...headers },
          body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const set = res.headers.get('set-cookie');
        if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json() : await res.text();
        return { status: res.status, data, headers: res.headers };
      };
      return { call, get cookie() { return cookie; } };
    }
  };
}

async function member(t, name = 'Mona', email = 'mona@example.com') {
  const c = t.client();
  const r = await c.call('POST', '/api/auth/signup', { name, email, password: 'Secret-pass-1', brand: 'Mona Cafe' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return c;
}
async function admin(t) {
  const c = t.client();
  const r = await c.call('POST', '/api/auth/login', { email: 'owner@socialistem.com', password: 'Owner-pass-123' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return c;
}

/* ---------- tests ---------- */
test('health check and security headers', async () => {
  const t = await startApp();
  try {
    const r = await t.client().call('GET', '/healthz');
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
  } finally { await t.close(); }
});

test('sign up creates a member session with a default workspace', async () => {
  const t = await startApp();
  try {
    const c = await member(t);
    assert.match(c.cookie, /^sid=/);
    const me = await c.call('GET', '/api/auth/me');
    assert.equal(me.data.user.role, 'member');
    assert.equal(me.data.user.email, 'mona@example.com');
    const ws = await c.call('GET', '/api/workspace');
    assert.equal(ws.data.workspace.voice.brand, 'Mona Cafe');
    assert.equal(ws.data.workspace.schedule.length, 7);
    assert.deepEqual(ws.data.posts, []);
  } finally { await t.close(); }
});

test('sign up validates input and rejects duplicates', async () => {
  const t = await startApp();
  try {
    const c = t.client();
    assert.equal((await c.call('POST', '/api/auth/signup', { name: 'A', email: 'bad', password: 'Secret-pass-1' })).data.code, 'bad_email');
    assert.equal((await c.call('POST', '/api/auth/signup', { name: 'A', email: 'a@b.co', password: 'short' })).data.code, 'weak_password');
    assert.equal((await c.call('POST', '/api/auth/signup', { name: 'A', email: 'a@b.co', password: 'longpassword' })).data.code, 'weak_password');
    await member(t, 'A', 'a@b.co');
    const dup = await t.client().call('POST', '/api/auth/signup', { name: 'A', email: 'A@B.co', password: 'Secret-pass-1' });
    assert.equal(dup.status, 409);
  } finally { await t.close(); }
});

test('login, wrong password, logout and rate limiting', async () => {
  const t = await startApp();
  try {
    await member(t);
    const c = t.client();
    assert.equal((await c.call('POST', '/api/auth/login', { email: 'mona@example.com', password: 'nope' })).status, 401);
    assert.equal((await c.call('POST', '/api/auth/login', { email: 'MONA@example.com', password: 'Secret-pass-1' })).status, 200);
    assert.equal((await c.call('GET', '/api/auth/me')).status, 200);
    await c.call('POST', '/api/auth/logout', {});
    assert.equal((await c.call('GET', '/api/auth/me')).status, 401);
    const bad = t.client();
    for (let i = 0; i < 3; i++) await bad.call('POST', '/api/auth/login', { email: 'mona@example.com', password: 'wrong' });
    const blocked = await bad.call('POST', '/api/auth/login', { email: 'mona@example.com', password: 'Secret-pass-1' });
    assert.equal(blocked.status, 429);
  } finally { await t.close(); }
});

test('state-changing requests need the CSRF header and a same-site origin', async () => {
  const t = await startApp();
  try {
    const noHeader = await fetch(t.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(noHeader.status, 403);
    const evil = await fetch(t.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-socialistem': '1', origin: 'https://evil.example' }, body: '{}' });
    assert.equal(evil.status, 403);
  } finally { await t.close(); }
});

test('posts and ideas are private to their owner', async () => {
  const t = await startApp();
  try {
    const a = await member(t, 'A', 'a@example.com');
    const b = await member(t, 'B', 'b@example.com');
    const post = { networks: ['linkedin', 'myspace'], variants: { linkedin: 'Hello' }, status: 'scheduled', scheduledAt: '2030-01-01T09:00:00Z', media: [{ thumb: 'javascript:alert(1)' }] };
    const put = await a.call('PUT', '/api/posts/p_abc123', { post });
    assert.equal(put.status, 200);
    assert.deepEqual(put.data.post.networks, ['linkedin']);
    assert.deepEqual(put.data.post.media, []);
    assert.equal((await a.call('GET', '/api/workspace')).data.posts.length, 1);
    assert.equal((await b.call('GET', '/api/workspace')).data.posts.length, 0);
    assert.equal((await b.call('PUT', '/api/posts/p_abc123', { post })).status, 404);
    await b.call('DELETE', '/api/posts/p_abc123');
    assert.equal((await a.call('GET', '/api/workspace')).data.posts.length, 1);
    assert.equal((await a.call('PUT', '/api/posts/p_x', { post: { networks: ['x'], status: 'scheduled' } })).status, 400);
    assert.equal((await a.call('PUT', '/api/ideas/i_1', { idea: { title: 'Idea', col: 'ready' } })).data.idea.col, 'ready');
    assert.equal((await b.call('GET', '/api/workspace')).data.ideas.length, 0);
    await a.call('DELETE', '/api/posts/p_abc123');
    assert.equal((await a.call('GET', '/api/workspace')).data.posts.length, 0);
  } finally { await t.close(); }
});

test('workspace settings are sanitised', async () => {
  const t = await startApp();
  try {
    const c = await member(t);
    const r = await c.call('PUT', '/api/workspace', { workspace: { schedule: [['25:00', '09:00', '09:00'], [], [], [], [], [], ['7:30']], voice: { brand: 'X'.repeat(1000), lang: 'fr' }, connected: { x: 1, bogus: true }, keywords: ['a', '', 'b'] } });
    assert.deepEqual(r.data.workspace.schedule[0], ['09:00']);
    assert.deepEqual(r.data.workspace.schedule[6], ['07:30']);
    assert.equal(r.data.workspace.voice.brand.length, 600);
    assert.equal(r.data.workspace.voice.lang, 'en');
    assert.equal(r.data.workspace.connected.x, true);
    assert.equal('bogus' in r.data.workspace.connected, false);
    assert.deepEqual(r.data.workspace.keywords, ['a', 'b']);
  } finally { await t.close(); }
});

test('members cannot reach admin pages or APIs; admins can', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    assert.equal((await m.call('GET', '/api/admin/overview')).status, 403);
    const page = await m.call('GET', '/admin');
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('location'), '/app');
    const anon = await t.client().call('GET', '/app');
    assert.equal(anon.headers.get('location'), '/login?next=/app');
    const a = await admin(t);
    const o = await a.call('GET', '/api/admin/overview');
    assert.equal(o.status, 200);
    assert.equal(o.data.users.total, 2);
    assert.equal(o.data.series.days.length, 30);
    assert.equal((await a.call('GET', '/admin')).status, 200);
  } finally { await t.close(); }
});

test('admin manages users: suspend, plan, reset password, protections', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const a = await admin(t);
    const list = await a.call('GET', '/api/admin/users?q=mona');
    assert.equal(list.data.total, 1);
    const id = list.data.users[0].id;
    const sus = await a.call('PATCH', `/api/admin/users/${id}`, { status: 'suspended', plan: 'pro' });
    assert.equal(sus.data.user.status, 'suspended');
    assert.equal(sus.data.user.plan, 'pro');
    assert.equal((await m.call('GET', '/api/auth/me')).status, 401, 'suspension ends existing sessions');
    assert.equal((await t.client().call('POST', '/api/auth/login', { email: 'mona@example.com', password: 'Secret-pass-1' })).data.code, 'suspended');
    await a.call('PATCH', `/api/admin/users/${id}`, { status: 'active' });
    const reset = await a.call('POST', `/api/admin/users/${id}/reset-password`, {});
    assert.match(reset.data.tempPassword, /^[a-z]+-[a-z]+-\d{4}$/);
    assert.equal((await t.client().call('POST', '/api/auth/login', { email: 'mona@example.com', password: reset.data.tempPassword })).status, 200);
    const meId = (await a.call('GET', '/api/auth/me')).data.user.id;
    assert.equal((await a.call('PATCH', `/api/admin/users/${meId}`, { role: 'member' })).data.code, 'self');
    assert.equal((await a.call('DELETE', `/api/admin/users/${meId}`)).data.code, 'self');
    const created = await a.call('POST', '/api/admin/users', { email: 'new@example.com', name: 'New', role: 'admin' });
    assert.equal(created.status, 201);
    assert.equal(created.data.user.role, 'admin');
    assert.equal((await a.call('DELETE', `/api/admin/users/${id}`)).status, 200);
    const acts = await a.call('GET', '/api/admin/activity');
    assert.ok(acts.data.activity.some(x => x.action === 'admin.user_deleted'));
  } finally { await t.close(); }
});

test('admin settings: closing sign-ups and AI limits take effect', async () => {
  const t = await startApp();
  try {
    const a = await admin(t);
    const s = await a.call('PUT', '/api/admin/settings', { settings: { signupsOpen: false, aiDailyLimits: { free: 1, pro: 5, business: -3 }, announcement: 'Maintenance at 22:00' } });
    assert.equal(s.data.settings.aiDailyLimits.business, 0);
    const closed = await t.client().call('POST', '/api/auth/signup', { name: 'Z', email: 'z@example.com', password: 'Secret-pass-1' });
    assert.equal(closed.data.code, 'signups_closed');
    await a.call('PUT', '/api/admin/settings', { settings: { signupsOpen: true } });
    const m = await member(t);
    assert.equal((await m.call('GET', '/api/workspace')).data.announcement, 'Maintenance at 22:00');
    assert.equal((await m.call('POST', '/api/ai/hashtags', { text: 'Coffee', network: 'instagram' })).status, 200);
    const over = await m.call('POST', '/api/ai/hashtags', { text: 'Coffee', network: 'instagram' });
    assert.equal(over.status, 429);
    assert.equal(over.data.code, 'quota_exceeded');
    await a.call('PUT', '/api/admin/settings', { settings: { aiEnabled: false } });
    assert.equal((await a.call('POST', '/api/ai/hashtags', { text: 'x' })).data.code, 'ai_disabled');
  } finally { await t.close(); }
});

test('AI generate streams one variant per channel and records usage', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const r = await m.call('POST', '/api/ai/generate', { brief: { idea: 'Launch cold brew', networks: ['x', 'linkedin', 'nope'] }, tier: 'best' });
    assert.equal(r.status, 200);
    const lines = r.data.trim().split('\n').map(l => JSON.parse(l));
    assert.equal(lines[lines.length - 1].t, 'end');
    const text = lines.filter(l => l.t === 'd').map(l => l.v).join('');
    assert.deepEqual(text.split('\n').map(l => JSON.parse(l).network), ['x', 'linkedin']);
    const call = t.mock.calls[t.mock.calls.length - 1];
    assert.equal(call.headers['x-api-key'], 'test-key');
    assert.equal(call.headers['anthropic-version'], '2023-06-01');
    assert.equal(call.body.model, 'claude-sonnet-5-5');
    assert.match(call.body.messages[0].content, /Brand: Mona Cafe/);
    const usage = await m.call('GET', '/api/account/usage');
    assert.equal(usage.data.today, 1);
    assert.equal(usage.data.monthTokens, 33);
  } finally { await t.close(); }
});

test('AI generate accepts a valid image and rejects a bad one', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const ok = await m.call('POST', '/api/ai/generate', { brief: { idea: 'Photo post', networks: ['instagram'] }, image: png });
    assert.equal(ok.status, 200);
    const sent = t.mock.calls[t.mock.calls.length - 1].body.messages[0].content;
    assert.equal(sent[0].type, 'image');
    assert.equal(sent[0].source.media_type, 'image/png');
    const bad = await m.call('POST', '/api/ai/generate', { brief: { idea: 'x', networks: ['x'] }, image: 'data:text/html;base64,PHNjcmlwdD4=' });
    assert.equal(bad.data.code, 'image_rejected');
  } finally { await t.close(); }
});

test('AI enhance, hashtags, replies and ideas return clean data', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const enh = await m.call('POST', '/api/ai/enhance', { action: 'shorten', text: 'Long post', network: 'x' });
    const joined = enh.data.trim().split('\n').map(l => JSON.parse(l)).filter(l => l.t === 'd').map(l => l.v).join('');
    assert.equal(joined, 'Rewritten post. #Brand');
    assert.equal((await m.call('POST', '/api/ai/enhance', { action: 'hack', text: 'x' })).status, 400);
    assert.deepEqual((await m.call('POST', '/api/ai/hashtags', { text: 'Coffee', network: 'instagram' })).data.tags, ['#Coffee', '#Dubai']);
    assert.equal((await m.call('POST', '/api/ai/replies', { conversation: { network: 'x', msgs: [{ text: 'Hi' }] } })).data.replies[0].label, 'Warm');
    assert.equal((await m.call('POST', '/api/ai/ideas', { pillars: 'Menu' })).data.ideas[0].format, 'post');
  } finally { await t.close(); }
});

test('AI chat runs the save_draft tool and stores the draft for that member only', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const r = await m.call('POST', '/api/ai/chat', { turns: [{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'Draft a National Day post' }], summary: { queue: [] } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.text, 'I saved one draft for LinkedIn.');
    assert.equal(r.data.drafts.length, 1);
    assert.deepEqual(r.data.drafts[0].networks, ['linkedin']);
    const ws = await m.call('GET', '/api/workspace');
    assert.equal(ws.data.posts[0].status, 'draft');
    const rounds = t.mock.calls.filter(c => c.body.tools);
    assert.equal(rounds.length, 2);
    assert.equal(rounds[1].body.messages[rounds[1].body.messages.length - 1].content[0].type, 'tool_result');
  } finally { await t.close(); }
});

test('AI errors map to clear codes', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const r = await m.call('POST', '/api/ai/hashtags', { text: 'FAIL_AUTH', network: 'x' });
    assert.equal(r.data.code, 'not_configured');
    const t2 = await startApp({ ANTHROPIC_API_KEY: '' });
    try {
      const m2 = await member(t2);
      const r2 = await m2.call('POST', '/api/ai/generate', { brief: { idea: 'x', networks: ['x'] } });
      assert.equal(r2.status, 503);
      assert.equal(r2.data.code, 'not_configured');
    } finally { await t2.close(); }
  } finally { await t.close(); }
});

test('the scheduler publishes due posts only', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const past = new Date(Date.now() - 60000).toISOString(), future = new Date(Date.now() + 3600000).toISOString();
    await m.call('PUT', '/api/posts/p_due', { post: { networks: ['x'], variants: { x: 'a' }, status: 'scheduled', scheduledAt: past } });
    await m.call('PUT', '/api/posts/p_later', { post: { networks: ['x'], variants: { x: 'b' }, status: 'scheduled', scheduledAt: future } });
    assert.equal(runScheduler(t.app.db), 1);
    const posts = (await m.call('GET', '/api/workspace')).data.posts;
    assert.equal(posts.find(p => p.id === 'p_due').status, 'sent');
    assert.equal(posts.find(p => p.id === 'p_later').status, 'scheduled');
    assert.equal(runScheduler(t.app.db), 0);
  } finally { await t.close(); }
});

test('pages, static files and path traversal', async () => {
  const t = await startApp();
  try {
    const c = t.client();
    assert.equal((await c.call('GET', '/')).status, 200);
    assert.equal((await c.call('GET', '/login')).status, 200);
    assert.equal((await c.call('GET', '/assets/core.js')).status, 200);
    assert.equal((await c.call('GET', '/assets/..%2f..%2fserver%2fconfig.js')).status, 404);
    assert.equal((await c.call('GET', '/assets/../package.json')).status, 404);
    assert.equal((await c.call('GET', '/nope')).status, 404);
    const m = await member(t);
    assert.equal((await m.call('GET', '/login')).headers.get('location'), '/app');
  } finally { await t.close(); }
});

test('members can change their password and delete their account', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const other = t.client();
    await other.call('POST', '/api/auth/login', { email: 'mona@example.com', password: 'Secret-pass-1' });
    assert.equal((await m.call('POST', '/api/account/password', { current: 'wrong', next: 'Newpass-123' })).data.code, 'bad_password');
    assert.equal((await m.call('POST', '/api/account/password', { current: 'Secret-pass-1', next: 'Newpass-123' })).status, 200);
    assert.equal((await other.call('GET', '/api/auth/me')).status, 401, 'other sessions end');
    assert.equal((await m.call('GET', '/api/auth/me')).status, 200, 'this session stays');
    assert.equal((await m.call('PATCH', '/api/account', { name: 'Mona B', brand: 'New Brand' })).data.user.brand, 'New Brand');
    assert.equal((await m.call('DELETE', '/api/account', { password: 'Newpass-123' })).status, 200);
    assert.equal((await t.client().call('POST', '/api/auth/login', { email: 'mona@example.com', password: 'Newpass-123' })).status, 401);
    const a = await admin(t);
    assert.equal((await a.call('DELETE', '/api/account', { password: 'Owner-pass-123' })).data.code, 'last_admin');
  } finally { await t.close(); }
});
