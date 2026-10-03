import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { flushErrorTracking, initErrorTracking } from './lib/error-tracking';
import { attachRealtime, closeRealtime } from './realtime/socket';

// Before the server listens. The modules imported above are not instrumented, which only matters
// for tracing (off, ADR-024): errors are captured explicitly.
initErrorTracking();

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
});
// Socket.IO on the same origin (REALTIME-001, docs/architecture/realtime.md).
attachRealtime(server);

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'Shutting down');
  // Closing Socket.IO also closes the HTTP server it is attached to.
  void closeRealtime()
    .catch((err: unknown) => logger.error({ err }, 'Closing Socket.IO failed'))
    .then(flushErrorTracking)
    .finally(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
