// A member's workspace: settings, posts and ideas. Every query is scoped to the logged-in user.
const H = require('../http');
const A = require('../auth');
const { usageFor } = require('./auth');

const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
const STATUSES = ['draft', 'approval', 'scheduled', 'sent'];
const MAX_POSTS = 3000, MAX_IDEAS = 1000;

const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const isoOrNull = v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };

function cleanWorkspace(C, b, current) {
  const ws = { ...current };
  if (b.voice && typeof b.voice === 'object') {
    const v = {};
    for (const k of ['brand', 'about', 'audience', 'tone', 'avoid', 'hashtags']) v[k] = str(b.voice[k], 600).trim();
    v.lang = ['en', 'ar', 'both'].includes(b.voice.lang) ? b.voice.lang : 'en';
    ws.voice = v;
  }
  if (Array.isArray(b.schedule) && b.schedule.length === 7) ws.schedule = b.schedule.map(a => C.normalizeTimes(Array.isArray(a) ? a.slice(0, 24) : []));
  if (b.connected && typeof b.connected === 'object') {
    ws.connected = {};
    for (const n of C.NETWORKS) ws.connected[n.id] = !!b.connected[n.id];
  }
  if ('requireApproval' in b) ws.requireApproval = !!b.requireApproval;
  if ('hideSamples' in b) ws.hideSamples = !!b.hideSamples;
  if (Array.isArray(b.hidden)) ws.hidden = b.hidden.slice(0, 200).map(x => str(x, 64));
  if (Array.isArray(b.keywords)) ws.keywords = b.keywords.slice(0, 12).map(x => str(x, 60).trim()).filter(Boolean);
  return ws;
}

function cleanPost(C, id, p) {
  if (!p || typeof p !== 'object') throw new H.HttpError(400, 'bad_post', 'Post data is missing.');
  const networks = (Array.isArray(p.networks) ? p.networks : []).map(String).filter(n => C.getNetwork(n));
  if (!networks.length) throw new H.HttpError(400, 'bad_post', 'Pick at least one channel.');
  const status = STATUSES.includes(p.status) ? p.status : 'draft';
  const variants = {};
  for (const n of networks) variants[n] = str(p.variants && p.variants[n], 63206);
  const media = (Array.isArray(p.media) ? p.media : []).slice(0, 4).map(m => {
    if (m && typeof m.thumb === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(m.thumb) && m.thumb.length < 400000) return { thumb: m.thumb, name: str(m.name, 120) };
    if (m && typeof m.swatch === 'string') return { swatch: str(m.swatch, 20).replace(/[^a-z]/g, '') };
    return null;
  }).filter(Boolean);
  const scheduledAt = isoOrNull(p.scheduledAt);
  if ((status === 'scheduled') && !scheduledAt) throw new H.HttpError(400, 'bad_post', 'A scheduled post needs a time.');
  return {
    id, networks, variants, media, status, scheduledAt,
    sentAt: isoOrNull(p.sentAt), idea: str(p.idea, 4000), format: str(p.format, 20), altText: str(p.altText, 1000),
    author: str(p.author, 80) || 'You', aiWritten: !!p.aiWritten, createdAt: isoOrNull(p.createdAt) || new Date().toISOString(),
    stats: p.stats && typeof p.stats === 'object' ? { reach: +p.stats.reach || 0, interactions: +p.stats.interactions || 0, clicks: +p.stats.clicks || 0 } : null
  };
}

function cleanIdea(id, i) {
  if (!i || typeof i !== 'object' || !String(i.title || '').trim()) throw new H.HttpError(400, 'bad_idea', 'An idea needs a title.');
  return {
    id, title: str(i.title, 160).trim(), note: str(i.note, 600), pillar: str(i.pillar, 40), format: str(i.format, 20),
    col: ['ideas', 'drafting', 'ready'].includes(i.col) ? i.col : 'ideas', ai: !!i.ai, createdAt: isoOrNull(i.createdAt) || new Date().toISOString()
  };
}

