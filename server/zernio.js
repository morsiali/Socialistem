// Zernio unified social API (zernio.com): one API key, and Zernio's own approved apps handle the sign-in
// for every network. When ZERNIO_API_KEY is set, Socialistem uses it instead of per-network developer apps.
// Each Socialistem member gets one Zernio profile; their connected accounts live under it.
const crypto = require('crypto');

const NETWORKS = ['instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'youtube', 'threads', 'pinterest'];
const NAMES = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', x: 'X', tiktok: 'TikTok', youtube: 'YouTube', threads: 'Threads', pinterest: 'Pinterest' };
const toZ = n => (n === 'x' ? 'twitter' : n);
const fromZ = p => (p === 'twitter' ? 'x' : String(p || '').toLowerCase());

function createZernio(ctx, { PublishError, cipher }) {
  const { db, config } = ctx;
  const base = (config.zernioUrl || 'https://zernio.com/api/v1').replace(/\/+$/, '') + '/';
  const cache = new Map(); // userId -> { at, rows }

  async function call(path, method = 'GET', body) {
    let res;
    try {
      res = await fetch(base + path, {
        method, headers: { authorization: 'Bearer ' + config.zernioKey, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000)
      });
    } catch (e) { throw new PublishError('The social provider did not respond. Try again in a minute.', { code: 'network_unreachable' }); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof data.error === 'string' ? data.error : (data.error && data.error.message) || data.message || 'The social provider could not complete this request.';
      throw new PublishError(String(msg).slice(0, 400), { code: res.status === 401 ? 'provider_auth' : 'api_error' });
    }
    return data;
  }

  async function profileId(user) {
    const row = db.prepare('SELECT social_profile FROM users WHERE id = ?').get(user.id);
    if (row && row.social_profile) return cipher.dec(row.social_profile);
    const data = await call('profiles', 'POST', { name: 'socialistem_' + user.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(-48), description: user.email });
    const id = (data.profile && data.profile._id) || data.profileId;
    if (!id) throw new PublishError('Social account setup could not be completed. Try again.', { code: 'profile_error' });
    db.prepare('UPDATE users SET social_profile = ? WHERE id = ? AND social_profile IS NULL').run(cipher.enc(String(id)), user.id);
    const saved = db.prepare('SELECT social_profile FROM users WHERE id = ?').get(user.id);
    return cipher.dec(saved.social_profile);
  }

  /** Pull the member's accounts from Zernio into the connections table (cached for 30 s). */
  async function sync(user, force = false) {
    const hit = cache.get(user.id);
    if (!force && hit && Date.now() - hit.at < 30000) return;
    const row = db.prepare('SELECT social_profile FROM users WHERE id = ?').get(user.id);
    if (!row || !row.social_profile) { cache.set(user.id, { at: Date.now() }); return; }
    const pid = cipher.dec(row.social_profile);
    const data = await call('accounts?profileId=' + encodeURIComponent(pid));
    const list = (Array.isArray(data.accounts) ? data.accounts : [])
      .filter(a => a.isActive !== false && (!a.profileId || String((a.profileId && a.profileId._id) || a.profileId) === pid))
      .map(a => ({ id: String(a._id), network: fromZ(a.platform), name: a.displayName || a.username || NAMES[fromZ(a.platform)] || a.platform, handle: a.username ? (a.username.startsWith('@') ? a.username : '@' + a.username) : '' }))
      .filter(a => NETWORKS.includes(a.network));
    const now = new Date().toISOString();
    const keep = new Set();
    for (const a of list) {
      const existing = db.prepare('SELECT id FROM connections WHERE user_id = ? AND network = ? AND account_id = ?').get(user.id, a.network, a.id);
      const hasActive = db.prepare('SELECT 1 n FROM connections WHERE user_id = ? AND network = ? AND active = 1').get(user.id, a.network);
      const id = existing ? existing.id : 'c_' + crypto.randomBytes(9).toString('base64url');
      keep.add(id);
      if (existing) db.prepare("UPDATE connections SET account_name = ?, account_handle = ?, status = 'ok', last_error = '', updated_at = ? WHERE id = ?").run(a.name.slice(0, 120), a.handle.slice(0, 80), now, id);
      else db.prepare(`INSERT INTO connections (id, user_id, network, account_id, account_name, account_handle, meta, active, status, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, '{"via":"zernio"}', ?, 'ok', ?, ?)`).run(id, user.id, a.network, a.id, a.name.slice(0, 120), a.handle.slice(0, 80), hasActive ? 0 : 1, now, now);
    }
    for (const c of db.prepare('SELECT id, network, active FROM connections WHERE user_id = ?').all(user.id)) {
      if (keep.has(c.id)) continue;
      db.prepare('DELETE FROM connections WHERE id = ?').run(c.id);
      if (c.active) {
        const next = db.prepare('SELECT id FROM connections WHERE user_id = ? AND network = ? LIMIT 1').get(user.id, c.network);
        if (next) db.prepare('UPDATE connections SET active = 1 WHERE id = ?').run(next.id);
      }
    }
    cache.set(user.id, { at: Date.now() });
  }

  function providerList() {
    return NETWORKS.map(n => ({ id: n, name: NAMES[n], networks: [n], configured: true, via: 'zernio' }));
  }

  async function startConnect(user, network) {
    if (!NETWORKS.includes(network)) throw Object.assign(new Error('Unknown channel.'), { status: 404 });
    const state = crypto.randomBytes(24).toString('base64url');
    db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(new Date(Date.now() - 30 * 60000).toISOString());
    db.prepare('INSERT INTO oauth_states (state, user_id, provider, verifier, created_at) VALUES (?, ?, ?, ?, ?)').run(state, user.id, network, '', new Date().toISOString());
    const pid = await profileId(user);
    const back = `${config.publicUrl}/auth/callback/${network}?state=${encodeURIComponent(state)}`;
    const data = await call(`connect/${encodeURIComponent(toZ(network))}?profileId=${encodeURIComponent(pid)}&redirect_url=${encodeURIComponent(back)}`);
    const url = String(data.authUrl || data.url || '');
    if (!url.startsWith('https://')) throw new PublishError('The connection page could not be verified. Try again.', { code: 'bad_link' });
    return url;
  }

  async function finishConnect(user, network, { state, error }) {
    const row = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(String(state || ''));
    if (row) db.prepare('DELETE FROM oauth_states WHERE state = ?').run(row.state);
    if (!row || row.user_id !== user.id || row.provider !== network) throw new PublishError('That connection link expired. Start again from Settings.', { code: 'bad_state' });
    await sync(user, true);
    const got = db.prepare('SELECT 1 n FROM connections WHERE user_id = ? AND network = ?').get(user.id, network);
    if (!got) throw new PublishError(error ? 'The connection was cancelled.' : `${NAMES[network]} did not finish connecting. Try again.`, { code: 'cancelled' });
    ctx.log({ actorId: user.id, targetId: user.id, action: 'channel.connected', detail: network + ' (zernio)' });
    return [network];
  }

  async function disconnect(user, id) {
    const c = db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').get(id, user.id);
    if (!c) return false;
    try { await call('accounts/' + encodeURIComponent(c.account_id), 'DELETE'); } catch (e) { /* removed locally either way */ }
    db.prepare('DELETE FROM connections WHERE id = ?').run(id);
    if (c.active) {
      const next = db.prepare('SELECT id FROM connections WHERE user_id = ? AND network = ? LIMIT 1').get(user.id, c.network);
      if (next) db.prepare('UPDATE connections SET active = 1 WHERE id = ?').run(next.id);
    }
    cache.delete(user.id);
    ctx.log({ actorId: user.id, targetId: user.id, action: 'channel.disconnected', detail: c.network + ': ' + c.account_name });
    return true;
  }

  async function uploadImage(image) {
    const signed = await call('media/presign', 'POST', { filename: 'image.jpg', contentType: image.mime, size: image.data.length });
    const uploadUrl = String(signed.uploadUrl || ''), publicUrl = String(signed.publicUrl || '');
    if (!(uploadUrl.startsWith('https://') || uploadUrl.startsWith(new URL(base).origin + '/')) || !publicUrl.startsWith('https://')) throw new PublishError('The image upload address could not be verified.', { code: 'media_upload' });
    let res;
    try { res = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': image.mime }, body: image.data, signal: AbortSignal.timeout(120000) }); }
    catch (e) { res = null; }
    if (!res || !res.ok) throw new PublishError('The image could not be sent to the publishing service. Try again.', { code: 'media_upload' });
    return { type: 'image', url: publicUrl };
  }

  /** Publish one network's version through Zernio. Returns { id, url }. */
  async function publish(conn, { text, image, network }) {
    const mediaItems = image ? [await uploadImage(image)] : [];
    const data = await call('posts', 'POST', {
      content: text, publishNow: true,
      platforms: [{ platform: toZ(network), accountId: conn.account_id }],
      ...(mediaItems.length ? { mediaItems } : {})
    });
    const post = data.post || {};
    const target = (post.platforms || [])[0] || {};
    const state = String(target.status || post.status || '').toLowerCase();
    if (state === 'failed') throw new PublishError(String(target.errorMessage || target.error || 'The network rejected this post.').slice(0, 400), { code: 'api_error' });
    return { id: String(post._id || ''), url: target.platformPostUrl || '', pending: state !== 'published' };
  }

  return { providerList, sync, startConnect, finishConnect, disconnect, publish };
}

module.exports = { createZernio, NETWORKS };
