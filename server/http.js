// Minimal HTTP toolkit: routing, JSON bodies, cookies, static files and security headers.
const fs = require('fs');
const path = require('path');

class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra || {};
  }
}

function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(data), ...headers });
  res.end(data);
}

function redirect(res, location, status = 302) {
  res.writeHead(status, { location, 'cache-control': 'no-store' });
  res.end();
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limitBytes) { reject(new HttpError(413, 'too_large', 'That request is too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req, limitBytes = 1024 * 1024) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) throw new HttpError(415, 'json_required', 'Send JSON.');
  const raw = await readBody(req, limitBytes);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return v;
  } catch (e) {
    throw new HttpError(400, 'bad_json', 'The request body is not valid JSON.');
  }
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    if (k) { try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* skip malformed */ } }
  });
  return out;
}

function serializeCookie(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Lax', path: p = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${p}; SameSite=${sameSite}`;
  if (maxAge != null) c += `; Max-Age=${Math.floor(maxAge)}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  return c;
}

function createRouter() {
  const routes = [];
  function add(method, pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handler });
  }
  function match(method, pathname) {
    let pathMatched = false;
    for (const r of routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
  return {
    get: (p, h) => add('GET', p, h), post: (p, h) => add('POST', p, h), put: (p, h) => add('PUT', p, h),
    patch: (p, h) => add('PATCH', p, h), del: (p, h) => add('DELETE', p, h), match
  };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');

function securityHeaders(res, config) {
  res.setHeader('content-security-policy', CSP);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  if (config.secureCookies) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

/** Serve a file from root without escaping it. Returns false when there is no such file. */
function serveFile(res, root, relPath, { cache = 'no-cache', status = 200 } = {}) {
  let decoded;
  try { decoded = decodeURIComponent(relPath); } catch (e) { return false; }
  if (decoded.includes('\0')) return false;
  const full = path.resolve(root, '.' + path.posix.normalize('/' + decoded));
  if (full !== root && !full.startsWith(root + path.sep)) return false;
  let stat;
  try { stat = fs.statSync(full); } catch (e) { return false; }
  if (!stat.isFile()) return false;
  res.writeHead(status, { 'content-type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream', 'content-length': stat.size, 'cache-control': cache });
  fs.createReadStream(full).pipe(res);
  return true;
}

function clientIp(req, trustProxy) {
  if (trustProxy) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) return xf;
  }
  return req.socket.remoteAddress || '';
}

module.exports = { HttpError, sendJson, redirect, readJson, parseCookies, serializeCookie, createRouter, securityHeaders, serveFile, clientIp };
