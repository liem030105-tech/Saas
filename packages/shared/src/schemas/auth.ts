import { z } from 'zod';

import { CuidSchema } from './common';

// Field rules: docs/api/README.md → Validation rules (length limits proposed in D-15).
// Messages are shown under the form fields, so they are written for users (docs/design/ui.md → Copy).

/** Trimmed and lower-cased before validation, so uniqueness checks are case-insensitive. */
export const EmailSchema = z
  .string({ error: 'Enter your email address' })
  .trim()
  .toLowerCase()
  .max(254, 'Email must be at most 254 characters')
  .pipe(z.email('Enter a valid email address'));

/** 8–72 characters: bcrypt only reads the first 72 bytes. */
export const PasswordSchema = z
  .string({ error: 'Enter a password' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const UserNameSchema = z
  .string({ error: 'Enter your name' })
  .trim()
  .min(1, 'Enter your name')
  .max(100, 'Name must be at most 100 characters');

/** POST /auth/register body. */
export const RegisterInputSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: UserNameSchema,
});

/** A user as the API returns it; `passwordHash` never leaves the server. */
export const UserDtoSchema = z.object({
  id: CuidSchema,
  email: z.email(),
  name: z.string(),
  avatarUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
});

/** `data` of register and login: the user and a short-lived access token (refresh token is a cookie). */
export const AuthResponseSchema = z.object({
  user: UserDtoSchema,
  accessToken: z.string().min(1),
});
