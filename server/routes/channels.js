// Social channels: list / disconnect / choose account, image uploads, and "publish now".
// The OAuth redirects themselves (/auth/connect, /auth/callback) are pages, handled in app.js.
const crypto = require('crypto');
const H = require('../http');
const { claim, publishRow } = require('../scheduler');

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const MAX_MEDIA_PER_USER = 300;

function register(r, ctx) {
  const { db } = ctx;

  r.get('/api/channels', async (req, res) => {
    const u = ctx.requireUser(req);
    H.sendJson(res, 200, { providers: ctx.channels.providerList(), connections: ctx.channels.connectionsFor(u.id), practiceMode: !!ctx.settings().practiceMode });
  });

  r.del('/api/channels/:id', async (req, res, { id }) => {
    const u = ctx.requireUser(req);
    if (!ctx.channels.disconnect(u, id)) throw new H.HttpError(404, 'not_found', 'No such connection.');
    H.sendJson(res, 200, { connections: ctx.channels.connectionsFor(u.id) });
  });

  r.post('/api/channels/:id/active', async (req, res, { id }) => {
    const u = ctx.requireUser(req);
    if (!ctx.channels.setActive(u, id)) throw new H.HttpError(404, 'not_found', 'No such connection.');
    H.sendJson(res, 200, { connections: ctx.channels.connectionsFor(u.id) });
  });

  // Images arrive as a JPEG/PNG data URL (the browser resizes them first) and are served publicly
  // at /media/<id>.jpg so Instagram, Facebook and Threads can fetch them.
  r.post('/api/media', async (req, res) => {
    const u = ctx.requireUser(req);
    const b = await H.readJson(req, Math.ceil(MAX_MEDIA_BYTES * 1.4) + 4096);
    const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
    if (!m) throw new H.HttpError(400, 'bad_media', 'Send a JPEG or PNG image.');
    const data = Buffer.from(m[2], 'base64');
    if (!data.length || data.length > MAX_MEDIA_BYTES) throw new H.HttpError(413, 'too_large', 'Images must be under 8 MB.');
    const jpeg = data[0] === 0xff && data[1] === 0xd8;
    const png = data[0] === 0x89 && data[1] === 0x50;
    if (!jpeg && !png) throw new H.HttpError(400, 'bad_media', 'That file is not a JPEG or PNG image.');
    const count = db.prepare('SELECT COUNT(*) n FROM media WHERE user_id = ?').get(u.id).n;
    if (count >= MAX_MEDIA_PER_USER) {
      // Drop the oldest uploads no post refers to any more.
      const used = new Set();
      for (const row of db.prepare('SELECT data FROM posts WHERE user_id = ?').all(u.id)) {
        try { for (const x of JSON.parse(row.data).media || []) if (x.mediaId) used.add(x.mediaId); } catch (e) { /* skip */ }
      }
      const old = db.prepare('SELECT id FROM media WHERE user_id = ? ORDER BY created_at').all(u.id).filter(x => !used.has(x.id)).slice(0, 50);
      for (const x of old) db.prepare('DELETE FROM media WHERE id = ?').run(x.id);
      if (!old.length) throw new H.HttpError(409, 'limit', 'You have too many images. Delete some old posts first.');
    }
    const id = 'm_' + crypto.randomBytes(12).toString('base64url');
    db.prepare('INSERT INTO media (id, user_id, mime, data, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, u.id, jpeg ? 'image/jpeg' : 'image/png', data, data.length, new Date().toISOString());
    H.sendJson(res, 200, { id, url: `${ctx.config.publicUrl}/media/${id}.jpg` });
  });

  // Publish a saved post right now (also used for "Retry" on failed posts).
  r.post('/api/posts/:id/publish', async (req, res, { id }) => {
    const u = ctx.requireUser(req);
    const row = db.prepare('SELECT user_id, status FROM posts WHERE id = ?').get(id);
    if (!row || row.user_id !== u.id) throw new H.HttpError(404, 'not_found', 'No such post. Save it first.');
    if (row.status === 'sent') throw new H.HttpError(409, 'already_sent', 'This post is already published.');
    if (row.status === 'publishing') throw new H.HttpError(409, 'busy', 'This post is being published right now.');
    const claimed = claim(db, id, ['draft', 'approval', 'scheduled', 'failed']);
    if (!claimed) throw new H.HttpError(409, 'busy', 'This post is being published right now.');
    const data = JSON.parse(claimed.data);
    data.publishedBy = 'publish now';
    if (!data.scheduledAt) data.scheduledAt = new Date().toISOString();
    claimed.data = JSON.stringify(data);
    db.prepare('UPDATE posts SET scheduled_at = ? WHERE id = ?').run(data.scheduledAt, id);
    const post = await publishRow(ctx, claimed);
    H.sendJson(res, 200, { post });
  });
}

module.exports = { register };
