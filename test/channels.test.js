// Channel connection and publishing tests against a mock of the LinkedIn, X, Meta and Threads APIs.
// Run with: npm test
process.removeAllListeners('warning');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const { loadConfig } = require('../server/config');
const { createApp } = require('../server/app');
const { runScheduler } = require('../server/scheduler');
const { startMockNetworks } = require('./mock-networks');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(200), Buffer.from([0xff, 0xd9])]);
const JPEG_URL = 'data:image/jpeg;base64,' + JPEG.toString('base64');

/* ---------- harness ---------- */
async function startApp(env = {}, { providers = true } = {}) {
  const mock = await startMockNetworks();
  const config = loadConfig({
    NODE_ENV: 'test', DB_FILE: ':memory:', SCHEDULER_MS: '0', ANTHROPIC_API_KEY: 'k', PUBLISH_POLL_MS: '1',
    ADMIN_EMAIL: 'owner@socialistem.com', ADMIN_PASSWORD: 'Owner-pass-123',
    ...(providers ? {
      LINKEDIN_CLIENT_ID: 'li-id', LINKEDIN_CLIENT_SECRET: 'li-secret', X_CLIENT_ID: 'x-id', X_CLIENT_SECRET: 'x-secret',
      META_APP_ID: 'fb-id', META_APP_SECRET: 'fb-secret', THREADS_APP_ID: 'th-id', THREADS_APP_SECRET: 'th-secret'
    } : {}),
    ...env
  });
  config.providerUrls = {
    linkedinAuth: mock.url + '/li/auth', linkedinToken: mock.url + '/li/token', linkedinApi: mock.url + '/li',
    xAuth: mock.url + '/x/auth', xApi: mock.url + '/x', metaAuth: mock.url + '/fb/dialog', metaGraph: mock.url + '/fb',
    threadsAuth: mock.url + '/th/auth', threadsGraph: mock.url + '/th'
  };
  let app;
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicUrl = base;
  app = createApp(config, { noScheduler: true });
  return {
    app, mock, base,
    async close() { app.close(); await new Promise(r => server.close(r)); await new Promise(r => mock.server.close(r)); },
    client() {
      let cookie = '';
      const call = async (method, path, body) => {
        const res = await fetch(base + path, {
          method, redirect: 'manual',
          headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), 'x-socialistem': '1', ...(cookie ? { cookie } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const set = res.headers.get('set-cookie');
        if (set) cookie = set.split(';')[0];
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json() : await res.text();
        return { status: res.status, data, headers: res.headers };
      };
      return { call };
    }
  };
}

async function member(t, email = 'mona@example.com') {
  const c = t.client();
  const r = await c.call('POST', '/api/auth/signup', { name: 'Mona', email, password: 'Secret-pass-1', brand: 'Mona Cafe' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return c;
}

/** Walk the OAuth dance the way a browser would: Socialistem → network → callback. */
async function connect(t, c, provider, code) {
  const start = await c.call('GET', '/auth/connect/' + provider);
  assert.equal(start.status, 302, 'connect redirects');
  const authUrl = new URL(start.headers.get('location'));
  assert.ok(authUrl.href.startsWith(t.mock.url), 'goes to the network: ' + authUrl.href);
  assert.equal(authUrl.searchParams.get('redirect_uri'), `${t.base}/auth/callback/${provider}`);
  if (provider === 'x') t.mock.state.xChallenge = authUrl.searchParams.get('code_challenge');
  const back = await c.call('GET', `/auth/callback/${provider}?code=${code}&state=${encodeURIComponent(authUrl.searchParams.get('state'))}`);
  assert.equal(back.status, 302);
  return { location: back.headers.get('location'), authUrl };
}

async function savePost(c, id, networks, { text = 'Hello from Socialistem', media = [], status = 'draft', scheduledAt } = {}) {
  const variants = Object.fromEntries(networks.map(n => [n, `${text} (${n})`]));
  const r = await c.call('PUT', '/api/posts/' + id, { post: { networks, variants, media, status, scheduledAt } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.post;
}

/* ---------- tests ---------- */
test('channels that are not set up say so instead of failing', async () => {
  const t = await startApp({}, { providers: false });
  try {
    const m = await member(t);
    const ch = await m.call('GET', '/api/channels');
    assert.equal(ch.status, 200);
    assert.deepEqual(ch.data.providers.map(p => [p.id, p.configured]), [['linkedin', false], ['x', false], ['meta', false], ['threads', false]]);
    const r = await m.call('GET', '/auth/connect/linkedin');
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location'), /^\/app\?channel_error=.*not%20set%20up.*#settings$/);
    assert.match((await m.call('GET', '/auth/connect/nope')).headers.get('location'), /channel_error=Unknown/);
    assert.equal((await t.client().call('GET', '/auth/connect/linkedin')).headers.get('location'), '/login?next=/app', 'logged-out users go to login');
  } finally { await t.close(); }
});

test('LinkedIn: connect, then publish text and an image', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const { location, authUrl } = await connect(t, m, 'linkedin', 'li-code');
    assert.equal(location, '/app?connected=linkedin#settings');
    assert.equal(authUrl.searchParams.get('scope'), 'openid profile w_member_social');
    const conns = (await m.call('GET', '/api/channels')).data.connections;
    assert.equal(conns.length, 1);
    assert.equal(conns[0].name, 'Mona Linked');
    assert.equal(conns[0].active, true);

    const up = await m.call('POST', '/api/media', { dataUrl: JPEG_URL });
    assert.equal(up.status, 200);
    await savePost(m, 'p_li', ['linkedin'], { media: [{ thumb: JPEG_URL, mediaId: up.data.id }] });
    const r = await m.call('POST', '/api/posts/p_li/publish');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.post.status, 'sent');
    assert.equal(r.data.post.results.linkedin.ok, true);
    assert.equal(r.data.post.results.linkedin.url, 'https://www.linkedin.com/feed/update/urn:li:share:999');

    const ugc = t.mock.find('/li/v2/ugcPosts')[0];
    assert.equal(ugc.token, 'li-token');
    assert.equal(ugc.headers['x-restli-protocol-version'], '2.0.0');
    assert.equal(ugc.body.author, 'urn:li:person:li-member-1');
    const share = ugc.body.specificContent['com.linkedin.ugc.ShareContent'];
    assert.equal(share.shareCommentary.text, 'Hello from Socialistem (linkedin)');
    assert.equal(share.media[0].media, 'urn:li:digitalmediaAsset:A1');
    assert.ok(t.mock.find('/li/upload', 'PUT')[0].raw.equals(JPEG), 'uploads the exact image bytes');

    assert.equal((await m.call('POST', '/api/posts/p_li/publish')).data.code, 'already_sent', 'never posts twice');
  } finally { await t.close(); }
});

test('X: PKCE connect, image tweet, token refresh and reconnect on revoked access', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const { location, authUrl } = await connect(t, m, 'x', 'x-code');
    assert.equal(location, '/app?connected=x#settings');
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.match(authUrl.searchParams.get('scope'), /tweet\.write.*media\.write.*offline\.access/);

    const up = await m.call('POST', '/api/media', { dataUrl: JPEG_URL });
    await savePost(m, 'p_x', ['x'], { media: [{ thumb: JPEG_URL, mediaId: up.data.id }] });
    const r = await m.call('POST', '/api/posts/p_x/publish');
    assert.equal(r.data.post.status, 'sent', JSON.stringify(r.data));
    assert.equal(r.data.post.results.x.url, 'https://x.com/mona/status/1001');
    const tweet = t.mock.find('/x/2/tweets')[0];
    assert.deepEqual(tweet.body, { text: 'Hello from Socialistem (x)', media: { media_ids: ['777'] } });
    assert.equal(tweet.token, 'x-token-1');

    // The access token is about to expire: it is refreshed before posting.
    t.app.db.prepare("UPDATE connections SET expires_at = ? WHERE network = 'x'").run(new Date(Date.now() + 60000).toISOString());
    await savePost(m, 'p_x2', ['x']);
    assert.equal((await m.call('POST', '/api/posts/p_x2/publish')).data.post.status, 'sent');
    assert.equal(t.mock.find('/x/2/tweets')[1].token, 'x-token-2');

    // The member revoked access on X: the post fails clearly and the channel asks to reconnect.
    t.mock.state.revoked.add('x-token-2');
    await savePost(m, 'p_x3', ['x']);
    const failed = await m.call('POST', '/api/posts/p_x3/publish');
    assert.equal(failed.data.post.status, 'failed');
    assert.equal(failed.data.post.results.x.code, 'reconnect');
    assert.match(failed.data.post.results.x.error, /Reconnect/);
    assert.equal((await m.call('GET', '/api/channels')).data.connections[0].status, 'reconnect');

    // Reconnect, then retry the failed post.
    t.mock.state.revoked.clear();
    await connect(t, m, 'x', 'x-code');
    const conn = (await m.call('GET', '/api/channels')).data.connections;
    assert.equal(conn.length, 1, 'reconnecting updates the same account');
    assert.equal(conn[0].status, 'ok');
    const retry = await m.call('POST', '/api/posts/p_x3/publish');
    assert.equal(retry.data.post.status, 'sent');
  } finally { await t.close(); }
});

test('Facebook + Instagram: one login connects the Page and its Instagram account', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const { location, authUrl } = await connect(t, m, 'meta', 'fb-code');
    assert.equal(location, '/app?connected=facebook%2Cinstagram#settings');
    assert.match(authUrl.searchParams.get('scope'), /pages_manage_posts.*instagram_content_publish/);
    const conns = (await m.call('GET', '/api/channels')).data.connections;
    assert.deepEqual(conns.map(c => [c.network, c.name]).sort(), [['facebook', 'Mona Cafe'], ['instagram', '@monacafe']]);

    // Instagram without an image fails with a clear reason; Facebook still goes out.
    await savePost(m, 'p_fb', ['facebook', 'instagram']);
    const first = await m.call('POST', '/api/posts/p_fb/publish');
    assert.equal(first.data.post.status, 'failed');
    assert.equal(first.data.post.results.facebook.ok, true);
    assert.equal(first.data.post.results.facebook.url, 'https://www.facebook.com/page1_55');
    assert.equal(first.data.post.results.instagram.code, 'needs_media');
    assert.equal(t.mock.find('/fb/v25.0/page1/feed')[0].token, 'page-token');

    // Add an image and retry: only Instagram is posted, Facebook is not posted twice.
    const up = await m.call('POST', '/api/media', { dataUrl: JPEG_URL });
    await savePost(m, 'p_fb', ['facebook', 'instagram'], { media: [{ thumb: JPEG_URL, mediaId: up.data.id }], status: 'failed' });
    const retry = await m.call('POST', '/api/posts/p_fb/publish');
    assert.equal(retry.data.post.status, 'sent', JSON.stringify(retry.data.post.results));
    assert.equal(retry.data.post.results.instagram.url, 'https://www.instagram.com/p/abc/');
    assert.equal(t.mock.find('/fb/v25.0/page1/feed').length, 1, 'Facebook posted once');
    assert.equal(t.mock.find('/fb/v25.0/ig1/media')[0].body.image_url, `${t.base}/media/${up.data.id}.jpg`);
    assert.deepEqual(t.mock.state.fetchedImages, [{ status: 200, type: 'image/jpeg', jpeg: true }], 'Instagram could download the image');
    assert.ok(t.mock.state.igPolls >= 2, 'waits for the media container to finish');
  } finally { await t.close(); }
});

