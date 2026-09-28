# API – Authentication & Users

> **Domain:** `auth` and `users` modules. Conventions, errors, validation: [README](README.md). Token mechanics and the full flow: [security.md](../architecture/security.md#authentication-flow).

**Shared shapes**
- `UserDto = { id, email, name, avatarUrl: string | null, createdAt }`. `passwordHash` is never returned.
- **Refresh cookie** (set/cleared by the endpoints below): name `refresh_token`, attributes `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=<D-02>`. In development `Secure` is dropped on `http://localhost`.

---

### POST /auth/register
| | |
|--|--|
| Task | AUTH-001 |
| Authentication | Public · rate limited (D-04) |
| Authorization | – |
| Body | `{ email, password, name }` (validation: [README](README.md#validation-rules)) |
| Success | `201 { data: { user: UserDto, accessToken: string } }` + sets refresh cookie |
| Errors | `400 VALIDATION_ERROR` · `409 CONFLICT` (email already registered) · `429 RATE_LIMITED` |

**Behavior:** normalize the email → hash the password (bcrypt, D-03) → create the user and a new refresh-token family in one transaction → issue the access token.
Creating a personal workspace is **not** part of this endpoint; see D-06 / WORKSPACE-001.

### POST /auth/login
| | |
|--|--|
| Task | AUTH-002 |
| Authentication | Public · rate limited (D-04) |
| Body | `{ email, password }` |
| Success | `200 { data: { user: UserDto, accessToken } }` + sets refresh cookie (new family) |
| Errors | `400` · `401 INVALID_CREDENTIALS` (identical for unknown email and wrong password; a dummy bcrypt compare equalizes timing) · `429` |

### POST /auth/refresh
| | |
|--|--|
| Task | AUTH-003 |
| Authentication | Public; requires the refresh cookie |
| Body | none |
| Success | `200 { data: { accessToken } }` + sets the rotated refresh cookie |
| Errors | `401 UNAUTHORIZED` (cookie missing, unknown, or expired) · `401 TOKEN_REUSED` (revoked token presented → whole family revoked, cookie cleared) |

**Behavior:** look up `sha256(cookie)`, then:
- If the token is valid: in one transaction, revoke it, create its successor in the same family, and link `replacedById`.
- If the token was already revoked: revoke the entire family.

### POST /auth/logout
| | |
|--|--|
| Task | AUTH-004 |
| Authentication | Public; uses the refresh cookie if present (logout must work with an expired access token) |
| Success | `204` + clears the refresh cookie. Idempotent: `204` even without a valid cookie |

**Behavior:** revoke the current token's family. Other devices (other families) stay logged in. **Logout-all is not supported** (D-05).

### GET /auth/me
| | |
|--|--|
| Task | AUTH-005 |
| Authentication | Bearer |
| Success | `200 { data: UserDto }` |
| Errors | `401` |

### PATCH /users/me
| | |
|--|--|
| Task | AUTH-005 |
| Authentication | Bearer |
| Body | `{ name?, avatarUrl? }` (at least one field) |
| Success | `200 { data: UserDto }` |
| Errors | `400` · `401` |

Email changes are out of scope.

### POST /users/me/password  *(MVP inclusion pending D-07)*
| | |
|--|--|
| Task | AUTH-005 (optional part) |
| Authentication | Bearer |
| Body | `{ currentPassword, newPassword }` (`newPassword` follows the password rule and must differ from the current one) |
| Success | `204`. Revokes **all other** refresh-token families of the user; the current session stays logged in |
| Errors | `400` · `401 INVALID_CREDENTIALS` (wrong current password) |

## Required tests (per endpoint, in addition to the 5-case baseline in [testing.md](../development/testing.md))
- Register: duplicate email, email case-insensitivity, cookie attributes, password never returned.
- Login: identical error for unknown email and wrong password.
- Refresh: rotation returns a new cookie; replaying the old cookie → `TOKEN_REUSED` and the new cookie stops working too; expired token → `401`.
- Logout: the cookie is cleared, and refresh with it afterwards → `401`.
- Password change: other families revoked, current one kept.
