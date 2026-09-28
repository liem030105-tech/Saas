import { pino } from 'pino';

import { env } from './env';

// security.md → Error handling and logging.
const REDACTED_KEYS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
];

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: {
    paths: [
      ...REDACTED_KEYS,
      ...REDACTED_KEYS.map((key) => `*.${key}`),
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
});
