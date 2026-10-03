import { invalidEnvs, testEnv } from '@/testing/data/env';

import { parseEnv } from './env';

describe('parseEnv', () => {
  it('accepts a valid environment', () => {
    expect(parseEnv(testEnv)).toEqual(testEnv);
  });

  it('treats empty optional values as unset', () => {
    expect(parseEnv({ ...testEnv, VITE_SENTRY_DSN: '' }).VITE_SENTRY_DSN).toBeUndefined();
  });

  it.each(Object.entries(invalidEnvs))('rejects %s', (_name, source) => {
    expect(() => parseEnv(source)).toThrow(/Invalid frontend environment/);
  });
});