test('Threads: connect, publish and refresh the long-lived token', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    assert.equal((await connect(t, m, 'threads', 'th-code')).location, '/app?connected=threads#settings');
    await savePost(m, 'p_th', ['threads']);
    const r = await m.call('POST', '/api/posts/p_th/publish');
    assert.equal(r.data.post.status, 'sent', JSON.stringify(r.data));
    assert.equal(r.data.post.results.threads.url, 'https://www.threads.net/@mona.th/post/thp1');
    const create = t.mock.find('/th/v1.0/9/threads')[0];
    assert.deepEqual([create.body.media_type, create.body.text, create.token], ['TEXT', 'Hello from Socialistem (threads)', 'th-long']);

    t.app.db.prepare("UPDATE connections SET expires_at = ? WHERE network = 'threads'").run(new Date(Date.now() + 1000).toISOString());
    await savePost(m, 'p_th2', ['threads']);
    assert.equal((await m.call('POST', '/api/posts/p_th2/publish')).data.post.status, 'sent');
    assert.equal(t.mock.find('/th/v1.0/9/threads')[1].token, 'th-long-2');
  } finally { await t.close(); }
});

test('OAuth state is single-use, short-lived and tied to the member who started it', async () => {
  const t = await startApp();
  try {
    const a = await member(t, 'a@example.com');
    const b = await member(t, 'b@example.com');
    const start = await a.call('GET', '/auth/connect/linkedin');
    const st = new URL(start.headers.get('location')).searchParams.get('state');
    const stolen = await b.call('GET', `/auth/callback/linkedin?code=li-code&state=${st}`);
    assert.match(stolen.headers.get('location'), /channel_error=.*expired/, 'another member cannot use the link');
    const reused = await a.call('GET', `/auth/callback/linkedin?code=li-code&state=${st}`);
    assert.match(reused.headers.get('location'), /channel_error/, 'state is gone after one use');
    const s2 = new URL((await a.call('GET', '/auth/connect/linkedin')).headers.get('location')).searchParams.get('state');
    const cancelled = await a.call('GET', `/auth/callback/linkedin?error=user_cancelled_login&state=${s2}`);
    assert.match(cancelled.headers.get('location'), /channel_error=The%20connection%20was%20cancelled/);
    const s3 = new URL((await a.call('GET', '/auth/connect/linkedin')).headers.get('location')).searchParams.get('state');
    t.app.db.prepare('UPDATE oauth_states SET created_at = ?').run(new Date(Date.now() - 20 * 60000).toISOString());
    assert.match((await a.call('GET', `/auth/callback/linkedin?code=li-code&state=${s3}`)).headers.get('location'), /channel_error=.*expired/);
    const bad = await a.call('GET', '/auth/callback/linkedin?code=wrong&state=' + new URL((await a.call('GET', '/auth/connect/linkedin')).headers.get('location')).searchParams.get('state'));
    assert.match(bad.headers.get('location'), /channel_error=bad%20code/, 'network errors are passed on');
    assert.equal((await a.call('GET', '/api/channels')).data.connections.length, 0);
  } finally { await t.close(); }
});

