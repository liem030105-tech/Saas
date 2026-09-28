import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';
import {
  clientUrlWithPath,
  envDefaults,
  invalidEnvs,
  minimalEnv,
  testEnv,
} from '../../tests/data/env';

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    expect(parseEnv(testEnv).success).toBe(true);
  });

  it('applies defaults for unset or empty optional variables', () => {
    const result = parseEnv(minimalEnv);

    expect(result).toEqual({ success: true, env: expect.objectContaining(envDefaults) });
  });

  it('reduces CLIENT_URL to its origin so CORS matches the browser Origin header', () => {
    const result = parseEnv({ ...testEnv, CLIENT_URL: clientUrlWithPath.input });

    expect(result.success && result.env.CLIENT_URL).toBe(clientUrlWithPath.origin);
  });

  it('rejects a missing JWT_ACCESS_SECRET with a message naming it', () => {
    const result = parseEnv(invalidEnvs.missingJwtSecret);

    expect(result.success).toBe(false);
    expect(!result.success && result.message).toContain('JWT_ACCESS_SECRET');
  });

  it.each(Object.entries(invalidEnvs))('rejects %s', (_name, source) => {
    expect(parseEnv(source).success).toBe(false);
  });
});
