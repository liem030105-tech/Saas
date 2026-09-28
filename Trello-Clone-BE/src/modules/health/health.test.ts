import { describe, expect, it } from 'vitest';

import { getStatus } from './health.service';

describe('health.service', () => {
  it('reports ok', () => {
    expect(getStatus()).toEqual({ status: 'ok' });
  });
});
