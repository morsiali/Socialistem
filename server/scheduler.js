// Publishes posts whose time has come through each member's connected channels (server/channels.js).
// A post is claimed (status 'publishing') before any network call, so two runs never publish it twice.

let running = false;

/** Publish one stored post row now. Returns the saved post data. */
async function publishRow(ctx, row) {
  const { db } = ctx;
  let data;
  try { data = JSON.parse(row.data); } catch (e) { data = {}; }
  let out;
  try {
    out = await ctx.channels.publishPost(row.user_id, data);
  } catch (e) {
    console.error('Publish crashed', row.id, e);
    out = { ...data, status: 'failed', results: { ...(data.results || {}), _error: { ok: false, error: 'Publishing failed unexpectedly. Try again.' } } };
  }
  out.publishedBy = data.publishedBy || 'scheduler';
  const now = new Date().toISOString();
  out.updatedAt = now;
  db.prepare('UPDATE posts SET status = ?, data = ?, updated_at = ? WHERE id = ?').run(out.status, JSON.stringify(out), now, row.id);
  const failed = Object.entries(out.results || {}).filter(([, r]) => r && !r.ok).map(([n]) => n);
  ctx.log({ actorId: row.user_id, targetId: row.id, action: out.status === 'sent' ? 'post.published' : 'post.publish_failed', detail: failed.length ? 'failed: ' + failed.join(',') : (out.networks || []).join(',') });
  return out;
}

/** Atomically move a post into 'publishing'. Returns the row, or null when someone else got it first. */
function claim(db, id, fromStatuses) {
  const marks = fromStatuses.map(() => '?').join(',');
  const changed = Number(db.prepare(`UPDATE posts SET status = 'publishing', updated_at = ? WHERE id = ? AND status IN (${marks})`).run(new Date().toISOString(), id, ...fromStatuses).changes);
  if (!changed) return null;
  return db.prepare('SELECT id, user_id, data FROM posts WHERE id = ?').get(id);
}

/** Publish every due scheduled post. Returns the number of posts processed. */
async function runScheduler(ctx, now = new Date()) {
  if (running) return 0;
  running = true;
  try {
    const { db } = ctx;
    // Posts stuck in 'publishing' for 10+ minutes (e.g. the server restarted mid-publish) are retried.
    db.prepare("UPDATE posts SET status = 'scheduled' WHERE status = 'publishing' AND updated_at < ?").run(new Date(now.getTime() - 10 * 60000).toISOString());
    const due = db.prepare("SELECT id FROM posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 100").all(now.toISOString());
    let n = 0;
    for (const { id } of due) {
      const row = claim(db, id, ['scheduled']);
      if (!row) continue;
      await publishRow(ctx, row);
      n += 1;
    }
    return n;
  } finally {
    running = false;
  }
}

module.exports = { runScheduler, publishRow, claim };
