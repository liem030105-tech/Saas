import { describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  LoginInputSchema,
  RefreshResponseSchema,
  RegisterInputSchema,
  UserDtoSchema,
} from './auth';
import auth from '../../tests/data/auth.json';

describe('RegisterInputSchema', () => {
  it('trims and lower-cases the email and trims the name', () => {
    expect(RegisterInputSchema.parse(auth.validInput)).toEqual(auth.normalized);
  });

  it('accepts the upper bounds (72-character password, 100-character name)', () => {
    const input = {
      ...auth.normalized,
      password: auth.boundaries.password72,
      name: auth.boundaries.name100,
    };
    expect(RegisterInputSchema.safeParse(input).success).toBe(true);
  });

  it.each(Object.entries(auth.invalidInputs))('rejects %s', (_name, input) => {
    expect(RegisterInputSchema.safeParse(input).success).toBe(false);
  });

  it('reports the failing field by path, with a user-facing message', () => {
    const result = RegisterInputSchema.safeParse(auth.invalidInputs.passwordTooShort);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['password'], message: expect.stringMatching(/^Password/) }),
    ]);
  });
});

describe('LoginInputSchema', () => {
  it('normalizes the email and accepts any non-empty password up to 72 characters', () => {
    expect(LoginInputSchema.parse(auth.login.validInput)).toEqual(auth.login.normalized);
    const atCap = { ...auth.login.normalized, password: auth.boundaries.password72 };
    expect(LoginInputSchema.safeParse(atCap).success).toBe(true);
  });

  it.each(Object.entries(auth.login.invalidInputs))('rejects %s', (_name, input) => {
    expect(LoginInputSchema.safeParse(input).success).toBe(false);
  });

  it('strips unknown fields', () => {
    expect(LoginInputSchema.parse({ ...auth.login.normalized, name: 'Ada' })).toEqual(
      auth.login.normalized,
    );
  });
});

describe('UserDtoSchema / AuthResponseSchema', () => {
  it('parses a user and an auth response', () => {
    expect(UserDtoSchema.parse(auth.userDto)).toEqual(auth.userDto);
    expect(AuthResponseSchema.safeParse({ user: auth.userDto, accessToken: 'a.b.c' }).success).toBe(
      true,
    );
  });

  it('strips passwordHash if it ever appeared', () => {
    const parsed = UserDtoSchema.parse({ ...auth.userDto, passwordHash: 'x' });
    expect(parsed).not.toHaveProperty('passwordHash');
  });
});

describe('RefreshResponseSchema', () => {
  it('requires a non-empty access token and nothing else', () => {
    expect(RefreshResponseSchema.parse({ accessToken: 'a.b.c', user: auth.userDto })).toEqual({
      accessToken: 'a.b.c',
    });
    expect(RefreshResponseSchema.safeParse({ accessToken: '' }).success).toBe(false);
  });
});
