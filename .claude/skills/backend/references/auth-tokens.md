# Auth tokens (AUTH-001…004)

Spec: [architecture/security.md → Authentication flow](../../../../docs/architecture/security.md#authentication-flow) and [api/authentication.md](../../../../docs/api/authentication.md). This is the riskiest code in the project: follow the spec exactly and test every branch.

## Access token
- JWT HS256 with `JWT_ACCESS_SECRET`, payload `{ sub: userId }`, lifetime `ACCESS_TOKEN_TTL` (D-01). No roles inside.
- `authenticate` middleware: read `Authorization: Bearer <jwt>`, verify, set `req.userId` (typed via `src/types/express.d.ts`). Any failure → `401 UNAUTHORIZED`.

## Refresh token
```ts
import { createHash, randomBytes } from 'node:crypto';
const newRawToken = () => randomBytes(32).toString('base64url');           // 256-bit, not a JWT
const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex'); // only the hash is stored
```

### Rotation (`POST /auth/refresh`)
```ts
const presentedRaw = req.cookies.refresh_token;
const presented = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(presentedRaw) } });
if (!presented || presented.expiresAt <= new Date()) throw AppError.unauthorized();

const revokeFamily = () =>
  prisma.refreshToken.updateMany({ where: { familyId: presented.familyId, revokedAt: null }, data: { revokedAt: new Date() } });

if (presented.revokedAt) {                     // replay of a rotated token → kill the whole family
  await revokeFamily();
  throw new AppError('TOKEN_REUSED', 401, 'Session expired'); // controller also clears the cookie
}

const nextRaw = newRawToken();
const rotated = await prisma.$transaction(async (tx) => {
  // conditional update: if a concurrent request already rotated this token, count is 0
  const { count } = await tx.refreshToken.updateMany({ where: { id: presented.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count !== 1) return false;               // nothing written; handled below, outside the rolled-back transaction
  const next = await tx.refreshToken.create({
    data: { userId: presented.userId, familyId: presented.familyId, tokenHash: hashToken(nextRaw), expiresAt: presented.expiresAt }, // absolute expiry, D-02
  });
  await tx.refreshToken.update({ where: { id: presented.id }, data: { replacedById: next.id } });
  return true;
});
if (!rotated) {                                // the same token was presented twice at once: treat as reuse, per the spec
  await revokeFamily();
  throw new AppError('TOKEN_REUSED', 401, 'Session expired');
}
// respond with a new access token and set the cookie to nextRaw (never presentedRaw)
```

### Cookie
```ts
res.cookie('refresh_token', nextRaw, { // the newly issued token
  httpOnly: true,
  secure: env.NODE_ENV !== 'development', // dropped only in development (http://localhost); see modules/auth/cookie.ts
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: remainingMs, // until the family's absolute expiry
});
```
Clear it with the same `path` (`res.clearCookie('refresh_token', { path: '/api/v1/auth' })`), or the browser keeps it.

## Passwords
- Hash with the library and cost from D-03; passwords are 8–72 characters (bcrypt limit).
- Login with an unknown email still runs a compare against a fixed dummy hash, so timing does not reveal which emails exist. Same `401 INVALID_CREDENTIALS` for both cases.

## Tests that must exist
Register/login set the cookie with the exact attributes; refresh rotates (old token revoked, `replacedById` set); replaying a rotated token revokes the family and returns `TOKEN_REUSED`; two concurrent refreshes with the same token leave at most one live successor; logout is idempotent; an expired refresh token → 401.
