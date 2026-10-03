import { describe, expect, it } from 'vitest';

import { scrubEvent } from './error-tracking';
import { unscrubbedEvent } from '../../tests/data/error-tracking';

describe('scrubEvent', () => {
  it('keeps only the method and the path of the request, and drops the user', () => {
    const event = scrubEvent(structuredClone(unscrubbedEvent));

    expect(event.request).toEqual({
      method: 'POST',
      url: 'https://api.example.com/api/v1/invites/accept',
    });
    expect(event.user).toBeUndefined();
  });
});
