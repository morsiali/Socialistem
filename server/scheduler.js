// Publishes posts whose time has come. Publishing is simulated until channel APIs are connected:
// replace publishToChannel() with real calls (Meta Graph, LinkedIn, X, TikTok, YouTube, Pinterest).

async function publishToChannel(/* networkId, post, user */) {
  return { ok: true, simulated: true };
}

/** Marks due scheduled posts as sent. Returns the number of posts published. */
function runScheduler(db, now = new Date()) {
  const due = db.prepare("SELECT id, user_id, data, scheduled_at FROM posts WHERE status = 'scheduled' AND scheduled_at <= ? LIMIT 500").all(now.toISOString());
  const update = db.prepare("UPDATE posts SET status = 'sent', data = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'");
  let n = 0;
  for (const row of due) {
    let data;
    try { data = JSON.parse(row.data); } catch (e) { data = {}; }
    data.status = 'sent';
    data.sentAt = row.scheduled_at;
    data.publishedBy = 'scheduler (simulated)';
    for (const net of data.networks || []) publishToChannel(net, data).catch(() => {});
    n += Number(update.run(JSON.stringify(data), now.toISOString(), row.id).changes) || 0;
  }
  return n;
}

module.exports = { runScheduler, publishToChannel };