function savePostRow(db, userId, post) {
  const now = new Date().toISOString();
  post.updatedAt = now;
  db.prepare(`INSERT INTO posts (id, user_id, status, scheduled_at, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET status = excluded.status, scheduled_at = excluded.scheduled_at, data = excluded.data, updated_at = excluded.updated_at`)
    .run(post.id, userId, post.status, post.scheduledAt, JSON.stringify(post), post.createdAt, now);
  return post;
}

function register(r, ctx) {
  const { db, C } = ctx;

  r.get('/api/workspace', async (req, res) => {
    const u = ctx.requireUser(req);
    const s = ctx.settings();
    const posts = db.prepare('SELECT data FROM posts WHERE user_id = ? ORDER BY created_at').all(u.id).map(r2 => JSON.parse(r2.data));
    const ideas = db.prepare('SELECT data FROM ideas WHERE user_id = ? ORDER BY created_at').all(u.id).map(r2 => JSON.parse(r2.data));
    H.sendJson(res, 200, { user: A.publicUser(u), workspace: ctx.getWorkspace(u), posts, ideas, announcement: s.announcement || '', usage: usageFor(ctx, u) });
  });

  r.put('/api/workspace', async (req, res) => {
    const u = ctx.requireUser(req);
    const b = await H.readJson(req, 128 * 1024);
    const ws = cleanWorkspace(C, b.workspace || {}, ctx.getWorkspace(u));
    db.prepare('UPDATE workspaces SET data = ?, updated_at = ? WHERE user_id = ?').run(JSON.stringify(ws), new Date().toISOString(), u.id);
    H.sendJson(res, 200, { workspace: ws });
  });

  r.put('/api/posts/:id', async (req, res, { id }) => {
    const u = ctx.requireUser(req);
    if (!ID_RE.test(id)) throw new H.HttpError(400, 'bad_id', 'Invalid post id.');
    const b = await H.readJson(req, 2 * 1024 * 1024);
    const owner = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(id);
    if (owner && owner.user_id !== u.id) throw new H.HttpError(404, 'not_found', 'No such post.');
    if (!owner && db.prepare('SELECT COUNT(*) n FROM posts WHERE user_id = ?').get(u.id).n >= MAX_POSTS) throw new H.HttpError(409, 'limit', 'You have reached the post limit. Delete old posts first.');
    const post = savePostRow(db, u.id, cleanPost(C, id, b.post));
    if (!owner && post.status !== 'draft') ctx.log({ actorId: u.id, targetId: id, action: 'post.' + post.status, detail: post.networks.join(','), ip: req.ip });
    H.sendJson(res, 200, { post });
  });

  r.del('/api/posts/:id', async (req, res, { id }) => {
    const u = ctx.requireUser(req);
    db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(id, u.id);
    H.sendJson(res, 200, { ok: true });
  });

  r.put('/api/ideas/:id', async (req, res, { id }) => {
    const u = ctx.requireUser(req);
    if (!ID_RE.test(id)) throw new H.HttpError(400, 'bad_id', 'Invalid idea id.');
    const b = await H.readJson(req, 64 * 1024);
    const owner = db.prepare('SELECT user_id FROM ideas WHERE id = ?').get(id);
    if (owner && owner.user_id !== u.id) throw new H.HttpError(404, 'not_found', 'No such idea.');
    if (!owner && db.prepare('SELECT COUNT(*) n FROM ideas WHERE user_id = ?').get(u.id).n >= MAX_IDEAS) throw new H.HttpError(409, 'limit', 'You have reached the idea limit.');
    const idea = cleanIdea(id, b.idea);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ideas (id, user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`).run(id, u.id, JSON.stringify(idea), idea.createdAt, now);
    H.sendJson(res, 200, { idea });
  });

  r.del('/api/ideas/:id', async (req, res, { id }) => {
    const u = ctx.requireUser(req);
    db.prepare('DELETE FROM ideas WHERE id = ? AND user_id = ?').run(id, u.id);
    H.sendJson(res, 200, { ok: true });
  });
}

module.exports = { register, cleanPost, savePostRow };
