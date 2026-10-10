// Builds the request handler. index.js starts it; tests create it with an in-memory database.
const path = require('path');
const C = require('../public/assets/core.js');
const { openDb, getSettings, logActivity } = require('./db');
const H = require('./http');
const A = require('./auth');
const { runScheduler } = require('./scheduler');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const DEFAULT_SCHEDULE = [
  ['09:00', '18:30'], ['09:00', '13:00', '18:30'], ['09:00', '13:00', '18:30'], ['09:00', '13:00', '18:30'],
  ['09:00', '13:00', '18:30'], ['10:00', '16:00'], ['11:00', '19:00']
];

function defaultWorkspace(user) {
  const brand = user.brand || user.name || '';
  return {
    voice: { brand, about: '', audience: '', tone: 'Clear, warm and confident. Short sentences.', avoid: '', hashtags: '', lang: 'en' },
    schedule: DEFAULT_SCHEDULE.map(a => a.slice()),
    connected: { instagram: true, facebook: true, linkedin: true, x: true, tiktok: false, threads: false, youtube: false, pinterest: false },
    requireApproval: false, hidden: [], hideSamples: true, keywords: brand ? [brand] : []
  };
}

function createApp(config, opts = {}) {
  const dbPath = config.dbFile || path.join(config.dataDir, 'socialistem.db');
  const db = opts.db || openDb(dbPath);
  const loginLimiter = A.createLimiter(config.loginMaxAttempts, 15 * 60 * 1000);
  const router = H.createRouter();

  const ctx = {
    config, db, dbPath, C, loginLimiter, defaultWorkspace,
    settings: () => getSettings(db),
    log: (entry) => logActivity(db, entry),
    setSession(res, token) {
      res.setHeader('set-cookie', H.serializeCookie('sid', token, { maxAge: config.sessionDays * 86400, secure: config.secureCookies }));
    },
    clearSession(res) {
      res.setHeader('set-cookie', H.serializeCookie('sid', '', { maxAge: 0, secure: config.secureCookies }));
    },
    requireUser(req) {
      if (!req.user) throw new H.HttpError(401, 'unauthorized', 'Please log in.');
      return req.user;
    },
    requireAdmin(req) {
      const u = ctx.requireUser(req);
      if (u.role !== 'admin') throw new H.HttpError(403, 'forbidden', 'Admins only.');
      return u;
    },
    getWorkspace(user) {
      const row = db.prepare('SELECT data FROM workspaces WHERE user_id = ?').get(user.id);
      if (row) { try { return JSON.parse(row.data); } catch (e) { /* fall through to default */ } }
      const ws = defaultWorkspace(user);
      db.prepare('INSERT OR REPLACE INTO workspaces (user_id, data, updated_at) VALUES (?, ?, ?)').run(user.id, JSON.stringify(ws), new Date().toISOString());
      return ws;
    },
    createUser({ email, name, brand = '', password, role = 'member', plan = 'free' }) {
      const now = new Date().toISOString();
      const id = A.newId('u');
      db.prepare('INSERT INTO users (id, email, name, brand, password_hash, role, status, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, email, name, brand, A.hashPassword(password), role, 'active', plan, now);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      ctx.getWorkspace(user);
      return user;
    }
  };

  require('./routes/auth').register(router, ctx);
  require('./routes/workspace').register(router, ctx);
  require('./routes/ai').register(router, ctx);
  require('./routes/admin').register(router, ctx);

  seedAdmin(ctx);

  async function handle(req, res) {
    H.securityHeaders(res, config);
    const url = new URL(req.url, 'http://local');
    const pathname = url.pathname;
    req.query = url.searchParams;
    req.ip = H.clientIp(req, config.trustProxy);
    req.token = H.parseCookies(req.headers.cookie).sid || '';
    req.user = A.userForToken(db, req.token);

    try {
      if (pathname === '/healthz') return H.sendJson(res, 200, { ok: true, version: config.version });

      if (pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') checkCsrf(req);
        const m = router.match(req.method, pathname);
        if (!m) throw new H.HttpError(404, 'not_found', 'No such endpoint.');
        if (m.methodNotAllowed) throw new H.HttpError(405, 'method_not_allowed', 'Method not allowed.');
        return await m.handler(req, res, m.params);
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') throw new H.HttpError(405, 'method_not_allowed', 'Method not allowed.');
      return servePage(req, res, pathname, url);
    } catch (e) {
      if (res.headersSent) { try { res.end(); } catch (x) { /* already closed */ } return; }
      if (e instanceof H.HttpError) return H.sendJson(res, e.status, { code: e.code, message: e.message, ...e.extra });
      console.error('Unhandled error', e);
      return H.sendJson(res, 500, { code: 'server_error', message: 'Something went wrong on our side.' });
    }
  }

  function checkCsrf(req) {
    if (req.headers['x-socialistem'] !== '1') throw new H.HttpError(403, 'csrf', 'Missing request header.');
    const origin = req.headers.origin;
    if (origin) {
      let host;
      try { host = new URL(origin).host; } catch (e) { host = ''; }
      const fwdHost = config.trustProxy ? String(req.headers['x-forwarded-host'] || '').split(',')[0].trim() : '';
      if (host !== req.headers.host && host !== fwdHost) throw new H.HttpError(403, 'csrf', 'Cross-site request blocked.');
    }
  }

  function servePage(req, res, pathname, url) {
    const page = f => H.serveFile(res, PUBLIC_DIR, '/' + f, { cache: 'no-store' });
    if (pathname === '/' || pathname === '/index.html') return page('index.html');
    if (pathname === '/login' || pathname === '/signup') return req.user ? H.redirect(res, req.user.role === 'admin' && url.searchParams.get('next') === '/admin' ? '/admin' : '/app') : page('auth.html');
    if (pathname === '/app' || pathname.startsWith('/app/')) return req.user ? page('app.html') : H.redirect(res, '/login?next=/app');
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      if (!req.user) return H.redirect(res, '/login?next=/admin');
      return req.user.role === 'admin' ? page('admin.html') : H.redirect(res, '/app');
    }
    if (pathname.startsWith('/assets/') && H.serveFile(res, PUBLIC_DIR, pathname, { cache: 'public, max-age=300' })) return;
    if (pathname === '/favicon.ico' || pathname === '/favicon.svg') { if (H.serveFile(res, PUBLIC_DIR, '/assets/favicon.svg', { cache: 'public, max-age=86400' })) return; }
    if (pathname === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('User-agent: *\nDisallow: /app\nDisallow: /admin\nDisallow: /api/\n'); }
    if (!H.serveFile(res, PUBLIC_DIR, '/404.html', { cache: 'no-store', status: 404 })) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); }
  }

  let timer = null;
  if (config.schedulerMs > 0 && !opts.noScheduler) {
    timer = setInterval(() => { try { runScheduler(db); } catch (e) { console.error('Scheduler error', e); } }, config.schedulerMs);
    timer.unref();
  }

  return { handle, db, ctx, close() { if (timer) clearInterval(timer); } };
}

/** Create or promote the admin named in ADMIN_EMAIL / ADMIN_PASSWORD. Never overwrites an existing password. */
function seedAdmin(ctx) {
  const { config, db } = ctx;
  if (!config.adminEmail) return;
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(config.adminEmail);
  if (existing) {
    if (existing.role !== 'admin') {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
      ctx.log({ targetId: existing.id, action: 'admin.promoted_by_config', detail: config.adminEmail });
    }
    return;
  }
  if (!config.adminPassword) { console.warn('ADMIN_EMAIL is set but ADMIN_PASSWORD is empty; no admin account was created.'); return; }
  const problem = A.passwordProblem(config.adminPassword);
  if (problem) { console.warn('ADMIN_PASSWORD is too weak; no admin account was created. ' + problem); return; }
  const u = ctx.createUser({ email: config.adminEmail, name: 'Admin', password: config.adminPassword, role: 'admin', plan: 'business' });
  ctx.log({ targetId: u.id, action: 'admin.created_by_config', detail: config.adminEmail });
}

module.exports = { createApp, defaultWorkspace, DEFAULT_SCHEDULE };
