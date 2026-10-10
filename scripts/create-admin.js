// Create an admin, or promote an existing member: npm run create-admin -- you@example.com "Your Name"
// Prints a temporary password for new accounts. Uses the same DATA_DIR / DB_FILE as the server.
process.removeAllListeners('warning');
const { loadConfig } = require('../server/config');
const { createApp } = require('../server/app');
const A = require('../server/auth');

const email = A.normalizeEmail(process.argv[2]);
const name = process.argv[3] || 'Admin';
if (!A.validEmail(email)) { console.error('Usage: npm run create-admin -- you@example.com "Your Name"'); process.exit(1); }
const app = createApp({ ...loadConfig(), adminEmail: '' }, { noScheduler: true });
const existing = app.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
if (existing) {
  app.db.prepare("UPDATE users SET role = 'admin', status = 'active' WHERE id = ?").run(existing.id);
  app.ctx.log({ targetId: existing.id, action: 'admin.promoted_by_config', detail: email + ' (create-admin script)' });
  console.log(`${email} is now an admin. Their password is unchanged.`);
} else {
  const password = A.tempPassword();
  const u = app.ctx.createUser({ email, name, password, role: 'admin', plan: 'business' });
  app.ctx.log({ targetId: u.id, action: 'admin.created_by_config', detail: email + ' (create-admin script)' });
  console.log(`Admin created: ${email}\nTemporary password: ${password}\nLog in at /login, then change it from Account.`);
}
app.close();
app.db.close();
