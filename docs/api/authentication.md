# API – Authentication & Users

> **Domain:** `auth` and `users` modules. Conventions: [README](README.md). Token details: [security.md](../architecture/security.md).

### POST /auth/register
- **Authorization:** Public · rate limited 10/min/IP
- **Request:** `RegisterInput { email, password (8–72), name }`
- **Response:** `201 { data: { user: UserDto, accessToken } }` + refresh-token cookie
- **Service:** `auth.service.register` – hash password, create user + personal workspace (OWNER) + refresh-token family in one transaction
- **Errors:** `VALIDATION_ERROR`, `CONFLICT` (email taken), `RATE_LIMITED`
- **Tests:** success, duplicate email, weak password, cookie has `httpOnly/Secure/SameSite`

### POST /auth/login
- **Authorization:** Public · rate limited
- **Request:** `LoginInput { email, password }`
- **Response:** `200 { data: { user, accessToken } }` + cookie
- **Service:** `auth.service.login` – bcrypt compare, new token family
- **Errors:** `INVALID_CREDENTIALS` (same message for wrong email or password), `RATE_LIMITED`
- **Tests:** success, wrong password, unknown email (identical error)

### POST /auth/refresh
- **Authorization:** Public (requires cookie)
- **Response:** `200 { data: { accessToken } }` + new cookie
- **Service:** `auth.service.refresh` – rotate; a revoked token revokes the whole family
- **Errors:** `UNAUTHORIZED` (missing/invalid/expired), `TOKEN_REUSED`
- **Tests:** successful rotation, reusing an old token revokes the family, expired token

### POST /auth/logout
- **Authorization:** Authenticated or cookie · **Response:** `204`, clears the cookie
- **Service:** revokes the current family

### GET /auth/me
- **Authorization:** Authenticated · **Response:** `200 { data: UserDto }`

### PATCH /users/me
- **Authorization:** Authenticated
- **Request:** `UpdateProfileInput { name?, avatarUrl? }` · **Response:** `200 { data: UserDto }`

### POST /users/me/password
- **Authorization:** Authenticated
- **Request:** `ChangePasswordInput { currentPassword, newPassword }` · **Response:** `204`
- **Service:** verify current password, hash new one, revoke all other token families
- **Errors:** `INVALID_CREDENTIALS`, `VALIDATION_ERROR`

`UserDto = { id, email, name, avatarUrl, createdAt }` – `passwordHash` is never returned.
