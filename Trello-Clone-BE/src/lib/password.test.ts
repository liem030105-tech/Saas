import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BCRYPT_COST, hashPassword, verifyPassword } from './password';
import { loginCredentials } from '../../tests/data/auth';

const { password, wrongPassword } = loginCredentials;

describe('verifyPassword', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword(password);

    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(wrongPassword, hash)).toBe(false);
  });

  it('without a user, still runs one compare against a dummy hash of the same cost, and fails', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');

    expect(await verifyPassword(password, null)).toBe(false);

    expect(compare).toHaveBeenCalledTimes(1);
    const dummy = compare.mock.calls[0]![1];
    expect(bcrypt.getRounds(dummy)).toBe(BCRYPT_COST);
  });

  it('runs exactly one compare for an existing user too', async () => {
    const hash = await hashPassword(password);
    const compare = vi.spyOn(bcrypt, 'compare');

    await verifyPassword(wrongPassword, hash);

    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith(wrongPassword, hash);
  });
});
