import { testPrisma } from './db';
import { issueAccessToken } from '../../src/modules/auth/tokens';
import { buildUser } from '../data/users';

/** A new user row plus a valid access token for it (no password or login round-trip needed). */
export async function createUserWithToken() {
  const user = await testPrisma.user.create({ data: buildUser() });
  return { user, token: await issueAccessToken(user.id) };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
