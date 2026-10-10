/* Socialistem admin console: overview, members, activity and platform settings. */
(() => {
'use strict';
const C = window.SocialistemCore;
const ICONS = {
  chart: 'M4 20V11M10 20V5M16 20v-6M2 20h20',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  settings: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M15 5v4M9 10v4M17 15v4',
  x: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14', copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  arrow: 'M5 12h14M13 6l6 6-6 6', info: 'M12 16v-5M12 8h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', done: 'M5 12.5l4.5 4.5L19 7.5',
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5'
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;
const $ = (s, el = document) => el.querySelector(s);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
const fmtDate = iso => { if (!iso) return '—'; const d = new Date(iso); return `${d.getDate()} ${C.MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`; };
const ago = iso => (iso ? C.relativeTime(new Date(iso), new Date()) : 'never');
const fmtBytes = b => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? Math.round(b / 1024) + ' KB' : b + ' B');
const fmtUptime = s => (s > 86400 ? Math.floor(s / 86400) + 'd ' : '') + Math.floor((s % 86400) / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, { method, credentials: 'same-origin', headers: { 'x-socialistem': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) { throw { code: 'offline', message: 'You appear to be offline.' }; }
  if (res.status === 401) { location.href = '/login?next=/admin'; throw { code: 'unauthorized' }; }
  if (res.status === 403) { location.href = '/app'; throw { code: 'forbidden' }; }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw (data && data.code ? data : { code: 'server_error', message: 'The server could not complete that request.' });
  return data;
}
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4200); }

const ROUTES = { overview: ['Overview', 'chart'], users: ['Members', 'users'], activity: ['Activity', 'clock'], settings: ['Settings', 'settings'] };
const S = { route: 'overview', me: null, ov: null, users: { list: [], total: 0, q: '', filter: 'all' }, activity: null, settings: null, drawer: null, confirm: null, saveMsg: '', err: '' };
const ACTIONS = {
  'user.signup': 'Signed up', 'user.login': 'Logged in', 'user.login_failed': 'Failed login attempt', 'user.password_changed': 'Changed password',
  'user.deleted_self': 'Deleted own account', 'admin.user_created': 'Created a member', 'admin.user_updated': 'Updated a member',
  'admin.password_reset': 'Reset a password', 'admin.signed_out_user': 'Signed a member out', 'admin.user_deleted': 'Deleted a member',
  'admin.settings_updated': 'Changed platform settings', 'admin.created_by_config': 'Admin created from server settings',
  'admin.promoted_by_config': 'Promoted to admin from server settings', 'post.scheduled': 'Scheduled a post', 'post.approval': 'Sent a post for approval', 'post.sent': 'Published a post',
  'post.published': 'Published a post', 'post.publish_failed': 'A post failed to publish', 'channel.connected': 'Connected a channel', 'channel.disconnected': 'Disconnected a channel'
};

/* ---------------- render ---------------- */
function render() {
  $('#nav').innerHTML = '<div class="nav-label">Admin</div>' + Object.entries(ROUTES).map(([id, [l, i]]) =>
    `<a href="#${id}" data-go="${id}"${S.route === id ? ' aria-current="page"' : ''}>${ic(i)}<span>${l}</span>${id === 'users' && S.ov ? `<span class="count">${S.ov.users.total}</span>` : ''}</a>`).join('');
  const me = S.me;
  $('#rail-foot').innerHTML = me ? `<a class="btn ghost" href="/app" style="justify-content:flex-start">${ic('home')}Open member app</a>
    <div class="me"><span class="avatar">${esc(String(me.name || me.email).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><div class="grow"><b>${esc(me.name)}</b><small>${esc(me.email)}</small></div></div>
    <div class="me-links"><button class="btn ghost sm" data-act="logout">Log out</button></div>` : '';
  $('#view').innerHTML = (S.err ? `<div class="banner err" role="alert">${ic('info')}<div class="grow">${esc(S.err)}</div></div>` : '') + (VIEWS[S.route] || VIEWS.overview)();
  mountCharts();
  renderDrawer();
}
const VIEWS = {};

VIEWS.overview = () => {
  const o = S.ov;
  if (!o) return '<div class="empty"><h3>Loading overview…</h3></div>';
  const tile = (k, v, p) => `<div class="kpi-card"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span><span class="p">${esc(p)}</span></div>`;
  const planTotal = Object.values(o.users.plans).reduce((a, b) => a + b, 0) || 1;
  const kindMax = Math.max(1, ...o.ai.byKind.map(k => k.n));
  return `
  <header class="vh"><div><h1>Overview</h1><p class="sub">How Socialistem is doing today.</p></div><div class="vh-actions"><button class="btn sm" data-act="refresh">Refresh</button></div></header>
  ${!o.system.aiConfigured ? `<div class="banner err">${ic('info')}<div class="grow"><b>AI is not set up.</b> Add <code>ANTHROPIC_API_KEY</code> to the server's environment variables and restart it. Members can still write and schedule posts by hand.</div></div>` : ''}
  <div class="admin-kpis">
    ${tile('Members', C.fmtInt(o.users.total), `+${o.users.new7} this week · +${o.users.new30} in 30 days`)}
    ${tile('Active this week', C.fmtInt(o.users.active7), `${o.users.total ? Math.round(o.users.active7 / o.users.total * 100) : 0}% of members`)}
    ${tile('Scheduled posts', C.fmtInt(o.posts.scheduled), `${o.posts.next7} in the next 7 days`)}
    ${tile('Published posts', C.fmtInt(o.posts.sent), `${o.posts.failed || 0} failed · ${o.posts.drafts} drafts · ${o.posts.approval} awaiting approval`)}
    ${tile('AI requests today', C.fmtInt(o.ai.today), `${C.fmtInt(o.ai.month)} this month`)}
    ${tile('AI tokens this month', C.fmtCompact(o.ai.tokensMonth), `${o.ai.failedMonth} failed requests`)}
  </div>
  <div class="grid-2e">
    <article class="card"><div class="card-head"><div><h2>New members</h2><p class="sub">Sign-ups per day, last 30 days</p></div><span class="badge">${C.fmtInt(o.series.signups.reduce((a, b) => a + b, 0))} total</span></div><div class="bars-chart" data-chart="signups" role="img" aria-label="Sign-ups per day for the last 30 days"></div></article>
    <article class="card"><div class="card-head"><div><h2>AI requests</h2><p class="sub">Successful requests per day, last 30 days</p></div><span class="badge">${C.fmtInt(o.series.ai.reduce((a, b) => a + b, 0))} total</span></div><div class="bars-chart" data-chart="ai" role="img" aria-label="AI requests per day for the last 30 days"></div></article>
  </div>
  <div class="grid-2e">
    <article class="card"><div class="card-head"><div><h2>Newest members</h2><p class="sub">Most recent sign-ups</p></div><a class="btn sm" href="#users" data-go="users">All members ${ic('arrow', 'sm')}</a></div>
      <div class="team">${o.recentUsers.map(u => `<div class="member"><span class="avatar">${esc(String(u.name || u.email)[0].toUpperCase())}</span><div class="grow"><b>${esc(u.name)}</b><small>${esc(u.email)} · joined ${esc(ago(u.createdAt))}</small></div><span class="pill ${u.role === 'admin' ? 'admin' : ''}">${esc(u.role)}</span><button class="btn ghost sm" data-act="open-user" data-id="${esc(u.id)}">Manage</button></div>`).join('') || '<p class="sub">No members yet.</p>'}</div></article>
    <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
      <article class="card"><div class="card-head"><div><h2>Plans</h2><p class="sub">Members on each plan</p></div></div>
        <div class="bars">${Object.entries(o.users.plans).map(([p, n]) => `<div class="bar-row" data-tip="${esc(p)}: ${n} members"><span class="name" style="text-transform:capitalize">${esc(p)}</span><div class="bar-track"><div class="bar-fill" style="width:${(n / planTotal * 100).toFixed(1)}%"></div></div><span class="val">${n}<small>${Math.round(n / planTotal * 100)}%</small></span></div>`).join('')}</div></article>
      <article class="card"><div class="card-head"><div><h2>AI by feature</h2><p class="sub">Requests this month</p></div></div>
        <div class="bars">${o.ai.byKind.map(k => `<div class="bar-row" data-tip="${esc(k.kind)}: ${k.n} requests"><span class="name" style="text-transform:capitalize">${esc(k.kind)}</span><div class="bar-track"><div class="bar-fill" style="width:${(k.n / kindMax * 100).toFixed(1)}%"></div></div><span class="val">${C.fmtInt(k.n)}</span></div>`).join('') || '<p class="sub">No AI requests yet this month.</p>'}</div></article>
    </div>
  </div>
  <div class="grid-2e">${channelsCard(o.channels)}${systemCard(o.system)}</div>`;
};
const NET_NAMES = { linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', x: 'X', threads: 'Threads' };
const ENV_NAMES = { linkedin: 'LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET', x: 'X_CLIENT_ID / X_CLIENT_SECRET', meta: 'META_APP_ID / META_APP_SECRET', threads: 'THREADS_APP_ID / THREADS_APP_SECRET' };
function channelsCard(ch) {
  if (!ch) return '';
  const row = (k, v) => `<div class="status-row"><span>${esc(k)}</span><b>${v}</b></div>`;
  const off = ch.providers.filter(p => !p.configured);
  return `<article class="card"><div class="card-head"><div><h2>Social channels</h2><p class="sub">Which networks members can connect, and how many have</p></div></div><div class="status-list">
    ${ch.providers.map(p => row(p.name, p.configured ? `<span class="pill active">Ready</span> ${p.networks.map(n => `${esc(NET_NAMES[n] || n)}: ${C.fmtInt(ch.byNetwork[n] || 0)}`).join(' · ')}` : '<span class="pill suspended">Keys missing</span>')).join('')}
    ${row('Need reconnecting', C.fmtInt(ch.needReconnect || 0))}
    ${row('Practice mode', ch.practiceMode ? '<span class="pill">On</span>' : 'Off')}</div>
    ${off.length ? `<p class="sub" style="margin-top:10px">To switch a network on, add its keys to the server's environment variables: ${off.map(p => `<code>${esc(ENV_NAMES[p.id])}</code>`).join(', ')}.</p>` : ''}</article>`;
}
function systemCard(sys) {
  const row = (k, v) => `<div class="status-row"><span>${esc(k)}</span><b>${v}</b></div>`;
  return `<article class="card"><div class="card-head"><div><h2>System</h2><p class="sub">Server and AI configuration</p></div></div><div class="status-list">
    ${row('AI engine', sys.aiConfigured ? '<span class="pill active">Connected</span>' : '<span class="pill suspended">API key missing</span>')}
    ${row('Fast model', esc(sys.modelFast))}${row('Best model', esc(sys.modelBest))}
    ${row('Database size', esc(fmtBytes(sys.dbBytes)))}${row('Public address', esc(sys.publicUrl))}
    ${row('Version', esc(sys.version) + ' · Node ' + esc(sys.node))}${row('Uptime', esc(fmtUptime(sys.uptimeSec)))}</div></article>`;
}

VIEWS.users = () => {
  const u = S.users;
  return `
  <header class="vh"><div><h1>Members</h1><p class="sub">Everyone with a Socialistem account. Change roles and plans, suspend accounts or reset passwords.</p></div><div class="vh-actions"><button class="btn primary" data-act="add-user">${ic('plus')}Add member</button></div></header>
  <div class="toolbar"><div class="users-tools"><label class="sr" for="user-q">Search members</label><input class="input" id="user-q" type="search" placeholder="Search name, email or brand" value="${esc(u.q)}">
    <div class="seg" role="group" aria-label="Filter">${[['all', 'All'], ['members', 'Members'], ['admins', 'Admins'], ['suspended', 'Suspended']].map(([id, l]) => `<button data-act="ufilter" data-f="${id}" aria-pressed="${u.filter === id}">${l}</button>`).join('')}</div></div>
    <span class="sub">${C.fmtInt(u.total)} ${u.total === 1 ? 'member' : 'members'}</span></div>
  <article class="card" style="padding:6px 8px"><div class="tbl-wrap"><table>
    <thead><tr><th>Member</th><th>Role</th><th>Plan</th><th>Status</th><th class="num">Posts</th><th class="num">Channels</th><th class="num">AI this month</th><th>Last login</th><th>Joined</th><th></th></tr></thead>
    <tbody>${u.list.map(x => `<tr><td><span class="who"><b>${esc(x.name)}</b><small>${esc(x.email)}${x.brand ? ' · ' + esc(x.brand) : ''}</small></span></td>
      <td><span class="pill ${x.role === 'admin' ? 'admin' : ''}">${esc(x.role)}</span></td><td style="text-transform:capitalize">${esc(x.plan)}</td>
      <td><span class="pill ${x.status}">${esc(x.status)}</span></td><td class="num">${C.fmtInt(x.posts)}${x.failed ? ` <span class="pill suspended" title="Posts that failed to publish">${x.failed} failed</span>` : ''}</td><td class="num">${C.fmtInt(x.channels || 0)}</td><td class="num">${C.fmtInt(x.aiMonth)}</td>
      <td>${esc(ago(x.lastLoginAt))}</td><td>${esc(fmtDate(x.createdAt))}</td><td><button class="btn sm" data-act="open-user" data-id="${esc(x.id)}">Manage</button></td></tr>`).join('') || '<tr><td colspan="10" class="sub">No members match.</td></tr>'}</tbody></table></div></article>`;
};

VIEWS.activity = () => {
  const a = S.activity;
  return `
  <header class="vh"><div><h1>Activity</h1><p class="sub">Sign-ups, logins, admin changes and publishing, newest first.</p></div><div class="vh-actions"><button class="btn sm" data-act="refresh">Refresh</button></div></header>
  <article class="card" style="padding:6px 8px"><div class="tbl-wrap"><table><thead><tr><th>When</th><th>What</th><th>By</th><th>Details</th><th>IP</th></tr></thead>
  <tbody>${a ? a.map(r => `<tr><td style="white-space:nowrap" title="${esc(r.created_at)}">${esc(ago(r.created_at))}</td><td><b>${esc(ACTIONS[r.action] || r.action)}</b></td><td>${esc(r.actor_email || 'System')}</td><td><span class="clip">${esc(r.detail)}</span></td><td class="sub">${esc(r.ip || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="sub">Nothing yet.</td></tr>' : '<tr><td colspan="5" class="sub">Loading…</td></tr>'}</tbody></table></div></article>`;
};

VIEWS.settings = () => {
  const s = S.settings;
  if (!s) return '<div class="empty"><h3>Loading settings…</h3></div>';
  const sw = (k, on, label, help) => `<div class="chan"><div class="grow"><b>${label}</b><small>${help}</small></div><button type="button" class="switch" role="switch" aria-checked="${!!on}" aria-label="${label}" data-act="toggle-setting" data-k="${k}"></button></div>`;
  return `
  <header class="vh"><div><h1>Settings</h1><p class="sub">Platform-wide switches. They apply to every member right away.</p></div></header>
  ${S.saveMsg ? `<div class="banner ok" role="status">${ic('done')}<div class="grow">${esc(S.saveMsg)}</div></div>` : ''}
  <form class="settings" data-form="settings">
    <article class="card"><div class="card-head"><div><h2>Access</h2><p class="sub">Who can join and use AI</p></div></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${sw('signupsOpen', s.signupsOpen, 'Open sign-ups', 'Anyone can create an account at /signup')}
        ${sw('aiEnabled', s.aiEnabled, 'AI features', 'Writing, rewriting, replies, ideas, briefs and the assistant')}
        ${sw('practiceMode', s.practiceMode, 'Practice mode', 'Posts to channels a member has not connected are marked as published without going live. Use it for demos; keep it off for real use.')}
      </div></article>
    <article class="card"><div class="card-head"><div><h2>Daily AI limits</h2><p class="sub">Requests per member per day, by plan. Admins have no limit.</p></div></div>
      <div class="form-grid">${['free', 'pro', 'business'].map(p => `<div class="field"><label class="lbl" for="lim-${p}" style="text-transform:capitalize">${p}</label><input class="input" id="lim-${p}" type="number" min="0" max="100000" step="1" value="${Number(s.aiDailyLimits[p]) || 0}"></div>`).join('')}</div></article>
    <article class="card span2"><div class="card-head"><div><h2>Announcement</h2><p class="sub">Shown at the top of every member's workspace. Leave empty to hide it.</p></div></div>
      <div class="field"><label class="lbl" for="announce">Message</label><textarea class="input" id="announce" maxlength="300" rows="2" placeholder="e.g. Scheduled maintenance on Friday from 22:00 to 23:00 Dubai time.">${esc(s.announcement)}</textarea></div>
      <div style="margin-top:12px;display:flex;gap:8px"><button class="btn primary" type="submit">Save settings</button></div></article>
  </form>
  ${S.ov ? systemCard(S.ov.system) : ''}`;
};

/* ---------------- drawer: one member, or add a member ---------------- */
function renderDrawer() {
  const root = $('#drawer-root');
  const d = S.drawer;
  if (!d) { root.innerHTML = ''; return; }
  let body = '';
  if (d.kind === 'add') {
    body = d.created ? secretBlock(`${esc(d.created.user.email)} can now log in with this temporary password. Share it privately; they can change it from Account.`, d.created.tempPassword)
      : `<form data-form="add-user" style="display:flex;flex-direction:column;gap:12px">
        <div class="field"><label class="lbl" for="nu-email">Email</label><input class="input" id="nu-email" type="email" required></div>
        <div class="field"><label class="lbl" for="nu-name">Name</label><input class="input" id="nu-name" maxlength="80"></div>
        <div class="form-grid"><div class="field"><label class="lbl" for="nu-role">Role</label><select class="input" id="nu-role"><option value="member">Member</option><option value="admin">Admin</option></select></div>
        <div class="field"><label class="lbl" for="nu-plan">Plan</label><select class="input" id="nu-plan"><option value="free">Free</option><option value="pro">Pro</option><option value="business">Business</option></select></div></div>
        ${d.err ? `<p class="ai-note err">${esc(d.err)}</p>` : ''}
        <button class="btn primary" type="submit">Create member</button></form>`;
  } else if (!d.data) {
    body = '<p class="sub">Loading…</p>';
  } else {
    const u = d.data.user, self = S.me && u.id === S.me.id;
    const sel = (k, opts) => `<div class="field"><label class="lbl" for="du-${k}">${k[0].toUpperCase() + k.slice(1)}</label><select class="input" id="du-${k}" data-patch="${k}"${self && k !== 'plan' ? ' disabled' : ''}>${opts.map(o => `<option value="${o}"${u[k] === o ? ' selected' : ''}>${o[0].toUpperCase() + o.slice(1)}</option>`).join('')}</select></div>`;
    const row = (k, v) => `<div class="status-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
    body = `
      <div class="status-list">${row('Email', u.email)}${row('Brand', d.data.brand.brand || '—')}${row('Joined', fmtDate(u.createdAt))}${row('Last login', ago(u.lastLoginAt))}${row('Signed-in devices', u.sessions)}${row('Posts', `${u.posts} (${u.scheduled} scheduled)`)}${row('AI requests this month', u.aiMonth)}${row('Connected channels', (d.data.connections || []).map(c => `${NET_NAMES[c.network] || c.network}: ${c.name}${c.status === 'reconnect' ? ' (needs reconnecting)' : ''}`).join(', ') || 'None')}</div>
      <div class="form-grid">${sel('role', ['member', 'admin'])}${sel('plan', ['free', 'pro', 'business'])}${sel('status', ['active', 'suspended'])}</div>
      ${self ? '<p class="sub">You cannot change your own role or suspend yourself.</p>' : ''}
      ${d.err ? `<p class="ai-note err">${esc(d.err)}</p>` : ''}
      ${d.tempPassword ? secretBlock('New temporary password. Share it privately; their other sessions were signed out.', d.tempPassword) : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="reset-pw">Reset password</button><button class="btn" data-act="signout-user">Sign out everywhere</button>
      ${self ? '' : `<button class="btn danger${S.confirm === 'deluser' ? ' armed' : ''}" data-act="delete-user">${S.confirm === 'deluser' ? 'Click again to delete' : 'Delete member'}</button>`}</div>
      <div><h3 style="font-size:15px;margin-bottom:6px">Recent posts</h3>${d.data.posts.length ? `<div class="tbl-wrap"><table class="mini-table"><tbody>${d.data.posts.map(p => `<tr><td><span class="pill${p.status === 'failed' ? ' suspended' : ''}">${esc(p.status)}</span></td><td><span class="clip" title="${esc((p.errors || []).join(' | '))}">${esc(p.text)}</span>${p.errors && p.errors.length ? `<small class="sub" style="display:block;color:var(--bad)">${esc(p.errors[0])}</small>` : ''}</td><td class="sub" style="white-space:nowrap">${esc((p.networks || []).join(', '))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">No posts yet.</p>'}</div>
      <div><h3 style="font-size:15px;margin-bottom:6px">Recent activity</h3>${d.data.activity.length ? `<div class="tbl-wrap"><table class="mini-table"><tbody>${d.data.activity.map(a => `<tr><td style="white-space:nowrap">${esc(ago(a.created_at))}</td><td>${esc(ACTIONS[a.action] || a.action)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Nothing yet.</p>'}</div>`;
  }
  const title = d.kind === 'add' ? 'Add a member' : (d.data ? d.data.user.name : 'Member');
  root.innerHTML = `<div class="scrim" data-act="close-drawer"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
    <header class="drawer-head"><h2 id="drawer-title">${esc(title)}</h2><button class="iconbtn" data-act="close-drawer" aria-label="Close">${ic('x')}</button></header>
    <div class="drawer-body">${body}</div></aside>`;
}
function secretBlock(text, secret) {
  return `<div style="display:flex;flex-direction:column;gap:8px"><p class="sub">${text}</p><div class="secret"><code id="secret">${esc(secret)}</code><button class="btn sm" data-act="copy-secret">${ic('copy', 'sm')}Copy</button></div></div>`;
}

/* ---------------- charts ---------------- */
function niceMax(v) { if (v <= 0) return 4; const e = Math.pow(10, Math.floor(Math.log10(v))); const m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; }
function mountCharts() {
  if (!S.ov) return;
  document.querySelectorAll('[data-chart]').forEach(el => drawBars(el, S.ov.series[el.dataset.chart], S.ov.series.days, el.dataset.chart === 'ai' ? 'requests' : 'sign-ups'));
}
function drawBars(el, vals, days, unit) {
  const w = el.clientWidth, h = el.clientHeight || 180;
  if (!w || !vals) return;
  const pad = { l: 34, r: 6, t: 8, b: 22 };
  const max = Math.max(4, niceMax(Math.max(...vals)));
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const bw = iw / vals.length;
  const Y = v => pad.t + ih * (1 - v / max);
  let g = '';
  [0, max / 2, max].forEach(v => { const y = Y(v).toFixed(1); g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y}" y2="${y}" style="stroke:var(--line)"/><text x="${pad.l - 6}" y="${+y + 4}" text-anchor="end" style="fill:var(--muted);font-size:11px;font-weight:700">${C.fmtCompact(v)}</text>`; });
  vals.forEach((v, i) => {
    const x = pad.l + i * bw + 1, bh = Math.max(v ? 2 : 0, ih * v / max);
    const d = new Date(days[i] + 'T00:00:00Z');
    const label = `${d.getUTCDate()} ${C.MONTH_SHORT[d.getUTCMonth()]}`;
    g += `<rect x="${x.toFixed(1)}" y="${(pad.t + ih - bh).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" style="fill:var(--accent)"/>`;
    g += `<rect x="${(pad.l + i * bw).toFixed(1)}" y="${pad.t}" width="${bw.toFixed(1)}" height="${ih}" style="fill:transparent" data-tip="${label}: ${v} ${unit}"/>`;
  });
  [0, 10, 20, vals.length - 1].forEach((i, k) => {
    const d = new Date(days[i] + 'T00:00:00Z');
    g += `<text x="${(pad.l + i * bw + bw / 2).toFixed(1)}" y="${h - 6}" text-anchor="${k === 0 ? 'start' : k === 3 ? 'end' : 'middle'}" style="fill:var(--muted);font-size:11px;font-weight:700">${d.getUTCDate()} ${C.MONTH_SHORT[d.getUTCMonth()]}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${g}</svg>`;
}
function showTip(html, x, y) {
  const t = $('#tip'); t.innerHTML = html; t.hidden = false;
  const r = t.getBoundingClientRect();
  let left = x - r.width / 2, top = y - r.height - 10;
  if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
  if (top < 8) top = y + 14;
  t.style.left = Math.max(8, left) + 'px'; t.style.top = top + 'px';
}
document.addEventListener('pointerover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (!el) return; const r = el.getBoundingClientRect(); showTip(esc(el.dataset.tip), r.left + r.width / 2, r.top); });
document.addEventListener('pointerout', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) $('#tip').hidden = true; });
let roTimer;
new ResizeObserver(() => { clearTimeout(roTimer); roTimer = setTimeout(mountCharts, 120); }).observe(document.documentElement);

/* ---------------- data ---------------- */
async function load(route) {
  S.err = '';
  try {
    if (route === 'overview' || !S.ov) S.ov = await api('GET', '/api/admin/overview');
    if (route === 'users') { const u = S.users; const r = await api('GET', `/api/admin/users?q=${encodeURIComponent(u.q)}&filter=${u.filter}&limit=200`); u.list = r.users; u.total = r.total; }
    if (route === 'activity') S.activity = (await api('GET', '/api/admin/activity?limit=200')).activity;
    if (route === 'settings') S.settings = (await api('GET', '/api/admin/settings')).settings;
  } catch (e) { if (e && e.code !== 'unauthorized' && e.code !== 'forbidden') S.err = e.message || 'Could not load this page.'; }
  if (S.route === route) render();
}
async function openUser(id) {
  S.drawer = { kind: 'user', id, data: null }; S.confirm = null; renderDrawer();
  try { const data = await api('GET', '/api/admin/users/' + encodeURIComponent(id)); if (S.drawer && S.drawer.id === id) { S.drawer.data = data; renderDrawer(); } }
  catch (e) { if (S.drawer) { S.drawer.err = e.message || 'Could not load this member.'; S.drawer.data = null; renderDrawer(); } }
}
function setRoute(r) {
  if (!ROUTES[r]) r = 'overview';
  S.route = r; S.saveMsg = '';
  $('#app').classList.remove('menu-open'); $('#scrim').hidden = true;
  render(); window.scrollTo(0, 0);
  load(r);
}

/* ---------------- events ---------------- */
const ACT = {
  menu: () => { const open = !$('#app').classList.contains('menu-open'); $('#app').classList.toggle('menu-open', open); $('#scrim').hidden = !open; },
  logout: async () => { try { await api('POST', '/api/auth/logout', {}); } catch (e) { /* leave anyway */ } location.href = '/'; },
  refresh: () => load(S.route),
  ufilter: el => { S.users.filter = el.dataset.f; load('users'); },
  'open-user': el => openUser(el.dataset.id),
  'add-user': () => { S.drawer = { kind: 'add' }; renderDrawer(); setTimeout(() => $('#nu-email') && $('#nu-email').focus(), 30); },
  'close-drawer': () => { S.drawer = null; S.confirm = null; renderDrawer(); },
  'copy-secret': async el => {
    const text = $('#secret').textContent;
    try { await navigator.clipboard.writeText(text); el.textContent = 'Copied'; }
    catch (e) { const r = document.createRange(); r.selectNodeContents($('#secret')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.textContent = 'Selected: press Ctrl+C'; }
  },
  'reset-pw': async () => {
    const d = S.drawer;
    try { const r = await api('POST', `/api/admin/users/${encodeURIComponent(d.id)}/reset-password`, {}); d.tempPassword = r.tempPassword; d.err = ''; }
    catch (e) { d.err = e.message || 'Could not reset the password.'; }
    renderDrawer();
  },
  'signout-user': async () => {
    const d = S.drawer;
    try { await api('POST', `/api/admin/users/${encodeURIComponent(d.id)}/signout`, {}); toast('Signed out of every device.'); openUser(d.id); }
    catch (e) { d.err = e.message; renderDrawer(); }
  },
  'delete-user': async () => {
    const d = S.drawer;
    if (S.confirm !== 'deluser') { S.confirm = 'deluser'; return renderDrawer(); }
    try { await api('DELETE', '/api/admin/users/' + encodeURIComponent(d.id)); S.drawer = null; S.confirm = null; toast('Member deleted.'); load(S.route); S.ov = null; load('overview'); }
    catch (e) { d.err = e.message; S.confirm = null; renderDrawer(); }
  },
  'toggle-setting': el => { const k = el.dataset.k; S.settings[k] = !S.settings[k]; el.setAttribute('aria-checked', String(S.settings[k])); S.saveMsg = ''; }
};
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) { e.preventDefault(); if (location.hash.slice(1) === go.dataset.go) setRoute(go.dataset.go); else location.hash = go.dataset.go; return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { if (el.tagName === 'A') e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.patch && S.drawer && S.drawer.data) {
    const d = S.drawer;
    try { const r = await api('PATCH', '/api/admin/users/' + encodeURIComponent(d.id), { [t.dataset.patch]: t.value }); d.data.user = r.user; d.err = ''; toast('Saved.'); load(S.route); }
    catch (x) { d.err = x.message || 'Could not save.'; }
    renderDrawer();
  }
});
let searchTimer;
document.addEventListener('input', e => {
  if (e.target.id === 'user-q') { S.users.q = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(async () => { await load('users'); const q = $('#user-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300); }
});
document.addEventListener('submit', async e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  if (f.dataset.form === 'settings') {
    const s = S.settings;
    try {
      const r = await api('PUT', '/api/admin/settings', { settings: { signupsOpen: s.signupsOpen, aiEnabled: s.aiEnabled, practiceMode: !!s.practiceMode, announcement: $('#announce').value.trim(), aiDailyLimits: { free: +$('#lim-free').value, pro: +$('#lim-pro').value, business: +$('#lim-business').value } } });
      S.settings = r.settings; S.saveMsg = 'Settings saved. They apply to every member now.';
    } catch (x) { S.err = x.message || 'Could not save settings.'; }
    render();
  } else if (f.dataset.form === 'add-user') {
    const d = S.drawer;
    try {
      d.created = await api('POST', '/api/admin/users', { email: $('#nu-email').value.trim(), name: $('#nu-name').value.trim(), role: $('#nu-role').value, plan: $('#nu-plan').value });
      d.err = ''; load(S.route);
    } catch (x) { d.err = x.message || 'Could not create the member.'; }
    renderDrawer();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.drawer) ACT['close-drawer'](); });
$('#scrim').addEventListener('click', () => ACT.menu());
window.addEventListener('hashchange', () => setRoute(location.hash.slice(1)));

/* ---------------- boot ---------------- */
api('GET', '/api/auth/me').then(r => {
  if (!r.user || r.user.role !== 'admin') { location.href = '/app'; return; }
  S.me = r.user;
  setRoute(location.hash.slice(1) || 'overview');
}).catch(() => {});
})();
