// The only parts of the Sentry SDK the app uses. lib/error-tracking.ts imports this file lazily;
// re-exporting by name lets the bundler drop the rest of the SDK (replay, tracing, feedback).
export { captureException, init } from '@sentry/react';
