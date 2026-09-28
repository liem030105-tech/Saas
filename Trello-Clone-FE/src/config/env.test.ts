import { invalidEnvs, testEnv } from '@/testing/data/env';

import { parseEnv } from './env';

describe('parseEnv', () => {
  it('accepts a valid environment', () => {
    expect(parseEnv(testEnv)).toEqual(testEnv);
  });

  it.each(Object.entries(invalidEnvs))('rejects %s', (_name, source) => {
    expect(() => parseEnv(source)).toThrow(/Invalid frontend environment/);
  });
});
