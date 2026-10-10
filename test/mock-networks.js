// A fake LinkedIn, X, Meta (Facebook + Instagram) and Threads API for tests and local previews.
const http = require('http');
const crypto = require('crypto');

/* ---------- mock social networks ---------- */
function startMockNetworks() {
  const calls = [];
  const state = { xChallenge: '', revoked: new Set(), igPolls: 0, fetchedImages: [] };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      const raw = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://mock');
      const p = url.pathname, q = url.searchParams;
      const ct = String(req.headers['content-type'] || '');
      let body = {};
      if (ct.includes('application/json')) body = JSON.parse(raw.toString() || '{}');
      else if (ct.includes('urlencoded')) body = Object.fromEntries(new URLSearchParams(raw.toString()));
      const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const token = bearer || body.access_token || q.get('access_token') || '';
      calls.push({ method: req.method, path: p, query: Object.fromEntries(q), body, token, headers: req.headers, raw });
      const json = (status, data, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
      // Sign-in pages: approve straight away and send the browser back with a code (for browser previews).
      const AUTH = { '/li/auth': 'li-code', '/x/auth': 'x-code', '/fb/dialog': 'fb-code', '/th/auth': 'th-code' };
      if (req.method === 'GET' && AUTH[p]) {
        if (p === '/x/auth') state.xChallenge = q.get('code_challenge');
        res.writeHead(302, { location: `${q.get('redirect_uri')}?code=${AUTH[p]}&state=${encodeURIComponent(q.get('state'))}` });
        return res.end();
      }
      if (state.revoked.has(token)) return json(401, { error: { message: 'Invalid access token', type: 'OAuthException' } });

      // LinkedIn
      if (p === '/li/token') return body.code === 'li-code' ? json(200, { access_token: 'li-token', expires_in: 5184000 }) : json(400, { error_description: 'bad code' });
      if (p === '/li/v2/userinfo') return json(200, { sub: 'li-member-1', name: 'Mona Linked' });
      if (p === '/li/v2/assets') return json(200, { value: { asset: 'urn:li:digitalmediaAsset:A1', uploadMechanism: { 'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: `http://127.0.0.1:${server.address().port}/li/upload` } } } });
      if (p === '/li/upload') { res.writeHead(201); return res.end(); }
      if (p === '/li/v2/ugcPosts') return json(201, { id: 'urn:li:share:999' }, { 'x-restli-id': 'urn:li:share:999' });

      // X
      if (p === '/x/2/oauth2/token') {
        if (req.headers.authorization !== 'Basic ' + Buffer.from('x-id:x-secret').toString('base64')) return json(401, { error: 'unauthorized_client' });
        if (body.grant_type === 'authorization_code') {
          const challenge = crypto.createHash('sha256').update(body.code_verifier || '').digest('base64url');
          if (challenge !== state.xChallenge) return json(400, { error: 'invalid_request', error_description: 'PKCE check failed' });
          return json(200, { access_token: 'x-token-1', refresh_token: 'x-refresh-1', expires_in: 7200 });
        }
        if (body.grant_type === 'refresh_token' && body.refresh_token === 'x-refresh-1') return json(200, { access_token: 'x-token-2', refresh_token: 'x-refresh-2', expires_in: 7200 });
        return json(400, { error: 'invalid_grant' });
      }
      if (p === '/x/2/users/me') return json(200, { data: { id: '42', name: 'Mona X', username: 'mona' } });
      if (p === '/x/2/media/upload') return ct.includes('multipart/form-data') && raw.includes(Buffer.from('tweet_image')) ? json(200, { data: { id: '777' } }) : json(400, { errors: [{ message: 'bad upload' }] });
      if (p === '/x/2/tweets') return json(201, { data: { id: '1001', text: body.text } });

      // Meta (Facebook + Instagram)
      if (p === '/fb/v25.0/oauth/access_token') {
        if (q.get('fb_exchange_token') === 'fb-short') return json(200, { access_token: 'fb-long' });
        return q.get('code') === 'fb-code' ? json(200, { access_token: 'fb-short' }) : json(400, { error: { message: 'bad code' } });
      }
      if (p === '/fb/v25.0/me/accounts') return json(200, { data: [{ id: 'page1', name: 'Mona Cafe', access_token: 'page-token', instagram_business_account: { id: 'ig1', username: 'monacafe' } }] });
      if (p === '/fb/v25.0/page1/feed') return json(200, { id: 'page1_55' });
      if (p === '/fb/v25.0/page1/photos' || p === '/fb/v25.0/ig1/media') {
        // The real networks download the image from our public URL, so the mock does too.
        const img = await fetch(body.url || body.image_url);
        const buf = Buffer.from(await img.arrayBuffer());
        state.fetchedImages.push({ status: img.status, type: img.headers.get('content-type'), jpeg: buf[0] === 0xff && buf[1] === 0xd8 });
        if (!img.ok) return json(400, { error: { message: 'Image could not be downloaded' } });
        return p.endsWith('photos') ? json(200, { id: 'photo1', post_id: 'page1_56' }) : json(200, { id: 'cont1' });
      }
      if (p === '/fb/v25.0/cont1') { state.igPolls += 1; return json(200, { status_code: state.igPolls < 2 ? 'IN_PROGRESS' : 'FINISHED' }); }
      if (p === '/fb/v25.0/ig1/media_publish') return body.creation_id === 'cont1' ? json(200, { id: 'igpost1' }) : json(400, { error: { message: 'bad container' } });
      if (p === '/fb/v25.0/igpost1') return json(200, { permalink: 'https://www.instagram.com/p/abc/' });

      // Threads
      if (p === '/th/oauth/access_token') return body.code === 'th-code' ? json(200, { access_token: 'th-short', user_id: 9 }) : json(400, { error: { message: 'bad code' } });
      if (p === '/th/access_token') return json(200, { access_token: 'th-long', expires_in: 5184000 });
      if (p === '/th/refresh_access_token') return json(200, { access_token: 'th-long-2', expires_in: 5184000 });
      if (p === '/th/v1.0/me') return json(200, { id: '9', username: 'mona.th' });
      if (p === '/th/v1.0/9/threads') return json(200, { id: 'thc1' });
      if (p === '/th/v1.0/thc1') return json(200, { status: 'FINISHED' });
      if (p === '/th/v1.0/9/threads_publish') return json(200, { id: 'thp1' });
      if (p === '/th/v1.0/thp1') return json(200, { permalink: 'https://www.threads.net/@mona.th/post/thp1' });

      json(404, { error: { message: 'mock: no route ' + req.method + ' ' + p } });
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    resolve({ server, calls, state, url, find: (path, method = 'POST') => calls.filter(c => c.path === path && c.method === method) });
  }));
}


module.exports = { startMockNetworks };
