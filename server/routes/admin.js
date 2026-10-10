// Admin API: overview metrics, user management, activity log and platform settings.
const fs = require('fs');
const H = require('../http');
const A = require('../auth');
const { saveSettings } = require('../db');

const ROLES = ['member', 'admin'], STATUSES = ['active', 'suspended'], PLANS = ['free', 'pro', 'business'];
const startedAt = Date.now();

function dayKeys(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - i)).toISOString().slice(0, 10));
  return out;
}

function register(r, ctx) {
  const { db, config } = ctx;
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const n = (sql, ...a) => Number(one(sql, ...a).n) || 0;
  const iso = ms => new Date(Date.now() - ms).toISOString();
  const DAY = 86400000;

  function activeAdmins() { return n("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND status = 'active'"); }
  function userRow(id) {
    const u = one('SELECT * FROM users WHERE id = ?', id);
    if (!u) throw new H.HttpError(404, 'not_found', 'No such user.');
    return u;
  }
  function adminUser(u) {
    const month = new Date().toISOString().slice(0, 7) + '-01T00:00:00.000Z';
    return {
      ...A.publicUser(u),
      posts: n('SELECT COUNT(*) n FROM posts WHERE user_id = ?', u.id),
      scheduled: n("SELECT COUNT(*) n FROM posts WHERE user_id = ? AND status = 'scheduled'", u.id),
      aiMonth: n('SELECT COUNT(*) n FROM ai_usage WHERE user_id = ? AND ok = 1 AND created_at >= ?', u.id, month),
      sessions: n('SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND expires_at > ?', u.id, new Date().toISOString()),
      channels: n('SELECT COUNT(*) n FROM connections WHERE user_id = ?', u.id),
      failed: n("SELECT COUNT(*) n FROM posts WHERE user_id = ? AND status = 'failed'", u.id)
    };
  }

  r.get('/api/admin/overview', async (req, res) => {
    ctx.requireAdmin(req);
    const today = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
    const month = new Date().toISOString().slice(0, 7) + '-01T00:00:00.000Z';
    const days = dayKeys(30);
    const since30 = days[0] + 'T00:00:00.000Z';
    const signups = Object.fromEntries(db.prepare('SELECT substr(created_at, 1, 10) d, COUNT(*) n FROM users WHERE created_at >= ? GROUP BY d').all(since30).map(x => [x.d, Number(x.n)]));
    const ai = Object.fromEntries(db.prepare('SELECT substr(created_at, 1, 10) d, COUNT(*) n FROM ai_usage WHERE ok = 1 AND created_at >= ? GROUP BY d').all(since30).map(x => [x.d, Number(x.n)]));
    let dbBytes = 0;
    try { if (ctx.dbPath !== ':memory:') dbBytes = fs.statSync(ctx.dbPath).size; } catch (e) { dbBytes = 0; }
    H.sendJson(res, 200, {
      users: {
        total: n('SELECT COUNT(*) n FROM users'), admins: n("SELECT COUNT(*) n FROM users WHERE role = 'admin'"),
        suspended: n("SELECT COUNT(*) n FROM users WHERE status = 'suspended'"),
        new7: n('SELECT COUNT(*) n FROM users WHERE created_at >= ?', iso(7 * DAY)), new30: n('SELECT COUNT(*) n FROM users WHERE created_at >= ?', iso(30 * DAY)),
        active7: n('SELECT COUNT(*) n FROM users WHERE last_login_at >= ?', iso(7 * DAY)),
        plans: Object.fromEntries(PLANS.map(p => [p, n('SELECT COUNT(*) n FROM users WHERE plan = ?', p)]))
      },
      posts: {
        total: n('SELECT COUNT(*) n FROM posts'), scheduled: n("SELECT COUNT(*) n FROM posts WHERE status = 'scheduled'"),
        sent: n("SELECT COUNT(*) n FROM posts WHERE status = 'sent'"), drafts: n("SELECT COUNT(*) n FROM posts WHERE status = 'draft'"),
        approval: n("SELECT COUNT(*) n FROM posts WHERE status = 'approval'"),
        failed: n("SELECT COUNT(*) n FROM posts WHERE status = 'failed'"),
        next7: n("SELECT COUNT(*) n FROM posts WHERE status = 'scheduled' AND scheduled_at < ?", new Date(Date.now() + 7 * DAY).toISOString())
      },
      ai: {
        today: n('SELECT COUNT(*) n FROM ai_usage WHERE ok = 1 AND created_at >= ?', today),
        month: n('SELECT COUNT(*) n FROM ai_usage WHERE ok = 1 AND created_at >= ?', month),
        failedMonth: n('SELECT COUNT(*) n FROM ai_usage WHERE ok = 0 AND created_at >= ?', month),
        tokensMonth: Number(one('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) n FROM ai_usage WHERE created_at >= ?', month).n) || 0,
        byKind: db.prepare('SELECT kind, COUNT(*) n FROM ai_usage WHERE ok = 1 AND created_at >= ? GROUP BY kind ORDER BY n DESC').all(month).map(x => ({ kind: x.kind, n: Number(x.n) }))
      },
      series: { days, signups: days.map(d => signups[d] || 0), ai: days.map(d => ai[d] || 0) },
      channels: {
        providers: ctx.channels.providerList(),
        practiceMode: !!ctx.settings().practiceMode,
        byNetwork: Object.fromEntries(db.prepare('SELECT network, COUNT(*) n FROM connections GROUP BY network').all().map(x => [x.network, Number(x.n)])),
        needReconnect: n("SELECT COUNT(*) n FROM connections WHERE status = 'reconnect'")
      },
      recentUsers: db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 6').all().map(A.publicUser),
      system: {
        version: config.version, node: process.version, uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        aiConfigured: !!config.anthropicKey, modelFast: config.modelFast, modelBest: config.modelBest, dbBytes,
        publicUrl: config.publicUrl
      }
    });
  });

  r.get('/api/admin/users', async (req, res) => {
    ctx.requireAdmin(req);
    const q = String(req.query.get('q') || '').trim().toLowerCase().slice(0, 100);
    const filter = String(req.query.get('filter') || 'all');
    const limit = Math.min(200, Math.max(1, Number(req.query.get('limit')) || 50));
    const offset = Math.max(0, Number(req.query.get('offset')) || 0);
    const where = [], args = [];
    if (q) { where.push('(lower(email) LIKE ? OR lower(name) LIKE ? OR lower(brand) LIKE ?)'); const like = '%' + q.replace(/[%_]/g, '') + '%'; args.push(like, like, like); }
    if (filter === 'admins') where.push("role = 'admin'");
    if (filter === 'members') where.push("role = 'member'");
    if (filter === 'suspended') where.push("status = 'suspended'");
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = n(`SELECT COUNT(*) n FROM users ${w}`, ...args);
    const rows = db.prepare(`SELECT * FROM users ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
    H.sendJson(res, 200, { total, users: rows.map(adminUser) });
  });

  r.get('/api/admin/users/:id', async (req, res, { id }) => {
    ctx.requireAdmin(req);
    const u = userRow(id);
    const posts = db.prepare('SELECT data FROM posts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 10').all(id).map(x => {
      const p = JSON.parse(x.data);
      const errors = Object.entries(p.results || {}).filter(([, r2]) => r2 && !r2.ok).map(([net, r2]) => `${net}: ${r2.error}`);
      return { id: p.id, status: p.status, networks: p.networks, scheduledAt: p.scheduledAt, errors, text: String(Object.values(p.variants || {})[0] || '').slice(0, 160) };
    });
    const activity = db.prepare('SELECT action, detail, ip, created_at FROM activity WHERE target_id = ? OR actor_id = ? ORDER BY id DESC LIMIT 15').all(id, id);
    const ws = ctx.getWorkspace(u);
    H.sendJson(res, 200, { user: adminUser(u), brand: ws.voice || {}, posts, activity, connections: ctx.channels.connectionsFor(id).map(c => ({ network: c.network, name: c.name, handle: c.handle, status: c.status, active: c.active })) });
  });

  r.post('/api/admin/users', async (req, res) => {
    const me = ctx.requireAdmin(req);
    const b = await H.readJson(req, 16 * 1024);
    const email = A.normalizeEmail(b.email);
    const name = String(b.name || '').trim().slice(0, 80) || email.split('@')[0];
    if (!A.validEmail(email)) throw new H.HttpError(400, 'bad_email', 'Enter a valid email address.');
    if (one('SELECT 1 n FROM users WHERE email = ?', email)) throw new H.HttpError(409, 'email_taken', 'An account with this email already exists.');
    const role = ROLES.includes(b.role) ? b.role : 'member';
    const plan = PLANS.includes(b.plan) ? b.plan : 'free';
    const password = A.tempPassword();
    const u = ctx.createUser({ email, name, brand: String(b.brand || '').slice(0, 80), password, role, plan });
    ctx.log({ actorId: me.id, targetId: u.id, action: 'admin.user_created', detail: `${email} (${role}, ${plan})`, ip: req.ip });
    H.sendJson(res, 201, { user: adminUser(u), tempPassword: password });
  });

  r.patch('/api/admin/users/:id', async (req, res, { id }) => {
    const me = ctx.requireAdmin(req);
    const u = userRow(id);
    const b = await H.readJson(req, 16 * 1024);
    const changes = {};
    if (b.role != null) { if (!ROLES.includes(b.role)) throw new H.HttpError(400, 'bad_role', 'Unknown role.'); changes.role = b.role; }
    if (b.status != null) { if (!STATUSES.includes(b.status)) throw new H.HttpError(400, 'bad_status', 'Unknown status.'); changes.status = b.status; }
    if (b.plan != null) { if (!PLANS.includes(b.plan)) throw new H.HttpError(400, 'bad_plan', 'Unknown plan.'); changes.plan = b.plan; }
    if (b.name != null) { const nm = String(b.name).trim().slice(0, 80); if (!nm) throw new H.HttpError(400, 'name_required', 'Enter a name.'); changes.name = nm; }
    const demoting = (changes.role === 'member' && u.role === 'admin') || (changes.status === 'suspended' && u.role === 'admin' && u.status === 'active');
    if (demoting && u.id === me.id) throw new H.HttpError(409, 'self', 'You cannot remove your own admin access or suspend yourself.');
    if (demoting && activeAdmins() <= 1) throw new H.HttpError(409, 'last_admin', 'This is the only active admin.');
    const keys = Object.keys(changes);
    if (!keys.length) return H.sendJson(res, 200, { user: adminUser(u) });
    db.prepare(`UPDATE users SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`).run(...keys.map(k => changes[k]), id);
    if (changes.status === 'suspended') A.destroyUserSessions(db, id);
    ctx.log({ actorId: me.id, targetId: id, action: 'admin.user_updated', detail: `${u.email}: ` + keys.map(k => `${k} ${u[k]} → ${changes[k]}`).join(', '), ip: req.ip });
    H.sendJson(res, 200, { user: adminUser(userRow(id)) });
  });

  r.post('/api/admin/users/:id/reset-password', async (req, res, { id }) => {
    const me = ctx.requireAdmin(req);
    const u = userRow(id);
    const password = A.tempPassword();
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(A.hashPassword(password), id);
    A.destroyUserSessions(db, id, u.id === me.id ? req.token : null);
    ctx.log({ actorId: me.id, targetId: id, action: 'admin.password_reset', detail: u.email, ip: req.ip });
    H.sendJson(res, 200, { tempPassword: password });
  });

  r.post('/api/admin/users/:id/signout', async (req, res, { id }) => {
    const me = ctx.requireAdmin(req);
    const u = userRow(id);
    A.destroyUserSessions(db, id, u.id === me.id ? req.token : null);
    ctx.log({ actorId: me.id, targetId: id, action: 'admin.signed_out_user', detail: u.email, ip: req.ip });
    H.sendJson(res, 200, { ok: true });
  });

  r.del('/api/admin/users/:id', async (req, res, { id }) => {
    const me = ctx.requireAdmin(req);
    const u = userRow(id);
    if (u.id === me.id) throw new H.HttpError(409, 'self', 'You cannot delete your own account from here.');
    if (u.role === 'admin' && u.status === 'active' && activeAdmins() <= 1) throw new H.HttpError(409, 'last_admin', 'This is the only active admin.');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    ctx.log({ actorId: me.id, targetId: id, action: 'admin.user_deleted', detail: u.email, ip: req.ip });
    H.sendJson(res, 200, { ok: true });
  });

  r.get('/api/admin/activity', async (req, res) => {
    ctx.requireAdmin(req);
    const limit = Math.min(500, Math.max(1, Number(req.query.get('limit')) || 100));
    const rows = db.prepare(`SELECT a.id, a.action, a.detail, a.ip, a.created_at, a.target_id, u.email AS actor_email
                             FROM activity a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ?`).all(limit);
    H.sendJson(res, 200, { activity: rows });
  });

  r.get('/api/admin/settings', async (req, res) => {
    ctx.requireAdmin(req);
    H.sendJson(res, 200, { settings: ctx.settings() });
  });

  r.put('/api/admin/settings', async (req, res) => {
    const me = ctx.requireAdmin(req);
    const b = await H.readJson(req, 16 * 1024);
    const s = b.settings || {};
    const patch = {};
    if ('signupsOpen' in s) patch.signupsOpen = !!s.signupsOpen;
    if ('aiEnabled' in s) patch.aiEnabled = !!s.aiEnabled;
    if ('practiceMode' in s) patch.practiceMode = !!s.practiceMode;
    if ('announcement' in s) patch.announcement = String(s.announcement || '').slice(0, 300);
    if (s.aiDailyLimits && typeof s.aiDailyLimits === 'object') {
      patch.aiDailyLimits = {};
      for (const p of PLANS) patch.aiDailyLimits[p] = Math.max(0, Math.min(100000, Math.round(Number(s.aiDailyLimits[p]) || 0)));
    }
    const out = saveSettings(db, patch);
    ctx.log({ actorId: me.id, action: 'admin.settings_updated', detail: Object.keys(patch).join(', '), ip: req.ip });
    H.sendJson(res, 200, { settings: out });
  });
}

module.exports = { register };
