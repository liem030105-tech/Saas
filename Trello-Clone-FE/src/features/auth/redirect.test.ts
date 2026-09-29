import { safeRedirect, unsafeRedirects } from '@/testing/data/auth';

import { safeRedirectPath } from './redirect';

describe('safeRedirectPath', () => {
  it('keeps an internal path with its query and hash', () => {
    expect(safeRedirectPath(safeRedirect.redirectTo)).toBe(safeRedirect.redirectTo);
    expect(safeRedirectPath('/boards/abc#card-1')).toBe('/boards/abc#card-1');
  });

  it('falls back to / when there is no redirectTo', () => {
    expect(safeRedirectPath(null)).toBe('/');
  });

  it.each(unsafeRedirects)('ignores %j', (redirectTo) => {
    expect(safeRedirectPath(redirectTo)).toBe('/');
  });
});
