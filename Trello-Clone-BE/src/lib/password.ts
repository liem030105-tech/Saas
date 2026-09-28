import bcrypt from 'bcryptjs';

// Proposed default from D-03: bcryptjs (pure JavaScript, no native build) with cost 12.
export const BCRYPT_COST = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
