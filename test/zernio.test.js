// Zernio mode: every network connects through one API key. Runs against a mock Zernio API.
process.removeAllListeners('warning');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { loadConfig } = require('../server/config');
const { createApp } = require('../server/app');

function mockZernio() {
  const calls = [], accounts = [];
  let base;
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://m'), body = raw && String(req.headers['content-type']).includes('json') ? JSON.parse(raw) : {};
      calls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, auth: req.headers.authorization });
      const json = (s, d) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(d)); };
      if (u.pathname === '/upload') { res.writeHead(200); return res.end(); }
      if (req.headers.authorization !== 'Bearer zk_test') return json(401, { error: 'bad key' });
      const p = u.pathname.replace('/api/v1', '');
      if (p === '/profiles' && req.method === 'POST') return json(201, { profile: { _id: 'prof1' } });
      if (p === '/accounts' && req.method === 'GET') return json(200, { accounts });
      if (p.startsWith('/connect/')) {
        const platform = p.split('/')[2];
        // simulate the member approving: the account appears, then Zernio sends them back
        accounts.push({ _id: 'acc_' + platform, platform, username: 'mona_' + platform, profileId: u.searchParams.get('profileId'), isActive: true });
        return json(200, { authUrl: 'https://zernio.example/auth/' + platform + '?next=' + encodeURIComponent(u.searchParams.get('redirect_url')) });
      }
      if (p.startsWith('/accounts/') && req.method === 'DELETE') { const i = accounts.findIndex(a => a._id === p.split('/')[2]); if (i >= 0) accounts.splice(i, 1); return json(200, { ok: true }); }
      if (p === '/media/presign') return json(200, { uploadUrl: base + '/upload', publicUrl: 'https://media.zernio.com/x.jpg' });
      if (p === '/upload') { res.writeHead(200); return res.end(); }
      if (p === '/posts') {
        const plat = body.platforms[0].platform;
        if (body.content.includes('REJECT')) return json(200, { post: { _id: 'pz', platforms: [{ status: 'failed', errorMessage: 'Duplicate content' }] } });
        return json(201, { post: { _id: 'post_' + plat, status: 'published', platforms: [{ status: 'published', platformPostUrl: 'https://' + plat + '.example/p/1' }] } });
      }
      json(404, { error: 'no route ' + p });
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r({ server, calls, accounts, base }); }));
}

async function start() {
  const z = await mockZernio();
  const config = loadConfig({ NODE_ENV: 'test', DB_FILE: ':memory:', SCHEDULER_MS: '0', ZERNIO_API_KEY: 'zk_test', ZERNIO_BASE_URL: z.base + '/api/v1' });
  let app;
  const server = http.createServer((q, s) => app.handle(q, s));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  config.publicUrl = `http://127.0.0.1:${server.address().port}`;
  app = createApp(config, { noScheduler: true });
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(config.publicUrl + path, { method, redirect: 'manual', headers: { 'x-socialistem': '1', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, data: ct.includes('json') ? await res.json() : await res.text() };
  };
  await call('POST', '/api/auth/signup', { name: 'Mona', email: 'mona@example.com', password: 'Secret-pass-1' });
  return { z, app, call, async close() { app.close(); await new Promise(r => server.close(r)); await new Promise(r => z.server.close(r)); } };
}

async function connect(t, network) {
  const r = await t.call('GET', '/auth/connect/' + network);
  assert.equal(r.status, 302);
  const next = new URL(r.headers.get('location')).searchParams.get('next');
  const back = await t.call('GET', new URL(next).pathname + new URL(next).search);
  return back.headers.get('location');
}

test('Zernio: all eight networks are available and connect with one click', async () => {
  const t = await start();
  try {
    const ch = (await t.call('GET', '/api/channels')).data;
    assert.deepEqual(ch.providers.map(p => p.id), ['instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'youtube', 'threads', 'pinterest']);
    assert.ok(ch.providers.every(p => p.configured));
    assert.equal(await connect(t, 'linkedin'), '/app?connected=linkedin#settings');
    assert.equal(await connect(t, 'x'), '/app?connected=x#settings');
    const conns = (await t.call('GET', '/api/channels')).data.connections;
    assert.deepEqual(conns.map(c => [c.network, c.handle]).sort(), [['linkedin', '@mona_linkedin'], ['x', '@mona_twitter']]);
    assert.equal(t.z.calls.filter(c => c.path.endsWith('/profiles')).length, 1, 'one Zernio profile per member');
    assert.equal(t.z.calls.filter(c => c.path.includes('/connect/')).map(c => c.path)[1], '/api/v1/connect/twitter', 'X is "twitter" at Zernio');
  } finally { await t.close(); }
});

test('Zernio: publish with an image, show network errors, and disconnect', async () => {
  const t = await start();
  try {
    await connect(t, 'instagram');
    const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3, 0xff, 0xd9]).toString('base64');
    const up = await t.call('POST', '/api/media', { dataUrl: jpeg });
    await t.call('PUT', '/api/posts/p_z1', { post: { networks: ['instagram'], variants: { instagram: 'Hello' }, media: [{ thumb: jpeg, mediaId: up.data.id }] } });
    const r = await t.call('POST', '/api/posts/p_z1/publish');
    assert.equal(r.data.post.status, 'sent', JSON.stringify(r.data.post.results));
    assert.equal(r.data.post.results.instagram.url, 'https://instagram.example/p/1');
    const sent = t.z.calls.find(c => c.path === '/api/v1/posts');
    assert.deepEqual(sent.body.platforms, [{ platform: 'instagram', accountId: 'acc_instagram' }]);
    assert.deepEqual(sent.body.mediaItems, [{ type: 'image', url: 'https://media.zernio.com/x.jpg' }]);

    await t.call('PUT', '/api/posts/p_z2', { post: { networks: ['instagram'], variants: { instagram: 'REJECT me' }, media: [{ thumb: jpeg, mediaId: up.data.id }] } });
    const bad = await t.call('POST', '/api/posts/p_z2/publish');
    assert.equal(bad.data.post.status, 'failed');
    assert.equal(bad.data.post.results.instagram.error, 'Duplicate content');

    const id = (await t.call('GET', '/api/channels')).data.connections[0].id;
    assert.equal((await t.call('DELETE', '/api/channels/' + id)).data.connections.length, 0);
    assert.equal(t.z.accounts.length, 0, 'removed at Zernio too');
  } finally { await t.close(); }
});
