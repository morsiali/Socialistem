// Real social channel connections: OAuth, encrypted token storage, media hosting and publishing.
// Providers: LinkedIn (personal profile), Meta (Facebook Pages + Instagram Business), X, Threads.
// Each provider is switched on by its client id/secret environment variables.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PublishError extends Error {
  constructor(message, { code = 'publish_failed', reconnect = false } = {}) { super(message); this.code = code; this.reconnect = reconnect; }
}

/* ---------------- token encryption (AES-256-GCM, key file in DATA_DIR) ---------------- */
function loadKey(config) {
  if (config.tokenKey) return crypto.createHash('sha256').update(config.tokenKey).digest();
  if (config.dbFile === ':memory:') return crypto.createHash('sha256').update('test-only-key').digest();
  const file = path.join(config.dataDir, 'token.key');
  try { return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64'); } catch (e) { /* create below */ }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(file, key.toString('base64'), { mode: 0o600 });
  return key;
}
function makeCipher(key) {
  return {
    enc(text) {
      if (!text) return '';
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const out = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
      return [iv.toString('base64'), c.getAuthTag().toString('base64'), out.toString('base64')].join('.');
    },
    dec(blob) {
      if (!blob) return '';
      const [iv, tag, data] = String(blob).split('.');
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
    }
  };
}

/* ---------------- HTTP helpers ---------------- */
async function http(url, { method = 'GET', headers = {}, body, form, json, raw } = {}) {
  const h = { ...headers };
  let payload = body;
  if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
  if (json) { h['content-type'] = 'application/json'; payload = JSON.stringify(json); }
  let res;
  try { res = await fetch(url, { method, headers: h, body: payload }); }
  catch (e) { throw new PublishError('Could not reach the network. Try again in a minute.', { code: 'network_unreachable' }); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (raw) return { res, data, text };
  if (!res.ok) throw apiError(res.status, data, text);
  return data || {};
}
function apiError(status, data, text) {
  const msg = (data && ((data.error && (data.error.message || data.error.error_user_msg)) || data.message || data.detail || data.error_description || (data.errors && data.errors[0] && (data.errors[0].message || data.errors[0].detail)) || (typeof data.error === 'string' ? data.error : ''))) || String(text || '').slice(0, 200);
  const expired = status === 401 || /expired|invalid.*token|session has been invalidated|OAuthException/i.test(msg);
  return new PublishError(expired ? 'The connection expired. Reconnect this channel in Settings.' : (msg || `The network returned an error (${status}).`), { code: expired ? 'reconnect' : 'api_error', reconnect: expired });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ---------------- providers ---------------- */
function buildProviders(config) {
  const U = (name, def) => (config.providerUrls && config.providerUrls[name]) || def;
  const redirect = id => `${config.publicUrl}/auth/callback/${id}`;
  const GV = 'v25.0';

  const linkedin = {
    id: 'linkedin', name: 'LinkedIn', networks: ['linkedin'],
    configured: !!(config.linkedinClientId && config.linkedinClientSecret),
    authorizeUrl(state) {
      return U('linkedinAuth', 'https://www.linkedin.com/oauth/v2/authorization') + '?' + new URLSearchParams({
        response_type: 'code', client_id: config.linkedinClientId, redirect_uri: redirect('linkedin'), state, scope: 'openid profile w_member_social'
      });
    },
    async exchange(code) {
      const t = await http(U('linkedinToken', 'https://www.linkedin.com/oauth/v2/accessToken'), { method: 'POST', form: { grant_type: 'authorization_code', code, redirect_uri: redirect('linkedin'), client_id: config.linkedinClientId, client_secret: config.linkedinClientSecret } });
      const me = await http(U('linkedinApi', 'https://api.linkedin.com') + '/v2/userinfo', { headers: { authorization: 'Bearer ' + t.access_token } });
      return [{ network: 'linkedin', accountId: me.sub, name: me.name || 'LinkedIn member', handle: '', token: t.access_token, refresh: t.refresh_token || '', expiresIn: t.expires_in, meta: { picture: me.picture || '' } }];
    },
    async publish(conn, token, { text, image }) {
      const api = U('linkedinApi', 'https://api.linkedin.com');
      const author = 'urn:li:person:' + conn.account_id;
      const auth = { authorization: 'Bearer ' + token, 'x-restli-protocol-version': '2.0.0' };
      let media = null;
      if (image) {
        const reg = await http(api + '/v2/assets?action=registerUpload', { method: 'POST', headers: auth, json: { registerUploadRequest: { recipes: ['urn:li:digitalmediaRecipe:feedshare-image'], owner: author, serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }] } } });
        const v = reg.value || {};
        const uploadUrl = v.uploadMechanism && v.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'] && v.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
        if (!uploadUrl || !v.asset) throw new PublishError('LinkedIn did not accept the image upload.');
        const up = await http(uploadUrl, { method: 'PUT', headers: { authorization: 'Bearer ' + token, 'content-type': image.mime }, body: image.data, raw: true });
        if (!up.res.ok) throw apiError(up.res.status, up.data, up.text);
        media = v.asset;
      }
      const body = {
        author, lifecycleState: 'PUBLISHED',
        specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text }, shareMediaCategory: media ? 'IMAGE' : 'NONE', ...(media ? { media: [{ status: 'READY', media }] } : {}) } },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
      };
      const r = await http(api + '/v2/ugcPosts', { method: 'POST', headers: auth, json: body, raw: true });
      if (!r.res.ok) throw apiError(r.res.status, r.data, r.text);
      const id = r.res.headers.get('x-restli-id') || (r.data && r.data.id) || '';
      return { id, url: id ? `https://www.linkedin.com/feed/update/${id}` : 'https://www.linkedin.com/feed/' };
    }
  };

  const x = {
    id: 'x', name: 'X', networks: ['x'], pkce: true,
    configured: !!(config.xClientId && config.xClientSecret),
    authorizeUrl(state, verifier) {
      const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
      return U('xAuth', 'https://x.com/i/oauth2/authorize') + '?' + new URLSearchParams({
        response_type: 'code', client_id: config.xClientId, redirect_uri: redirect('x'), state,
        scope: 'tweet.read tweet.write users.read media.write offline.access', code_challenge: challenge, code_challenge_method: 'S256'
      });
    },
    basic() { return 'Basic ' + Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString('base64'); },
    async exchange(code, verifier) {
      const t = await http(U('xApi', 'https://api.x.com') + '/2/oauth2/token', { method: 'POST', headers: { authorization: x.basic() }, form: { code, grant_type: 'authorization_code', client_id: config.xClientId, redirect_uri: redirect('x'), code_verifier: verifier } });
      const me = await http(U('xApi', 'https://api.x.com') + '/2/users/me', { headers: { authorization: 'Bearer ' + t.access_token } });
      const d = me.data || {};
      return [{ network: 'x', accountId: d.id, name: d.name || d.username, handle: d.username ? '@' + d.username : '', token: t.access_token, refresh: t.refresh_token || '', expiresIn: t.expires_in, meta: { username: d.username || '' } }];
    },
    async refresh(refreshToken) {
      const t = await http(U('xApi', 'https://api.x.com') + '/2/oauth2/token', { method: 'POST', headers: { authorization: x.basic() }, form: { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: config.xClientId } });
      return { token: t.access_token, refresh: t.refresh_token || refreshToken, expiresIn: t.expires_in };
    },
    async publish(conn, token, { text, image }) {
      const api = U('xApi', 'https://api.x.com');
      const body = { text };
      if (image) {
        const fd = new FormData();
        fd.append('media', new Blob([image.data], { type: image.mime }), 'image.jpg');
        fd.append('media_category', 'tweet_image');
        const r = await http(api + '/2/media/upload', { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: fd, raw: true });
        if (!r.res.ok) throw apiError(r.res.status, r.data, r.text);
        const mid = r.data && r.data.data && r.data.data.id;
        if (!mid) throw new PublishError('X did not accept the image.');
        body.media = { media_ids: [String(mid)] };
      }
      const r = await http(api + '/2/tweets', { method: 'POST', headers: { authorization: 'Bearer ' + token }, json: body });
      const id = r.data && r.data.id;
      const user = (JSON.parse(conn.meta || '{}').username) || 'i';
      return { id, url: id ? `https://x.com/${user}/status/${id}` : 'https://x.com' };
    }
  };

  const meta = {
    id: 'meta', name: 'Facebook & Instagram', networks: ['facebook', 'instagram'],
    configured: !!(config.metaAppId && config.metaAppSecret),
    authorizeUrl(state) {
      return U('metaAuth', `https://www.facebook.com/${GV}/dialog/oauth`) + '?' + new URLSearchParams({
        client_id: config.metaAppId, redirect_uri: redirect('meta'), state, response_type: 'code',
        scope: 'pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management'
      });
    },
    async exchange(code) {
      const g = U('metaGraph', 'https://graph.facebook.com') + '/' + GV;
      const short = await http(g + '/oauth/access_token?' + new URLSearchParams({ client_id: config.metaAppId, client_secret: config.metaAppSecret, redirect_uri: redirect('meta'), code }));
      const long = await http(g + '/oauth/access_token?' + new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: config.metaAppId, client_secret: config.metaAppSecret, fb_exchange_token: short.access_token }));
      const pages = await http(g + '/me/accounts?' + new URLSearchParams({ fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '50', access_token: long.access_token }));
      const out = [];
      for (const p of pages.data || []) {
        out.push({ network: 'facebook', accountId: p.id, name: p.name, handle: '', token: p.access_token, refresh: '', expiresIn: null, meta: {} });
        const ig = p.instagram_business_account;
        if (ig && ig.id) out.push({ network: 'instagram', accountId: ig.id, name: ig.username ? '@' + ig.username : p.name, handle: ig.username ? '@' + ig.username : '', token: p.access_token, refresh: '', expiresIn: null, meta: { pageId: p.id, username: ig.username || '' } });
      }
      if (!out.length) throw new PublishError('No Facebook Pages were shared. Reconnect and tick at least one Page (and its Instagram account).', { code: 'no_pages' });
      return out;
    },
    async publish(conn, token, { text, imageUrl, network }) {
      const g = U('metaGraph', 'https://graph.facebook.com') + '/' + GV;
      if (network === 'facebook') {
        if (imageUrl) {
          const r = await http(`${g}/${conn.account_id}/photos`, { method: 'POST', form: { url: imageUrl, caption: text, access_token: token } });
          return { id: r.post_id || r.id, url: `https://www.facebook.com/${r.post_id || r.id}` };
        }
        const r = await http(`${g}/${conn.account_id}/feed`, { method: 'POST', form: { message: text, access_token: token } });
        return { id: r.id, url: `https://www.facebook.com/${r.id}` };
      }
      if (!imageUrl) throw new PublishError('Instagram needs an image. Add one and try again.', { code: 'needs_media' });
      const c = await http(`${g}/${conn.account_id}/media`, { method: 'POST', form: { image_url: imageUrl, caption: text, access_token: token } });
      await waitReady(async () => (await http(`${g}/${c.id}?` + new URLSearchParams({ fields: 'status_code', access_token: token }))).status_code, 'FINISHED', 'ERROR');
      const p = await http(`${g}/${conn.account_id}/media_publish`, { method: 'POST', form: { creation_id: c.id, access_token: token } });
      let url = 'https://www.instagram.com/';
      try { url = (await http(`${g}/${p.id}?` + new URLSearchParams({ fields: 'permalink', access_token: token }))).permalink || url; } catch (e) { /* link is optional */ }
      return { id: p.id, url };
    }
  };

  const threads = {
    id: 'threads', name: 'Threads', networks: ['threads'],
    configured: !!(config.threadsAppId && config.threadsAppSecret),
    authorizeUrl(state) {
      return U('threadsAuth', 'https://threads.net/oauth/authorize') + '?' + new URLSearchParams({
        client_id: config.threadsAppId, redirect_uri: redirect('threads'), scope: 'threads_basic,threads_content_publish', response_type: 'code', state
      });
    },
    async exchange(code) {
      const g = U('threadsGraph', 'https://graph.threads.net');
      const short = await http(g + '/oauth/access_token', { method: 'POST', form: { client_id: config.threadsAppId, client_secret: config.threadsAppSecret, code, grant_type: 'authorization_code', redirect_uri: redirect('threads') } });
      const long = await http(g + '/access_token?' + new URLSearchParams({ grant_type: 'th_exchange_token', client_secret: config.threadsAppSecret, access_token: short.access_token }));
      const me = await http(g + '/v1.0/me?' + new URLSearchParams({ fields: 'id,username', access_token: long.access_token }));
      return [{ network: 'threads', accountId: me.id || String(short.user_id), name: me.username ? '@' + me.username : 'Threads', handle: me.username ? '@' + me.username : '', token: long.access_token, refresh: long.access_token, expiresIn: long.expires_in, meta: { username: me.username || '' } }];
    },
    async refresh(currentToken) {
      const t = await http(U('threadsGraph', 'https://graph.threads.net') + '/refresh_access_token?' + new URLSearchParams({ grant_type: 'th_refresh_token', access_token: currentToken }));
      return { token: t.access_token, refresh: t.access_token, expiresIn: t.expires_in };
    },
    async publish(conn, token, { text, imageUrl }) {
      const g = U('threadsGraph', 'https://graph.threads.net') + '/v1.0';
      const form = imageUrl ? { media_type: 'IMAGE', image_url: imageUrl, text, access_token: token } : { media_type: 'TEXT', text, access_token: token };
      const c = await http(`${g}/${conn.account_id}/threads`, { method: 'POST', form });
      await waitReady(async () => (await http(`${g}/${c.id}?` + new URLSearchParams({ fields: 'status', access_token: token }))).status, 'FINISHED', 'ERROR');
      const p = await http(`${g}/${conn.account_id}/threads_publish`, { method: 'POST', form: { creation_id: c.id, access_token: token } });
      let url = 'https://www.threads.net/';
      try { url = (await http(`${g}/${p.id}?` + new URLSearchParams({ fields: 'permalink', access_token: token }))).permalink || url; } catch (e) { /* link is optional */ }
      return { id: p.id, url };
    }
  };

  async function waitReady(check, done, failed) {
    for (let i = 0; i < 20; i++) {
      let s;
      try { s = await check(); } catch (e) { s = undefined; }
      if (s === done || s === undefined) return;
      if (s === failed) throw new PublishError('The network could not process the media. Use a JPEG under 8 MB.', { code: 'media_failed' });
      await sleep(config.publishPollMs != null ? config.publishPollMs : 3000);
    }
    throw new PublishError('The network took too long to process the post. Try again.', { code: 'timeout' });
  }

  return { linkedin, x, meta, threads };
}

