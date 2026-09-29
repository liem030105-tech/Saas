import { randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';

// Proposed default from D-03: bcryptjs (pure JavaScript, no native build) with cost 12.
export const BCRYPT_COST = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

/**
 * Hash of a random value nobody knows, with the same cost as real hashes. Login compares against
 * it when the email is unknown, so both failure paths spend the same bcrypt time
 * (docs/architecture/security.md → Login timing). Started at import so no request pays for it.
 */
const dummyHash = hashPassword(randomBytes(32).toString('base64url'));

/**
 * Checks `password` against `hash`, or against the dummy hash when there is no user (`null`),
 * so the caller always runs exactly one bcrypt compare. Returns false for a missing user.
 */
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? (await dummyHash));
  return hash !== null && matches;
}