test('members only see and control their own channels, posts and tokens', async () => {
  const t = await startApp();
  try {
    const a = await member(t, 'a@example.com');
    const b = await member(t, 'b@example.com');
    await connect(t, a, 'linkedin', 'li-code');
    const id = (await a.call('GET', '/api/channels')).data.connections[0].id;
    assert.equal((await b.call('GET', '/api/channels')).data.connections.length, 0);
    assert.equal((await b.call('DELETE', '/api/channels/' + id)).status, 404);
    assert.equal((await b.call('POST', `/api/channels/${id}/active`)).status, 404);
    await savePost(a, 'p_a', ['linkedin']);
    assert.equal((await b.call('POST', '/api/posts/p_a/publish')).status, 404);
    // b has no LinkedIn account: publishing fails with a clear message, not a crash
    await savePost(b, 'p_b', ['linkedin']);
    const r = await b.call('POST', '/api/posts/p_b/publish');
    assert.equal(r.data.post.status, 'failed');
    assert.match(r.data.post.results.linkedin.error, /No LinkedIn account is connected/);
    // tokens are encrypted at rest and never sent to the browser
    const row = t.app.db.prepare('SELECT token_enc FROM connections').get();
    assert.ok(row.token_enc && !row.token_enc.includes('li-token'));
    assert.ok(!JSON.stringify((await a.call('GET', '/api/workspace')).data).includes('li-token'));
    assert.equal((await a.call('DELETE', '/api/channels/' + id)).data.connections.length, 0);
  } finally { await t.close(); }
});

