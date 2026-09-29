import { SignJWT } from 'jose';

import { foreignJwtSecret } from '../data/auth';
import { testEnv } from '../data/env';

const key = (secret: string) => new TextEncoder().encode(secret);

/** Access tokens `authenticate` must reject, for the given user. */
export async function buildRejectedTokens(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  const [header] = (await new SignJWT().setProtectedHeader({ alg: 'HS256' }).sign(key('x'))).split(
    '.',
  );
  const unsignedPayload = Buffer.from(
    JSON.stringify({ sub: userId, iat: now, exp: now + 900 }),
  ).toString('base64url');
  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  return {
    expired: await new SignJWT()
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 60)
      .sign(key(testEnv.JWT_ACCESS_SECRET)),
    wrongSignature: await new SignJWT()
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(key(foreignJwtSecret)),
    // A non-empty third segment, so it passes the Bearer format check and reaches jose.
    algNone: `${noneHeader}.${unsignedPayload}.c2lnbmF0dXJl`,
    // Right secret, other HMAC algorithm: only HS256 is accepted.
    hs512: await new SignJWT()
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(key(testEnv.JWT_ACCESS_SECRET)),
    tamperedPayload: `${header}.${unsignedPayload}.c2lnbmF0dXJl`,
    withoutSub: await new SignJWT()
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(key(testEnv.JWT_ACCESS_SECRET)),
  };
}
