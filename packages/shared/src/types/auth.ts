import type {
  AuthResponseSchema,
  LoginInputSchema,
  RefreshResponseSchema,
  RegisterInputSchema,
  UserDtoSchema,
} from '../schemas/auth';
import type { z } from 'zod';

/** What the register form holds (before trimming / lower-casing). */
export type RegisterInput = z.input<typeof RegisterInputSchema>;
/** What the API works with after validation. */
export type RegisterData = z.output<typeof RegisterInputSchema>;
/** What the login form holds (before trimming / lower-casing the email). */
export type LoginInput = z.input<typeof LoginInputSchema>;
export type LoginData = z.output<typeof LoginInputSchema>;
export type UserDto = z.infer<typeof UserDtoSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