test('members cannot mark posts as published themselves', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    const p = await savePost(m, 'p_fake', ['x'], { status: 'sent' });
    assert.equal(p.status, 'draft');
    const r = await m.call('PUT', '/api/posts/p_fake', { post: { networks: ['x'], variants: { x: 'hi' }, status: 'scheduled', scheduledAt: new Date().toISOString(), results: { x: { ok: true } } } });
    assert.equal(r.data.post.status, 'scheduled');
    assert.equal(r.data.post.results, undefined, 'results come only from the publisher');
  } finally { await t.close(); }
});

test('the scheduler publishes due posts through the connected account exactly once', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    await connect(t, m, 'linkedin', 'li-code');
    const past = new Date(Date.now() - 60000).toISOString(), future = new Date(Date.now() + 3600000).toISOString();
    await savePost(m, 'p_due', ['linkedin'], { status: 'scheduled', scheduledAt: past });
    await savePost(m, 'p_later', ['linkedin'], { status: 'scheduled', scheduledAt: future });
    const [n1, n2] = await Promise.all([runScheduler(t.app.ctx), runScheduler(t.app.ctx)]);
    assert.equal(n1 + n2, 1);
    assert.equal(await runScheduler(t.app.ctx), 0);
    assert.equal(t.mock.find('/li/v2/ugcPosts').length, 1, 'posted once');
    const posts = (await m.call('GET', '/api/workspace')).data.posts;
    assert.equal(posts.find(p => p.id === 'p_due').status, 'sent');
    assert.equal(posts.find(p => p.id === 'p_later').status, 'scheduled');
    // A member editing a published post cannot put it back in the queue.
    await savePost(m, 'p_due', ['linkedin'], { status: 'scheduled', scheduledAt: past });
    assert.equal(await runScheduler(t.app.ctx), 0);
  } finally { await t.close(); }
});

