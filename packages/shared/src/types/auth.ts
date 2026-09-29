import type { AuthResponseSchema, RegisterInputSchema, UserDtoSchema } from '../schemas/auth';
import type { z } from 'zod';

/** What the register form holds (before trimming / lower-casing). */
export type RegisterInput = z.input<typeof RegisterInputSchema>;
/** What the API works with after validation. */
export type RegisterData = z.output<typeof RegisterInputSchema>;
export type UserDto = z.infer<typeof UserDtoSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
