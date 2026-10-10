// Entry point: node server/index.js
process.removeAllListeners('warning');
process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.warn(w); });

const http = require('http');
const { loadConfig } = require('./config');
const { createApp } = require('./app');

const config = loadConfig();
const app = createApp(config);
const server = http.createServer((req, res) => { app.handle(req, res); });
server.headersTimeout = 65000;
server.requestTimeout = 300000;

server.listen(config.port, config.host, () => {
  console.log(`${config.appName} running on ${config.publicUrl} (port ${config.port})`);
  if (!config.anthropicKey) console.warn('ANTHROPIC_API_KEY is not set: AI features will show "not set up" until you add it.');
});

function shutdown() {
  console.log('Shutting down…');
  app.close();
  server.close(() => { try { app.db.close(); } catch (e) { /* already closed */ } process.exit(0); });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
