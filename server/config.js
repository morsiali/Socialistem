// All runtime configuration comes from environment variables (see .env.example).
const path = require('path');

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  return {
    appName: 'Socialistem',
    production,
    port: Number(env.PORT) || 3000,
    host: env.HOST || '0.0.0.0',
    publicUrl: (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    dataDir: env.DATA_DIR || path.join(__dirname, '..', 'data'),
    dbFile: env.DB_FILE || '', // defaults to <dataDir>/socialistem.db; ":memory:" for tests
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === 'true' : production,
    secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : production,
    sessionDays: Number(env.SESSION_DAYS) || 30,
    supportEmail: env.SUPPORT_EMAIL || '',
    adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD || '',
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    anthropicUrl: (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, ''),
    modelFast: env.AI_MODEL_FAST || 'claude-haiku-5-5',
    modelBest: env.AI_MODEL_BEST || 'claude-sonnet-5-5',
    schedulerMs: env.SCHEDULER_MS ? Number(env.SCHEDULER_MS) : 30000,
    loginMaxAttempts: Number(env.LOGIN_MAX_ATTEMPTS) || 10,
    version: '1.0.0'
  };
}

module.exports = { loadConfig };
