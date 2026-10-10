// Sign up, log in, log out, current user, and the member's own account.
const H = require('../http');
const A = require('../auth');

function register(r, ctx) {
  const { db, config } = ctx;

  r.get('/api/public/config', async (req, res) => {
    const s = ctx.settings();
    H.sendJson(res, 200, { appName: config.appName, signupsOpen: !!s.signupsOpen, supportEmail: config.supportEmail, loggedIn: !!req.user });
  });

  r.post('/api/auth/signup', async (req, res) => {
    const s = ctx.settings();
    const b = await H.readJson(req, 16 * 1024);
    const email = A.normalizeEmail(b.email);
    const name = String(b.name || '').trim().slice(0, 80);
    const brand = String(b.brand || '').trim().slice(0, 80);
    const isConfiguredAdmin = config.adminEmail && email === config.adminEmail;
    if (!s.signupsOpen && !isConfiguredAdmin) throw new H.HttpError(403, 'signups_closed', 'New sign-ups are closed right now.');
    if (!name) throw new H.HttpError(400, 'name_required', 'Enter your name.');
    if (!A.validEmail(email)) throw new H.HttpError(400, 'bad_email', 'Enter a valid email address.');
    const problem = A.passwordProblem(b.password);
    if (problem) throw new H.HttpError(400, 'weak_password', problem);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new H.HttpError(409, 'email_taken', 'An account with this email already exists. Log in instead.');
    const user = ctx.createUser({ email, name, brand, password: b.password, role: isConfiguredAdmin ? 'admin' : 'member' });
    const { token } = A.createSession(db, user.id, { days: config.sessionDays, ip: req.ip, userAgent: req.headers['user-agent'] });
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
    ctx.log({ actorId: user.id, targetId: user.id, action: 'user.signup', detail: email, ip: req.ip });
    ctx.setSession(res, token);
    H.sendJson(res, 201, { user: A.publicUser(user) });
  });

  r.post('/api/auth/login', async (req, res) => {
    const b = await H.readJson(req, 16 * 1024);
    const email = A.normalizeEmail(b.email);
    const keyIp = 'ip:' + req.ip, keyPair = 'pair:' + req.ip + '|' + email;
    if (ctx.loginLimiter.count(keyPair) >= ctx.loginLimiter.max || ctx.loginLimiter.count(keyIp) >= ctx.loginLimiter.max * 5) {
      throw new H.HttpError(429, 'too_many_attempts', 'Too many attempts. Wait 15 minutes, then try again.');
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !A.verifyPassword(b.password || '', user.password_hash)) {
      ctx.loginLimiter.hit(keyPair); ctx.loginLimiter.hit(keyIp);
      if (user) ctx.log({ targetId: user.id, action: 'user.login_failed', ip: req.ip });
      throw new H.HttpError(401, 'bad_credentials', 'Email or password is incorrect.');
    }
    if (user.status !== 'active') throw new H.HttpError(403, 'suspended', 'This account is suspended. Contact support.');
    ctx.loginLimiter.reset(keyPair);
    const { token } = A.createSession(db, user.id, { days: config.sessionDays, ip: req.ip, userAgent: req.headers['user-agent'] });
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
    ctx.log({ actorId: user.id, targetId: user.id, action: 'user.login', ip: req.ip });
    ctx.setSession(res, token);
    H.sendJson(res, 200, { user: A.publicUser(user) });
  });

  r.post('/api/auth/logout', async (req, res) => {
    A.destroySession(db, req.token);
    ctx.clearSession(res);
    H.sendJson(res, 200, { ok: true });
  });

  r.get('/api/auth/me', async (req, res) => {
    const u = ctx.requireUser(req);
    H.sendJson(res, 200, { user: A.publicUser(u) });
  });

  r.patch('/api/account', async (req, res) => {
    const u = ctx.requireUser(req);
    const b = await H.readJson(req, 16 * 1024);
    const name = b.name != null ? String(b.name).trim().slice(0, 80) : u.name;
    const brand = b.brand != null ? String(b.brand).trim().slice(0, 80) : u.brand;
    if (!name) throw new H.HttpError(400, 'name_required', 'Enter your name.');
    db.prepare('UPDATE users SET name = ?, brand = ? WHERE id = ?').run(name, brand, u.id);
    H.sendJson(res, 200, { user: A.publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
  });

  r.post('/api/account/password', async (req, res) => {
    const u = ctx.requireUser(req);
    const b = await H.readJson(req, 16 * 1024);
    if (!A.verifyPassword(b.current || '', u.password_hash)) throw new H.HttpError(400, 'bad_password', 'Your current password is incorrect.');
    const problem = A.passwordProblem(b.next);
    if (problem) throw new H.HttpError(400, 'weak_password', problem);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(A.hashPassword(b.next), u.id);
    A.destroyUserSessions(db, u.id, req.token);
    ctx.log({ actorId: u.id, targetId: u.id, action: 'user.password_changed', ip: req.ip });
    H.sendJson(res, 200, { ok: true });
  });

  r.post('/api/account/signout-others', async (req, res) => {
    const u = ctx.requireUser(req);
    A.destroyUserSessions(db, u.id, req.token);
    H.sendJson(res, 200, { ok: true });
  });

  r.del('/api/account', async (req, res) => {
    const u = ctx.requireUser(req);
    const b = await H.readJson(req, 16 * 1024);
    if (!A.verifyPassword(b.password || '', u.password_hash)) throw new H.HttpError(400, 'bad_password', 'Your password is incorrect.');
    if (u.role === 'admin') {
      const admins = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND status = 'active'").get().n;
      if (admins <= 1) throw new H.HttpError(409, 'last_admin', 'You are the only admin. Make someone else an admin first.');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    ctx.log({ targetId: u.id, action: 'user.deleted_self', detail: u.email, ip: req.ip });
    ctx.clearSession(res);
    H.sendJson(res, 200, { ok: true });
  });

  r.get('/api/account/usage', async (req, res) => {
    const u = ctx.requireUser(req);
    H.sendJson(res, 200, usageFor(ctx, u));
  });
}

function usageFor(ctx, u) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);
  const q = ctx.db.prepare('SELECT COUNT(*) n, COALESCE(SUM(input_tokens + output_tokens), 0) t FROM ai_usage WHERE user_id = ? AND ok = 1 AND created_at >= ?');
  const today = q.get(u.id, day + 'T00:00:00.000Z');
  const mon = q.get(u.id, month + '-01T00:00:00.000Z');
  const s = ctx.settings();
  return {
    plan: u.plan, unlimited: u.role === 'admin',
    limit: (s.aiDailyLimits && s.aiDailyLimits[u.plan]) || 0,
    today: Number(today.n), month: Number(mon.n), monthTokens: Number(mon.t), aiEnabled: !!s.aiEnabled, aiConfigured: !!ctx.config.anthropicKey
  };
}

module.exports = { register, usageFor };