/** Which provider connects which network. */
const NETWORK_PROVIDER = { linkedin: 'linkedin', x: 'x', facebook: 'meta', instagram: 'meta', threads: 'threads' };
const NETWORK_NAMES = { linkedin: 'LinkedIn', x: 'X', facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', tiktok: 'TikTok', youtube: 'YouTube', pinterest: 'Pinterest' };

function createChannels(ctx) {
  const { db, config } = ctx;
  const providers = buildProviders(config);
  const cipher = makeCipher(loadKey(config));
  const zernio = config.zernioKey ? require('./zernio').createZernio(ctx, { PublishError, cipher }) : null;

  function providerList() {
    if (zernio) return zernio.providerList();
    return Object.values(providers).map(p => ({ id: p.id, name: p.name, networks: p.networks, configured: p.configured }));
  }
  function connectionsFor(userId) {
    return db.prepare('SELECT * FROM connections WHERE user_id = ? ORDER BY network, created_at').all(userId).map(publicConn);
  }
  function publicConn(c) {
    return { id: c.id, network: c.network, accountId: c.account_id, name: c.account_name, handle: c.account_handle, active: !!c.active, status: c.status, lastError: c.last_error, expiresAt: c.expires_at, createdAt: c.created_at };
  }

  /** Bring the member's account list up to date (Zernio mode only; direct mode is always current). */
  async function refresh(user, force) {
    if (!zernio) return;
    try { await zernio.sync(user, force); } catch (e) { console.error('Channel sync failed', e.message); }
  }

  async function startConnect(user, providerId) {
    if (zernio) return zernio.startConnect(user, providerId);
    const p = providers[providerId];
    if (!p) throw Object.assign(new Error('Unknown channel.'), { status: 404 });
    if (!p.configured) throw Object.assign(new Error(`${p.name} is not set up on this server yet.`), { status: 503 });
    const state = crypto.randomBytes(24).toString('base64url');
    const verifier = p.pkce ? crypto.randomBytes(48).toString('base64url') : '';
    db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(new Date(Date.now() - 15 * 60000).toISOString());
    db.prepare('INSERT INTO oauth_states (state, user_id, provider, verifier, created_at) VALUES (?, ?, ?, ?, ?)').run(state, user.id, providerId, verifier, new Date().toISOString());
    return p.authorizeUrl(state, verifier);
  }

  async function finishConnect(user, providerId, { code, state, error }) {
    if (zernio) return zernio.finishConnect(user, providerId, { state, error });
    const row = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(String(state || ''));
    if (row) db.prepare('DELETE FROM oauth_states WHERE state = ?').run(row.state);
    if (!row || row.user_id !== user.id || row.provider !== providerId || new Date(row.created_at) < new Date(Date.now() - 15 * 60000)) throw new PublishError('That connection link expired. Start again from Settings.', { code: 'bad_state' });
    if (error) throw new PublishError('The connection was cancelled.', { code: 'cancelled' });
    if (!code) throw new PublishError('The network did not return an authorisation code.', { code: 'no_code' });
    const accounts = await providers[providerId].exchange(String(code), row.verifier);
    const now = new Date().toISOString();
    const saved = [];
    for (const a of accounts) {
      const existing = db.prepare('SELECT id FROM connections WHERE user_id = ? AND network = ? AND account_id = ?').get(user.id, a.network, String(a.accountId));
      const id = existing ? existing.id : 'c_' + crypto.randomBytes(9).toString('base64url');
      const expires = a.expiresIn ? new Date(Date.now() + Number(a.expiresIn) * 1000).toISOString() : null;
      const hasActive = db.prepare('SELECT 1 n FROM connections WHERE user_id = ? AND network = ? AND active = 1 AND id != ?').get(user.id, a.network, id);
      db.prepare(`INSERT INTO connections (id, user_id, network, account_id, account_name, account_handle, token_enc, refresh_enc, expires_at, meta, active, status, last_error, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', '', ?, ?)
                  ON CONFLICT(id) DO UPDATE SET account_name = excluded.account_name, account_handle = excluded.account_handle, token_enc = excluded.token_enc,
                  refresh_enc = excluded.refresh_enc, expires_at = excluded.expires_at, meta = excluded.meta, status = 'ok', last_error = '', updated_at = excluded.updated_at`)
        .run(id, user.id, a.network, String(a.accountId), String(a.name || '').slice(0, 120), String(a.handle || '').slice(0, 80), cipher.enc(a.token), cipher.enc(a.refresh), expires, JSON.stringify(a.meta || {}), hasActive ? 0 : 1, now, now);
      saved.push(a.network);
    }
    ctx.log({ actorId: user.id, targetId: user.id, action: 'channel.connected', detail: [...new Set(saved)].join(', ') });
    return saved;
  }

  async function disconnect(user, id) {
    if (zernio) return zernio.disconnect(user, id);
    const c = db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').get(id, user.id);
    if (!c) return false;
    db.prepare('DELETE FROM connections WHERE id = ?').run(id);
    if (c.active) {
      const next = db.prepare('SELECT id FROM connections WHERE user_id = ? AND network = ? ORDER BY created_at LIMIT 1').get(user.id, c.network);
      if (next) db.prepare('UPDATE connections SET active = 1 WHERE id = ?').run(next.id);
    }
    ctx.log({ actorId: user.id, targetId: user.id, action: 'channel.disconnected', detail: c.network + ': ' + c.account_name });
    return true;
  }

  function setActive(user, id) {
    const c = db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').get(id, user.id);
    if (!c) return false;
    db.prepare('UPDATE connections SET active = 0 WHERE user_id = ? AND network = ?').run(user.id, c.network);
    db.prepare('UPDATE connections SET active = 1 WHERE id = ?').run(id);
    return true;
  }

  async function tokenFor(conn) {
    let token = cipher.dec(conn.token_enc);
    const p = providers[NETWORK_PROVIDER[conn.network]];
    if (conn.expires_at && new Date(conn.expires_at) < new Date(Date.now() + 5 * 60000)) {
      const refresh = cipher.dec(conn.refresh_enc);
      if (!p.refresh || !refresh) throw new PublishError('The connection expired. Reconnect this channel in Settings.', { code: 'reconnect', reconnect: true });
      const t = await p.refresh(refresh);
      token = t.token;
      db.prepare('UPDATE connections SET token_enc = ?, refresh_enc = ?, expires_at = ?, updated_at = ? WHERE id = ?')
        .run(cipher.enc(t.token), cipher.enc(t.refresh), t.expiresIn ? new Date(Date.now() + t.expiresIn * 1000).toISOString() : null, new Date().toISOString(), conn.id);
    }
    return token;
  }

  function mediaFor(userId, post) {
    const m = (post.media || []).find(x => x && x.mediaId);
    if (!m) return null;
    const row = db.prepare('SELECT id, mime, data FROM media WHERE id = ? AND user_id = ?').get(m.mediaId, userId);
    if (!row) return null;
    return { data: Buffer.from(row.data), mime: row.mime, url: `${config.publicUrl}/media/${row.id}.jpg` };
  }

  /**
   * Publish a post to every network it targets. Networks already published stay untouched (retry-safe).
   * Returns the updated post data with per-network results and status 'sent' or 'failed'.
   */
  async function publishPost(userId, post) {
    const settings = ctx.settings();
    const results = { ...(post.results || {}) };
    const image = mediaFor(userId, post);
    if (zernio) await refresh({ id: userId });
    for (const network of post.networks || []) {
      if (results[network] && results[network].ok) continue;
      const text = String((post.variants || {})[network] || '').trim();
      const at = new Date().toISOString();
      const conn = db.prepare('SELECT * FROM connections WHERE user_id = ? AND network = ? AND active = 1').get(userId, network);
      try {
        if (!conn) {
          if (settings.practiceMode) { results[network] = { ok: true, simulated: true, at }; continue; }
          throw new PublishError(`No ${NETWORK_NAMES[network] || network} account is connected. Connect one in Settings.`, { code: 'not_connected' });
        }
        let r;
        if (zernio) r = await zernio.publish(conn, { network, text, image });
        else {
          const provider = providers[NETWORK_PROVIDER[network]];
          if (!provider || !provider.configured) throw new PublishError('This channel is not available on the server right now.', { code: 'not_configured' });
          const token = await tokenFor(conn);
          r = await provider.publish(conn, token, { network, text, image, imageUrl: image ? image.url : '' });
        }
        results[network] = { ok: true, id: String(r.id || ''), url: r.url || '', account: conn.account_name, at };
        db.prepare("UPDATE connections SET status = 'ok', last_error = '' WHERE id = ?").run(conn.id);
      } catch (e) {
        const message = e instanceof PublishError ? e.message : 'Publishing failed unexpectedly. Try again.';
        if (!(e instanceof PublishError)) console.error('Publish error', network, e);
        results[network] = { ok: false, error: message, code: e.code || 'error', at };
        if (conn && e.reconnect) db.prepare("UPDATE connections SET status = 'reconnect', last_error = ? WHERE id = ?").run(message, conn.id);
      }
    }
    const allOk = (post.networks || []).every(n => results[n] && results[n].ok);
    return { ...post, results, status: allOk ? 'sent' : 'failed', sentAt: allOk ? new Date().toISOString() : (post.sentAt || null) };
  }

  return { providers, providerList, refresh, mode: zernio ? 'zernio' : 'direct', connectionsFor, startConnect, finishConnect, disconnect, setActive, publishPost, cipher };
}

module.exports = { createChannels, buildProviders, PublishError, NETWORK_PROVIDER };
