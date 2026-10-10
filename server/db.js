// SQLite storage using Node's built-in driver (no native dependencies to compile).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL DEFAULT '',
     brand TEXT NOT NULL DEFAULT '',
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
     plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','business')),
     created_at TEXT NOT NULL,
     last_login_at TEXT
   );
   CREATE TABLE sessions (
     id_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL,
     expires_at TEXT NOT NULL,
     ip TEXT, user_agent TEXT
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE workspaces (
     user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     data TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE posts (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     status TEXT NOT NULL,
     scheduled_at TEXT,
     data TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX posts_user ON posts(user_id);
   CREATE INDEX posts_due ON posts(status, scheduled_at);
   CREATE TABLE ideas (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     data TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX ideas_user ON ideas(user_id);
   CREATE TABLE ai_usage (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
     kind TEXT NOT NULL,
     model TEXT NOT NULL,
     input_tokens INTEGER NOT NULL DEFAULT 0,
     output_tokens INTEGER NOT NULL DEFAULT 0,
     ok INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL
   );
   CREATE INDEX ai_usage_user_time ON ai_usage(user_id, created_at);
   CREATE TABLE activity (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
     target_id TEXT,
     action TEXT NOT NULL,
     detail TEXT NOT NULL DEFAULT '',
     ip TEXT,
     created_at TEXT NOT NULL
   );
   CREATE INDEX activity_time ON activity(created_at);
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`
];

const DEFAULT_SETTINGS = {
  signupsOpen: true,
  aiEnabled: true,
  aiDailyLimits: { free: 40, pro: 300, business: 1500 },
  announcement: ''
};

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get();
  let version = row ? row.version : 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      version += 1;
      db.prepare('UPDATE schema_version SET version = ?').run(version);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

function getSettings(db) {
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    try { out[r.key] = JSON.parse(r.value); } catch (e) { /* ignore corrupt value */ }
  }
  return out;
}

function saveSettings(db, patch) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) stmt.run(k, JSON.stringify(v));
  return getSettings(db);
}

function logActivity(db, { actorId = null, targetId = null, action, detail = '', ip = null }) {
  db.prepare('INSERT INTO activity (actor_id, target_id, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(actorId, targetId, action, String(detail).slice(0, 500), ip, new Date().toISOString());
}

module.exports = { openDb, getSettings, saveSettings, logActivity, DEFAULT_SETTINGS };
