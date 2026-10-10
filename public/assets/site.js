/* Landing page and login/sign-up behaviour for socialistem.com */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const page = document.body.dataset.page;

async function api(method, path, body) {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'x-socialistem': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw (data && data.code ? data : { code: 'server_error', message: 'Something went wrong. Try again.' });
  return data;
}
const getConfig = () => api('GET', '/api/public/config').catch(() => ({ signupsOpen: true, loggedIn: false, supportEmail: '' }));
/** Only allow same-site paths after login. */
function safeNext(v) { return typeof v === 'string' && /^\/(?!\/)[A-Za-z0-9/_\-#?=&.]*$/.test(v) ? v : '/app'; }

if (page === 'privacy') {
  const year = $('#year'); if (year) year.textContent = new Date().getFullYear();
  getConfig().then(cfg => {
    if (!cfg.supportEmail) return;
    $('#support-line').textContent = ' at ' + cfg.supportEmail;
    $('#support-email').textContent = cfg.supportEmail;
  });
}

if (page === 'landing') {
  const year = $('#year'); if (year) year.textContent = new Date().getFullYear();
  getConfig().then(cfg => {
    if (cfg.loggedIn) {
      $('#nav-login').hidden = true;
      $('#nav-cta').textContent = 'Open app'; $('#nav-cta').href = '/app';
    }
    if (cfg.supportEmail) $('#support').textContent = cfg.supportEmail;
    $('#hero-form').addEventListener('submit', e => {
      e.preventDefault();
      const idea = $('#idea').value.trim();
      try { if (idea) sessionStorage.setItem('socialistem.idea', idea); } catch (x) { /* storage blocked */ }
      location.href = cfg.loggedIn ? '/app' : '/signup';
    });
  });
  $('#idea').addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') $('#hero-form').requestSubmit(); });
}

if (page === 'auth') {
  const signup = location.pathname.startsWith('/signup');
  const next = safeNext(new URLSearchParams(location.search).get('next'));
  const showError = msg => { $('#auth-error-text').textContent = msg; $('#auth-error').hidden = !msg; };
  document.title = (signup ? 'Create your account' : 'Log in') + ' · Socialistem';
  $('#auth-title').textContent = signup ? 'Create your account' : 'Log in';
  $('#auth-sub').textContent = signup ? 'Free during early access. Your first posts are a sentence away.' : 'Welcome back. Pick up where you left off.';
  $('#auth-submit').textContent = signup ? 'Create account' : 'Log in';
  $('#f-name').hidden = !signup; $('#f-brand').hidden = !signup; $('#pw-hint').hidden = !signup;
  $('#name').required = signup;
  $('#password').autocomplete = signup ? 'new-password' : 'current-password';
  const q = next !== '/app' ? '?next=' + encodeURIComponent(next) : '';
  $('#auth-switch').innerHTML = signup ? `Already have an account? <a href="/login${q}">Log in</a>` : `New to Socialistem? <a href="/signup${q}">Create an account</a>`;
  let idea = '';
  try { idea = sessionStorage.getItem('socialistem.idea') || ''; } catch (e) { idea = ''; }
  if (signup && idea) $('#auth-sub').textContent = 'Create your account and we will write your first posts right away.';

  getConfig().then(cfg => {
    if (!signup) $('#auth-help').textContent = cfg.supportEmail ? `Forgot your password? Email ${cfg.supportEmail} and we will reset it.` : 'Forgot your password? Ask your workspace admin to reset it.';
    if (signup && !cfg.signupsOpen) { showError('New sign-ups are closed right now. If you already have an account, log in instead.'); }
  });

  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    showError('');
    const email = $('#email').value.trim(), password = $('#password').value;
    if (signup && !$('#name').value.trim()) return showError('Enter your name.');
    if (!email || !email.includes('@')) return showError('Enter a valid email address.');
    if (!password) return showError('Enter your password.');
    const btn = $('#auth-submit');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = signup ? 'Creating your account…' : 'Logging in…';
    try {
      const body = signup ? { name: $('#name').value.trim(), email, password, brand: $('#brand').value.trim() } : { email, password };
      await api('POST', signup ? '/api/auth/signup' : '/api/auth/login', body);
      location.href = next;
    } catch (err) {
      showError(err.message || 'That did not work. Try again.');
      btn.disabled = false; btn.textContent = label;
    }
  });
}
})();
