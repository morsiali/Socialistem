// Password hashing (scrypt), session tokens and request authentication.
const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Returns an error message, or '' when the password is acceptable. */
function passwordProblem(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Use at least 8 characters for the password.';
  if (pw.length > 200) return 'That password is too long.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number in the password.';
  return '';
}

function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }
function validEmail(e) { return EMAIL_RE.test(e) && e.length <= 254; }

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const newId = prefix => prefix + '_' + crypto.randomBytes(12).toString('base64url');

function createSession(db, userId, { days, ip, userAgent }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + days * 86400000);
  db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sha256(token), userId, now.toISOString(), expires.toISOString(), ip || null, String(userAgent || '').slice(0, 200));
  return { token, expires };
}

function userForToken(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.*, s.id_hash AS session_hash, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`).get(sha256(token));
  if (!row) return null;
  if (new Date(row.expires_at) <= new Date() || row.status !== 'active') {
    db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(row.session_hash);
    return null;
  }
  return row;
}

function destroySession(db, token) { if (token) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(sha256(token)); }
function destroyUserSessions(db, userId, exceptToken) {
  if (exceptToken) db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?').run(userId, sha256(exceptToken));
  else db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, brand: u.brand, role: u.role, status: u.status, plan: u.plan, createdAt: u.created_at, lastLoginAt: u.last_login_at };
}

/** Generates a readable temporary password that passes passwordProblem(). */
function tempPassword() {
  const words = ['coral', 'falcon', 'harbor', 'dune', 'cedar', 'saffron', 'lumen', 'pearl', 'marina', 'oasis', 'amber', 'zephyr'];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${pick()}-${crypto.randomInt(1000, 9999)}`;
}

/** Simple in-memory limiter for login attempts: key -> timestamps within the window. */
function createLimiter(max, windowMs) {
  const hits = new Map();
  return {
    hit(key) {
      const now = Date.now();
      const list = (hits.get(key) || []).filter(t => now - t < windowMs);
      list.push(now);
      hits.set(key, list);
      if (hits.size > 10000) for (const k of hits.keys()) { hits.delete(k); if (hits.size < 5000) break; }
      return list.length;
    },
    count(key) { const now = Date.now(); return (hits.get(key) || []).filter(t => now - t < windowMs).length; },
    reset(key) { hits.delete(key); },
    max
  };
}

module.exports = {
  hashPassword, verifyPassword, passwordProblem, normalizeEmail, validEmail, newId, sha256,
  createSession, userForToken, destroySession, destroyUserSessions, publicUser, tempPassword, createLimiter
};