test('practice mode marks unconnected networks as simulated; admins see channel stats', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    await savePost(m, 'p_prac', ['instagram']);
    assert.equal((await m.call('POST', '/api/posts/p_prac/publish')).data.post.status, 'failed');
    const admin = t.client();
    await admin.call('POST', '/api/auth/login', { email: 'owner@socialistem.com', password: 'Owner-pass-123' });
    assert.equal((await m.call('PUT', '/api/admin/settings', { settings: { practiceMode: true } })).status, 403);
    assert.equal((await admin.call('PUT', '/api/admin/settings', { settings: { practiceMode: true } })).data.settings.practiceMode, true);
    const r = await m.call('POST', '/api/posts/p_prac/publish');
    assert.equal(r.data.post.status, 'sent');
    assert.equal(r.data.post.results.instagram.simulated, true);
    assert.equal((await m.call('GET', '/api/channels')).data.practiceMode, true);
    await connect(t, m, 'linkedin', 'li-code');
    const ov = (await admin.call('GET', '/api/admin/overview')).data;
    assert.equal(ov.channels.byNetwork.linkedin, 1);
    assert.equal(ov.channels.practiceMode, true);
    assert.equal(ov.channels.providers.find(p => p.id === 'meta').configured, true);
    const users = (await admin.call('GET', '/api/admin/users')).data.users;
    assert.equal(users.find(u => u.email === 'mona@example.com').channels, 1);
  } finally { await t.close(); }
});

test('image uploads are validated and served publicly for the networks', async () => {
  const t = await startApp();
  try {
    const m = await member(t);
    assert.equal((await m.call('POST', '/api/media', { dataUrl: 'data:text/html;base64,PGgxPg==' })).status, 400);
    assert.equal((await m.call('POST', '/api/media', { dataUrl: 'data:image/jpeg;base64,' + Buffer.from('<svg>').toString('base64') })).status, 400);
    assert.equal((await t.client().call('POST', '/api/media', { dataUrl: JPEG_URL })).status, 401);
    const up = await m.call('POST', '/api/media', { dataUrl: JPEG_URL });
    const res = await fetch(up.data.url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(JPEG));
    assert.equal((await fetch(t.base + '/media/m_doesnotexist0.jpg')).status, 404);
    assert.equal((await fetch(t.base + '/media/..%2fpackage.json')).status, 404);
  } finally { await t.close(); }
});
